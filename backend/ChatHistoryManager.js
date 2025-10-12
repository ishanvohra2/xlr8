const crypto = require('bare-crypto');

/**
 * ChatHistoryManager - Manages multiple chat conversations
 * Each chat has a unique ID and can be associated with a file
 */
class ChatHistoryManager {
    constructor() {
        // Map of chatId -> chat object
        this.chats = new Map();
        
        // Map of filePath -> array of chatIds
        this.fileChats = new Map();
    }

    /**
     * Generate a unique chat ID
     * @returns {string} Unique chat ID
     */
    generateChatId() {
        return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Create a new chat
     * @param {Object} params - Chat parameters
     * @param {string} params.filePath - Associated file path (optional)
     * @param {string} params.title - Chat title (optional)
     * @returns {string} Chat ID
     */
    createChat({ filePath = null, title = null } = {}) {
        const chatId = this.generateChatId();
        const chat = {
            id: chatId,
            filePath,
            title: title || (filePath ? `Chat about ${filePath.split('/').pop()}` : 'New Chat'),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [] // [{role, content, timestamp}]
        };
        
        this.chats.set(chatId, chat);
        
        // Associate with file if provided
        if (filePath) {
            if (!this.fileChats.has(filePath)) {
                this.fileChats.set(filePath, []);
            }
            this.fileChats.get(filePath).push(chatId);
        }
        
        console.log('[ChatHistoryManager] Created chat:', chatId);
        return chatId;
    }

    /**
     * Get a chat by ID
     * @param {string} chatId - Chat ID
     * @returns {Object|null} Chat object or null if not found
     */
    getChat(chatId) {
        return this.chats.get(chatId) || null;
    }

    /**
     * Get all chats for a file
     * @param {string} filePath - File path
     * @returns {Array} Array of chat objects
     */
    getChatsForFile(filePath) {
        const chatIds = this.fileChats.get(filePath) || [];
        return chatIds.map(id => this.chats.get(id)).filter(Boolean);
    }

    /**
     * Get all chats
     * @returns {Array} Array of chat objects
     */
    getAllChats() {
        return Array.from(this.chats.values());
    }

    /**
     * Add a message to a chat
     * @param {string} chatId - Chat ID
     * @param {string} role - Message role ('user' or 'assistant')
     * @param {string} content - Message content
     * @returns {boolean} Success status
     */
    addMessage(chatId, role, content) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            console.error('[ChatHistoryManager] Chat not found:', chatId);
            return false;
        }
        
        chat.messages.push({
            role,
            content,
            timestamp: new Date().toISOString()
        });
        
        chat.updatedAt = new Date().toISOString();
        
        // Update title if it's the first user message
        if (role === 'user' && chat.messages.length === 1) {
            // Use first 50 chars of message as title
            chat.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
        }
        
        return true;
    }

    /**
     * Get conversation history for a chat (formatted for LLM)
     * @param {string} chatId - Chat ID
     * @returns {Array} Array of {role, content} objects
     */
    getHistory(chatId) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            return [];
        }
        
        return chat.messages.map(({ role, content }) => ({ role, content }));
    }

    /**
     * Update chat title
     * @param {string} chatId - Chat ID
     * @param {string} title - New title
     * @returns {boolean} Success status
     */
    updateTitle(chatId, title) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            return false;
        }
        
        chat.title = title;
        chat.updatedAt = new Date().toISOString();
        return true;
    }

    /**
     * Delete a chat
     * @param {string} chatId - Chat ID
     * @returns {boolean} Success status
     */
    deleteChat(chatId) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            return false;
        }
        
        // Remove from file association
        if (chat.filePath) {
            const fileChats = this.fileChats.get(chat.filePath);
            if (fileChats) {
                const index = fileChats.indexOf(chatId);
                if (index > -1) {
                    fileChats.splice(index, 1);
                }
                
                // Remove file entry if no more chats
                if (fileChats.length === 0) {
                    this.fileChats.delete(chat.filePath);
                }
            }
        }
        
        this.chats.delete(chatId);
        console.log('[ChatHistoryManager] Deleted chat:', chatId);
        return true;
    }

    /**
     * Clear all messages in a chat
     * @param {string} chatId - Chat ID
     * @returns {boolean} Success status
     */
    clearChat(chatId) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            return false;
        }
        
        chat.messages = [];
        chat.updatedAt = new Date().toISOString();
        return true;
    }

    /**
     * Get chat statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            totalChats: this.chats.size,
            totalFiles: this.fileChats.size,
            totalMessages: Array.from(this.chats.values()).reduce((sum, chat) => sum + chat.messages.length, 0)
        };
    }
}

module.exports = { ChatHistoryManager };

