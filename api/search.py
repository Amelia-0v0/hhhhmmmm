# /api/search.py (最终 Tavily API 稳定版)

import os
import httpx
import json
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
# 👇 导入 TavilyClient
from tavily import TavilyClient
from openai import OpenAI

app = Flask(__name__ )
CORS(app)

# --- 从环境变量中获取 Tavily API Key ---
# 为了安全，我们不把 Key 硬编码在代码里
# 你需要在运行后端前，在终端设置这个环境变量
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY")

def generate_event(event_type, data):
    """将数据格式化为服务器发送事件 (SSE) 字符串。"""
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

@app.route('/api/search', methods=['POST'])
def search_handler():
    # --- 获取请求数据 (不变) ---
    auth_header = request.headers.get('Authorization')
    openrouter_api_key = auth_header.split(' ')[1] if auth_header and auth_header.startswith('Bearer ') else None
    data = request.get_json()
    query = data.get('query')
    model = data.get('model')

    if not all([openrouter_api_key, query, model]):
        return Response(generate_event("error", {"message": "请求参数不完整"}), status=400, mimetype='text/event-stream')
    
    # --- 检查 Tavily Key 是否已设置 ---
    if not TAVILY_API_KEY:
        # 提供清晰的错误提示，指导如何修复
        error_msg = "服务器缺少 Tavily API Key 配置。请在启动后端服务的终端中，使用 'set TAVILY_API_KEY=你的Key' (Windows) 或 'export TAVILY_API_KEY=你的Key' (Mac/Linux) 命令进行设置。"
        return Response(generate_event("error", {"message": error_msg}), status=500, mimetype='text/event-stream')

    def generate_responses():
        try:
            # 初始化两个客户端
            openai_client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=openrouter_api_key, http_client=httpx.Client( ))
            tavily_client = TavilyClient(api_key=TAVILY_API_KEY)
            
            # --- 核心改动：使用 Tavily API 进行搜索 ---
            yield generate_event("status", {"message": "正在使用 Tavily AI 进行专业搜索..."})
            
            # 调用 Tavily 的 search 方法，它会返回一个结构化的、干净的 JSON
            # include_raw_content=False 表示我们不需要原始网页HTML，只要总结好的内容
            search_result = tavily_client.search(query=query, search_depth="basic", max_results=5)
            
            # 从返回结果中构建上下文
            search_context = "--- 以下是 Tavily AI 搜索到的相关背景信息 ---\n"
            for result in search_result['results']:
                search_context += f"[来源: {result['url']}]\n{result['content']}\n\n"
            search_context += "--- 背景信息结束 ---\n\n"
            
            yield generate_event("search_results", {"context": search_context})

            # --- 后续调用 LLM 的代码完全不变 ---
            system_prompt = "你是一个强大的 AI 助手。请根据下面提供的实时背景信息来回答用户的问题。请优先、深入地利用这些信息，并进行合理的总结与推理。如果背景信息不足或没有提供，请直接利用你自身的知识进行回答。"
            final_prompt = f"{search_context}请基于以上信息，回答这个问题: \"{query}\""
            
            stream = openai_client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": final_prompt}],
                stream=True,
            )

            for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield generate_event("llm_chunk", {"content": content})
            
            yield generate_event("done", {"message": "Stream finished"})

        except Exception as e:
            print(f"An error occurred during streaming: {e}")
            import traceback
            traceback.print_exc()
            yield generate_event("error", {"message": f"服务器发生意外错误: {str(e)}"})
    
    return Response(stream_with_context(generate_responses()), mimetype='text/event-stream')

# --- 用于本地运行的启动代码 (不变) ---
if __name__ == '__main__':
    app.run(port=5001, debug=True)
