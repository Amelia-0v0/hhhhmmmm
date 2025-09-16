class OpenRouterChat {
    constructor() {
        this.apiKey = localStorage.getItem('openrouter_api_key') || '';
        this.currentModel = '';
        this.availableModels = [];
        this.isLoading = false;
        
        // 会话管理
        this.conversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        this.currentConversationId = null;
        this.conversationsPerPage = 20;
        this.conversationsLoaded = 0;
        
        this.initializeElements();
        this.bindEvents();
        this.loadApiKey();
        this.loadModels();
        this.loadConversations();
        
        // 如果没有会话，创建第一个
        if (this.conversations.length === 0) {
            this.createNewConversation();
        }
    }

    initializeElements() {
        this.elements = {
            // API 和模型相关
            apiKeyInput: document.getElementById('apiKey'),
            saveApiKeyBtn: document.getElementById('saveApiKey'),
            modelSelect: document.getElementById('modelSelect'),
            statusText: document.getElementById('statusText'),
            currentModelText: document.getElementById('currentModel'),
            
            // 聊天相关
            chatMessages: document.getElementById('chatMessages'),
            messageInput: document.getElementById('messageInput'),
            sendButton: document.getElementById('sendButton'),
            chatTitle: document.getElementById('chatTitle'),
            
            // 会话管理
            conversationsList: document.getElementById('conversationsList'),
            newChatBtn: document.getElementById('newChatBtn'),
            loadMoreBtn: document.getElementById('loadMoreBtn'),
            renameChatBtn: document.getElementById('renameChatBtn'),
            
            // 模态框
            renameModal: document.getElementById('renameModal'),
            renameInput: document.getElementById('renameInput'),
            confirmRename: document.getElementById('confirmRename'),
            cancelRename: document.getElementById('cancelRename')
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

        // 会话管理
        this.elements.newChatBtn.addEventListener('click', () => this.createNewConversation());
        this.elements.loadMoreBtn.addEventListener('click', () => this.loadMoreConversations());
        this.elements.renameChatBtn.addEventListener('click', () => this.showRenameModal());
        
        // 模态框事件
        this.elements.confirmRename.addEventListener('click', () => this.confirmRename());
        this.elements.cancelRename.addEventListener('click', () => this.hideRenameModal());
        this.elements.renameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.confirmRename();
            if (e.key === 'Escape') this.hideRenameModal();
        });
        
        // 点击模态框外部关闭
        this.elements.renameModal.addEventListener('click', (e) => {
            if (e.target === this.elements.renameModal) this.hideRenameModal();
        });
    }

    // ==================== API Key 和模型管理 ====================
    
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
        
        // 添加模型切换消息到当前会话
        if (this.currentConversationId && this.getCurrentConversation()?.messages.length > 0) {
            this.addSystemMessage(`已切换到模型: ${modelId}`);
        }
    }

    // ==================== 会话管理 ====================
    
    createNewConversation() {
        const conversation = {
            id: Date.now().toString(),
            title: '新会话',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            model: this.currentModel || ''
        };
        
        this.conversations.unshift(conversation);
        this.saveConversations();
        this.selectConversation(conversation.id);
        this.loadConversations();
    }

    selectConversation(conversationId) {
        this.currentConversationId = conversationId;
        const conversation = this.getCurrentConversation();
        
        if (!conversation) return;
        
        // 更新标题
        this.elements.chatTitle.textContent = conversation.title;
        this.elements.renameChatBtn.style.display = 'block';
        
        // 清空聊天区域并加载消息
        this.elements.chatMessages.innerHTML = '';
        this.loadConversationMessages(conversation);
        
        // 更新会话列表的激活状态
        this.updateConversationListUI();
        
        // 如果会话有保存的模型，切换到该模型
        if (conversation.model && conversation.model !== this.currentModel) {
            this.elements.modelSelect.value = conversation.model;
            this.selectModel(conversation.model);
        }
    }

    getCurrentConversation() {
        return this.conversations.find(conv => conv.id === this.currentConversationId);
    }

    loadConversations() {
        const container = this.elements.conversationsList;
        container.innerHTML = '';
        
        const toShow = Math.min(this.conversationsPerPage, this.conversations.length);
        this.conversationsLoaded = toShow;
        
        for (let i = 0; i < toShow; i++) {
            const conversation = this.conversations[i];
            const element = this.createConversationElement(conversation);
            container.appendChild(element);
        }
        
        // 显示/隐藏加载更多按钮
        this.elements.loadMoreBtn.style.display = 
            this.conversations.length > this.conversationsLoaded ? 'block' : 'none';
        
        // 如果没有选中的会话，选中第一个
        if (!this.currentConversationId && this.conversations.length > 0) {
            this.selectConversation(this.conversations[0].id);
        }
    }

    loadMoreConversations() {
        const container = this.elements.conversationsList;
        const remaining = this.conversations.length - this.conversationsLoaded;
        const toLoad = Math.min(this.conversationsPerPage, remaining);
        
        for (let i = this.conversationsLoaded; i < this.conversationsLoaded + toLoad; i++) {
            const conversation = this.conversations[i];
            const element = this.createConversationElement(conversation);
            container.appendChild(element);
        }
        
        this.conversationsLoaded += toLoad;
        
        // 隐藏按钮如果没有更多会话
        if (this.conversationsLoaded >= this.conversations.length) {
            this.elements.loadMoreBtn.style.display = 'none';
        }
    }

    createConversationElement(conversation) {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        div.dataset.conversationId = conversation.id;
        
        const lastMessage = conversation.messages.length > 0 ? 
            conversation.messages[conversation.messages.length - 1] : null;
        const preview = lastMessage ? 
            (lastMessage.content.length > 50 ? lastMessage.content.substring(0, 50) + '...' : lastMessage.content) : 
            '暂无消息';
        
        const timeAgo = this.getTimeAgo(conversation.updatedAt);
        
        div.innerHTML = `
            <div class="conversation-title">${conversation.title}</div>
            <div class="conversation-preview">${preview}</div>
            <div class="conversation-meta">
                <span>${timeAgo}</span>
                <div class="conversation-actions">
                    <button class="action-btn delete-btn" title="删除会话">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"></polyline>
                            <path d="M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        // 点击选择会话
        div.addEventListener('click', (e) => {
            if (!e.target.closest('.conversation-actions')) {
                this.selectConversation(conversation.id);
            }
        });
        
        // 删除按钮
        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteConversation(conversation.id);
        });
        
        return div;
    }

    updateConversationListUI() {
        const items = this.elements.conversationsList.querySelectorAll('.conversation-item');
        items.forEach(item => {
            if (item.dataset.conversationId === this.currentConversationId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    deleteConversation(conversationId) {
        if (this.conversations.length <= 1) {
            this.showError('至少需要保留一个会话');
            return;
        }
        
        if (confirm('确定要删除这个会话吗？')) {
            this.conversations = this.conversations.filter(conv => conv.id !== conversationId);
            this.saveConversations();
            
            // 如果删除的是当前会话，切换到第一个会话
            if (conversationId === this.currentConversationId) {
                this.selectConversation(this.conversations[0].id);
            }
            
            this.loadConversations();
        }
    }

    // ==================== 重命名功能 ====================
    
    showRenameModal() {
        const conversation = this.getCurrentConversation();
        if (!conversation) return;
        
        this.elements.renameInput.value = conversation.title;
        this.elements.renameModal.style.display = 'flex';
        this.elements.renameInput.focus();
        this.elements.renameInput.select();
    }

    hideRenameModal() {
        this.elements.renameModal.style.display = 'none';
    }

    confirmRename() {
        const newTitle = this.elements.renameInput.value.trim();
        if (!newTitle) {
            this.showError('会话名称不能为空');
            return;
        }
        
        const conversation = this.getCurrentConversation();
        if (conversation) {
            conversation.title = newTitle;
            conversation.updatedAt = new Date().toISOString();
            this.saveConversations();
            
            this.elements.chatTitle.textContent = newTitle;
            this.loadConversations();
        }
        
        this.hideRenameModal();
    }

    // ==================== 消息处理 ====================
    
    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message || !this.currentModel || !this.apiKey || this.isLoading) return;

        const conversation = this.getCurrentConversation();
        if (!conversation) {
            this.showError('请先选择或创建一个会话');
            return;
        }

        this.isLoading = true;
        this.elements.messageInput.value = '';
        this.elements.sendButton.disabled = true;
        
        // 添加用户消息
        this.addMessage('user', message);
        
        // 显示输入指示器
        this.showTypingIndicator();
        
        try {
            const response = await this.callOpenRouterAPI(message, conversation);
            this.hideTypingIndicator();
            this.addMessage('assistant', response, this.currentModel);
            
            // 更新会话标题（如果是第一条消息）
            if (conversation.messages.length === 2 && conversation.title === '新会话') {
                conversation.title = message.length > 30 ? message.substring(0, 30) + '...' : message;
                this.elements.chatTitle.textContent = conversation.title;
            }
            
            // 保存会话
            conversation.updatedAt = new Date().toISOString();
            conversation.model = this.currentModel;
            this.saveConversations();
            this.loadConversations();
            
        } catch (error) {
            this.hideTypingIndicator();
            this.showError(`发送消息失败: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.enableSendButton();
        }
    }

    async callOpenRouterAPI(message, conversation) {
        // 构建消息历史
        const messages = [
            ...conversation.messages.slice(-10), // 只保留最近10条消息
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
        const conversation = this.getCurrentConversation();
        if (!conversation) return;
        
        // 添加到会话历史
        conversation.messages.push({ role, content });
        
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

    loadConversationMessages(conversation) {
        conversation.messages.forEach(message => {
            this.addMessageToUI(message.role, message.content, conversation.model);
        });
    }

    addMessageToUI(role, content, model = null) {
        // 创建消息元素（不添加到会话历史）
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${role}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        if (role === 'assistant' && model) {
            const messageHeader = document.createElement('div');
            messageHeader.className = 'message-header';
            messageHeader.innerHTML = `
                <span class="model-badge">${model}</span>
            `;
            messageDiv.appendChild(messageHeader);
        }
        
        messageContent.textContent = content;
        messageDiv.appendChild(messageContent);
        
        this.elements.chatMessages.appendChild(messageDiv);
    }

    // ==================== UI 辅助方法 ====================
    
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

    autoResizeTextarea() {
        const textarea = this.elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        this.enableSendButton();
    }

    scrollToBottom() {
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    // ==================== 数据持久化 ====================
    
    saveConversations() {
        localStorage.setItem('conversations', JSON.stringify(this.conversations));
    }

    // ==================== 工具方法 ====================
    
    getTimeAgo(dateString) {
        const now = new Date();
        const date = new Date(dateString);
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return '刚刚';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}天前`;
        
        return date.toLocaleDateString();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new OpenRouterChat();
});
