/**
 * AI Manager - Handles AI features (Ask/Chat and Edit)
 */

import { backendProvider } from './providers/backend-provider.js';

export class AIManager {
  constructor(editor) {
    this.editor = editor;
    this.currentChatId = null;
    this.currentEditResult = null;
    this.editHistory = []; // For undo/redo
    this.editHistoryIndex = -1;
    
    // DOM elements
    this.chatPanel = document.getElementById('ai-chat-panel');
    this.chatList = document.getElementById('ai-chat-list');
    this.chatActive = document.getElementById('ai-chat-active');
    this.messagesContainer = document.getElementById('ai-messages-container');
    this.chatInput = document.getElementById('ai-chat-input');
    this.sendBtn = document.getElementById('ai-send-btn');
    this.loadingIndicator = document.getElementById('ai-loading-indicator');
    
    this.editModal = document.getElementById('ai-edit-modal');
    this.editInstruction = document.getElementById('ai-edit-instruction');
    this.generateEditBtn = document.getElementById('ai-generate-edit-btn');
    this.editInputSection = document.getElementById('ai-edit-input-section');
    this.editResultSection = document.getElementById('ai-edit-result-section');
    this.editLoading = document.getElementById('ai-edit-loading');
    this.diffDisplay = document.getElementById('ai-diff-display');
    this.acceptEditBtn = document.getElementById('ai-accept-edit-btn');
    this.rejectEditBtn = document.getElementById('ai-reject-edit-btn');
    
    this.modelStatus = document.getElementById('ai-model-status');
    this.statusIndicator = this.modelStatus.querySelector('.ai-status-indicator');
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupBackendCallbacks();
    this.updateModelStatus('loading');
  }

