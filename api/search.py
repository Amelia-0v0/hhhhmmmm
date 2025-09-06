# /api/search.py (最终流式生产版)

import os
import httpx
import json
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
from duckduckgo_search import DDGS
from openai import OpenAI

app = Flask(__name__ )
CORS(app)

# --- 工具函数：用于生成符合 Server-Sent Events (SSE) 格式的事件 ---
def generate_event(event_type, data):
    """将数据格式化为服务器发送事件 (SSE) 字符串。"""
    # SSE 格式要求:
    # event: <event_name>
    # data: <json_string>
    # \n\n (两个换行符表示事件结束)
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

@app.route('/api/search', methods=['POST'])
def search_handler():
    # --- 1. 获取并校验请求数据 ---
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        # 对于流式响应，错误也需要以流式事件的形式返回
        return Response(generate_event("error", {"message": "请求头中缺少有效的 API Key"}), status=401, mimetype='text/event-stream')
    
    api_key = auth_header.split(' ')[1]
    data = request.get_json()
    query = data.get('query')
    model = data.get('model')

    if not all([api_key, query, model]):
        return Response(generate_event("error", {"message": "请求参数不完整"}), status=400, mimetype='text/event-stream')

    # --- 2. 定义流式响应的“生成器”函数 ---
    # 这个函数里的代码不会一次性执行完，而是通过 `yield` 关键字，一点一点地把结果“生产”出来
    def generate_responses():
        try:
            # --- 步骤 A: 初始化客户端 ---
            # 这一步很快，不需要 yield
            http_client = httpx.Client( )
            client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, http_client=http_client )
            
            # --- 步骤 B: 执行 DuckDuckGo 搜索 (耗时操作) ---
            # 在开始搜索前，先给前端发一个状态更新
            yield generate_event("status", {"message": "正在使用 DuckDuckGo 联网搜索..."})
            
            search_context = ""
            try:
                # 使用 with 语句确保资源被正确关闭
                with DDGS() as ddgs:
                    # 为了提高成功率和速度，我们只取前3个结果
                    results = list(ddgs.text(query, max_results=3))
                    if results:
                        # 搜索成功，构建上下文，并把结果发给前端
                        search_context = "--- 以下是 DuckDuckGo 搜索到的相关背景信息 ---\n"
                        for i, res in enumerate(results):
                            search_context += f"[信息 {i + 1}]: {res['body']}\n"
                        search_context += "--- 背景信息结束 ---\n\n"
                        yield generate_event("search_results", {"context": search_context})
                    else:
                        yield generate_event("status", {"message": "网络搜索未找到相关信息，将直接回答..."})
            except Exception as e:
                print(f"DuckDuckGo search failed: {e}")
                yield generate_event("status", {"message": "网络搜索失败，将直接使用 AI 知识回答..."})

            # --- 步骤 C: 以流式方式调用 LLM (耗时操作) ---
            system_prompt = "你是一个强大的 AI 助手。请根据下面提供的实时背景信息来回答用户的问题。请优先、深入地利用这些信息，并进行合理的总结与推理。如果背景信息不足或没有提供，请直接利用你自身的知识进行回答。"
            final_prompt = f"{search_context}请基于以上信息，回答这个问题: \"{query}\""
            
            # 关键：设置 stream=True
            stream = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": final_prompt},
                ],
                stream=True,
            )

            # --- 步骤 D: 转发 LLM 的流式数据 ---
            # 遍历从 OpenRouter 收到的每一个数据块
            for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    # 每收到一小块内容，就立刻把它作为 'llm_chunk' 事件发给前端
                    yield generate_event("llm_chunk", {"content": content})
            
            # --- 步骤 E: 发送结束信号 ---
            # 告诉前端所有数据都已发送完毕
            yield generate_event("done", {"message": "Stream finished"})

        except Exception as e:
            # 如果整个过程中发生任何错误，打印日志并通过 'error' 事件通知前端
            print(f"An error occurred during streaming: {e}")
            import traceback
            traceback.print_exc()
            yield generate_event("error", {"message": f"服务器发生意外错误: {str(e)}"})

    # --- 3. 返回流式响应 ---
    # 使用 Response 对象包裹我们的生成器函数，并指定 mimetype 为 'text/event-stream'
    return Response(stream_with_context(generate_responses()), mimetype='text/event-stream')
