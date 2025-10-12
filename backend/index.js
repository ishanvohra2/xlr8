/** @typedef {import('pear-interface')} */ /* global Pear */
const fs = require("bare-fs").promises; // Use promises API
const { WorkerManager } = require("./WorkerManager");
const { LSPManager } = require("./LSPManager");

const MessageTypes = Object.freeze({
    EXIT: "exit",
    SAVE_FILE: "save_file",
    LOAD_FILE: "load_file",

    LSP_START: "lsp_start",
    LSP_STOP: "lsp_stop",
    LSP_COMPLETION: "lsp_completion",
    LSP_DIAGNOSTICS: "lsp_diagnostics"
  });

const workerManager = new WorkerManager();
const lspManager = new LSPManager();

// Initialize message buffer for length-prefixed protocol
let messageBuffer = '';

async function cleanup() {
    console.log("[Worker] Cleanup started");
    lspManager.stopAll();
    console.log("[Worker] Cleanup complete");
}
  
  workerManager.setupCleanupHandler(async () => {
    await cleanup();
  });
  
  Pear.teardown(async () => {
    await cleanup();
  });
  
  const MAX_BUFFER_SIZE = 1024 * 1024 * 10; // 10MB
  
  // Use length-prefixed protocol (like LSP) to handle large messages reliably
  workerManager.setupMessageHandler(async (data) => {
  
    if (messageBuffer.length + data.length > MAX_BUFFER_SIZE) {
      throw new Error('Message buffer size limit exceeded');
    }
  
    // Append incoming data to the buffer
    messageBuffer += Buffer.from(data).toString();
  
    // Process all complete messages in the buffer using length-prefix protocol
    while (true) {
      // Look for Content-Length header
      const headerEnd = messageBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      
      const headers = messageBuffer.substring(0, headerEnd);
      const contentLengthMatch = headers.match(/Content-Length: (\d+)/);
      
      if (!contentLengthMatch) {
        console.error('[Worker] Invalid message format: missing Content-Length header');
        messageBuffer = messageBuffer.substring(headerEnd + 4); // Skip this malformed message
        continue;
      }
      
      const contentLength = parseInt(contentLengthMatch[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      
      // Check if we have the complete message
      if (messageBuffer.length < messageEnd) break;
      
      const messageText = messageBuffer.substring(messageStart, messageEnd);
      messageBuffer = messageBuffer.substring(messageEnd);
      
      try {
        const message = parseAndValidateMessage(messageText);
        await handleMessage(message);
      } catch (err) {
        console.error("[Worker] Error processing message:", err);
        workerManager.sendMessage({
          type: "error",
          error: err.message,
        });
      }
    }
  });
  
  workerManager.sendMessage({ type: "worker_initialized" });
  
  /**
   * Parses and validates incoming message structure
   * @param {string} messageString - Raw message string to parse
   * @returns {Object} Validated message object
   * @throws {Error} If message is invalid or malformed
   */
  function parseAndValidateMessage(messageString) {
    // Validate input is a string
    if (typeof messageString !== "string") {
      throw new Error("Message must be a string");
    }
  
    // Check for empty or whitespace-only messages
    if (!messageString.trim()) {
      throw new Error("Message cannot be empty");
    }
  
    let message;
  
    // Parse JSON with proper error handling
    try {
      message = JSON.parse(messageString);
    } catch (parseError) {
      throw new Error(`Invalid JSON format: ${parseError.message}`);
    }
  
    // Validate message structure
    if (!message || typeof message !== "object") {
      throw new Error("Message must be a valid object");
    }
  
    // Validate required fields
    if (!message.type) {
      throw new Error("Message must have a type field");
    }
  
    if (typeof message.type !== "string") {
      throw new Error("Message type must be a string");
    }
  
    // Validate type is not empty
    if (!message.type.trim()) {
      throw new Error("Message type cannot be empty");
    }
  
    // Validate against known message types for additional security
    const validMessageTypes = Object.values(MessageTypes);
  
    if (!validMessageTypes.includes(message.type)) {
      throw new Error(`Unknown message type: ${message.type}`);
    }
  
    // Additional validation for specific message types
    validateMessageTypeSpecificFields(message);
  
    return message;
  }
  
  /**
   * Validates if a string is properly Base64 encoded
   * @param {string} str - String to validate
   * @returns {boolean} True if valid Base64
   */
  function isValidBase64(str) {
    try {
      // Check if string contains only valid Base64 characters
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(str)) {
        console.error("Base64 validation failed: Invalid characters");
        return false;
      }
  
      // Test decode/encode round trip using Node.js Buffer
      const decoded = Buffer.from(str, "base64");
      const reencoded = decoded.toString("base64");
      const isValid = reencoded === str;
  
      if (!isValid) {
        console.error("Base64 validation failed: Round trip test failed");
        console.error(
          "Original length:",
          str.length,
          "Reencoded length:",
          reencoded.length
        );
      }
  
      return isValid;
    } catch (e) {
      console.error("Base64 validation failed with error:", e.message);
      return false;
    }
  }

/**
 * Validates message-type-specific required fields
 * @param {Object} message - Message object to validate
 * @throws {Error} If message-specific validation fails
 */
function validateMessageTypeSpecificFields(message) {
    switch (message.type) {
        case MessageTypes.SAVE_FILE:
            if (!message.filePath) {
                throw new Error("filePath is required for SAVE_FILE message");
            }
            if (!message.fileData) {
                throw new Error("fileData is required for SAVE_FILE message");
            }
            break;

        case MessageTypes.LOAD_FILE:
            if (!message.filePath) {
                throw new Error("filePath is required for LOAD_FILE message");
            }
            break;

        case MessageTypes.LSP_COMPLETION:
            if (!message.filePath) {
                throw new Error("filePath is required for LSP_COMPLETION message");
            }
            if (message.line === undefined || message.character === undefined) {
                throw new Error("line and character are required for LSP_COMPLETION message");
            }
            if (!message.content) {
                throw new Error("content is required for LSP_COMPLETION message");
            }
            break;
            
        default: break;
    }
}

async function handleSaveFile(message) {
    const { filePath, fileData, encoding } = message;
    
    try {
        console.log('[Worker] Saving file:', filePath);
        
        // Decode if Base64 encoded
        let decodedData = fileData;
        if (encoding === 'base64') {
            decodedData = Buffer.from(fileData, 'base64').toString('utf-8');
        }
        
        await fs.writeFile(filePath, decodedData, 'utf-8');
        
        // Send success response back to UI
        workerManager.sendMessage({
            type: 'file_saved',
            success: true,
            filePath: filePath
        });
        
        console.log('[Worker] File saved successfully:', filePath);
    } catch (error) {
        console.error('[Worker] Error saving file:', error);
        
        // Send error response back to UI
        workerManager.sendMessage({
            type: 'file_saved',
            success: false,
            filePath: filePath,
            error: error.message
        });
    }
}

async function handleLoadFile(message) {
    const { filePath } = message;
    
    try {
        console.log('[Worker] Loading file:', filePath);
        const fileData = await fs.readFile(filePath, 'utf-8');
        
        // Base64 encode the file content to avoid JSON escaping issues
        const encodedData = Buffer.from(fileData, 'utf-8').toString('base64');
        
        // Send file content back to UI
        workerManager.sendMessage({
            type: 'file_loaded',
            success: true,
            filePath: filePath,
            fileData: encodedData,
            encoding: 'base64'
        });
        
        console.log('[Worker] File loaded successfully:', filePath, 'Length:', fileData.length);
    } catch (error) {
        console.error('[Worker] Error loading file:', error);
        
        // Send error response back to UI
        workerManager.sendMessage({
            type: 'file_loaded',
            success: false,
            filePath: filePath,
            error: error.message
        });
    }
}

async function handleLSPCompletion(message) {
    const { filePath, line, character, content } = message;
    
    try {
        console.log('[Worker] LSP completion request:', filePath, 'at', line, ':', character);
        
        // Request completions from LSP manager
        const completions = await lspManager.requestCompletion(filePath, line, character, content);
        
        // Send completions back to UI
        workerManager.sendMessage({
            type: 'lsp_completion_result',
            success: true,
            filePath: filePath,
            completions: completions
        });
        
        console.log('[Worker] LSP completions sent:', completions.length, 'items');
    } catch (error) {
        console.error('[Worker] Error getting LSP completions:', error);
        
        // Send error response back to UI
        workerManager.sendMessage({
            type: 'lsp_completion_result',
            success: false,
            filePath: filePath,
            error: error.message
        });
    }
}

// Message handlers map
const messageHandlers = {
    [MessageTypes.EXIT]: handleExit,
    [MessageTypes.SAVE_FILE]: handleSaveFile,
    [MessageTypes.LOAD_FILE]: handleLoadFile,
    [MessageTypes.LSP_COMPLETION]: handleLSPCompletion,
};
  
  /**
   * Handles incoming messages by dispatching to appropriate handler functions
   * @param {Object} message - The validated message object with type and payload
   */
async function handleMessage(message) {
    const handler = messageHandlers[message.type];
    if (handler) {
      await handler(message);
    } else {
      // This should not happen due to upfront validation, but keeping as safety net
      throw new Error(`No handler found for message type: ${message.type}`);
    }
}

// Message handler functions
async function handleExit() {
    Pear.exit();
}