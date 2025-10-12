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

