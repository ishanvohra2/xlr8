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
    
    // Multi-file support - track attached files for chat and edit separately
    this.chatAttachedFiles = []; // Array of file paths
    this.editAttachedFiles = []; // Array of file paths
    
    // Buffers for streaming performance
    this.editPreviewBuffer = '';
    this.editPreviewUpdateScheduled = false;
    this.chatMessageBuffer = '';
    this.chatMessageUpdateScheduled = false;
    
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
    
    // Shared file chips elements (used by both chat and edit)
    this.filesContainer = document.getElementById('ai-files-container');
    this.filesChips = document.getElementById('ai-files-chips');
    this.addFileBtn = document.getElementById('ai-add-file-btn');
    
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
    
    // Shared file attachment button
    this.addFileBtn.addEventListener('click', () => this.addFile());
    
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
    backendProvider.onAIEditResponseEnd = (data) => {
      this.currentEditResult = data.result;
      this.showEditResult(data.result);
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
      // Initialize with current file attached
      if (this.chatAttachedFiles.length === 0 && this.editor.currentFile) {
        this.chatAttachedFiles = [this.editor.currentFile];
      }
      this.updateFileChips();
      await this.showChatList();
    } else if (mode === 'edit') {
      this.panelTitleText.textContent = 'Edit with AI';
      this.newChatBtn.style.display = 'none';
      // Initialize with current file attached
      if (this.editAttachedFiles.length === 0 && this.editor.currentFile) {
        this.editAttachedFiles = [this.editor.currentFile];
      }
      this.updateFileChips();
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
    
    // Reset chat message buffer
    this.chatMessageBuffer = '';
    this.chatMessageUpdateScheduled = false;
    
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
      const context = await this.gatherContext();
      
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
    
    // Add token to buffer
    this.chatMessageBuffer += token;
    
    // Schedule DOM update if not already scheduled
    if (!this.chatMessageUpdateScheduled) {
      this.chatMessageUpdateScheduled = true;
      
      // Use requestAnimationFrame for smooth, batched updates
      requestAnimationFrame(() => {
        // Store raw markdown in a data attribute
        const currentMarkdown = contentDiv.dataset.markdown || '';
        const newMarkdown = currentMarkdown + this.chatMessageBuffer;
        contentDiv.dataset.markdown = newMarkdown;
        
        // Re-render the markdown
        contentDiv.innerHTML = marked.parse(newMarkdown);
        
        // Clear buffer
        this.chatMessageBuffer = '';
        
        // Reset flag for next batch
        this.chatMessageUpdateScheduled = false;
        
        this.scrollMessagesToBottom();
      });
    }
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
    
    // Reset buffers
    this.editPreviewBuffer = '';
    this.editPreviewUpdateScheduled = false;
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
    
    // Reset buffers
    this.editPreviewBuffer = '';
    this.editPreviewUpdateScheduled = false;
    
    try {
      // Gather context
      const context = await this.gatherContext();
      
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
    // Ensure final buffer content is displayed before hiding
    if (this.editPreviewBuffer) {
      this.editPreview.textContent = this.editPreviewBuffer;
      this.editPreviewBuffer = '';
      this.editPreviewUpdateScheduled = false;
    }
    
    // Hide preview, show result
    this.editPreviewSection.style.display = 'none';
    this.editResultSection.style.display = 'flex';
    this.editInstruction.disabled = false;
    this.generateEditBtn.disabled = false;
    
    // Check if it's a multi-file edit
    if (result.type === 'multi-file') {
      this.showMultiFileDiff(result);
    } else {
      // Single file edit (legacy)
      this.showSingleFileDiff(result.diff);
    }
  }

  showSingleFileDiff(diff) {
    // Format and display single file diff
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

  showMultiFileDiff(result) {
    // Display multi-file diff with file tabs
    const filesWithChanges = result.files.filter(f => f.hasChanges);
    
    if (filesWithChanges.length === 0) {
      this.diffDisplay.innerHTML = '<div class="ai-no-changes">No changes detected</div>';
      return;
    }
    
    // Create tabbed interface for multiple files
    let html = '';
    
    // Show explanation if present
    if (result.explanation) {
      html += `<div class="ai-edit-explanation">${this.escapeHtml(result.explanation)}</div>`;
    }
    
    // Create file tabs
    html += '<div class="ai-diff-tabs">';
    filesWithChanges.forEach((file, index) => {
      const fileName = file.filePath.split('/').pop();
      html += `<button class="ai-diff-tab ${index === 0 ? 'active' : ''}" data-file-index="${index}">
        <span class="ai-diff-tab-name">${this.escapeHtml(fileName)}</span>
        <span class="ai-diff-tab-path">${this.escapeHtml(file.filePath)}</span>
      </button>`;
    });
    html += '</div>';
    
    // Create diff displays for each file
    html += '<div class="ai-diff-contents">';
    filesWithChanges.forEach((file, index) => {
      html += `<div class="ai-diff-content ${index === 0 ? 'active' : ''}" data-file-index="${index}">`;
      html += `<div class="ai-diff-header">${this.escapeHtml(file.filePath)}</div>`;
      html += '<pre class="ai-diff-code">';
      
      // Format diff for this file
      if (file.diff && file.diff.hasChanges) {
        for (const hunk of file.diff.hunks) {
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
            
            html += lineSpan;
          }
        }
      } else {
        html += 'No changes in this file';
      }
      
      html += '</pre>';
      html += '</div>';
    });
    html += '</div>';
    
    this.diffDisplay.innerHTML = html;
    
    // Add click handlers for tabs
    const tabs = this.diffDisplay.querySelectorAll('.ai-diff-tab');
    const contents = this.diffDisplay.querySelectorAll('.ai-diff-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const fileIndex = parseInt(tab.dataset.fileIndex);
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        contents.forEach(c => c.classList.remove('active'));
        contents[fileIndex].classList.add('active');
      });
    });
  }

  appendToEditPreview(token) {
    // Add token to buffer
    this.editPreviewBuffer += token;
    
    // Schedule DOM update if not already scheduled
    if (!this.editPreviewUpdateScheduled) {
      this.editPreviewUpdateScheduled = true;
      
      // Use requestAnimationFrame for smooth, batched updates
      requestAnimationFrame(() => {
        // Update the DOM with buffered content
        this.editPreview.textContent = this.editPreviewBuffer;
        
        // Auto-scroll to bottom
        this.editPreview.scrollTop = this.editPreview.scrollHeight;
        
        // Reset flag for next batch
        this.editPreviewUpdateScheduled = false;
      });
    }
  }

  async acceptEdit() {
    if (!this.currentEditResult) return;
    
    const result = this.currentEditResult;
    
    // Check if multi-file edit
    if (result.type === 'multi-file') {
      await this.acceptMultiFileEdit(result);
    } else {
      // Single file edit (legacy)
      await this.acceptSingleFileEdit(result);
    }
  }

  async acceptSingleFileEdit(result) {
    const diff = result.diff;
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

  async acceptMultiFileEdit(result) {
    if (!result.hasChanges) {
      this.editor.showMessage('No changes to apply');
      return;
    }
    
    const filesWithChanges = result.files.filter(f => f.hasChanges);
    
    if (filesWithChanges.length === 0) {
      this.editor.showMessage('No changes to apply');
      return;
    }
    
    // Apply changes to all files
    let appliedCount = 0;
    const errors = [];
    
    for (const file of filesWithChanges) {
      try {
        const filePath = file.filePath;
        const newContent = file.diff.newText;
        
        // Check if file is currently open in editor
        if (this.editor.currentFile === filePath) {
          // Update current file
          this.saveEditState();
          this.editor.setEditorContent(newContent);
          this.editor.isDirty = true;
          appliedCount++;
        } else {
          // Check if file is in buffer manager
          const buffer = this.editor.bufferManager?.getBufferByPath(filePath);
          if (buffer) {
            // Update buffer content
            buffer.content = newContent;
            buffer.isDirty = true;
            appliedCount++;
          } else {
            // File not open - save directly to filesystem
            await backendProvider.saveFile(filePath, newContent);
            appliedCount++;
          }
        }
      } catch (error) {
        console.error(`[AIManager] Error applying edit to ${file.filePath}:`, error);
        errors.push({ file: file.filePath, error: error.message });
      }
    }
    
    // Update UI
    this.editor.updateStatusBar();
    
    // Show result message
    if (errors.length > 0) {
      this.editor.showMessage(`Applied ${appliedCount}/${filesWithChanges.length} file edits. ${errors.length} error(s).`);
      console.error('[AIManager] Errors applying edits:', errors);
    } else {
      this.editor.showMessage(`Successfully applied edits to ${appliedCount} file(s)`);
    }
    
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
  // File Attachment Methods
  // ============================================================================

  async addFile() {
    const filePath = await this.selectFile();
    if (!filePath) return; // User cancelled
    
    const attachedFiles = this.currentMode === 'chat' ? this.chatAttachedFiles : this.editAttachedFiles;
    
    if (!attachedFiles.includes(filePath)) {
      attachedFiles.push(filePath);
      this.updateFileChips();
    }
  }

  removeFile(filePath) {
    if (this.currentMode === 'chat') {
      this.chatAttachedFiles = this.chatAttachedFiles.filter(f => f !== filePath);
    } else {
      this.editAttachedFiles = this.editAttachedFiles.filter(f => f !== filePath);
    }
    this.updateFileChips();
  }

  updateFileChips() {
    const attachedFiles = this.currentMode === 'chat' ? this.chatAttachedFiles : this.editAttachedFiles;
    
    // Clear existing chips
    this.filesChips.innerHTML = '';
    
    // Show/hide container based on whether there are files
    if (attachedFiles.length > 0) {
      this.filesContainer.style.display = 'flex';
      
      // Create chips for each file
      attachedFiles.forEach(filePath => {
        const chip = document.createElement('div');
        chip.className = 'ai-file-chip';
        
        const fileName = filePath.split('/').pop();
        
        chip.innerHTML = `
          <span class="ai-file-chip-name" title="${this.escapeHtml(filePath)}">${this.escapeHtml(fileName)}</span>
          <button class="ai-file-chip-remove" title="Remove file">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        `;
        
        const removeBtn = chip.querySelector('.ai-file-chip-remove');
        removeBtn.addEventListener('click', () => {
          this.removeFile(filePath);
        });
        
        this.filesChips.appendChild(chip);
      });
    } else {
      this.filesContainer.style.display = 'none';
    }
  }

  async selectFile() {
    // Use the fuzzy finder to select a file
    return new Promise((resolve) => {
      if (this.editor.fuzzyFinder) {
        // Set temporary callback for file selection
        this.editor.fuzzyFinder.tempCallback = (filePath) => {
          resolve(filePath);
        };
        
        // Open the fuzzy finder
        this.editor.fuzzyFinder.open();
      } else {
        // Fallback: prompt for file path
        const filePath = prompt('Enter file path:');
        resolve(filePath);
      }
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  async gatherContext() {
    const mode = this.currentMode;
    const attachedFiles = mode === 'chat' ? this.chatAttachedFiles : this.editAttachedFiles;
    
    // Build context with multiple files
    const contexts = [];
    
    for (const filePath of attachedFiles) {
      // Get file content
      let content = '';
      let language = 'javascript';
      
      // Check if it's the current file
      if (filePath === this.editor.currentFile) {
        content = this.editor.getEditorContent();
        language = this.editor.currentLanguage;
      } else {
        // Check if file is in buffer manager
        const buffer = this.editor.bufferManager?.getBufferByPath(filePath);
        if (buffer) {
          content = buffer.content;
          language = buffer.language;
        } else {
          // Load file from backend
          try {
            const fileData = await backendProvider.loadFile(filePath);
            content = fileData.content;
            language = this.detectLanguage(filePath);
          } catch (error) {
            console.error(`[AIManager] Failed to load file ${filePath}:`, error);
            content = '// Failed to load file';
          }
        }
      }
      
      contexts.push({
        filePath,
        content,
        language
      });
    }
    
    // Add cursor position and selection for the current file
    const currentFileContext = contexts.find(c => c.filePath === this.editor.currentFile);
    if (currentFileContext) {
      currentFileContext.cursorPosition = this.editor.getCursorPosition();
      
      const selection = this.getSelection();
      if (selection) {
        currentFileContext.selection = {
          start: { line: 0, character: selection.start },
          end: { line: 0, character: selection.end },
          text: selection.text
        };
      }
    }
    
    return { files: contexts };
  }

  detectLanguage(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'cs': 'csharp',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'xml': 'xml',
      'md': 'markdown',
      'sh': 'bash',
      'yaml': 'yaml',
      'yml': 'yaml',
      'toml': 'toml',
      'sql': 'sql'
    };
    return languageMap[ext] || 'plaintext';
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

