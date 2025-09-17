// 文件路径: /api/search.js

// 导入新的搜索库 duck-duck-scrape
const { search } = require('duck-duck-scrape');
const OpenAI = require('openai');

// 初始化 OpenRouter 客户端
const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY, // 从 Vercel 环境变量读取
});

// Vercel Serverless Function 的入口
module.exports = async (req, res) => {
  // 设置 CORS 头部
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { query, model } = req.body;

  if (!query || !model) {
    return res.status(400).json({ error: '请求中必须包含 "query" 和 "model"' });
  }

  try {
    // --- 1. 使用 duck-duck-scrape 执行搜索 ---
    console.log(`正在为查询进行搜索: "${query}"`);
    // 这个库的用法稍有不同，我们获取4条结果
    const searchResults = await search(query, { count: 4 });

    // --- 2. 整理搜索结果作为上下文 ---
    let context = "--- 以下是 DuckDuckGo 搜索到的相关背景信息 ---\n";
    if (searchResults.results && searchResults.results.length > 0) {
      searchResults.results.forEach((item, index) => {
        // 注意：这里的摘要字段是 description
        context += `[信息 ${index + 1}]: ${item.description}\n`; 
      });
    } else {
      context = "--- 未从网络上搜索到直接相关的背景信息 ---\n";
    }
    context += "--- 背景信息结束 ---\n\n";

    // --- 3. 构建 Prompt 并调用 OpenRouter ---
    const systemPrompt = "你是一个强大的 AI 助手。请根据下面提供的实时背景信息来回答用户的问题。请优先、深入地利用这些信息，并进行合理的总结与推理。如果背景信息不足，再结合你自身的知识进行回答。";
    const finalPrompt = `${context}请基于以上信息，回答这个问题: "${query}"`;

    console.log(`正在使用模型 ${model} 调用 OpenRouter...`);
    const completion = await openrouter.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: finalPrompt },
      ],
      site: 'OpenRouter Multi-Model Chat (Search Enhanced)', 
    });

    const answer = completion.choices[0].message.content;

    // --- 4. 返回最终答案 ---
    return res.status(200).json({ answer });

  } catch (error) {
    console.error('API 处理时发生错误:', error);
    return res.status(500).json({ error: '处理请求时服务器发生内部错误。' });
  }
};