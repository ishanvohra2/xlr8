const { loadModel, completion, unloadModel } = require('@qvac/sdk');

/**
 * InferenceManager - Handles AI inference for ask/edit features
 * Manages context window, conversation history, and mode-specific prompts
 */
class InferenceManager {

    constructor() {
        this.modelConfig = {
            ctx_size: 8192,
            device: 'gpu',
        }
        this.modelPath = 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q2_k.gguf'
        this.modelId = null;
        this.maxContextTokens = 8192;
        
        // System prompts for different modes
        this.systemPrompts = {
            ask: `You are an expert coding assistant. Your role is to help developers understand and work with their code.

When answering questions:
- Be concise but thorough
- Provide specific examples when helpful
- Reference line numbers and file names when discussing code
- Suggest improvements if relevant
- If you're not sure, say so

Multiple file contexts may be provided. Use all provided context to give accurate, context-aware answers.`,

            edit: `You are an expert code editor. Your role is to modify code based on user instructions.

When editing code:
- Make ONLY the changes requested
- Preserve existing code style and formatting
- Add comments for complex changes
- Ensure changes are syntactically correct
- Be surgical - change only what's necessary
- You can edit ONE or MULTIPLE files as needed to fulfill the instruction

IMPORTANT OUTPUT FORMAT:
You MUST respond with a JSON object in the following format:

{
  "files": [
    {
      "filePath": "path/to/file1.js",
      "newContent": "complete modified file content here"
    },
    {
      "filePath": "path/to/file2.js", 
      "newContent": "complete modified file content here"
    }
  ],
  "explanation": "Brief explanation of changes (optional)"
}

Rules:
- Include ONLY files that need to be modified
- Provide the COMPLETE new content for each file (not just the changed lines)
- Use the exact file paths from the context provided
- Do NOT include line numbers in the code
- Ensure valid JSON format
- If only one file needs editing, still use the JSON format with a single file in the array

Multiple file contexts are provided. Edit whichever files are necessary to complete the instruction.`
        };
    }

    /**
     * Load the LLM model
     * @param {Function} progressCallback - Called with progress updates
     */
    async loadLLM(progressCallback) {
        console.log('[InferenceManager] Loading model...');
        this.modelId = await loadModel({
            modelSrc: this.modelPath,
            modelType: 'llm',
            modelConfig: this.modelConfig,
            onProgress: (progress) => {
                if (progressCallback) {
                    progressCallback(progress);
                }
            }
        });
        console.log('[InferenceManager] Model loaded:', this.modelId);
    }

