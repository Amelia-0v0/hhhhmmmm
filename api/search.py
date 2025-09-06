# 文件路径: /api/search.py

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from duckduckgo_search import DDGS
from openai import OpenAI

# 初始化 Flask 应用
app = Flask(__name__)
CORS(app)

# 初始化 OpenRouter 客户端 (使用正确的 'base_url' 参数)
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY"),
)

@app.route('/api/search', methods=['POST'])
def search_handler():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    query = data.get('query')
    model = data.get('model')

    if not query or not model:
        return jsonify({"error": "请求中必须包含 'query' 和 'model'"}), 400

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
        return jsonify({"error": "调用 AI 模型时发生内部错误。"}), 500