/** @typedef {import('pear-interface')} */ /* global Pear */

/**
 * Backend Provider - Handles communication with Pear worker backend
 * Uses Pear.worker for IPC with the backend worker
 */

class BackendProvider {
  constructor() {
    this.pipe = null;
    this.connected = false;
    this.messageBuffer = '';
    this.pendingRequests = new Map();
    
    // Callbacks for events
    this.onFileLoaded = null;
    this.onFileSaved = null;
    this.onError = null;
    this.onAIModelLoading = null;
    this.onAIModelLoaded = null;
    this.onAIChatResponseToken = null;
    this.onAIChatResponseEnd = null;
    this.onAIEditResponseToken = null;
    this.onAIEditResponseEnd = null;
  }

  /**
   * Initialize connection to backend worker
   */
  async connect() {
    if (this.connected) {
      console.log('[BackendProvider] Already connected');
      return;
    }

    try {
      console.log('[BackendProvider] Connecting to backend worker...');
      console.log('[BackendProvider] Worker link:', Pear.config.links.worker);

      // Start the worker
      this.pipe = Pear.worker.run(Pear.config.links.worker);

      // Setup data handler
      this.pipe.on('data', (bufData) => {
        this.handleData(bufData);
      });

      // Setup error handler
      this.pipe.on('error', (err) => {
        console.error('[BackendProvider] Pipe error:', err);
        if (this.onError) {
          this.onError(err);
        }
      });

      this.connected = true;
      console.log('[BackendProvider] Connected to backend worker');
    } catch (error) {
      console.error('[BackendProvider] Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Handle incoming data from worker
   * @param {Buffer} bufData - Raw buffer data from worker
   */
  handleData(bufData) {
    const rawData = Buffer.from(bufData).toString();
    
    // Append to buffer
    this.messageBuffer += rawData;

    // Process complete messages using length-prefix protocol
    while (true) {
      // Look for Content-Length header
      const headerEnd = this.messageBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      
      const headers = this.messageBuffer.substring(0, headerEnd);
      const contentLengthMatch = headers.match(/Content-Length: (\d+)/);
      
      if (!contentLengthMatch) {
        console.error('[BackendProvider] Invalid message format: missing Content-Length header');
        this.messageBuffer = this.messageBuffer.substring(headerEnd + 4);
        continue;
      }
      
      const contentLength = parseInt(contentLengthMatch[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      
      // Check if we have the complete message
      if (this.messageBuffer.length < messageEnd) break;
      
      const messageText = this.messageBuffer.substring(messageStart, messageEnd);
      this.messageBuffer = this.messageBuffer.substring(messageEnd);
      
      try {
        const message = JSON.parse(messageText);
        this.handleMessage(message);
      } catch (error) {
        console.error('[BackendProvider] Failed to parse JSON message:', error);
      }
    }
  }

  /**
   * Handle parsed message from worker
   * @param {Object} message - Parsed message object
   */
  handleMessage(message) {
    console.log('[BackendProvider] Received message:', message);

    switch (message.type) {
      case 'worker_initialized':
        console.log('[BackendProvider] Worker initialized');
        break;

      case 'file_loaded':
        this.handleFileLoaded(message);
        break;

      case 'file_saved':
        this.handleFileSaved(message);
        break;

      case 'lsp_completion_result':
        this.handleLSPCompletion(message);
        break;

      case 'lsp_definition_result':
        this.handleLSPDefinition(message);
        break;

      case 'project_search_result':
        this.handleProjectSearchResult(message);
        break;

      case 'list_files_result':
        this.handleListFilesResult(message);
        break;

      // AI Messages
      case 'ai_model_loading':
        this.handleAIModelLoading(message);
        break;

      case 'ai_model_loaded':
        this.handleAIModelLoaded(message);
        break;

      case 'ai_chat_created':
        this.handleAIChatCreated(message);
        break;

      case 'ai_chats_list':
        this.handleAIChatsList(message);
        break;

      case 'ai_chat_data':
        this.handleAIChatData(message);
        break;

      case 'ai_chat_deleted':
        this.handleAIChatDeleted(message);
        break;

      case 'ai_chat_response_start':
        this.handleAIChatResponseStart(message);
        break;

      case 'ai_chat_response_token':
        this.handleAIChatResponseToken(message);
        break;

      case 'ai_chat_response_end':
        this.handleAIChatResponseEnd(message);
        break;

      case 'ai_chat_response_error':
        this.handleAIChatResponseError(message);
        break;

      case 'ai_edit_response_start':
        this.handleAIEditResponseStart(message);
        break;

      case 'ai_edit_response_token':
        this.handleAIEditResponseToken(message);
        break;

      case 'ai_edit_response_end':
        this.handleAIEditResponseEnd(message);
        break;

      case 'ai_edit_response_error':
        this.handleAIEditResponseError(message);
        break;

      case 'error':
        console.error('[BackendProvider] Error from worker:', message.error);
        if (this.onError) {
          this.onError(new Error(message.error));
        }
        break;

      default:
        console.warn('[BackendProvider] Unknown message type:', message.type);
    }
  }

  /**
   * Handle file_loaded response
   */
  handleFileLoaded(message) {
    const { success, filePath, fileData, encoding, error } = message;
    const key = `load_${filePath}`;
    const pending = this.pendingRequests.get(key);

    if (pending) {
      this.pendingRequests.delete(key);
      
      if (success) {
        // Decode file data if it's base64 encoded
        let decodedData = fileData;
        if (encoding === 'base64') {
          decodedData = Buffer.from(fileData, 'base64').toString('utf-8');
        }
        
        pending.resolve({ filePath, fileData: decodedData });
      } else {
        pending.reject(new Error(error || 'Failed to load file'));
      }
    }

    // Also trigger callback if set
    if (this.onFileLoaded) {
      this.onFileLoaded({ success, filePath, fileData, error });
    }
  }

  /**
   * Handle file_saved response
   */
  handleFileSaved(message) {
    const { success, filePath, error } = message;
    const key = `save_${filePath}`;
    const pending = this.pendingRequests.get(key);

    if (pending) {
      this.pendingRequests.delete(key);
      
      if (success) {
        pending.resolve({ filePath });
      } else {
        pending.reject(new Error(error || 'Failed to save file'));
      }
    }

    // Also trigger callback if set
    if (this.onFileSaved) {
      this.onFileSaved({ success, filePath, error });
    }
  }

  /**
   * Handle lsp_completion_result response
   */
  handleLSPCompletion(message) {
    const { success, filePath, completions, error } = message;
    const key = `lsp_completion_${filePath}`;
    const pending = this.pendingRequests.get(key);

    if (pending) {
      this.pendingRequests.delete(key);
      
      if (success) {
        pending.resolve(completions || []);
      } else {
        pending.reject(new Error(error || 'Failed to get LSP completions'));
      }
    }
  }

  /**
   * Handle lsp_definition_result response
   */
  handleLSPDefinition(message) {
    const { success, filePath, definition, error } = message;
    
    // Find the pending request (we use timestamp in key, so need to find by prefix)
    for (const [key, pending] of this.pendingRequests.entries()) {
      if (key.startsWith(`lsp_definition_${filePath}`)) {
        this.pendingRequests.delete(key);
        
        if (success) {
          pending.resolve(definition);
        } else {
          pending.reject(new Error(error || 'Failed to get LSP definition'));
        }
        break;
      }
    }
  }

  /**
   * Handle project_search_result response
   */
  handleProjectSearchResult(message) {
    const { success, query, results, totalCount, limited, error } = message;
    
    // Find the pending request (we use timestamp in key, so need to find by prefix)
    for (const [key, pending] of this.pendingRequests.entries()) {
      if (key.startsWith('project_search_')) {
        this.pendingRequests.delete(key);
        
        if (success) {
          pending.resolve({ results, totalCount, limited });
        } else {
          pending.reject(new Error(error || 'Failed to search project'));
        }
        break;
      }
    }
  }

  /**
   * Handle list_files_result response
   */
  handleListFilesResult(message) {
    const { success, files, totalCount, limited, error } = message;
    
    // Find the pending request (we use timestamp in key, so need to find by prefix)
    for (const [key, pending] of this.pendingRequests.entries()) {
      if (key.startsWith('list_files_')) {
        this.pendingRequests.delete(key);
        
        if (success) {
          pending.resolve({ files, totalCount, limited });
        } else {
          pending.reject(new Error(error || 'Failed to list files'));
        }
        break;
      }
    }
  }

  /**
   * Send message to worker
   * @param {Object} message - Message object to send
   */
  sendMessage(message) {
    if (!this.connected || !this.pipe) {
      throw new Error('Not connected to backend worker');
    }

    console.log('[BackendProvider] Sending message:', message);
    
    // Use length-prefixed protocol to handle large messages
    const jsonStr = JSON.stringify(message);
    const contentLength = Buffer.byteLength(jsonStr, 'utf-8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    this.pipe.write(header + jsonStr);
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Load file from disk
   * @param {string} filePath - Path to file
   * @returns {Promise<{filePath: string, fileData: string}>}
   */
  async loadFile(filePath) {
    return new Promise((resolve, reject) => {
      const key = `load_${filePath}`;
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'load_file',
        filePath
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('Load file timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Save file to disk
   * @param {string} filePath - Path to file
   * @param {string} fileData - File content
   * @returns {Promise<{filePath: string}>}
   */
  async saveFile(filePath, fileData) {
    return new Promise((resolve, reject) => {
      const key = `save_${filePath}`;
      this.pendingRequests.set(key, { resolve, reject });

      // Base64 encode to prevent JSON serialization issues with special characters
      const encodedData = Buffer.from(fileData, 'utf-8').toString('base64');

      this.sendMessage({
        type: 'save_file',
        filePath,
        fileData: encodedData,
        encoding: 'base64'
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('Save file timeout'));
        }
      }, 30000);
    });
  }

  // ============================================================================
  // LSP Operations
  // ============================================================================

  /**
   * Request LSP completions
   * @param {string} filePath - Path to file
   * @param {number} line - Line number (0-based)
   * @param {number} character - Character position (0-based)
   * @param {string} content - Current file content
   * @returns {Promise<Array>} Array of completion items
   */
  async requestCompletion(filePath, line, character, content) {
    return new Promise((resolve, reject) => {
      const key = `lsp_completion_${filePath}`;
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'lsp_completion',
        filePath,
        line,
        character,
        content
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('LSP completion timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Request LSP definition location
   * @param {string} filePath - Path to file
   * @param {number} line - Line number (0-based)
   * @param {number} character - Character position (0-based)
   * @param {string} content - Current file content
   * @returns {Promise<Object|Array|null>} Definition location(s)
   */
  async requestDefinition(filePath, line, character, content) {
    return new Promise((resolve, reject) => {
      const key = `lsp_definition_${filePath}_${Date.now()}`;
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'lsp_definition',
        filePath,
        line,
        character,
        content
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('LSP definition timeout'));
        }
      }, 10000);
    });
  }

  // Project Search
  async requestProjectSearch(query, searchPath) {
    return new Promise((resolve, reject) => {
      const key = `project_search_${Date.now()}`;
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'project_search',
        query,
        searchPath
      });

      // Timeout after 30 seconds (search can be slow)
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('Project search timeout'));
        }
      }, 30000);
    });
  }

  // List Files
  async requestListFiles(searchPath) {
    return new Promise((resolve, reject) => {
      const key = `list_files_${Date.now()}`;
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'list_files',
        searchPath
      });

      // Timeout after 30 seconds (listing can be slow for large directories)
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('List files timeout'));
        }
      }, 30000);
    });
  }

  // ============================================================================
  // AI Message Handlers
  // ============================================================================

  handleAIModelLoading(message) {
    console.log('[BackendProvider] AI model loading:', message.progress);
    if (this.onAIModelLoading) {
      this.onAIModelLoading(message.progress);
    }
  }

  handleAIModelLoaded(message) {
    console.log('[BackendProvider] AI model loaded:', message.success);
    if (this.onAIModelLoaded) {
      this.onAIModelLoaded(message);
    }
    
    const key = 'ai_load_model';
    const pending = this.pendingRequests.get(key);
    if (pending) {
      this.pendingRequests.delete(key);
      if (message.success) {
        pending.resolve();
      } else {
        pending.reject(new Error(message.error || 'Failed to load model'));
      }
    }
  }

  handleAIChatCreated(message) {
    const { success, chatId, chat, error } = message;
    const key = 'ai_create_chat';
    const pending = this.pendingRequests.get(key);
    
    if (pending) {
      this.pendingRequests.delete(key);
      if (success) {
        pending.resolve({ chatId, chat });
      } else {
        pending.reject(new Error(error || 'Failed to create chat'));
      }
    }
  }

  handleAIChatsList(message) {
    const { success, chats, error } = message;
    const key = 'ai_get_chats';
    const pending = this.pendingRequests.get(key);
    
    if (pending) {
      this.pendingRequests.delete(key);
      if (success) {
        pending.resolve(chats);
      } else {
        pending.reject(new Error(error || 'Failed to get chats'));
      }
    }
  }

  handleAIChatData(message) {
    const { success, chat, error } = message;
    const key = 'ai_get_chat';
    const pending = this.pendingRequests.get(key);
    
    if (pending) {
      this.pendingRequests.delete(key);
      if (success) {
        pending.resolve(chat);
      } else {
        pending.reject(new Error(error || 'Failed to get chat'));
      }
    }
  }

  handleAIChatDeleted(message) {
    const { success, chatId, error } = message;
    const key = 'ai_delete_chat';
    const pending = this.pendingRequests.get(key);
    
    if (pending) {
      this.pendingRequests.delete(key);
      if (success) {
        pending.resolve({ chatId });
      } else {
        pending.reject(new Error(error || 'Failed to delete chat'));
      }
    }
  }

  handleAIChatResponseStart(message) {
    console.log('[BackendProvider] AI chat response started:', message.chatId);
  }

  handleAIChatResponseToken(message) {
    if (this.onAIChatResponseToken) {
      this.onAIChatResponseToken(message.chatId, message.token);
    }
  }

  handleAIChatResponseEnd(message) {
    console.log('[BackendProvider] AI chat response ended:', message.chatId);
    if (this.onAIChatResponseEnd) {
      this.onAIChatResponseEnd(message.chatId, message.response);
    }
    
    const key = `ai_chat_${message.chatId}`;
    const pending = this.pendingRequests.get(key);
    if (pending) {
      this.pendingRequests.delete(key);
      pending.resolve(message.response);
    }
  }

  handleAIChatResponseError(message) {
    console.error('[BackendProvider] AI chat error:', message.error);
    
    const key = `ai_chat_${message.chatId}`;
    const pending = this.pendingRequests.get(key);
    if (pending) {
      this.pendingRequests.delete(key);
      pending.reject(new Error(message.error || 'AI chat failed'));
    }
  }

  handleAIEditResponseStart(message) {
    console.log('[BackendProvider] AI edit response started');
  }

  handleAIEditResponseToken(message) {
    if (this.onAIEditResponseToken) {
      this.onAIEditResponseToken(message.token);
    }
  }

  handleAIEditResponseEnd(message) {
    console.log('[BackendProvider] AI edit response ended');
    if (this.onAIEditResponseEnd) {
      this.onAIEditResponseEnd(message);
    }
    
    const key = 'ai_edit';
    const pending = this.pendingRequests.get(key);
    if (pending) {
      this.pendingRequests.delete(key);
      pending.resolve({
        response: message.response,
        extractedCode: message.extractedCode,
        diff: message.diff,
        originalCode: message.originalCode
      });
    }
  }

  handleAIEditResponseError(message) {
    console.error('[BackendProvider] AI edit error:', message.error);
    
    const key = 'ai_edit';
    const pending = this.pendingRequests.get(key);
    if (pending) {
      this.pendingRequests.delete(key);
      pending.reject(new Error(message.error || 'AI edit failed'));
    }
  }

  // ============================================================================
  // AI Operations (Public API)
  // ============================================================================

  /**
   * Manually load AI model (if not already loaded on startup)
   * @returns {Promise<void>}
   */
  async loadAIModel() {
    return new Promise((resolve, reject) => {
      const key = 'ai_load_model';
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'ai_load_model'
      });

      // Timeout after 5 minutes (model loading can take time)
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('AI model load timeout'));
        }
      }, 300000);
    });
  }

  /**
   * Create a new chat
   * @param {string} filePath - Associated file path (optional)
   * @param {string} title - Chat title (optional)
   * @returns {Promise<{chatId: string, chat: Object}>}
   */
  async createChat(filePath = null, title = null) {
    return new Promise((resolve, reject) => {
      const key = 'ai_create_chat';
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'ai_create_chat',
        filePath,
        title
      });

      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('Create chat timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Get all chats or chats for a specific file
   * @param {string} filePath - File path (optional)
   * @returns {Promise<Array>} Array of chat objects
   */
  async getChats(filePath = null) {
    return new Promise((resolve, reject) => {
      const key = 'ai_get_chats';
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'ai_get_chats',
        filePath
      });

      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('Get chats timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Get a specific chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object>} Chat object
   */
  async getChat(chatId) {
    return new Promise((resolve, reject) => {
      const key = 'ai_get_chat';
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'ai_get_chat',
        chatId
      });

      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('Get chat timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Delete a chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<{chatId: string}>}
   */
  async deleteChat(chatId) {
    return new Promise((resolve, reject) => {
      const key = 'ai_delete_chat';
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'ai_delete_chat',
        chatId
      });

      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('Delete chat timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Send a chat message (Ask feature)
   * @param {string} chatId - Chat ID
   * @param {string} question - User's question
   * @param {Object} context - File context
   * @returns {Promise<string>} AI response
   */
  async sendChatMessage(chatId, question, context = {}) {
    return new Promise((resolve, reject) => {
      const key = `ai_chat_${chatId}`;
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'ai_chat_request',
        chatId,
        question,
        context
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('Chat timeout'));
        }
      }, 120000);
    });
  }

  /**
   * Request code edit (Edit feature)
   * @param {string} instruction - Edit instruction
   * @param {Object} context - File context (content, selection, etc.)
   * @returns {Promise<Object>} Edit result with diff
   */
  async requestEdit(instruction, context) {
    return new Promise((resolve, reject) => {
      const key = 'ai_edit';
      this.pendingRequests.set(key, { resolve, reject });

      this.sendMessage({
        type: 'ai_edit_request',
        instruction,
        context
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error('Edit timeout'));
        }
      }, 120000);
    });
  }

  /**
   * Disconnect from worker
   */
  disconnect() {
    if (this.pipe) {
      this.sendMessage({ type: 'exit' });
      this.pipe = null;
      this.connected = false;
      console.log('[BackendProvider] Disconnected from backend worker');
    }
  }
}

// Export singleton instance
export const backendProvider = new BackendProvider();

