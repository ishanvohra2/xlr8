/** @typedef {import('pear-interface')} */ /* global Pear */
const fs = require("bare-fs").promises; // Use promises API
const { WorkerManager } = require("./WorkerManager");
const { LSPManager } = require("./LSPManager");
const { InferenceManager } = require("./InferenceManager");
const { ChatHistoryManager } = require("./ChatHistoryManager");
const { DiffUtil } = require("./DiffUtil");

const MessageTypes = Object.freeze({
    EXIT: "exit",
    SAVE_FILE: "save_file",
    LOAD_FILE: "load_file",

    LSP_START: "lsp_start",
    LSP_STOP: "lsp_stop",
    LSP_COMPLETION: "lsp_completion",
    LSP_DIAGNOSTICS: "lsp_diagnostics",

    // AI Messages
    AI_LOAD_MODEL: "ai_load_model",
    AI_CHAT_REQUEST: "ai_chat_request",
    AI_EDIT_REQUEST: "ai_edit_request",
    AI_CREATE_CHAT: "ai_create_chat",
    AI_GET_CHATS: "ai_get_chats",
    AI_DELETE_CHAT: "ai_delete_chat",
    AI_GET_CHAT: "ai_get_chat"
  });

const workerManager = new WorkerManager();
const lspManager = new LSPManager();
const inferenceManager = new InferenceManager();
const chatHistoryManager = new ChatHistoryManager();

// Initialize message buffer for length-prefixed protocol
let messageBuffer = '';

async function cleanup() {
    console.log("[Worker] Cleanup started");
    lspManager.stopAll();
    await inferenceManager.unloadLLM();
    console.log("[Worker] Cleanup complete");
}

