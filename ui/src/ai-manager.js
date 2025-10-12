/**
 * AI Manager - Handles AI features (Ask/Chat and Edit)
 */

import { backendProvider } from './providers/backend-provider.js';
import { marked } from 'marked';

export class AIManager {
  constructor(editor) {
    this.editor = editor;
    this.currentChatId = null;
    this.currentEditResult = null;
    this.editHistory = []; // For undo/redo
    this.editHistoryIndex = -1;
    this.currentMode = null; // 'chat' or 'edit'
    
    // DOM elements - unified panel
    this.panel = document.getElementById('ai-panel');
    this.panelTitleText = document.getElementById('ai-panel-title-text');
    this.closePanelBtn = document.getElementById('ai-close-panel-btn');
    this.newChatBtn = document.getElementById('ai-new-chat-btn');
    this.toolbar = document.getElementById('ai-toolbar');
    
    // Chat elements
    this.chatList = document.getElementById('ai-chat-list');
    this.chatView = document.getElementById('ai-chat-view');
    this.messagesContainer = document.getElementById('ai-messages-container');
    this.chatInput = document.getElementById('ai-chat-input');
    this.sendBtn = document.getElementById('ai-send-btn');
    this.loadingIndicator = document.getElementById('ai-loading-indicator');
    
    // Edit elements
    this.editView = document.getElementById('ai-edit-view');
    this.editInstruction = document.getElementById('ai-edit-instruction');
    this.generateEditBtn = document.getElementById('ai-generate-edit-btn');
    this.editPreviewSection = document.getElementById('ai-edit-preview-section');
    this.editPreview = document.getElementById('ai-edit-preview');
    this.editResultSection = document.getElementById('ai-edit-result-section');
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
    this.configureMarkdown();
  }

  configureMarkdown() {
    // Configure marked for better code highlighting and rendering
    marked.setOptions({
      breaks: true, // Convert \n to <br>
      gfm: true, // GitHub Flavored Markdown
      headerIds: false,
      mangle: false
    });
  }

