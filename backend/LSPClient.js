const { spawn } = require('bare-subprocess');
const process = require('bare-process');

/**
 * Simple LSP Client - manages one language server process
 */
class LSPClient {
  constructor(command, args = []) {
    this.command = command;
    this.args = args;
    this.process = null;
    this.messageId = 0;
    this.buffer = '';
    this.pendingRequests = new Map();
    this.initialized = false;
  }

  /**
   * Start the language server
   */
  start() {
    console.log(`[LSPClient] Starting: ${this.command} ${this.args.join(' ')}`);
    
    this.process = spawn(this.command, this.args);
    
    // Handle stdout (LSP responses)
    this.process.stdout.on('data', (data) => {
      this.handleData(data);
    });
    
    // Handle stderr (LSP logs)
    this.process.stderr.on('data', (data) => {
      console.log('[LSPClient] stderr:', data.toString());
    });
    
    // Handle errors
    this.process.on('error', (err) => {
      console.error('[LSPClient] Process error:', err);
    });
    
    console.log('[LSPClient] Process started');
  }

  /**
   * Handle incoming data from LSP server
   */
  handleData(data) {
    this.buffer += data.toString();
    
    // Parse Content-Length messages (same as your UI <-> Backend protocol!)
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      
      const headers = this.buffer.substring(0, headerEnd);
      const contentLengthMatch = headers.match(/Content-Length: (\d+)/);
      
      if (!contentLengthMatch) {
        console.error('[LSPClient] Invalid message format');
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }
      
      const contentLength = parseInt(contentLengthMatch[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      
      if (this.buffer.length < messageEnd) break;
      
      const messageText = this.buffer.substring(messageStart, messageEnd);
      this.buffer = this.buffer.substring(messageEnd);
      
      try {
        const message = JSON.parse(messageText);
        this.handleMessage(message);
      } catch (err) {
        console.error('[LSPClient] Failed to parse message:', err);
      }
    }
  }

  /**
   * Handle a parsed LSP message
   */
  handleMessage(message) {
    console.log('[LSPClient] Received:', JSON.stringify(message).substring(0, 200));
    
    // Response to our request
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
    
    // Notification from server (no response needed)
    if (!message.id && message.method) {
      this.handleNotification(message);
    }
  }

  /**
   * Handle notifications from LSP server
   */
  handleNotification(message) {
    console.log('[LSPClient] Notification:', message.method);
    // We'll handle diagnostics here later
  }

  /**
   * Send an LSP request
   */
  sendRequest(method, params) {
    const id = ++this.messageId;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    const jsonStr = JSON.stringify(message);
    const content = `Content-Length: ${Buffer.byteLength(jsonStr)}\r\n\r\n${jsonStr}`;
    
    console.log('[LSPClient] Sending request:', method);
    this.process.stdin.write(content);
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  /**
   * Initialize the LSP server
   */
  async initialize(rootPath) {
    console.log('[LSPClient] Initializing with rootPath:', rootPath);
    
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${rootPath}`,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: false
            }
          }
        }
      }
    });
    
    // Send initialized notification
    const notification = {
      jsonrpc: '2.0',
      method: 'initialized',
      params: {}
    };
    const jsonStr = JSON.stringify(notification);
    const content = `Content-Length: ${Buffer.byteLength(jsonStr)}\r\n\r\n${jsonStr}`;
    this.process.stdin.write(content);
    
    this.initialized = true;
    console.log('[LSPClient] Initialized successfully');
    return result;
  }

  /**
   * Request completions at a specific position
   * @param {string} filePath - File URI (e.g., 'file:///path/to/file.js')
   * @param {number} line - Line number (0-based)
   * @param {number} character - Character position (0-based)
   * @returns {Promise<Array>} Array of completion items
   */
  async completion(filePath, line, character) {
    if (!this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const result = await this.sendRequest('textDocument/completion', {
      textDocument: {
        uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`
      },
      position: { line, character }
    });

    return result?.items || result || [];
  }

  /**
   * Request definition location for a symbol
   * @param {string} filePath - File URI (e.g., 'file:///path/to/file.js')
   * @param {number} line - Line number (0-based)
   * @param {number} character - Character position (0-based)
   * @returns {Promise<Array|Object>} Definition location(s)
   */
  async definition(filePath, line, character) {
    if (!this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const result = await this.sendRequest('textDocument/definition', {
      textDocument: {
        uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`
      },
      position: { line, character }
    });

    // Result can be Location, Location[], or null
    return result;
  }

  /**
   * Notify server that a document was opened
   * @param {string} filePath - File path
   * @param {string} languageId - Language ID (e.g., 'javascript', 'typescript')
   * @param {string} content - File content
   */
  didOpen(filePath, languageId, content) {
    const notification = {
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`,
          languageId,
          version: 1,
          text: content
        }
      }
    };

    const jsonStr = JSON.stringify(notification);
    const contentLength = Buffer.byteLength(jsonStr);
    const message = `Content-Length: ${contentLength}\r\n\r\n${jsonStr}`;
    this.process.stdin.write(message);

    console.log('[LSPClient] Sent didOpen notification');
  }

  /**
   * Notify server that a document was changed
   * @param {string} filePath - File path
   * @param {string} content - New file content
   * @param {number} version - Document version
   */
  didChange(filePath, content, version = 1) {
    const notification = {
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: {
          uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`,
          version
        },
        contentChanges: [
          {
            text: content
          }
        ]
      }
    };

    const jsonStr = JSON.stringify(notification);
    const contentLength = Buffer.byteLength(jsonStr);
    const message = `Content-Length: ${contentLength}\r\n\r\n${jsonStr}`;
    this.process.stdin.write(message);

    console.log('[LSPClient] Sent didChange notification');
  }

  /**
   * Stop the language server
   */
  stop() {
    if (this.process) {
      console.log('[LSPClient] Stopping');
      this.process.kill();
      this.process = null;
      this.initialized = false;
    }
  }
}

module.exports = { LSPClient };
