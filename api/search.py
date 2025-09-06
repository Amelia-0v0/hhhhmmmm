# /api/search.py (最终修复版)

import os
import httpx  # 👈 1. 导入 httpx 库
from flask import Flask, request, jsonify
from flask_cors import CORS
from duckduckgo_search import DDGS
from openai import OpenAI

app = Flask(__name__ )
CORS(app)

@app.route('/api/search', methods=['POST'])
def search_handler():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({"error": "请求头中缺少有效的 API Key"}), 401
    
    api_key = auth_header.split(' ')[1]

    data = request.get_json()
    if not data:
        return jsonify({"error": "无效的 JSON"}), 400

    query = data.get('query')
    model = data.get('model')

    if not query or not model:
        return jsonify({"error": "请求中必须包含 'query' 和 'model'"}), 400

    try:
        # 👇 2. 创建一个 httpx 客户端
        # 这允许 Vercel 的代理配置被正确应用
        http_client = httpx.Client(
            proxies=os.environ.get("https_proxy" ) or os.environ.get("http_proxy" )
        )

        # 👇 3. 将配置好的 httpx 客户端传递给 OpenAI
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            http_client=http_client  # 👈 使用这个参数
         )
    except Exception as e:
        print(f'OpenAI 客户端初始化失败: {e}')
        # 将错误信息返回给前端，方便调试
        return jsonify({"error": f"AI 客户端初始化失败: {str(e)}"}), 500

    # --- 后续的搜索和调用逻辑 (保持不变) ---
    context = "--- 未从网络上搜索到直接相关的背景信息 ---\n"
    search_failed = False

    try:
        print(f'正在使用 duckduckgo-search 为查询进行搜索: "{query}"')
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=4))
            if results:
                context = "--- 以下是 DuckDuckGo 搜索到的相关背景信息 ---\n"
                for i, res in enumerate(results):
                    context += f"[信息 {i + 1}]: {res['body']}\n"
    except Exception as e:
        print(f'DuckDuckGo 搜索失败，将跳过搜索步骤: {e}')
        search_failed = True
    
    context += "--- 背景信息结束 ---\n\n"

    try:
        system_prompt = "你是一个强大的 AI 助手。请根据下面提供的实时背景信息来回答用户的问题。请优先、深入地利用这些信息，并进行合理的总结与推理。如果背景信息不足或没有提供，请直接利用你自身的知识进行回答。"
        final_prompt = f"{context}请基于以上信息，回答这个问题: \"{query}\""
        
        print(f"正在使用模型 {model} 调用 OpenRouter...")
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
        print(f'调用 OpenRouter 时发生错误: {e}')
        return jsonify({"error": f"调用 AI 模型时发生内部错误: {str(e)}"}), 500

