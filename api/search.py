# /api/search.py (带有“指纹”的调试版本)

import os
import httpx
from flask import Flask, request, jsonify
from flask_cors import CORS
from duckduckgo_search import DDGS
from openai import OpenAI

# --- 打印一个独特的版本号作为“指纹” ---
print("--- RUNNING SEARCH API VERSION 3.0 (DEBUG FINGERPRINT ) ---")

app = Flask(__name__)
CORS(app)

@app.route('/api/search', methods=['POST'])
def search_handler():
    try:
        # --- 1. 严格检查并获取 API Key ---
        print("Step 1: Checking for API Key...")
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            print("Error: Authorization header is missing or invalid.")
            return jsonify({"error": "请求头中缺少有效的 API Key"}), 401
        
        api_key = auth_header.split(' ')[1]
        if not api_key:
            print("Error: API Key in header is empty.")
            return jsonify({"error": "请求头中的 API Key 为空"}), 401
        print("API Key successfully retrieved.")

        # --- 2. 获取 JSON 数据 ---
        print("Step 2: Parsing JSON data...")
        data = request.get_json()
        if not data:
            print("Error: Invalid JSON data.")
            return jsonify({"error": "无效的 JSON"}), 400
        query = data.get('query')
        model = data.get('model')
        if not query or not model:
            print("Error: 'query' or 'model' is missing in JSON.")
            return jsonify({"error": "请求中必须包含 'query' 和 'model'"}), 400
        print(f"Received query: '{query}', model: '{model}'")

        # --- 3. 初始化 HTTP 和 OpenAI 客户端 ---
        print("Step 3: Initializing HTTP and OpenAI clients...")
        
        # 显式创建 httpx 客户端
        http_client = httpx.Client(
            proxies=os.environ.get("https_proxy" ) or os.environ.get("http_proxy" )
        )
        print("httpx.Client created successfully." )

        # 将其传递给 OpenAI
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            http_client=http_client
         )
        print("OpenAI client initialized successfully.")

        # --- 4. 执行 DuckDuckGo 搜索 ---
        print("Step 4: Performing DuckDuckGo search...")
        context = "--- 未从网络上搜索到直接相关的背景信息 ---\n"
        search_failed = False
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=4))
                if results:
                    context = "--- 以下是 DuckDuckGo 搜索到的相关背景信息 ---\n"
                    for i, res in enumerate(results):
                        context += f"[信息 {i + 1}]: {res['body']}\n"
            print("DuckDuckGo search completed.")
        except Exception as e:
            print(f'DuckDuckGo search failed: {e}')
            search_failed = True
        
        context += "--- 背景信息结束 ---\n\n"

        # --- 5. 调用 OpenRouter API ---
        print("Step 5: Calling OpenRouter API...")
        system_prompt = "你是一个强大的 AI 助手。请根据下面提供的实时背景信息来回答用户的问题。请优先、深入地利用这些信息，并进行合理的总结与推理。如果背景信息不足或没有提供，请直接利用你自身的知识进行回答。"
        final_prompt = f"{context}请基于以上信息，回答这个问题: \"{query}\""
        
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": final_prompt},
            ]
        )
        print("OpenRouter API call successful.")

        answer = completion.choices[0].message.content
        if search_failed:
            answer = "（抱歉，实时网络搜索暂时出现问题，以下是基于我的现有知识的回答）\n\n" + answer

        return jsonify({"answer": answer})

    except Exception as e:
        # --- 捕获所有未知错误 ---
        print(f"--- UNCAUGHT EXCEPTION IN HANDLER: {type(e).__name__}: {e} ---")
        # 打印完整的堆栈跟踪，以便更深入地调试
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"服务器发生意外错误: {str(e)}"}), 500