  setupEventListeners() {
    // Chat panel controls
    document.getElementById('ai-ask-btn').addEventListener('click', () => this.openChatPanel());
    document.getElementById('ai-close-chat-btn').addEventListener('click', () => this.closeChatPanel());
    document.getElementById('ai-new-chat-btn').addEventListener('click', () => this.showChatList());
    document.getElementById('ai-start-chat-btn').addEventListener('click', () => this.startNewChat());
    
    // Chat input
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // Edit modal controls
    document.getElementById('ai-edit-btn').addEventListener('click', () => this.openEditModal());
    document.getElementById('ai-close-edit-btn').addEventListener('click', () => this.closeEditModal());
    this.generateEditBtn.addEventListener('click', () => this.generateEdit());
    this.acceptEditBtn.addEventListener('click', () => this.acceptEdit());
    this.rejectEditBtn.addEventListener('click', () => this.rejectEdit());
    
    // Edit instruction enter handling
    this.editInstruction.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        this.generateEdit();
      }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+A for Ask
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        this.openChatPanel();
      }
      // Ctrl+Shift+E for Edit
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this.openEditModal();
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        if (this.chatPanel.classList.contains('active')) {
          this.closeChatPanel();
        }
        if (this.editModal.style.display === 'block') {
          this.closeEditModal();
        }
      }
    });
  }

  setupBackendCallbacks() {
    // Model loading progress
    backendProvider.onAIModelLoading = (progress) => {
      console.log('[AIManager] Model loading progress:', progress);
      this.updateModelStatus('loading');
    };
    
    // Model loaded
    backendProvider.onAIModelLoaded = (result) => {
      console.log('[AIManager] Model loaded:', result);
      if (result.success) {
        this.updateModelStatus('ready');
      } else {
        this.updateModelStatus('error');
        console.error('[AIManager] Model load error:', result.error);
      }
    };
    
    // Chat response tokens (streaming)
    backendProvider.onAIChatResponseToken = (chatId, token) => {
      if (chatId === this.currentChatId) {
        this.appendToLastMessage(token);
      }
    };
    
    // Chat response end
    backendProvider.onAIChatResponseEnd = (chatId, response) => {
      if (chatId === this.currentChatId) {
        this.loadingIndicator.style.display = 'none';
        this.chatInput.disabled = false;
        this.sendBtn.disabled = false;
      }
    };
    
    // Edit response tokens (streaming)
    backendProvider.onAIEditResponseToken = (token) => {
      // Could show streaming preview here if desired
    };
    
    // Edit response end
    backendProvider.onAIEditResponseEnd = (result) => {
      this.currentEditResult = result;
      this.showEditResult(result);
    };
  }

  updateModelStatus(status) {
    this.statusIndicator.className = 'ai-status-indicator ' + status;
    
    const statusTexts = {
      loading: 'Loading AI Model...',
      ready: 'AI Model Ready',
      error: 'AI Model Error'
    };
    
    this.modelStatus.title = statusTexts[status] || 'Unknown Status';
  }

  // ============================================================================
  // Chat Panel Methods
  // ============================================================================

  async openChatPanel() {
    if (!this.editor.currentFile) {
      this.editor.showMessage('Please open a file first');
      return;
    }
    
    this.chatPanel.classList.add('active');
    this.chatPanel.style.display = 'flex';
    
    // Show chat list or start new chat
    await this.showChatList();
  }

  closeChatPanel() {
    this.chatPanel.classList.remove('active');
    setTimeout(() => {
      this.chatPanel.style.display = 'none';
    }, 300);
  }

  async showChatList() {
    try {
      const chats = await backendProvider.getChats(this.editor.currentFile);
      
      const chatsContainer = document.getElementById('ai-chats-container');
      chatsContainer.innerHTML = '';
      
      if (chats.length === 0) {
        // No chats, start a new one automatically
        await this.startNewChat();
      } else {
        // Show list of chats
        this.chatList.style.display = 'block';
        this.chatActive.style.display = 'none';
        
        chats.forEach(chat => {
          const chatItem = document.createElement('div');
          chatItem.className = 'ai-chat-item';
          chatItem.innerHTML = `
            <div class="ai-chat-item-title">${this.escapeHtml(chat.title)}</div>
            <div class="ai-chat-item-time">${this.formatTime(chat.updatedAt)}</div>
          `;
          chatItem.addEventListener('click', () => this.loadChat(chat.id));
          chatsContainer.appendChild(chatItem);
        });
      }
    } catch (error) {
      console.error('[AIManager] Error loading chats:', error);
      this.editor.showMessage('Failed to load chats');
    }
  }

  async startNewChat() {
    try {
      const { chatId } = await backendProvider.createChat(this.editor.currentFile);
      this.currentChatId = chatId;
      
      this.chatList.style.display = 'none';
      this.chatActive.style.display = 'flex';
      this.messagesContainer.innerHTML = '';
      this.chatInput.value = '';
      this.chatInput.focus();
    } catch (error) {
      console.error('[AIManager] Error creating chat:', error);
      this.editor.showMessage('Failed to create chat');
    }
  }

  async loadChat(chatId) {
    try {
      const chat = await backendProvider.getChat(chatId);
      this.currentChatId = chatId;
      
      this.chatList.style.display = 'none';
      this.chatActive.style.display = 'flex';
      
      // Display messages
      this.messagesContainer.innerHTML = '';
      chat.messages.forEach(msg => {
        this.addMessageToUI(msg.role, msg.content, false);
      });
      
      this.chatInput.value = '';
      this.chatInput.focus();
      this.scrollMessagesToBottom();
    } catch (error) {
      console.error('[AIManager] Error loading chat:', error);
      this.editor.showMessage('Failed to load chat');
    }
  }

  async sendMessage() {
    const question = this.chatInput.value.trim();
    if (!question) return;
    
    // Add user message to UI
    this.addMessageToUI('user', question);
    this.chatInput.value = '';
    this.chatInput.disabled = true;
    this.sendBtn.disabled = true;
    
    // Show loading indicator
    this.loadingIndicator.style.display = 'block';
    
    // Add placeholder for AI response
    this.addMessageToUI('assistant', '');
    
    try {
      // Gather context
      const context = this.gatherContext();
      
      // Send to backend (streaming handled by callbacks)
      await backendProvider.sendChatMessage(this.currentChatId, question, context);
      
    } catch (error) {
      console.error('[AIManager] Error sending message:', error);
      this.editor.showMessage('Failed to send message: ' + error.message);
      this.loadingIndicator.style.display = 'none';
      this.chatInput.disabled = false;
      this.sendBtn.disabled = false;
    }
  }

  addMessageToUI(role, content, animate = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ai-message-${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(contentDiv);
    this.messagesContainer.appendChild(messageDiv);
    
    this.scrollMessagesToBottom();
  }

  appendToLastMessage(token) {
    const messages = this.messagesContainer.querySelectorAll('.ai-message');
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    const contentDiv = lastMessage.querySelector('.ai-message-content');
    contentDiv.textContent += token;
    
    this.scrollMessagesToBottom();
  }

  scrollMessagesToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  // ============================================================================
  // Edit Modal Methods
  // ============================================================================

  openEditModal() {
    if (!this.editor.currentFile) {
      this.editor.showMessage('Please open a file first');
      return;
    }
    
    this.editModal.style.display = 'flex';
    this.editInputSection.style.display = 'block';
    this.editResultSection.style.display = 'none';
    this.editLoading.style.display = 'none';
    this.editInstruction.value = '';
    this.editInstruction.focus();
  }

  closeEditModal() {
    this.editModal.style.display = 'none';
  }

  async generateEdit() {
    const instruction = this.editInstruction.value.trim();
    if (!instruction) return;
    
    // Show loading
    this.editInputSection.style.display = 'none';
    this.editLoading.style.display = 'block';
    
    try {
      // Gather context
      const context = this.gatherContext();
      
      // Request edit (streaming handled by callbacks)
      const result = await backendProvider.requestEdit(instruction, context);
      
      // Result will be shown by callback
    } catch (error) {
      console.error('[AIManager] Error generating edit:', error);
      this.editor.showMessage('Failed to generate edit: ' + error.message);
      this.editLoading.style.display = 'none';
      this.editInputSection.style.display = 'block';
    }
  }

  showEditResult(result) {
    this.editLoading.style.display = 'none';
    this.editResultSection.style.display = 'block';
    
    // Format and display diff
    const diff = result.diff;
    if (diff && diff.hasChanges) {
      let diffHtml = '';
      
      for (const hunk of diff.hunks) {
        for (const line of hunk.lines) {
          let lineClass = '';
          let prefix = ' ';
          
          if (line.type === 'add') {
            lineClass = 'diff-add';
            prefix = '+';
          } else if (line.type === 'remove') {
            lineClass = 'diff-remove';
            prefix = '-';
          }
          
          const lineSpan = lineClass ? 
            `<span class="${lineClass}">${this.escapeHtml(prefix + line.content)}</span>\n` :
            this.escapeHtml(prefix + line.content) + '\n';
          
          diffHtml += lineSpan;
        }
      }
      
      this.diffDisplay.innerHTML = diffHtml;
    } else {
      this.diffDisplay.textContent = 'No changes detected';
    }
  }

  acceptEdit() {
    if (!this.currentEditResult) return;
    
    const diff = this.currentEditResult.diff;
    if (!diff || !diff.hasChanges) {
      this.editor.showMessage('No changes to apply');
      this.closeEditModal();
      return;
    }
    
    // Save current state for undo
    this.saveEditState();
    
    // Apply the edit
    const newText = diff.newText;
    
    // Get selection or replace whole content
    const selection = this.getSelection();
    if (selection) {
      // Replace selection
      const content = this.editor.getEditorContent();
      const before = content.substring(0, selection.start);
      const after = content.substring(selection.end);
      this.editor.setEditorContent(before + newText + after);
    } else {
      // Replace whole file
      this.editor.setEditorContent(newText);
    }
    
    this.editor.isDirty = true;
    this.editor.updateStatusBar();
    this.editor.showMessage('Edit applied successfully');
    this.closeEditModal();
  }

  rejectEdit() {
    this.closeEditModal();
    this.editor.showMessage('Edit rejected');
  }

  saveEditState() {
    const state = {
      content: this.editor.getEditorContent(),
      cursorPos: this.editor.getCursorPosition()
    };
    
    // Remove any states after current index (if user went back and made new edit)
    this.editHistory = this.editHistory.slice(0, this.editHistoryIndex + 1);
    
    this.editHistory.push(state);
    this.editHistoryIndex = this.editHistory.length - 1;
    
    // Limit history to 50 states
    if (this.editHistory.length > 50) {
      this.editHistory.shift();
      this.editHistoryIndex--;
    }
  }

  undo() {
    if (this.editHistoryIndex <= 0) {
      this.editor.showMessage('Nothing to undo');
      return;
    }
    
    this.editHistoryIndex--;
    const state = this.editHistory[this.editHistoryIndex];
    this.editor.setEditorContent(state.content);
    this.editor.setCursorPosition(state.cursorPos);
    this.editor.showMessage('Undo');
  }

  redo() {
    if (this.editHistoryIndex >= this.editHistory.length - 1) {
      this.editor.showMessage('Nothing to redo');
      return;
    }
    
    this.editHistoryIndex++;
    const state = this.editHistory[this.editHistoryIndex];
    this.editor.setEditorContent(state.content);
    this.editor.setCursorPosition(state.cursorPos);
    this.editor.showMessage('Redo');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  gatherContext() {
    const context = {
      filePath: this.editor.currentFile,
      content: this.editor.getEditorContent(),
      language: this.editor.currentLanguage,
      cursorPosition: this.editor.getCursorPosition()
    };
    
    const selection = this.getSelection();
    if (selection) {
      context.selection = {
        start: { line: 0, character: selection.start },
        end: { line: 0, character: selection.end },
        text: selection.text
      };
    }
    
    return context;
  }

  getSelection() {
    const start = this.editor.editor.selectionStart;
    const end = this.editor.editor.selectionEnd;
    
    if (start !== end) {
      const text = this.editor.editor.value.substring(start, end);
      return { start, end, text };
    }
    
    return null;
  }

  formatTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