    /**
     * Estimate token count (rough approximation: 1 token ≈ 4 characters)
     * @param {string} text - Text to estimate
     * @returns {number} Estimated token count
     */
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }

    /**
     * Build context string from file and conversation
     * @param {Object} context - Context object (can contain single file or multiple files)
     * @param {boolean} includeLineNumbers - Whether to include line numbers (default: true)
     * @returns {string} Formatted context string
     */
    buildContextString(context, includeLineNumbers = true) {
        // Handle multi-file context
        if (context.files && Array.isArray(context.files)) {
            return this.buildMultiFileContextString(context.files, includeLineNumbers);
        }
        
        // Handle single file context (legacy)
        const parts = [];
        
        if (context.filePath) {
            parts.push(`File: ${context.filePath}`);
        }
        
        if (context.language) {
            parts.push(`Language: ${context.language}`);
        }
        
        if (context.content) {
            if (includeLineNumbers) {
                // Include line numbers for reference (useful in chat mode)
                const lines = context.content.split('\n');
                const lineNumbers = lines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');
                parts.push(`\nCode:\n\`\`\`${context.language || ''}\n${lineNumbers}\n\`\`\``);
            } else {
                // Just raw code without line numbers (for edit mode)
                parts.push(`\nCode:\n\`\`\`${context.language || ''}\n${context.content}\n\`\`\``);
            }
        }
        
        if (context.selection && context.selection.text) {
            if (includeLineNumbers) {
                parts.push(`\nSelected code (lines ${context.selection.start.line + 1}-${context.selection.end.line + 1}):\n\`\`\`${context.language || ''}\n${context.selection.text}\n\`\`\``);
            } else {
                parts.push(`\nSelected code:\n\`\`\`${context.language || ''}\n${context.selection.text}\n\`\`\``);
            }
        }
        
        if (context.cursorPosition && includeLineNumbers) {
            parts.push(`\nCursor at line ${context.cursorPosition.line + 1}, character ${context.cursorPosition.character + 1}`);
        }
        
        if (context.diagnostics && context.diagnostics.length > 0) {
            parts.push(`\nCurrent issues:\n${context.diagnostics.map(d => `- Line ${d.line}: ${d.message}`).join('\n')}`);
        }
        
        return parts.join('\n');
    }

    /**
     * Build context string for multiple files with token management
     * @param {Array} files - Array of file objects
     * @param {boolean} includeLineNumbers - Whether to include line numbers
     * @returns {string} Formatted context string
     */
    buildMultiFileContextString(files, includeLineNumbers = true) {
        const parts = [];
        const maxTokensPerFile = Math.floor((this.maxContextTokens * 0.5) / files.length); // Use 50% of context for files
        
        files.forEach((file, index) => {
            const fileParts = [];
            
            // File header
            fileParts.push(`\n=== File ${index + 1}: ${file.filePath} ===`);
            
            if (file.language) {
                fileParts.push(`Language: ${file.language}`);
            }
            
            if (file.content) {
                let content = file.content;
                
                // Truncate content if it exceeds token limit
                const estimatedTokens = this.estimateTokens(content);
                if (estimatedTokens > maxTokensPerFile) {
                    // Truncate to fit within limit
                    const maxChars = maxTokensPerFile * 4; // Approximate chars from tokens
                    content = content.substring(0, maxChars) + '\n... (truncated)';
                }
                
                if (includeLineNumbers) {
                    const lines = content.split('\n');
                    const lineNumbers = lines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');
                    fileParts.push(`\nCode:\n\`\`\`${file.language || ''}\n${lineNumbers}\n\`\`\``);
                } else {
                    fileParts.push(`\nCode:\n\`\`\`${file.language || ''}\n${content}\n\`\`\``);
                }
            }
            
            // Add selection and cursor info for current file
            if (file.selection && file.selection.text) {
                if (includeLineNumbers) {
                    fileParts.push(`\nSelected code (lines ${file.selection.start.line + 1}-${file.selection.end.line + 1}):\n\`\`\`${file.language || ''}\n${file.selection.text}\n\`\`\``);
                } else {
                    fileParts.push(`\nSelected code:\n\`\`\`${file.language || ''}\n${file.selection.text}\n\`\`\``);
                }
            }
            
            if (file.cursorPosition && includeLineNumbers) {
                fileParts.push(`\nCursor at line ${file.cursorPosition.line + 1}, character ${file.cursorPosition.character + 1}`);
            }
            
            if (file.diagnostics && file.diagnostics.length > 0) {
                fileParts.push(`\nCurrent issues:\n${file.diagnostics.map(d => `- Line ${d.line}: ${d.message}`).join('\n')}`);
            }
            
            parts.push(fileParts.join('\n'));
        });
        
        return parts.join('\n\n');
    }

    /**
     * Trim conversation history to fit context window
     * @param {Array} history - Conversation history
     * @param {string} systemPrompt - System prompt
     * @param {string} contextString - Current context
     * @param {string} userMessage - Current user message
     * @returns {Array} Trimmed history
     */
    trimHistory(history, systemPrompt, contextString, userMessage) {
        const systemTokens = this.estimateTokens(systemPrompt);
        const contextTokens = this.estimateTokens(contextString);
        const userTokens = this.estimateTokens(userMessage);
        const reserveTokens = 512; // Reserve for response
        
        let availableTokens = this.maxContextTokens - systemTokens - contextTokens - userTokens - reserveTokens;
        
        // Keep most recent messages that fit
        const trimmedHistory = [];
        for (let i = history.length - 1; i >= 0; i--) {
            const msgTokens = this.estimateTokens(history[i].content);
            if (msgTokens <= availableTokens) {
                trimmedHistory.unshift(history[i]);
                availableTokens -= msgTokens;
            } else {
                break;
            }
        }
        
        return trimmedHistory;
    }

    /**
     * Chat with AI about code (Ask mode)
     * @param {Object} params - Chat parameters
     * @param {string} params.question - User's question
     * @param {Object} params.context - File context (filePath, content, language, etc.)
     * @param {Array} params.history - Conversation history [{role, content}]
     * @param {Function} params.onToken - Callback for streaming tokens
     * @returns {Promise<string>} Complete response
     */
    async chat({ question, context = {}, history = [], onToken }) {
        if (!this.modelId) {
            throw new Error('Model not loaded. Call loadLLM() first.');
        }
        
        const systemPrompt = this.systemPrompts.ask;
        const contextString = this.buildContextString(context);
        
        // Build full user message with context
        const fullUserMessage = contextString 
            ? `${contextString}\n\nQuestion: ${question}`
            : question;
        
        // Trim history to fit context window
        const trimmedHistory = this.trimHistory(history, systemPrompt, contextString, question);
        
        // Build message history
        const messages = [
            { role: 'system', content: systemPrompt },
            ...trimmedHistory,
            { role: 'user', content: fullUserMessage }
        ];
        
        console.log('[InferenceManager] Chat request, history length:', trimmedHistory.length);
        
        // Generate response
        const result = completion({
            modelId: this.modelId,
            history: messages,
            stream: true
        });
        
        let fullResponse = '';
        for await (const token of result.tokenStream) {
            fullResponse += token;
            if (onToken) {
                onToken(token);
            }
        }
        
        return fullResponse;
    }

    /**
     * Edit code with AI (Edit mode)
     * @param {Object} params - Edit parameters
     * @param {string} params.instruction - Edit instruction
     * @param {Object} params.context - File context
     * @param {Function} params.onToken - Callback for streaming tokens
     * @returns {Promise<string>} Generated code
     */
    async edit({ instruction, context = {}, onToken }) {
        if (!this.modelId) {
            throw new Error('Model not loaded. Call loadLLM() first.');
        }
        
        const systemPrompt = this.systemPrompts.edit;
        // Don't include line numbers in edit mode - prevents LLM from copying them
        const contextString = this.buildContextString(context, false);
        
        // Build edit prompt
        const editPrompt = `${contextString}\n\nInstruction: ${instruction}\n\nProvide the modified code:`;
        
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: editPrompt }
        ];
        
        console.log('[InferenceManager] Edit request');
        
        // Generate response
        const result = completion({
            modelId: this.modelId,
            history: messages,
            stream: true
        });
        
        let fullResponse = '';
        for await (const token of result.tokenStream) {
            fullResponse += token;
            console.log('[InferenceManager] Edit response token:', token);
            if (onToken) {
                onToken(token);
            }
        }
        
        return fullResponse;
    }

    /**
     * Unload the LLM model
     */
    async unloadLLM() {
        if (this.modelId) {
            console.log('[InferenceManager] Unloading model');
            await unloadModel({modelId: this.modelId});
            this.modelId = null;
        }
    }

    /**
     * Check if model is loaded
     * @returns {boolean}
     */
    isLoaded() {
        return this.modelId !== null;
    }
}

module.exports = { InferenceManager };