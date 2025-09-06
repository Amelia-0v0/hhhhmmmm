# /api/search.py (已修复语法错误的最终版)

import os
import httpx
import json
import time # 引入 time 模块 ，用于重试间隔
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
from duckduckgo_search import DDGS
from openai import OpenAI

app = Flask(__name__)
CORS(app)

def generate_event(event_type, data):
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

@app.route('/api/search', methods=['POST'])
def search_handler():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return Response(generate_event("error", {"message": "请求头中缺少有效的 API Key"}), status=401, mimetype='text/event-stream')
    
    api_key = auth_header.split(' ')[1]
    data = request.get_json()
    query = data.get('query')
    model = data.get('model')

    if not all([api_key, query, model]):
        return Response(generate_event("error", {"message": "请求参数不完整"}), status=400, mimetype='text/event-stream')

    def generate_responses():
        try:
            http_client = httpx.Client( )
            client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, http_client=http_client )
            
            yield generate_event("status", {"message": "正在使用 DuckDuckGo 联网搜索..."})
            
            search_context = ""
            search_success = False
            
            # --- 带有重试逻辑的搜索模块 ---
            for attempt in range(2): # 最多尝试2次
                try:
                    with DDGS() as ddgs:
                        results = list(ddgs.text(query, max_results=3))
                        if results:
                            search_context = "--- 以下是 DuckDuckGo 搜索到的相关背景信息 ---\n"
                            for i, res in enumerate(results):
                                search_context += f"[信息 {i + 1}]: {res['body']}\n"
                            search_context += "--- 背景信息结束 ---\n\n"
                            yield generate_event("search_results", {"context": search_context})
                        
                        search_success = True
                        print(f"DuckDuckGo search attempt {attempt + 1} succeeded.")
                        break # 搜索成功，跳出重试循环
                
                except Exception as e:
                    print(f"DuckDuckGo search attempt {attempt + 1} failed: {e}")
                    if attempt == 0: # 如果是第一次失败，通知前端并等待1秒再重试
                        yield generate_event("status", {"message": f"网络搜索失败({e.__class__.__name__})，1秒后自动重试..."})
                        time.sleep(1) # 等待1秒
            
            if not search_success:
                yield generate_event("status", {"message": "网络搜索多次失败，将直接使用 AI 知识回答..."})

            # --- 调用 LLM 的模块 (保持不变) ---
            system_prompt = "你是一个强大的 AI 助手。请根据下面提供的实时背景信息来回答用户的问题。请优先、深入地利用这些信息，并进行合理的总结与推理。如果背景信息不足或没有提供，请直接利用你自身的知识进行回答。"
            final_prompt = f"{search_context}请基于以上信息，回答这个问题: \"{query}\""
            
            stream = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": final_prompt},
                ],
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

# --- 用于本地运行的启动代码 (保持不变) ---
if __name__ == '__main__':
    app.run(port=5001, debug=True)
