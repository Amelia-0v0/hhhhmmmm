class OpenRouterChat {
    constructor() {
        this.apiKey = localStorage.getItem('openrouter_api_key') || '';
        this.currentModel = '';
        this.chatHistory = [];
        this.availableModels = [];
        this.isLoading = false;
        
        this.initializeElements();
        this.bindEvents();
        this.loadApiKey();
        this.loadModels();
    }

    initializeElements() {
        this.elements = {
            apiKeyInput: document.getElementById('apiKey'),
            saveApiKeyBtn: document.getElementById('saveApiKey'),
            modelSelect: document.getElementById('modelSelect'),
            chatMessages: document.getElementById('chatMessages'),
            messageInput: document.getElementById('messageInput'),
            sendButton: document.getElementById('sendButton'),
            statusText: document.getElementById('statusText'),
            currentModelText: document.getElementById('currentModel')
        };
    }

    bindEvents() {
        // API Key events
        this.elements.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());
        this.elements.apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveApiKey();
        });

        // Model selection
        this.elements.modelSelect.addEventListener('change', (e) => this.selectModel(e.target.value));

        // Message sending
        this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.elements.messageInput.addEventListener('input', () => this.autoResizeTextarea());
    }

    loadApiKey() {
        if (this.apiKey) {
            this.elements.apiKeyInput.value = this.apiKey;
            this.updateStatus('API Key 已加载');
            this.enableInterface();
        }
    }

    async saveApiKey() {
        const apiKey = this.elements.apiKeyInput.value.trim();
        if (!apiKey) {
            this.showError('请输入有效的 API Key');
            return;
        }

        this.apiKey = apiKey;
        localStorage.setItem('openrouter_api_key', apiKey);
        this.updateStatus('API Key 已保存');
        this.enableInterface();
        await this.loadModels();
    }

    async loadModels() {
        if (!this.apiKey) {
            this.updateStatus('请先输入 API Key');
            return;
        }

        try {
            this.updateStatus('加载模型列表...');
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.availableModels = data.data || [];
            this.populateModelSelect();
            this.updateStatus('模型列表加载完成');
        } catch (error) {
            console.error('加载模型失败:', error);
            this.showError(`加载模型失败: ${error.message}`);
            this.updateStatus('加载模型失败');
        }
    }

    populateModelSelect() {
        const select = this.elements.modelSelect;
        select.innerHTML = '<option value="">选择一个模型...</option>';

        // 按受欢迎程度和类型分组模型
        const popularModels = [
            'openai/gpt-4o',
            'openai/gpt-4o-mini',
            'anthropic/claude-3.5-sonnet',
            'anthropic/claude-3-haiku',
            'google/gemini-pro-1.5',
            'meta-llama/llama-3.1-8b-instruct',
            'mistralai/mistral-7b-instruct'
        ];

        const modelGroups = {
            'OpenAI': [],
            'Anthropic': [],
            'Google': [],
            'Meta': [],
            'Mistral': [],
            'Other': []
        };

        // 分组模型
        this.availableModels.forEach(model => {
            const id = model.id;
            if (id.includes('openai/')) {
                modelGroups['OpenAI'].push(model);
            } else if (id.includes('anthropic/')) {
                modelGroups['Anthropic'].push(model);
            } else if (id.includes('google/')) {
                modelGroups['Google'].push(model);
            } else if (id.includes('meta-llama/')) {
                modelGroups['Meta'].push(model);
            } else if (id.includes('mistralai/')) {
                modelGroups['Mistral'].push(model);
            } else {
                modelGroups['Other'].push(model);
            }
        });

        // 添加分组选项
        Object.entries(modelGroups).forEach(([groupName, models]) => {
            if (models.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = groupName;
                
                models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.id;
                    option.textContent = `${model.id} ${model.pricing ? `($${model.pricing.prompt}/1K tokens)` : ''}`;
                    optgroup.appendChild(option);
                });
                
                select.appendChild(optgroup);
            }
        });
    }

    selectModel(modelId) {
        if (!modelId) return;
        
        this.currentModel = modelId;
        this.elements.currentModelText.textContent = `当前模型: ${modelId}`;
        this.updateStatus('模型已选择，可以开始对话');
        this.enableSendButton();
        
        // 添加模型切换消息到聊天历史
        if (this.chatHistory.length > 0) {
            this.addSystemMessage(`已切换到模型: ${modelId}`);
        }
    }

    enableInterface() {
        this.elements.modelSelect.disabled = false;
        if (this.currentModel) {
            this.enableSendButton();
        }
    }

    enableSendButton() {
        const hasMessage = this.elements.messageInput.value.trim().length > 0;
        const hasModel = this.currentModel.length > 0;
        const hasApiKey = this.apiKey.length > 0;
        
        this.elements.sendButton.disabled = !(hasMessage && hasModel && hasApiKey && !this.isLoading);
    }

    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message || !this.currentModel || !this.apiKey || this.isLoading) return;

        this.isLoading = true;
        this.elements.messageInput.value = '';
        this.elements.sendButton.disabled = true;
        
        // 添加用户消息
        this.addMessage('user', message);
        
        // 显示输入指示器
        this.showTypingIndicator();
        
        try {
            const response = await this.callOpenRouterAPI(message);
            this.hideTypingIndicator();
            this.addMessage('assistant', response, this.currentModel);
        } catch (error) {
            this.hideTypingIndicator();
            this.showError(`发送消息失败: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.enableSendButton();
        }
    }

    async callOpenRouterAPI(message) {
        // 构建消息历史，只包含最近的对话
        const messages = [
            ...this.chatHistory.slice(-10), // 只保留最近10条消息
            { role: 'user', content: message }
        ];

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'OpenRouter Multi-Model Chat'
            },
            body: JSON.stringify({
                model: this.currentModel,
                messages: messages,
                temperature: 0.7,
                max_tokens: 2000,
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API 返回了无效的响应格式');
        }

        return data.choices[0].message.content;
    }

    addMessage(role, content, model = null) {
        // 添加到聊天历史
        this.chatHistory.push({ role, content });
        
        // 创建消息元素
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        if (role === 'assistant' && model) {
            const messageHeader = document.createElement('div');
            messageHeader.className = 'message-header';
            messageHeader.innerHTML = `
                <span class="model-badge">${model}</span>
                <span>${new Date().toLocaleTimeString()}</span>
            `;
            messageDiv.appendChild(messageHeader);
        }
        
        messageContent.textContent = content;
        messageDiv.appendChild(messageContent);
        
        // 移除欢迎消息
        const welcomeMessage = this.elements.chatMessages.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        this.elements.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addSystemMessage(content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.style.textAlign = 'center';
        messageDiv.style.margin = '10px 0';
        
        const messageContent = document.createElement('div');
        messageContent.style.background = '#e3f2fd';
        messageContent.style.color = '#1976d2';
        messageContent.style.padding = '8px 16px';
        messageContent.style.borderRadius = '16px';
        messageContent.style.fontSize = '12px';
        messageContent.style.display = 'inline-block';
        messageContent.textContent = content;
        
        messageDiv.appendChild(messageContent);
        this.elements.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message message-assistant';
        typingDiv.id = 'typing-indicator';
        
        const typingContent = document.createElement('div');
        typingContent.className = 'typing-indicator';
        typingContent.innerHTML = `
            <span>AI 正在输入</span>
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        typingDiv.appendChild(typingContent);
        this.elements.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        this.elements.chatMessages.appendChild(errorDiv);
        this.scrollToBottom();
        
        // 5秒后自动移除错误消息
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    updateStatus(status) {
        this.elements.statusText.textContent = status;
    }

    autoResizeTextarea() {
        const textarea = this.elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        this.enableSendButton();
    }

    scrollToBottom() {
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new OpenRouterChat();
});