// Load AI model on startup
async function initializeAI() {
    try {
        console.log("[Worker] Loading AI model on startup...");
        await inferenceManager.loadLLM((progress) => {
            workerManager.sendMessage({
                type: 'ai_model_loading',
                progress
            });
        });
        workerManager.sendMessage({
            type: 'ai_model_loaded',
            success: true
        });
        console.log("[Worker] AI model loaded successfully");
    } catch (error) {
        console.error("[Worker] Failed to load AI model:", error);
        workerManager.sendMessage({
            type: 'ai_model_loaded',
            success: false,
            error: error.message
        });
    }
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
  
  // Initialize AI model
  initializeAI();
  
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

        case MessageTypes.AI_CHAT_REQUEST:
            if (!message.question) {
                throw new Error("question is required for AI_CHAT_REQUEST message");
            }
            if (!message.chatId) {
                throw new Error("chatId is required for AI_CHAT_REQUEST message");
            }
            break;

        case MessageTypes.AI_EDIT_REQUEST:
            if (!message.instruction) {
                throw new Error("instruction is required for AI_EDIT_REQUEST message");
            }
            if (!message.context) {
                throw new Error("context is required for AI_EDIT_REQUEST message");
            }
            break;

        case MessageTypes.AI_DELETE_CHAT:
            if (!message.chatId) {
                throw new Error("chatId is required for AI_DELETE_CHAT message");
            }
            break;

        case MessageTypes.AI_GET_CHAT:
            if (!message.chatId) {
                throw new Error("chatId is required for AI_GET_CHAT message");
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

// ============================================================================
// AI Message Handlers
// ============================================================================

async function handleAILoadModel(message) {
    try {
        console.log('[Worker] Manual AI model load requested');
        
        if (inferenceManager.isLoaded()) {
            workerManager.sendMessage({
                type: 'ai_model_loaded',
                success: true,
                alreadyLoaded: true
            });
            return;
        }
        
        await inferenceManager.loadLLM((progress) => {
            workerManager.sendMessage({
                type: 'ai_model_loading',
                progress
            });
        });
        
        workerManager.sendMessage({
            type: 'ai_model_loaded',
            success: true
        });
        
        console.log('[Worker] AI model loaded');
    } catch (error) {
        console.error('[Worker] Error loading AI model:', error);
        workerManager.sendMessage({
            type: 'ai_model_loaded',
            success: false,
            error: error.message
        });
    }
}

async function handleAICreateChat(message) {
    try {
        const { filePath, title } = message;
        
        const chatId = chatHistoryManager.createChat({ filePath, title });
        
        workerManager.sendMessage({
            type: 'ai_chat_created',
            success: true,
            chatId,
            chat: chatHistoryManager.getChat(chatId)
        });
        
        console.log('[Worker] Chat created:', chatId);
    } catch (error) {
        console.error('[Worker] Error creating chat:', error);
        workerManager.sendMessage({
            type: 'ai_chat_created',
            success: false,
            error: error.message
        });
    }
}

async function handleAIGetChats(message) {
    try {
        const { filePath } = message;
        
        let chats;
        if (filePath) {
            chats = chatHistoryManager.getChatsForFile(filePath);
        } else {
            chats = chatHistoryManager.getAllChats();
        }
        
        workerManager.sendMessage({
            type: 'ai_chats_list',
            success: true,
            chats
        });
        
        console.log('[Worker] Chats retrieved:', chats.length);
    } catch (error) {
        console.error('[Worker] Error getting chats:', error);
        workerManager.sendMessage({
            type: 'ai_chats_list',
            success: false,
            error: error.message
        });
    }
}

async function handleAIGetChat(message) {
    try {
        const { chatId } = message;
        
        const chat = chatHistoryManager.getChat(chatId);
        
        if (!chat) {
            throw new Error(`Chat not found: ${chatId}`);
        }
        
        workerManager.sendMessage({
            type: 'ai_chat_data',
            success: true,
            chat
        });
        
        console.log('[Worker] Chat retrieved:', chatId);
    } catch (error) {
        console.error('[Worker] Error getting chat:', error);
        workerManager.sendMessage({
            type: 'ai_chat_data',
            success: false,
            error: error.message
        });
    }
}

async function handleAIDeleteChat(message) {
    try {
        const { chatId } = message;
        
        const success = chatHistoryManager.deleteChat(chatId);
        
        if (!success) {
            throw new Error(`Failed to delete chat: ${chatId}`);
        }
        
        workerManager.sendMessage({
            type: 'ai_chat_deleted',
            success: true,
            chatId
        });
        
        console.log('[Worker] Chat deleted:', chatId);
    } catch (error) {
        console.error('[Worker] Error deleting chat:', error);
        workerManager.sendMessage({
            type: 'ai_chat_deleted',
            success: false,
            error: error.message
        });
    }
}

async function handleAIChatRequest(message) {
    try {
        const { chatId, question, context } = message;
        
        console.log('[Worker] AI chat request for chat:', chatId);
        
        // Verify model is loaded
        if (!inferenceManager.isLoaded()) {
            throw new Error('AI model not loaded');
        }
        
        // Get chat history
        const history = chatHistoryManager.getHistory(chatId);
        
        // Add user message to chat
        chatHistoryManager.addMessage(chatId, 'user', question);
        
        // Signal start of response
        workerManager.sendMessage({
            type: 'ai_chat_response_start',
            chatId
        });
        
        // Stream response
        let fullResponse = '';
        const response = await inferenceManager.chat({
            question,
            context,
            history,
            onToken: (token) => {
                fullResponse += token;
                workerManager.sendMessage({
                    type: 'ai_chat_response_token',
                    chatId,
                    token
                });
            }
        });
        
        // Add assistant response to chat
        chatHistoryManager.addMessage(chatId, 'assistant', fullResponse);
        
        // Signal end of response
        workerManager.sendMessage({
            type: 'ai_chat_response_end',
            chatId,
            response: fullResponse
        });
        
        console.log('[Worker] AI chat response complete');
    } catch (error) {
        console.error('[Worker] Error in AI chat:', error);
        workerManager.sendMessage({
            type: 'ai_chat_response_error',
            chatId: message.chatId,
            error: error.message
        });
    }
}

async function handleAIEditRequest(message) {
    try {
        const { instruction, context } = message;
        
        console.log('[Worker] AI edit request');
        
        // Verify model is loaded
        if (!inferenceManager.isLoaded()) {
            throw new Error('AI model not loaded');
        }
        
        // Signal start of edit
        workerManager.sendMessage({
            type: 'ai_edit_response_start'
        });
        
        // Generate edit
        let fullResponse = '';
        const response = await inferenceManager.edit({
            instruction,
            context,
            onToken: (token) => {
                fullResponse += token;
                workerManager.sendMessage({
                    type: 'ai_edit_response_token',
                    token
                });
            }
        });
        
        // Extract code from response
        const extractedCode = DiffUtil.extractCodeFromResponse(fullResponse, context.language);
        
        // Generate diff
        const originalCode = context.selection?.text || context.content || '';
        const diff = DiffUtil.generateDiff(originalCode, extractedCode);
        
        // Signal end of edit
        workerManager.sendMessage({
            type: 'ai_edit_response_end',
            response: fullResponse,
            extractedCode,
            diff,
            originalCode
        });
        
        console.log('[Worker] AI edit response complete');
    } catch (error) {
        console.error('[Worker] Error in AI edit:', error);
        workerManager.sendMessage({
            type: 'ai_edit_response_error',
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
    [MessageTypes.AI_LOAD_MODEL]: handleAILoadModel,
    [MessageTypes.AI_CREATE_CHAT]: handleAICreateChat,
    [MessageTypes.AI_GET_CHATS]: handleAIGetChats,
    [MessageTypes.AI_GET_CHAT]: handleAIGetChat,
    [MessageTypes.AI_DELETE_CHAT]: handleAIDeleteChat,
    [MessageTypes.AI_CHAT_REQUEST]: handleAIChatRequest,
    [MessageTypes.AI_EDIT_REQUEST]: handleAIEditRequest,
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