  setupEventListeners() {
    // Panel controls
    document.getElementById('ai-ask-btn').addEventListener('click', () => this.openPanel('chat'));
    document.getElementById('ai-edit-btn').addEventListener('click', () => this.openPanel('edit'));
    this.closePanelBtn.addEventListener('click', () => this.closePanel());
    this.newChatBtn.addEventListener('click', () => this.showChatList());
    document.getElementById('ai-start-chat-btn').addEventListener('click', () => this.startNewChat());
    
    // Chat input
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.chatInput.addEventListener('input', () => this.autoResizeTextarea(this.chatInput));
    
    // Edit controls
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
    this.editInstruction.addEventListener('input', () => this.autoResizeTextarea(this.editInstruction));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+A for Ask
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        this.openPanel('chat');
      }
      // Ctrl+Shift+E for Edit
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this.openPanel('edit');
      }
      // Escape to close panel
      if (e.key === 'Escape') {
        if (this.panel.classList.contains('active')) {
          this.closePanel();
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
      this.appendToEditPreview(token);
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
  // Panel Management Methods
  // ============================================================================

  async openPanel(mode) {
    if (!this.editor.currentFile) {
      this.editor.showMessage('Please open a file first');
      return;
    }
    
    this.currentMode = mode;
    this.panel.classList.add('active');
    this.panel.style.display = 'flex';
    
    // Hide floating action buttons when panel is open
    this.toolbar.style.display = 'none';
    
    // Hide all views
    this.chatList.style.display = 'none';
    this.chatView.style.display = 'none';
    this.editView.style.display = 'none';
    
    if (mode === 'chat') {
      this.panelTitleText.textContent = 'Chat';
      this.newChatBtn.style.display = 'flex';
      await this.showChatList();
    } else if (mode === 'edit') {
      this.panelTitleText.textContent = 'Edit with AI';
      this.newChatBtn.style.display = 'none';
      this.showEditView();
    }
  }

  closePanel() {
    this.panel.classList.remove('active');
    
    // Show floating action buttons again
    this.toolbar.style.display = 'flex';
    
    setTimeout(() => {
      this.panel.style.display = 'none';
      // Reset views
      this.chatList.style.display = 'none';
      this.chatView.style.display = 'none';
      this.editView.style.display = 'none';
    }, 250);
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
        this.chatList.style.display = 'flex';
        this.chatView.style.display = 'none';
        
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
      this.chatView.style.display = 'flex';
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
      this.chatView.style.display = 'flex';
      
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
    
    // Render markdown for assistant messages, plain text for user messages
    if (role === 'assistant') {
      contentDiv.innerHTML = marked.parse(content || '');
    } else {
      contentDiv.textContent = content;
    }
    
    messageDiv.appendChild(contentDiv);
    this.messagesContainer.appendChild(messageDiv);
    
    this.scrollMessagesToBottom();
  }

  appendToLastMessage(token) {
    const messages = this.messagesContainer.querySelectorAll('.ai-message');
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    const contentDiv = lastMessage.querySelector('.ai-message-content');
    
    // Store raw markdown in a data attribute
    const currentMarkdown = contentDiv.dataset.markdown || '';
    const newMarkdown = currentMarkdown + token;
    contentDiv.dataset.markdown = newMarkdown;
    
    // Re-render the markdown
    contentDiv.innerHTML = marked.parse(newMarkdown);
    
    this.scrollMessagesToBottom();
  }

  scrollMessagesToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  // ============================================================================
  // Edit View Methods
  // ============================================================================

  showEditView() {
    this.editView.style.display = 'flex';
    this.editPreviewSection.style.display = 'none';
    this.editResultSection.style.display = 'none';
    this.editInstruction.value = '';
    this.editInstruction.disabled = false;
    this.generateEditBtn.disabled = false;
    this.editInstruction.focus();
  }

  async generateEdit() {
    const instruction = this.editInstruction.value.trim();
    if (!instruction) return;
    
    // Disable input while generating
    this.editInstruction.disabled = true;
    this.generateEditBtn.disabled = true;
    
    // Show streaming preview section
    this.editResultSection.style.display = 'none';
    this.editPreviewSection.style.display = 'block';
    this.editPreview.textContent = '';
    
    try {
      // Gather context
      const context = this.gatherContext();
      
      // Request edit (streaming handled by callbacks)
      const result = await backendProvider.requestEdit(instruction, context);
      
      // Result will be shown by callback
    } catch (error) {
      console.error('[AIManager] Error generating edit:', error);
      this.editor.showMessage('Failed to generate edit: ' + error.message);
      this.editPreviewSection.style.display = 'none';
      this.editInstruction.disabled = false;
      this.generateEditBtn.disabled = false;
    }
  }

  showEditResult(result) {
    // Hide preview, show result
    this.editPreviewSection.style.display = 'none';
    this.editResultSection.style.display = 'flex';
    this.editInstruction.disabled = false;
    this.generateEditBtn.disabled = false;
    
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

  appendToEditPreview(token) {
    this.editPreview.textContent += token;
    // Auto-scroll to bottom
    this.editPreview.scrollTop = this.editPreview.scrollHeight;
  }

  acceptEdit() {
    if (!this.currentEditResult) return;
    
    const diff = this.currentEditResult.diff;
    if (!diff || !diff.hasChanges) {
      this.editor.showMessage('No changes to apply');
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
    
    // Reset edit view
    this.editResultSection.style.display = 'none';
    this.editInstruction.value = '';
    this.editInstruction.focus();
  }

  rejectEdit() {
    // Reset edit view
    this.editPreviewSection.style.display = 'none';
    this.editResultSection.style.display = 'none';
    this.editInstruction.value = '';
    this.editInstruction.focus();
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

  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }
}

