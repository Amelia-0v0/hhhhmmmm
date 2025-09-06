# /api/search.py (最终决定版)

import os
import httpx
from flask import Flask, request, jsonify
from flask_cors import CORS
from duckduckgo_search import DDGS
from openai import OpenAI

# 打印一个独特的版本号作为“指纹”
print("--- RUNNING SEARCH API VERSION 4.0 (FINAL VERSION) ---")

app = Flask(__name__)
CORS(app)

@app.route('/api/search', methods=['POST'])
def search_handler():
    try:
        # --- 1. 获取 API Key ---
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "请求头中缺少有效的 API Key"}), 401
        
        api_key = auth_header.split(' ')[1]
        if not api_key:
            return jsonify({"error": "请求头中的 API Key 为空"}), 401

        # --- 2. 获取 JSON 数据 ---
        data = request.get_json()
        query = data.get('query')
        model = data.get('model')

        if not query or not model:
            return jsonify({"error": "请求中必须包含 'query' 和 'model'"}), 400

        # --- 3. 初始化客户端 (最终修正) ---
        
        # 👇 **核心改动：创建一个没有任何参数的 httpx.Client**
        # httpx 会自动从环境变量中读取代理设置，无需手动传入
        http_client = httpx.Client()

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            http_client=http_client
        )
        print("OpenAI client initialized successfully.") # 加上日志以确认

        # --- 4. 执行搜索 ---
        context = "--- 未从网络上搜索到直接相关的背景信息 ---\n"
        search_failed = False
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=4))
                if results:
                    context = "--- 以下是 DuckDuckGo 搜索到的相关背景信息 ---\n"
                    for i, res in enumerate(results):
                        context += f"[信息 {i + 1}]: {res['body']}\n"
        except Exception as e:
            print(f'DuckDuckGo 搜索失败: {e}')
            search_failed = True
        
        context += "--- 背景信息结束 ---\n\n"

        # --- 5. 调用 OpenRouter ---
        system_prompt = "你是一个强大的 AI 助手。请根据下面提供的实时背景信息来回答用户的问题。请优先、深入地利用这些信息，并进行合理的总结与推理。如果背景信息不足或没有提供，请直接利用你自身的知识进行回答。"
        final_prompt = f"{context}请基于以上信息，回答这个问题: \"{query}\""
        
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": final_prompt},
            ]
        )

        answer = completion.choices[0].message.content
        if search_failed:
            answer = "（抱歉，实时网络搜索暂时出现问题，以下是基于我的现有知识的回答）\n\n" + answer

        return jsonify({"answer": answer})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"服务器发生意外错误: {str(e)}"}), 500