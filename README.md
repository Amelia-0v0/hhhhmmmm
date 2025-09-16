# OpenRouter AI 多模型聊天应用

一个基于 OpenRouter.ai API 的现代化网页聊天应用，支持多种 LLM 模型并可在对话过程中自由切换。

## 🌟 功能特性

- **多模型支持**: 支持 OpenAI、Anthropic、Google、Meta、Mistral 等多家厂商的 LLM 模型
- **实时模型切换**: 在对话过程中可以随时切换不同的模型
- **现代化 UI**: 美观的渐变背景和响应式设计
- **智能分组**: 模型按厂商自动分组，便于选择
- **聊天历史**: 保持对话上下文，支持连续对话
- **实时状态**: 显示输入状态和当前使用的模型
- **错误处理**: 完善的错误提示和处理机制
- **本地存储**: API Key 安全存储在本地浏览器中
- **响应式设计**: 支持桌面和移动设备

## 🚀 快速开始

### 1. 获取 OpenRouter API Key

1. 访问 [OpenRouter.ai](https://openrouter.ai/)
2. 注册账户并登录
3. 在控制台中创建 API Key
4. 复制您的 API Key

### 2. 运行应用

1. 下载项目文件到本地
2. 使用浏览器打开 `index.html` 文件
3. 或者使用本地服务器运行（推荐）:
   ```bash
   # 使用 Python
   python -m http.server 8000
   
   # 使用 Node.js
   npx serve .
   
   # 使用 PHP
   php -S localhost:8000
   ```

### 3. 配置和使用

1. **输入 API Key**: 在页面顶部输入您的 OpenRouter API Key 并点击"保存"
2. **选择模型**: 从下拉菜单中选择您想要使用的 LLM 模型
3. **开始对话**: 在底部输入框中输入消息并发送
4. **切换模型**: 随时可以从下拉菜单选择不同的模型继续对话

## 📁 项目结构

```
openrouter-chat/
├── index.html          # 主页面结构
├── styles.css          # 样式文件
├── script.js           # 核心 JavaScript 逻辑
└── README.md           # 项目文档
```

## 🎨 支持的模型

应用支持 OpenRouter.ai 平台上的所有可用模型，包括但不限于：

### OpenAI 系列
- GPT-4o
- GPT-4o Mini
- GPT-4 Turbo
- GPT-3.5 Turbo

### Anthropic 系列
- Claude 3.5 Sonnet
- Claude 3 Opus
- Claude 3 Haiku

### Google 系列
- Gemini Pro 1.5
- Gemini Pro

### Meta 系列
- Llama 3.1 (各种规格)
- Llama 2

### Mistral 系列
- Mistral 7B Instruct
- Mixtral 8x7B

## 🔧 技术特性

### 前端技术
- **纯 HTML/CSS/JavaScript**: 无需额外框架
- **现代 ES6+**: 使用类、异步函数等现代语法
- **响应式设计**: CSS Grid 和 Flexbox 布局
- **动画效果**: CSS 动画和过渡效果

### API 集成
- **RESTful API**: 标准的 HTTP 请求
- **错误处理**: 完善的异常捕获和用户提示
- **请求优化**: 智能的消息历史管理
- **安全性**: API Key 本地存储，不会发送到第三方

### 用户体验
- **实时反馈**: 输入状态指示器
- **自动滚动**: 消息自动滚动到底部
- **键盘快捷键**: Enter 发送，Shift+Enter 换行
- **自适应输入框**: 输入框高度自动调整

## 🛠️ 自定义配置

### 修改默认设置

在 `script.js` 中可以修改以下配置：

```javascript
// 修改保留的聊天历史数量
const messages = [
    ...this.chatHistory.slice(-10), // 改为其他数字
    { role: 'user', content: message }
];

// 修改 API 请求参数
body: JSON.stringify({
    model: this.currentModel,
    messages: messages,
    temperature: 0.7,        // 调整创造性 (0-1)
    max_tokens: 2000,        // 调整最大输出长度
    stream: false
})
```

### 添加自定义样式

在 `styles.css` 中可以修改：
- 颜色主题
- 字体样式
- 布局尺寸
- 动画效果

## 🔒 安全说明

- **API Key 安全**: API Key 仅存储在用户本地浏览器中，不会上传到任何服务器
- **HTTPS 要求**: 建议在 HTTPS 环境下使用以确保数据传输安全
- **隐私保护**: 聊天记录仅在当前会话中保存，刷新页面后清空

## 🐛 故障排除

### 常见问题

1. **模型加载失败**
   - 检查 API Key 是否正确
   - 确认网络连接正常
   - 查看浏览器控制台错误信息

2. **消息发送失败**
   - 确认已选择模型
   - 检查 API Key 余额
   - 查看错误提示信息

3. **界面显示异常**
   - 清除浏览器缓存
   - 检查浏览器兼容性
   - 确认所有文件完整

### 浏览器兼容性

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 📝 更新日志

### v1.0.0 (2024-09-17)
- 初始版本发布
- 支持多模型聊天
- 实现模型切换功能
- 添加现代化 UI 设计
- 完善错误处理机制

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

## 📄 许可证

MIT License - 详见 LICENSE 文件

## 🔗 相关链接

- [OpenRouter.ai 官网](https://openrouter.ai/)
- [OpenRouter API 文档](https://openrouter.ai/docs)
- [支持的模型列表](https://openrouter.ai/models)

---

**注意**: 使用本应用需要有效的 OpenRouter.ai API Key，API 调用会产生费用，请注意控制使用量。
