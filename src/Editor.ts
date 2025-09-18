import { terminal } from 'terminal-kit';
import { BufferManager } from './BufferManager';
import { TerminalRenderer } from './TerminalRenderer';
import { LSPManager, CompletionSuggestion, DefinitionLocation } from './LSPManager';
import { TabManager } from './TabManager';
import { InferenceManager } from './InferenceManager';
import { ChatManager, ChatMessage } from './ChatManager';
import * as fs from 'fs';
import * as path from 'path';

type UndoOperation = {
  type: 'insert' | 'replace' | 'delete';
  before: { content: string; cursor: { row: number; col: number } };
  after: { content: string; cursor: { row: number; col: number } };
  timestamp: number;
};

export class Editor {
  private tabManager: TabManager;
  private lspManager: LSPManager;
  private inferenceManager: InferenceManager;
  private chatManager: ChatManager;
  private isRunning: boolean = false;
  private debugMode: boolean = false;
  private aiUndoStack: UndoOperation[] = [];
  private maxUndoOperations: number = 10;

  constructor(filename?: string, debugMode: boolean = false) {
    this.lspManager = new LSPManager(debugMode);
    this.tabManager = new TabManager(this.lspManager, debugMode);
    this.inferenceManager = new InferenceManager();
    this.chatManager = new ChatManager();
    this.debugMode = debugMode;
    
    if (filename) {
      this.tabManager.openFile(filename);
    }
    
    this.setupTerminal();
    this.preloadAIModel();
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  private debugLog(message: string, ...args: any[]): void {
    if (this.debugMode) {
      console.log(message, ...args);
    }
  }

  private preloadAIModel(): void {
    // Start loading the AI model in the background
    this.debugLog('🤖 Starting AI model preloading...');
    
    // Load model in background
    this.inferenceManager.loadLocalModel(undefined, (progress) => {
      this.debugLog(`📥 AI Model loading: ${progress.percentage.toFixed(1)}%`);
    }).then(() => {
      this.debugLog('✅ AI model loaded and ready!');
    }).catch((error) => {
      this.debugLog('❌ AI model loading failed:', error);
    });
  }

  private setupTerminal(): void {
    // Enable raw mode for direct key handling
    terminal.grabInput(true);
    
    // Handle terminal resize
    terminal.on('resize', () => {
      this.getCurrentTab().getRenderer().render();
    });

    // Handle keyboard input
    terminal.on('key', (name: string, matches: string[], data: any) => {
      if (!this.isRunning) return;

      const ctrl = data.ctrl;
      const shift = data.shift;

      // Handle special key combinations
      if (ctrl && name === 'c') {
        this.quit();
        return;
      }

      if (ctrl && name === 'z') {
        this.getCurrentTab().getBuffer().undo();
        this.getCurrentTab().getRenderer().render();
        return;
      }

      if (ctrl && name === 'y') {
        this.getCurrentTab().getBuffer().redo();
        this.getCurrentTab().getRenderer().render();
        return;
      }

      if (ctrl && shift && name === 'z') {
        this.debugLog('Ctrl+Shift+Z detected - undo AI edit!');
        this.undoAIEdit();
        return;
      }


      if (shift && name === 'TAB') {
        this.debugLog('Shift+Tab detected!');
        // Only trigger completions in insert mode
        if (this.getCurrentTab().getRenderer().getMode() === 'insert') {
          this.requestCompletions();
        }
        return;
      }

      if (ctrl && name === 'd') {
        this.debugLog('Ctrl+D detected - go to definition!');
        this.goToDefinition();
        return;
      }

      // Tab navigation
      if (ctrl && name === 't') {
        this.debugLog('Ctrl+T detected - new tab!');
        this.tabManager.newTab(undefined, this);
        this.getCurrentTab().getRenderer().render();
        return;
      }

      if (ctrl && name === 'w') {
        this.debugLog('Ctrl+W detected - close tab!');
        this.tabManager.closeCurrentTab(this);
        this.getCurrentTab().getRenderer().render();
        return;
      }

      if (ctrl && name === 'TAB') {
        this.debugLog('Ctrl+Tab detected - next tab!');
        this.tabManager.nextTab(this);
        this.getCurrentTab().getRenderer().render();
        return;
      }

      if (ctrl && shift && name === 'TAB') {
        this.debugLog('Ctrl+Shift+Tab detected - previous tab!');
        this.tabManager.previousTab(this);
        this.getCurrentTab().getRenderer().render();
        return;
      }

      if (ctrl && name === 'h') {
        this.debugLog('Ctrl+H detected - toggle chat panel!');
        this.getCurrentTab().getRenderer().toggleChat();
        return;
      }

      if (ctrl && name === 'j') {
        this.debugLog('Ctrl+J detected - scroll chat down!');
        this.getCurrentTab().getRenderer().scrollChatContentDown();
        return;
      }

      if (ctrl && name === 'k') {
        this.debugLog('Ctrl+K detected - scroll chat up!');
        this.getCurrentTab().getRenderer().scrollChatContentUp();
        return;
      }


      // Handle regular key input
      const currentTab = this.getCurrentTab();
      const handled = currentTab.getRenderer().handleKey(name, ctrl, shift);
      if (handled) {
        currentTab.getRenderer().render();
        this.tabManager.markCurrentTabAsModified();
        
        // Update LSP document if content changed
        const filename = currentTab.getFilename();
        if (filename && this.lspManager.isReady()) {
          this.lspManager.updateDocument(filename, currentTab.getBuffer());
          // Update diagnostics after document change
          setTimeout(() => this.updateDiagnostics(), 100);
          
          // Auto-trigger completions for certain characters (only in insert mode)
          if (this.shouldTriggerAutoCompletion(name) && this.getCurrentTab().getRenderer().getMode() === 'insert') {
            this.debugLog('Auto-triggering completions for key:', name);
            setTimeout(() => this.requestCompletions(), 200);
          }
        }
      }
    });
  }

  async loadFile(filename: string): Promise<void> {
    await this.tabManager.openFile(filename, this);
    
    // Initialize LSP for the loaded file
    if (!this.lspManager.isReady()) {
      const workspaceRoot = process.cwd();
      await this.lspManager.initialize(workspaceRoot, filename);
    }
  }

  async saveFile(): Promise<void> {
    try {
      await this.tabManager.saveCurrentTab();
    } catch (error) {
      // TODO: Show error message to user
      console.error('Error saving file:', error);
      throw error; // Re-throw to let caller handle it
    }
  }

  start(): void {
    this.isRunning = true;
    this.getCurrentTab().getRenderer().setEditor(this);
    this.getCurrentTab().getRenderer().render();
  }

  quit(): void {
    this.isRunning = false;
    
    // Close LSP document and stop LSP manager
    if (this.lspManager.isReady()) {
      this.lspManager.closeDocument();
      this.lspManager.stop();
    }
    
    terminal.grabInput(false);
    terminal.clear();
    process.exit(0);
  }

  getCurrentTab() {
    return this.tabManager.getCurrentTab();
  }

  getTabManager(): TabManager {
    return this.tabManager;
  }

  getInferenceManager(): InferenceManager {
    return this.inferenceManager;
  }

  getChatManager(): ChatManager {
    return this.chatManager;
  }

  private updateAIContext(): void {
    const currentTab = this.getCurrentTab();
    const filename = currentTab.getFilename();
    const buffer = currentTab.getBuffer();
    const cursor = buffer.getCursor();
    
    this.inferenceManager.setContext({
      currentFile: filename,
      currentContent: buffer.getContent(),
      cursorPosition: cursor,
      projectRoot: process.cwd(),
      availableFiles: this.getAvailableFiles()
    });
  }

  private getAvailableFiles(): string[] {
    try {
      return fs.readdirSync(process.cwd()).filter(file => 
        file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json')
      );
    } catch {
      return [];
    }
  }

  async executeAICommand(command: string, prompt: string): Promise<void> {
    this.debugLog('AI Command:', command, 'Prompt:', prompt);
    
    // Handle ai complete command
    if (command === 'ai complete') {
      await this.executeAIComplete();
      return;
    }
    
    // Update context before AI interaction
    this.updateAIContext();
    
    // Update chat manager with current file context
    const currentFile = this.getCurrentTab().getFilename();
    this.chatManager.updateCurrentFile(currentFile);
    
    try {
      // Check if model is ready, if not show loading message
      if (!this.inferenceManager.isModelReady()) {
        if (this.inferenceManager.isModelLoading()) {
          this.debugLog('Model is already loading...');
        } else {
          this.debugLog('Loading AI model...');
        }
        
        await this.inferenceManager.loadLocalModel(undefined, (progress) => {
          this.debugLog(`Model loading: ${progress.percentage.toFixed(1)}%`);
        });
      }

      const mode = command === 'ai edit' ? 'edit' : 'ask';
      
      // Add user message to chat history
      this.chatManager.addMessage('user', prompt, mode);
      
      // Ensure chat panel is visible for AI operations
      this.getCurrentTab().getRenderer().showChat();
      
      // Update the renderer with chat messages
      this.updateRendererWithChatHistory();

      if (mode === 'edit') {
        // For edit mode, use the new diff-based approach
        const currentTab = this.getCurrentTab();
        const currentFilePath = currentTab.getFullPath();
        if (currentFilePath) {
          const currentContent = currentTab.getContent();
          
          // Set context for the inference manager
          this.inferenceManager.setContext({
            currentFile: currentFilePath,
            currentContent: currentContent,
            cursorPosition: { row: 0, col: 0 }, // Default cursor position
            projectRoot: process.cwd()
          });

          let assistantResponse = '';
          
          // Build the conversation history with system prompt
          const history = [
            { role: 'system' as const, content: this.inferenceManager.getSystemPrompt('edit') },
            { role: 'user' as const, content: prompt }
          ];
          
          await this.inferenceManager.generateResponse(
            history,
            (progress: string) => {
              assistantResponse += progress;
              // Update the last assistant message in real-time
              this.updateLastAssistantMessage(assistantResponse, mode);
            }
          );
          
          // Add final assistant response to chat history
          this.chatManager.addMessage('assistant', assistantResponse.trim(), mode);
          this.updateRendererWithChatHistory();
          
          // Parse the response to extract new code
          const newContent = this.inferenceManager.parseCodeFromResponse(assistantResponse);
          
          if (newContent) {
            // Create a backup for undo functionality
            const backup = {
              content: currentContent,
              cursor: { ...currentTab.getBuffer().getCursor() }
            };
            
            // Apply the new content directly
            currentTab.setContent(newContent, this.debugMode);
            
            // Store the operation for undo
            this.storeUndoOperation('replace', backup, {
              content: newContent,
              cursor: { row: 0, col: 0 }
            });
            
            // Update LSP document
            const filename = currentTab.getFilename();
            if (this.lspManager.isReady() && filename) {
              this.lspManager.updateDocument(filename, currentTab.getBuffer());
            }
            
            // Show success message in chat
            this.chatManager.addMessage('assistant', '✅ Code has been updated successfully!', mode);
            this.updateRendererWithChatHistory();
          } else {
            const errorMsg = '❌ Could not parse code from AI response. Please ensure the AI response contains code blocks.';
            this.chatManager.addMessage('assistant', errorMsg, mode);
            this.updateRendererWithChatHistory();
          }
        } else {
          const errorMsg = 'Error: No file is currently open for editing.';
          this.chatManager.addMessage('assistant', errorMsg, mode);
          this.updateRendererWithChatHistory();
        }
      } else {
        // For ask mode, use conversation history
        const systemPrompt = this.inferenceManager.getSystemPrompt(mode);
        const history = this.chatManager.getConversationHistoryForAI();
        
        // Replace the system prompt placeholder with actual system prompt
        if (history.length > 0 && history[0].content.startsWith('__SYSTEM_PROMPT_PLACEHOLDER__')) {
          history[0].content = systemPrompt;
        }
        
        let assistantResponse = '';
        await this.inferenceManager.generateResponse(
          history,
          (token: string) => {
            assistantResponse += token;
            // Update the last assistant message in real-time
            this.updateLastAssistantMessage(assistantResponse, mode);
          }
        );
        
        // Add final assistant response to chat history
        this.chatManager.addMessage('assistant', assistantResponse.trim(), mode);
        this.updateRendererWithChatHistory();
      }


    } catch (error) {
      console.error('AI command failed:', error);
      const errorMsg = `❌ AI Error: ${error}`;
      
      // Ensure we're in a clean state for the next command
      try {
        this.chatManager.addMessage('assistant', errorMsg, command === 'ai edit' ? 'edit' : 'ask');
        this.updateRendererWithChatHistory();
      } catch (chatError) {
        console.error('Error updating chat after AI command failure:', chatError);
      }
      
      // Model is now ready
    }
  }

  private async executeAIComplete(): Promise<void> {
    this.debugLog('Executing AI complete command');
    
    // Check if model is ready
    if (!this.inferenceManager.isModelReady()) {
      console.log('❌ AI model not loaded. Please wait for model to load.');
      return;
    }

    try {
      // Update context
      this.updateAIContext();
      
      // Get current line content and cursor position
      const currentTab = this.getCurrentTab();
      const buffer = currentTab.getBuffer();
      const cursor = buffer.getCursor();
      const currentLine = buffer.getLine(cursor.row);
      const textBeforeCursor = currentLine.substring(0, cursor.col);
      
      // Create a simple completion prompt
      const completionPrompt = `Complete this code line: "${textBeforeCursor}"`;
      
      // Generate completion
      const systemPrompt = `You are an AI code completion assistant. Provide a concise completion for the given code line. Return only the completion text without explanations.`;
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: completionPrompt }
      ];
      
      let completion = '';
      await this.inferenceManager.generateResponse(messages, (token: string) => {
        completion += token;
      });
      
      // Clean up the completion (remove any extra text)
      completion = completion.trim().replace(/^```[\w]*\n?/g, '').replace(/\n?```$/g, '');
      
      if (completion) {
        // Show as ghost text suggestion
        this.getCurrentTab().getRenderer().showAISuggestion(completion);
      } else {
        console.log('No completion available.');
      }
      
    } catch (error) {
      console.error('AI completion failed:', error);
    }
  }

  private updateRendererWithChatHistory(): void {
    const currentSession = this.chatManager.getCurrentSession();
    if (currentSession) {
      const messages = currentSession.messages.map((msg: ChatMessage) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        mode: msg.mode
      }));
      this.debugLog('Updating renderer with chat history:', messages.length, 'messages');
      this.getCurrentTab().getRenderer().setChatMessages(messages);
    } else {
      this.debugLog('No current chat session found');
    }
  }

  private updateLastAssistantMessage(content: string, mode: 'edit' | 'ask'): void {
    // Update the last message in the renderer without adding to chat history
    // This allows for real-time streaming updates
    const messages = this.getCurrentTab().getRenderer().getChatMessages();
    
    this.debugLog('Updating assistant message:', content.substring(0, 50) + '...', 'mode:', mode);
    
    // If there's no assistant message yet, create a temporary one for streaming
    if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') {
      // Add a temporary assistant message for streaming
      const tempMessage = {
        role: 'assistant',
        content: content,
        timestamp: Date.now(),
        mode: mode
      };
      messages.push(tempMessage);
      this.debugLog('Added temporary assistant message');
    } else {
      // Update existing assistant message
      messages[messages.length - 1].content = content;
      this.debugLog('Updated existing assistant message');
    }
    
    this.getCurrentTab().getRenderer().setChatMessages(messages);
  }



  private showError(message: string): void {
    console.error(`❌ Error: ${message}`);
  }



  private insertMultiLineText(buffer: BufferManager, text: string): void {
    const lines = text.split('\n');
    const cursor = buffer.getCursor();
    
    // Insert first line
    for (const char of lines[0]) {
      buffer.insertChar(char);
    }
    
    // Insert remaining lines
    for (let i = 1; i < lines.length; i++) {
      buffer.insertNewline();
      for (const char of lines[i]) {
        buffer.insertChar(char);
      }
    }
  }

  private insertTextAtPosition(line: number, col: number, text: string): void {
    console.log('📝 INSERT TEXT AT POSITION called with:', { line, col, text });
    const currentTab = this.getCurrentTab();
    const buffer = currentTab.getBuffer();
    
    try {
      // Store the current cursor position
      const originalCursor = buffer.getCursor();
      
      // Create a backup for undo functionality
      const backup = {
        content: buffer.getContent(),
        cursor: { ...originalCursor }
      };
      
      // Move cursor to the target position
      buffer.setCursor(line, col);
      console.log('📝 Moved cursor to position:', { line, col });
      
      // First, convert literal \n characters to actual newlines
      const normalizedText = text.replace(/\\n/g, '\n');
      console.log('📝 Normalized text:', normalizedText);
      
      // Use efficient insertion method
      if (normalizedText.includes('\n')) {
        this.insertMultiLineText(buffer, normalizedText);
      } else {
        // Single line insertion
        for (const char of normalizedText) {
          buffer.insertChar(char);
        }
      }
      
      const finalCursor = buffer.getCursor();
      console.log('📝 Final cursor position:', finalCursor);
      
      // Store the operation for undo
      this.storeUndoOperation('insert', backup, {
        content: buffer.getContent(),
        cursor: finalCursor
      });
      
      currentTab.getRenderer().render();
      this.tabManager.markCurrentTabAsModified();
      
      // Update LSP document
      const filename = currentTab.getFilename();
      if (this.lspManager.isReady() && filename) {
        this.lspManager.updateDocument(filename, buffer);
      }
    } catch (error) {
      console.error('❌ Error inserting text at position:', error);
      this.showError(`Failed to insert text at position: ${error}`);
    }
  }

  private replaceTextInRange(startLine: number, startCol: number, endLine: number, endCol: number, text: string): void {
    const currentTab = this.getCurrentTab();
    const buffer = currentTab.getBuffer();
    
    try {
      // Create a backup for undo functionality
      const originalCursor = buffer.getCursor();
      const backup = {
        content: buffer.getContent(),
        cursor: { ...originalCursor }
      };
      
      // Set cursor to start position
      buffer.setCursor(startLine, startCol);
      
      // Delete the range by repeatedly calling deleteChar
      // This handles both single line and multi-line deletions
      const totalCharsToDelete = this.calculateCharsToDelete(buffer, startLine, startCol, endLine, endCol);
      
      for (let i = 0; i < totalCharsToDelete; i++) {
        buffer.deleteChar();
      }
      
      // Insert new text
      const normalizedText = text.replace(/\\n/g, '\n');
      if (normalizedText.includes('\n')) {
        this.insertMultiLineText(buffer, normalizedText);
      } else {
        for (const char of normalizedText) {
          buffer.insertChar(char);
        }
      }
      
      const finalCursor = buffer.getCursor();
      
      // Store the operation for undo
      this.storeUndoOperation('replace', backup, {
        content: buffer.getContent(),
        cursor: finalCursor
      });
      
      currentTab.getRenderer().render();
      this.tabManager.markCurrentTabAsModified();
      
      // Update LSP document
      const filename = currentTab.getFilename();
      if (this.lspManager.isReady() && filename) {
        this.lspManager.updateDocument(filename, buffer);
      }
    } catch (error) {
      console.error('❌ Error replacing text in range:', error);
      this.showError(`Failed to replace text: ${error}`);
    }
  }

  private calculateCharsToDelete(buffer: BufferManager, startLine: number, startCol: number, endLine: number, endCol: number): number {
    if (startLine === endLine) {
      // Same line - just count characters
      return endCol - startCol;
    }
    
    let totalChars = 0;
    
    // Characters from start position to end of first line
    totalChars += buffer.getLineLength(startLine) - startCol;
    
    // Add newline character for first line
    totalChars += 1;
    
    // Characters from complete middle lines (including newlines)
    for (let line = startLine + 1; line < endLine; line++) {
      totalChars += buffer.getLineLength(line) + 1; // +1 for newline
    }
    
    // Characters from start of last line to end position
    totalChars += endCol;
    
    return totalChars;
  }

  private deleteTextInRange(startLine: number, startCol: number, endLine: number, endCol: number): void {
    const currentTab = this.getCurrentTab();
    const buffer = currentTab.getBuffer();
    
    try {
      // Create a backup for undo functionality
      const originalCursor = buffer.getCursor();
      const backup = {
        content: buffer.getContent(),
        cursor: { ...originalCursor }
      };
      
      // Set cursor to start position
      buffer.setCursor(startLine, startCol);
      
      // Delete the range
      const totalCharsToDelete = this.calculateCharsToDelete(buffer, startLine, startCol, endLine, endCol);
      
      for (let i = 0; i < totalCharsToDelete; i++) {
        buffer.deleteChar();
      }
      
      const finalCursor = buffer.getCursor();
      
      // Store the operation for undo
      this.storeUndoOperation('delete', backup, {
        content: buffer.getContent(),
        cursor: finalCursor
      });
      
      currentTab.getRenderer().render();
      this.tabManager.markCurrentTabAsModified();
      
      // Update LSP document
      const filename = currentTab.getFilename();
      if (this.lspManager.isReady() && filename) {
        this.lspManager.updateDocument(filename, buffer);
      }
    } catch (error) {
      console.error('❌ Error deleting text in range:', error);
      this.showError(`Failed to delete text: ${error}`);
    }
  }

  private storeUndoOperation(type: 'insert' | 'replace' | 'delete', before: { content: string; cursor: { row: number; col: number } }, after: { content: string; cursor: { row: number; col: number } }): void {
    const operation: UndoOperation = {
      type,
      before,
      after,
      timestamp: Date.now()
    };
    
    this.aiUndoStack.push(operation);
    
    // Limit the undo stack size
    if (this.aiUndoStack.length > this.maxUndoOperations) {
      this.aiUndoStack.shift();
    }
    
    console.log('📚 Stored undo operation:', operation.type);
  }

  undoAIEdit(): boolean {
    if (this.aiUndoStack.length === 0) {
      this.showError('No AI edits to undo');
      return false;
    }
    
    const operation = this.aiUndoStack.pop()!;
    const currentTab = this.getCurrentTab();
    
    try {
      // Restore the previous state using BufferTab's setContent method
      currentTab.setContent(operation.before.content, this.debugMode);
      const buffer = currentTab.getBuffer();
      buffer.setCursor(operation.before.cursor.row, operation.before.cursor.col);
      
      currentTab.getRenderer().render();
      this.tabManager.markCurrentTabAsModified();
      
      // Update LSP document
      const filename = currentTab.getFilename();
      if (this.lspManager.isReady() && filename) {
        this.lspManager.updateDocument(filename, buffer);
      }
      
      console.log('↶ Undid AI edit:', operation.type);
      this.showError(`Undid AI ${operation.type} operation`);
      return true;
    } catch (error) {
      console.error('❌ Error undoing AI edit:', error);
      this.showError(`Failed to undo AI edit: ${error}`);
      return false;
    }
  }

  getAIUndoStackSize(): number {
    return this.aiUndoStack.length;
  }

  clearAIUndoStack(): void {
    this.aiUndoStack = [];
    console.log('🗑️ Cleared AI undo stack');
  }



  async requestCompletions(): Promise<void> {
    const currentTab = this.getCurrentTab();
    const filename = currentTab.getFilename();
    
    // Only show completions in insert mode
    if (currentTab.getRenderer().getMode() !== 'insert') {
      this.debugLog('Not in insert mode, skipping completions');
      return;
    }
    
    if (!this.lspManager.isReady() || !filename) {
      this.debugLog('LSP not ready or no filename. Ready:', this.lspManager.isReady(), 'Filename:', filename);
      return;
    }

    try {
      const position = currentTab.getBuffer().getCursor();
      this.debugLog('Requesting completions at position:', position);
      const completions = await this.lspManager.getCompletions(filename, position);
      this.debugLog('Received completions:', completions.length, 'items');
      if (completions.length > 0) {
        this.debugLog('First few completions:', completions.slice(0, 3).map(c => c.label));
      }
      currentTab.getRenderer().setCompletions(completions);
      currentTab.getRenderer().render();
    } catch (error) {
      console.error('Failed to get completions:', error);
    }
  }

  insertCompletion(completion: CompletionSuggestion): void {
    const currentTab = this.getCurrentTab();
    const buffer = currentTab.getBuffer();
    const cursor = buffer.getCursor();
    
    // Move cursor to the start of the replacement range
    buffer.setCursor(completion.range.start.row, completion.range.start.col);
    
    // Delete the text that will be replaced
    if (completion.range.start.row === completion.range.end.row) {
      // Same line replacement - delete characters in the range
      const charsToDelete = completion.range.end.col - completion.range.start.col;
      
      for (let i = 0; i < charsToDelete; i++) {
        buffer.deleteChar();
      }
    }
    
    // Insert the new text
    for (const char of completion.insertText) {
      buffer.insertChar(char);
    }
    
    currentTab.getRenderer().render();
    this.tabManager.markCurrentTabAsModified();
    
    // Update LSP document
    const filename = currentTab.getFilename();
    if (this.lspManager.isReady() && filename) {
      this.lspManager.updateDocument(filename, buffer);
      // Update diagnostics after document change
      setTimeout(() => this.updateDiagnostics(), 100);
    }
  }

  private updateDiagnostics(): void {
    const currentTab = this.getCurrentTab();
    const filename = currentTab.getFilename();
    
    if (!filename || !this.lspManager.isReady()) return;
    
    const diagnostics = this.lspManager.getDiagnostics(filename);
    currentTab.getRenderer().setDiagnostics(diagnostics);
    currentTab.getRenderer().render();
  }

  private shouldTriggerAutoCompletion(key: string): boolean {
    // Trigger completions for these characters
    const triggerChars = ['.', '(', '[', ' '];
    return triggerChars.includes(key) || (key.length === 1 && /[a-zA-Z]/.test(key));
  }

  async goToDefinition(): Promise<void> {
    const currentTab = this.getCurrentTab();
    const filename = currentTab.getFilename();
    
    if (!this.lspManager.isReady() || !filename) {
      this.debugLog('LSP not ready or no filename for go-to-definition');
      return;
    }

    try {
      const position = currentTab.getBuffer().getCursor();
      this.debugLog('Requesting definition at position:', position);
      const definitions = await this.lspManager.getDefinition(filename, position);
      
      if (definitions.length === 0) {
        this.debugLog('No definition found');
        return;
      }

      if (definitions.length === 1) {
        // Single definition - jump directly
        await this.jumpToDefinition(definitions[0]);
      } else {
        // Multiple definitions - show selection menu
        this.showDefinitionMenu(definitions);
      }
    } catch (error) {
      console.error('Failed to get definition:', error);
    }
  }

  private async jumpToDefinition(definition: DefinitionLocation): Promise<void> {
    try {
      const currentTab = this.getCurrentTab();
      
      // If it's the same file, just move the cursor
      if (definition.filePath === currentTab.getFilename()) {
        currentTab.getBuffer().setCursor(definition.position.row, definition.position.col);
        currentTab.getRenderer().render();
        return;
      }

      // Different file - load it in a new tab
      await this.tabManager.openFile(definition.filePath, this);
      const newTab = this.getCurrentTab();
      newTab.getBuffer().setCursor(definition.position.row, definition.position.col);
      newTab.getRenderer().render();
    } catch (error) {
      console.error('Failed to jump to definition:', error);
    }
  }

  private showDefinitionMenu(definitions: DefinitionLocation[]): void {
    // For now, just jump to the first definition
    // TODO: Implement a proper selection menu
    this.debugLog(`Found ${definitions.length} definitions, jumping to first one`);
    this.jumpToDefinition(definitions[0]);
  }

  // LSP Configuration methods
  getLSPManager(): LSPManager {
    return this.lspManager;
  }

  async switchLSPServer(serverName: string): Promise<void> {
    try {
      const workspaceRoot = process.cwd();
      await this.lspManager.switchServer(serverName, workspaceRoot);
      
      // Re-open current document with new server
      const currentTab = this.getCurrentTab();
      const filename = currentTab.getFilename();
      if (filename) {
        this.lspManager.openDocument(filename, currentTab.getBuffer());
      }
      
      this.showError(`Switched to LSP server: ${serverName}`);
    } catch (error) {
      this.showError(`Failed to switch LSP server: ${error}`);
    }
  }

  listLSPServers(): void {
    const servers = this.lspManager.listAvailableServers();
    const enabledServers = this.lspManager.listEnabledServers();
    const currentServer = this.lspManager.getCurrentServerConfig();
    
    let message = '📋 Available LSP Servers:\n\n';
    
    for (const server of servers) {
      const isEnabled = enabledServers.some(s => s.name === server.name);
      const isCurrent = currentServer?.name === server.name;
      const status = isCurrent ? ' (current)' : isEnabled ? ' (enabled)' : ' (disabled)';
      const extensions = server.fileExtensions.join(', ');
      
      message += `• ${server.name}${status}\n`;
      message += `  Command: ${server.command} ${server.args.join(' ')}\n`;
      message += `  Extensions: ${extensions}\n\n`;
    }
    
    message += `Config file: ${this.lspManager.getConfigPath()}\n`;
    
    console.log(message);
  }

  enableLSPServer(serverName: string): void {
    try {
      this.lspManager.enableServer(serverName);
      this.showError(`Enabled LSP server: ${serverName}`);
    } catch (error) {
      this.showError(`Failed to enable LSP server: ${error}`);
    }
  }

  disableLSPServer(serverName: string): void {
    try {
      this.lspManager.disableServer(serverName);
      this.showError(`Disabled LSP server: ${serverName}`);
    } catch (error) {
      this.showError(`Failed to disable LSP server: ${error}`);
    }
  }

  setDefaultLSPServer(serverName: string): void {
    try {
      this.lspManager.setDefaultServer(serverName);
      this.showError(`Set default LSP server: ${serverName}`);
    } catch (error) {
      this.showError(`Failed to set default LSP server: ${error}`);
    }
  }

  createLSPConfigFile(): void {
    try {
      this.lspManager.createDefaultConfigFile();
      const configPath = this.lspManager.getConfigPath();
      this.showError(`Created LSP config file at: ${configPath}`);
    } catch (error) {
      this.showError(`Failed to create LSP config file: ${error}`);
    }
  }
}
