import { terminal } from 'terminal-kit';
import { BufferManager } from './BufferManager';
import { CompletionSuggestion } from './LSPManager';
import { LSPDiagnostic } from './LSPClient';
import { SyntaxHighlighter, HighlightedToken } from './SyntaxHighlighter';

export type EditorMode = 'insert' | 'command';

export class TerminalRenderer {
  private buffer: BufferManager;
  private mode: EditorMode = 'insert';
  private filename: string = '';
  private viewportStartRow: number = 0;
  private viewportStartCol: number = 0;
  private terminalWidth: number = 80;
  private terminalHeight: number = 24;
  private commandInput: string = '';
  private editor: any = null; // Will be set by Editor class
  private completions: CompletionSuggestion[] = [];
  private selectedCompletionIndex: number = 0;
  private showCompletions: boolean = false;
  private diagnostics: LSPDiagnostic[] = [];
  private syntaxHighlighter: SyntaxHighlighter;
  private lastSavedContent: string = '';
  private debugMode: boolean = false;
  private chatScrollOffset: number = 0;
  private chatContentScrollOffset: number = 0;
  private chatMessages: Array<{ role: string; content: string; timestamp: number; mode: string }> = [];
  private isChatVisible: boolean = true;
  private aiSuggestion: string = '';
  private isShowingAISuggestion: boolean = false;

  constructor(buffer: BufferManager, filename: string = '', debugMode: boolean = false) {
    this.buffer = buffer;
    this.filename = filename;
    this.syntaxHighlighter = new SyntaxHighlighter();
    this.syntaxHighlighter.setLanguage(filename);
    this.lastSavedContent = buffer.getContent();
    this.debugMode = debugMode;
    this.updateTerminalSize();
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  private debugLog(message: string, ...args: any[]): void {
    if (this.debugMode) {
      console.log(message, ...args);
    }
  }

  private updateTerminalSize(): void {
    // Get terminal size more reliably
    const rawWidth = terminal.width;
    const rawHeight = terminal.height;
    
    // Handle Infinity values and use fallbacks
    this.terminalWidth = (rawWidth && rawWidth !== Infinity && rawWidth > 0) ? Math.min(rawWidth, 200) : 80;
    this.terminalHeight = (rawHeight && rawHeight !== Infinity && rawHeight > 0) ? Math.min(rawHeight, 50) : 24;
    
    this.debugLog('Terminal size:', { width: this.terminalWidth, height: this.terminalHeight });
  }

  private getViewportEndRow(maxHeight?: number): number {
    const availableHeight = maxHeight || (this.terminalHeight - 2); // -2 for status bar
    return Math.min(
      this.viewportStartRow + availableHeight - 1,
      this.buffer.getLineCount() - 1
    );
  }

  private getViewportEndCol(): number {
    return this.viewportStartCol + this.terminalWidth - 1;
  }

  private ensureCursorVisible(): void {
    const cursor = this.buffer.getCursor();
    
    // Calculate available editor height
    const statusBarHeight = 1;
    const commandInputHeight = this.mode === 'command' ? 1 : 0;
    const chatHeight = this.isChatVisible ? 6 : 0; // Fixed chat height
    const editorHeight = this.terminalHeight - statusBarHeight - commandInputHeight - chatHeight;
    
    // Adjust viewport to keep cursor visible
    if (cursor.row < this.viewportStartRow) {
      this.viewportStartRow = cursor.row;
    } else if (cursor.row > this.getViewportEndRow(editorHeight)) {
      this.viewportStartRow = cursor.row - editorHeight + 1;
    }

    if (cursor.col < this.viewportStartCol) {
      this.viewportStartCol = cursor.col;
    } else if (cursor.col > this.getViewportEndCol()) {
      this.viewportStartCol = cursor.col - this.terminalWidth + 1;
    }
  }

  render(): void {
    this.updateTerminalSize();
    this.ensureCursorVisible();
    
    terminal.clear();
    
    // Calculate layout heights
    const statusBarHeight = 1;
    const commandInputHeight = this.mode === 'command' ? 1 : 0;
    const chatHeight = this.isChatVisible ? this.calculateOptimalChatHeight() : 0;
    const editorHeight = this.terminalHeight - statusBarHeight - commandInputHeight - chatHeight;
    
    // Render text content (always show editor)
    this.renderTextContent(editorHeight);
    
    // Render completions if showing (before other UI elements so it doesn't overlap)
    if (this.showCompletions && this.completions.length > 0) {
      this.renderCompletions();
    }
    
    // Render status bar (positioned after editor content)
    this.renderStatusBar(editorHeight);
    
    // Render command input if in command mode (positioned after status bar)
    if (this.mode === 'command') {
      this.renderCommandInput(editorHeight, statusBarHeight);
    }
    
    // Render chat panel at the bottom if visible
    if (this.isChatVisible) {
      this.renderChatPanel(chatHeight, editorHeight, statusBarHeight, commandInputHeight);
    }
    
    // Position cursor
    this.positionCursor();
  }

  private calculateOptimalChatHeight(): number {
    const lastExchange = this.getLastUserAndAIExchange();
    // Use full width minus prefix for better text wrapping
    const userContentWidth = this.terminalWidth - 3; // -3 for "Q: "
    const aiContentWidth = this.terminalWidth - 3; // -3 for "A: "
    
    let totalLines = 0;
    
    if (lastExchange.user && lastExchange.assistant) {
      // Calculate lines needed for user message
      const userLines = this.wrapLine(lastExchange.user.content, userContentWidth).length;
      totalLines += userLines;
      
      // Calculate lines needed for AI response
      const aiLines = this.wrapLine(lastExchange.assistant.content, aiContentWidth).length;
      totalLines += aiLines;
    } else if (lastExchange.user && !lastExchange.assistant) {
      // User message + "AI is thinking..."
      const userLines = this.wrapLine(lastExchange.user.content, userContentWidth).length;
      totalLines += userLines + 1; // +1 for "AI is thinking..."
    } else if (lastExchange.assistant && !lastExchange.user) {
      // Just AI response
      const aiLines = this.wrapLine(lastExchange.assistant.content, aiContentWidth).length;
      totalLines += aiLines;
    } else {
      // No messages, show placeholder
      totalLines = 1;
    }
    
    // Use a more generous height allocation to prevent text overwriting during streaming
    // Ensure minimum height of 6 and allow up to 3/4 of terminal height for better visibility
    const minHeight = 6;
    const maxHeight = Math.floor(this.terminalHeight * 0.75);
    const optimalHeight = Math.min(Math.max(totalLines, minHeight), maxHeight);
    
    return optimalHeight;
  }

  private renderChatPanel(panelHeight: number, editorHeight: number, statusBarHeight: number, commandInputHeight: number): void {
    // Position chat panel at the bottom after all other elements
    const startRow = editorHeight + statusBarHeight + commandInputHeight + 1;
    const maxLines = panelHeight;
    
    // Clear the chat panel area first to prevent text overwriting
    for (let i = 0; i < maxLines; i++) {
      terminal.moveTo(1, startRow + i);
      terminal(' '.repeat(this.terminalWidth));
    }
    
    // Get the last user prompt and AI response
    const lastExchange = this.getLastUserAndAIExchange();
    
    let currentLine = 0;
    let totalContentLines = 0;
    
    if (lastExchange.user && lastExchange.assistant) {
      // Calculate total lines needed for both messages
      const userContentWidth = this.terminalWidth - 3;
      const aiContentWidth = this.terminalWidth - 3;
      const userLines = this.wrapLine(lastExchange.user.content, userContentWidth).length;
      const aiLines = this.wrapLine(lastExchange.assistant.content, aiContentWidth).length;
      totalContentLines = userLines + aiLines;
      
      // Render last user prompt with wrapping
      currentLine = this.renderFullWidthMessage(startRow, currentLine, maxLines, 'Q:', lastExchange.user.content, terminal.green, terminal.bold.green);
      
      if (currentLine < maxLines) {
        // Render last AI response with wrapping
        currentLine = this.renderFullWidthMessage(startRow, currentLine, maxLines, 'A:', lastExchange.assistant.content, terminal.yellow, terminal.bold.yellow);
      }
    } else if (lastExchange.user && !lastExchange.assistant) {
      // Calculate lines for user message
      const userContentWidth = this.terminalWidth - 3;
      totalContentLines = this.wrapLine(lastExchange.user.content, userContentWidth).length + 1;
      
      // Render user prompt when AI is still responding
      currentLine = this.renderFullWidthMessage(startRow, currentLine, maxLines, 'Q:', lastExchange.user.content, terminal.green, terminal.bold.green);
      
      if (currentLine < maxLines) {
        // Show "AI is thinking..." message
        terminal.moveTo(1, startRow + currentLine);
        terminal.bold.yellow('A: ');
        terminal.gray('AI is thinking...');
        currentLine++;
      }
    } else if (lastExchange.assistant && !lastExchange.user) {
      // Calculate lines for AI response only
      const aiContentWidth = this.terminalWidth - 3;
      totalContentLines = this.wrapLine(lastExchange.assistant.content, aiContentWidth).length;
      
      // Render assistant response without user prompt (streaming case)
      currentLine = this.renderFullWidthMessage(startRow, currentLine, maxLines, 'A:', lastExchange.assistant.content, terminal.yellow, terminal.bold.yellow);
    } else {
      // Show placeholder when no chat messages
      terminal.moveTo(1, startRow + currentLine);
      terminal.gray('No chat messages yet. Use :ai ask or :ai edit to start.');
      currentLine++;
      totalContentLines = 1;
    }
    
    // Show scroll indicators if content is longer than available space
    this.renderScrollIndicators(startRow, maxLines, totalContentLines);
  }

  private renderScrollIndicators(startRow: number, maxLines: number, totalContentLines: number): void {
    // Only show indicators if content is scrollable
    if (totalContentLines <= maxLines) {
      return;
    }
    
    const canScrollUp = this.chatContentScrollOffset > 0;
    const canScrollDown = this.chatContentScrollOffset + maxLines < totalContentLines;
    
    // Show scroll indicators in the right margin
    if (canScrollUp) {
      terminal.moveTo(this.terminalWidth - 1, startRow);
      terminal.cyan('↑');
    }
    
    if (canScrollDown) {
      terminal.moveTo(this.terminalWidth - 1, startRow + maxLines - 1);
      terminal.cyan('↓');
    }
    
    // Show scroll help text at the bottom if content is scrollable
    if (canScrollUp || canScrollDown) {
      terminal.moveTo(this.terminalWidth - 20, startRow + maxLines - 1);
      terminal.dim.gray('Ctrl+K/J to scroll');
    }
  }

  private renderFullWidthMessage(startRow: number, currentLine: number, maxLines: number, prefix: string, content: string, contentColor: any, prefixColor: any): number {
    // Use full terminal width minus just the prefix space
    const contentWidth = this.terminalWidth - prefix.length - 1; // -1 for space after prefix
    const wrappedLines = this.wrapLine(content, contentWidth);
    
    // Apply scroll offset
    const startIndex = Math.max(0, this.chatContentScrollOffset);
    const endIndex = Math.min(wrappedLines.length, startIndex + maxLines - currentLine + 1);
    
    for (let i = startIndex; i < endIndex && currentLine < maxLines; i++) {
      terminal.moveTo(1, startRow + currentLine);
      
      if (i === 0) {
        // First line: show prefix
        prefixColor(prefix + ' ');
        contentColor(wrappedLines[i]);
      } else {
        // Subsequent lines: indent to align with content after prefix
        terminal(' '.repeat(prefix.length + 1));
        contentColor(wrappedLines[i]);
      }
      
      currentLine++;
    }
    
    return currentLine;
  }





  private getLastUserAndAIExchange(): { user?: any; assistant?: any } {
    // Get all user-assistant exchanges
    const exchanges: Array<{ user: any; assistant: any }> = [];
    let currentUser: any = null;
    
    for (const message of this.chatMessages) {
      if (message.role === 'user') {
        currentUser = message;
      } else if (message.role === 'assistant') {
        if (currentUser) {
          exchanges.push({ user: currentUser, assistant: message });
          currentUser = null;
        } else {
          // Handle case where assistant message exists without a preceding user message
          // This can happen during streaming
          exchanges.push({ user: null, assistant: message });
        }
      }
    }
    
    // If we have a current user but no assistant yet, show the user message
    if (currentUser && exchanges.length === 0) {
      return { user: currentUser, assistant: null };
    }
    
    // Return the exchange at the scroll offset (0 = most recent)
    const index = Math.max(0, exchanges.length - 1 - this.chatScrollOffset);
    return exchanges[index] || {};
  }

  private wrapLine(line: string, maxWidth: number): string[] {
    if (line.length <= maxWidth) {
      return [line];
    }
    
    const wrapped: string[] = [];
    const words = line.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      // If adding this word would exceed the width
      if (currentLine.length + word.length + 1 > maxWidth) {
        // If we have content in current line, push it
        if (currentLine.length > 0) {
          wrapped.push(currentLine);
          currentLine = '';
        }
        
        // If the word itself is longer than maxWidth, break it
        if (word.length > maxWidth) {
          let remainingWord = word;
          while (remainingWord.length > maxWidth) {
            wrapped.push(remainingWord.substring(0, maxWidth));
            remainingWord = remainingWord.substring(maxWidth);
          }
          if (remainingWord.length > 0) {
            currentLine = remainingWord;
          }
        } else {
          currentLine = word;
        }
      } else {
        // Add word to current line
        if (currentLine.length > 0) {
          currentLine += ' ' + word;
        } else {
          currentLine = word;
        }
      }
    }
    
    // Add any remaining content
    if (currentLine.length > 0) {
      wrapped.push(currentLine);
    }
    
    return wrapped;
  }

  private renderTextContent(maxHeight?: number): void {
    const endRow = this.getViewportEndRow(maxHeight);
    
    // Calculate line number width based on the highest line number
    const maxLineNumber = this.buffer.getLineCount();
    const lineNumberWidth = Math.max(3, maxLineNumber.toString().length + 1);
    
    for (let row = this.viewportStartRow; row <= endRow; row++) {
      const line = this.buffer.getLine(row);
      const displayLine = line.slice(this.viewportStartCol);
      
      // Calculate available width for content (subtract line numbers and padding)
      const contentWidth = this.terminalWidth - lineNumberWidth - 1; // -1 for space after line number
      
      // Truncate line if it's too long
      const truncatedLine = displayLine.length > contentWidth 
        ? displayLine.slice(0, contentWidth - 1) + '~'
        : displayLine;
      
      terminal.moveTo(1, row - this.viewportStartRow + 1);
      
      // Render line number
      const lineNumber = (row + 1).toString().padStart(lineNumberWidth - 1, ' ');
      terminal.gray(lineNumber + ' ');
      
      // Check for diagnostics on this line
      const lineDiagnostics = this.getDiagnosticsForLine(row);
      if (lineDiagnostics.length > 0) {
        // Highlight line with error/warning color
        const severity = lineDiagnostics[0].severity;
        if (severity === 1) { // Error
          terminal.red(truncatedLine);
        } else if (severity === 2) { // Warning
          terminal.yellow(truncatedLine);
        } else {
          this.renderHighlightedLine(truncatedLine);
        }
      } else {
        this.renderHighlightedLine(truncatedLine);
      }

      // Render AI suggestion as ghost text if on current line
      if (this.isShowingAISuggestion && row === this.buffer.getCursor().row) {
        this.renderAISuggestion(row, lineNumberWidth);
      }
    }
  }

  private renderHighlightedLine(line: string): void {
    const highlighted = this.syntaxHighlighter.highlightLine(line);
    
    for (const token of highlighted.tokens) {
      this.renderToken(token);
    }
  }


  private renderAISuggestion(row: number, lineNumberWidth: number): void {
    const cursor = this.buffer.getCursor();
    if (row !== cursor.row) return;

    // Calculate position for ghost text (after current cursor position)
    const suggestionStartCol = cursor.col - this.viewportStartCol + lineNumberWidth + 1;
    
    // Only show suggestion if it fits in the viewport
    if (suggestionStartCol < this.terminalWidth && this.aiSuggestion) {
      terminal.moveTo(suggestionStartCol, row - this.viewportStartRow + 1);
      // Render ghost text in gray/faded color
      terminal.gray(this.aiSuggestion);
    }
  }

  private renderToken(token: HighlightedToken): void {
    const { text, color, bold, italic } = token;
    
    // Apply styling based on token properties
    if (bold && italic) {
      terminal.bold.italic(this.getColorMethod(color)(text));
    } else if (bold) {
      terminal.bold(this.getColorMethod(color)(text));
    } else if (italic) {
      terminal.italic(this.getColorMethod(color)(text));
    } else {
      this.getColorMethod(color)(text);
    }
  }

  private getColorMethod(color: string): (text: string) => void {
    switch (color) {
      case 'red': return terminal.red;
      case 'green': return terminal.green;
      case 'yellow': return terminal.yellow;
      case 'blue': return terminal.blue;
      case 'magenta': return terminal.magenta;
      case 'cyan': return terminal.cyan;
      case 'white': return terminal.white;
      case 'gray': return terminal.gray;
      case 'default':
      default: return terminal;
    }
  }

  private renderStatusBar(editorHeight: number): void {
    const cursor = this.buffer.getCursor();
    const modeText = `[${this.mode.toUpperCase()}]`;
    const filenameText = this.filename || '[No Name]';
    const modifiedText = this.buffer.getContent() !== this.lastSavedContent ? '*' : '';
    
    // Get language from filename extension
    const language = this.getLanguageFromFilename(filenameText);
    
    // Format cursor position as "Ln X, Col Y"
    const positionText = `Ln ${cursor.row + 1}, Col ${cursor.col + 1}`;
    
    // Get AI status
    let aiStatus = 'AI: off';
    if (this.editor && this.editor.getInferenceManager) {
      const aiStatusType = this.editor.getInferenceManager().getModelStatus();
      switch (aiStatusType) {
        case 'ready':
          aiStatus = 'AI: qwen-coder';
          break;
        case 'loading':
          aiStatus = 'AI: loading...';
          break;
        case 'not_loaded':
          aiStatus = 'AI: off';
          break;
      }
    }
    
    // Ensure terminal width is valid
    const width = Math.max(1, this.terminalWidth);
    
    // Format status bar according to spec: [MODE] filename | LANG | Ln X, Col Y | AI: status
    const statusText = `${modeText} ${filenameText}${modifiedText} | ${language} | ${positionText} | ${aiStatus}`;
    
    this.debugLog('Rendering status bar:', { width, statusText, statusTextLength: statusText.length });
    
    // Position status bar right after editor content
    const statusBarRow = editorHeight + 1;
    terminal.moveTo(1, statusBarRow);
    terminal.bgBlue.white(statusText.padEnd(width));
  }

  private getLanguageFromFilename(filename: string): string {
    if (!filename || filename === '[No Name]') return 'TXT';
    
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'js': return 'JS';
      case 'ts': return 'TS';
      case 'jsx': return 'JSX';
      case 'tsx': return 'TSX';
      case 'py': return 'PY';
      case 'java': return 'JAVA';
      case 'cpp': case 'cc': case 'cxx': return 'CPP';
      case 'c': return 'C';
      case 'cs': return 'CS';
      case 'go': return 'GO';
      case 'rs': return 'RUST';
      case 'php': return 'PHP';
      case 'rb': return 'RB';
      case 'swift': return 'SWIFT';
      case 'kt': return 'KT';
      case 'scala': return 'SCALA';
      case 'html': return 'HTML';
      case 'css': return 'CSS';
      case 'scss': return 'SCSS';
      case 'less': return 'LESS';
      case 'json': return 'JSON';
      case 'xml': return 'XML';
      case 'yaml': case 'yml': return 'YAML';
      case 'md': return 'MD';
      case 'sql': return 'SQL';
      case 'sh': case 'bash': return 'SH';
      case 'ps1': return 'PS1';
      case 'dockerfile': return 'DOCKER';
      case 'makefile': return 'MAKE';
      default: return extension?.toUpperCase() || 'TXT';
    }
  }

  private renderCommandInput(editorHeight: number, statusBarHeight: number): void {
    const width = Math.max(1, this.terminalWidth);
    // Position command input right after status bar
    const commandInputRow = editorHeight + statusBarHeight + 1;
    terminal.moveTo(1, commandInputRow);
    terminal.bgGreen.white(`:${this.commandInput}`.padEnd(width));
  }

  private positionCursor(): void {
    const cursor = this.buffer.getCursor();
    const displayRow = cursor.row - this.viewportStartRow + 1;
    
    // Calculate line number width for cursor positioning
    const maxLineNumber = this.buffer.getLineCount();
    const lineNumberWidth = Math.max(3, maxLineNumber.toString().length + 1);
    
    // Adjust cursor column to account for line numbers
    const displayCol = cursor.col - this.viewportStartCol + lineNumberWidth + 1;
    
    terminal.moveTo(displayCol, displayRow);
  }

  private renderCompletions(): void {
    const cursor = this.buffer.getCursor();
    const maxCompletions = Math.min(this.completions.length, 10); // Show max 10 completions
    const completionHeight = maxCompletions + 2; // +2 for border
    
    // Calculate position for completion popup - position it below the current line
    const startRow = Math.max(1, cursor.row - this.viewportStartRow + 2);
    const startCol = Math.max(1, cursor.col - this.viewportStartCol + 1);
    
    // Ensure completions don't go off screen and don't overlap with status bar
    const maxRow = this.terminalHeight - 2; // Leave space for status bar
    const adjustedStartRow = startRow + completionHeight > maxRow 
      ? Math.max(1, maxRow - completionHeight) 
      : startRow;
    
    this.debugLog('Rendering completions at row:', adjustedStartRow, 'col:', startCol, 'height:', completionHeight);
    
    // Draw completion box border
    terminal.moveTo(startCol, adjustedStartRow);
    terminal.bgWhite.black('┌' + '─'.repeat(30) + '┐');
    
    // Draw completion items
    for (let i = 0; i < maxCompletions; i++) {
      const completion = this.completions[i];
      const isSelected = i === this.selectedCompletionIndex;
      
      terminal.moveTo(startCol, adjustedStartRow + i + 1);
      
      if (isSelected) {
        terminal.bgBlue.white('│▶ ' + completion.label.padEnd(26) + ' │');
      } else {
        terminal.bgWhite.black('│  ' + completion.label.padEnd(26) + ' │');
      }
    }
    
    // Draw bottom border
    terminal.moveTo(startCol, adjustedStartRow + maxCompletions + 1);
    terminal.bgWhite.black('└' + '─'.repeat(30) + '┘');
    
    // Draw help text
    terminal.moveTo(startCol, adjustedStartRow + maxCompletions + 2);
    terminal.bgGray.white('↑↓/jk: nav  Enter/Space: accept  Esc: cancel'.padEnd(32));
  }

  setMode(mode: EditorMode): void {
    this.mode = mode;
    if (mode === 'command') {
      this.commandInput = '';
    }
  }

  getMode(): EditorMode {
    return this.mode;
  }

  setCommandInput(input: string): void {
    this.commandInput = input;
  }

  getCommandInput(): string {
    return this.commandInput;
  }

  setFilename(filename: string): void {
    this.filename = filename;
    this.syntaxHighlighter.setLanguage(filename);
  }

  getFilename(): string {
    return this.filename;
  }

  setEditor(editor: any): void {
    this.editor = editor;
  }

  getEditor(): any {
    return this.editor;
  }

  setBuffer(buffer: BufferManager): void {
    this.buffer = buffer;
    // Update the lastSavedContent to match the new buffer
    this.lastSavedContent = buffer.getContent();
  }

  // Simplified chat management methods
  addChatMessage(role: 'user' | 'assistant', content: string, mode: 'edit' | 'ask'): void {
    this.chatMessages.push({
      role,
      content,
      timestamp: Date.now(),
      mode
    });
    
    this.render();
  }

  clearChatMessages(): void {
    this.chatMessages = [];
    this.chatScrollOffset = 0;
    this.render();
  }

  showChat(): void {
    this.isChatVisible = true;
    this.render();
  }

  hideChat(): void {
    this.isChatVisible = false;
    this.render();
  }

  toggleChat(): void {
    this.isChatVisible = !this.isChatVisible;
    this.render();
  }

  scrollChatContentUp(): void {
    if (this.chatContentScrollOffset > 0) {
      this.chatContentScrollOffset--;
      this.render();
    }
  }

  scrollChatContentDown(): void {
    // Calculate total content lines to prevent over-scrolling
    const lastExchange = this.getLastUserAndAIExchange();
    let totalContentLines = 0;
    
    if (lastExchange.user && lastExchange.assistant) {
      const userContentWidth = this.terminalWidth - 3;
      const aiContentWidth = this.terminalWidth - 3;
      const userLines = this.wrapLine(lastExchange.user.content, userContentWidth).length;
      const aiLines = this.wrapLine(lastExchange.assistant.content, aiContentWidth).length;
      totalContentLines = userLines + aiLines;
    } else if (lastExchange.user && !lastExchange.assistant) {
      const userContentWidth = this.terminalWidth - 3;
      totalContentLines = this.wrapLine(lastExchange.user.content, userContentWidth).length + 1;
    } else if (lastExchange.assistant && !lastExchange.user) {
      const aiContentWidth = this.terminalWidth - 3;
      totalContentLines = this.wrapLine(lastExchange.assistant.content, aiContentWidth).length;
    }
    
    const chatHeight = this.calculateOptimalChatHeight();
    const maxScrollOffset = Math.max(0, totalContentLines - chatHeight);
    
    if (this.chatContentScrollOffset < maxScrollOffset) {
      this.chatContentScrollOffset++;
      this.render();
    }
  }

  scrollChat(): void {
    // Count the number of user-assistant exchanges
    const exchanges: Array<{ user: any; assistant: any }> = [];
    let currentUser: any = null;
    
    for (const message of this.chatMessages) {
      if (message.role === 'user') {
        currentUser = message;
      } else if (message.role === 'assistant' && currentUser) {
        exchanges.push({ user: currentUser, assistant: message });
        currentUser = null;
      }
    }
    
    // Cycle through exchanges
    this.chatScrollOffset = (this.chatScrollOffset + 1) % Math.max(1, exchanges.length);
    this.render();
  }

  getChatMessages(): Array<{ role: string; content: string; timestamp: number; mode: string }> {
    return [...this.chatMessages];
  }

  setChatMessages(messages: Array<{ role: string; content: string; timestamp: number; mode: string }>): void {
    const previousLength = this.chatMessages.length;
    const previousContent = this.chatMessages.length > 0 ? this.chatMessages[this.chatMessages.length - 1]?.content : '';
    this.chatMessages = [...messages];
    
    // Reset scroll offset if new messages were added or if content is growing (streaming)
    if (messages.length > previousLength) {
      this.chatContentScrollOffset = 0;
    } else {
      // During streaming, auto-scroll to show new content if we're near the bottom
      const currentContent = this.chatMessages.length > 0 ? this.chatMessages[this.chatMessages.length - 1]?.content : '';
      if (currentContent !== previousContent && currentContent.length > previousContent.length) {
        // Content is growing (streaming), check if we should auto-scroll
        const lastExchange = this.getLastUserAndAIExchange();
        if (lastExchange.assistant) {
          const aiContentWidth = this.terminalWidth - 3;
          const totalLines = this.wrapLine(lastExchange.assistant.content, aiContentWidth).length;
          const chatHeight = this.calculateOptimalChatHeight();
          
          // If we're scrolled near the bottom (within 3 lines), auto-scroll to show new content
          const maxScrollOffset = Math.max(0, totalLines - chatHeight);
          if (this.chatContentScrollOffset >= maxScrollOffset - 3) {
            this.chatContentScrollOffset = maxScrollOffset;
          }
        }
      }
    }
    
    // Only render if content actually changed to avoid unnecessary redraws
    const currentContent = this.chatMessages.length > 0 ? this.chatMessages[this.chatMessages.length - 1]?.content : '';
    if (currentContent !== previousContent) {
      this.debugLog('Chat messages updated:', this.chatMessages.length, 'messages');
      this.debugLog('Last exchange:', this.getLastUserAndAIExchange());
      this.render();
    }
  }

  // AI Suggestion methods
  showAISuggestion(suggestion: string): void {
    this.aiSuggestion = suggestion;
    this.isShowingAISuggestion = true;
    this.render();
  }

  hideAISuggestion(): void {
    this.aiSuggestion = '';
    this.isShowingAISuggestion = false;
    this.render();
  }

  acceptAISuggestion(): void {
    if (!this.isShowingAISuggestion || !this.aiSuggestion) return;
    
    // Insert the suggestion text into the buffer
    for (const char of this.aiSuggestion) {
      this.buffer.insertChar(char);
    }
    
    // Hide the suggestion
    this.hideAISuggestion();
  }


  setCompletions(completions: CompletionSuggestion[]): void {
    this.debugLog('Setting completions:', completions.length, 'items');
    this.completions = completions;
    this.selectedCompletionIndex = 0;
    this.showCompletions = completions.length > 0;
    this.debugLog('Show completions:', this.showCompletions);
  }

  hideCompletions(): void {
    this.showCompletions = false;
    this.completions = [];
    this.selectedCompletionIndex = 0;
  }

  selectNextCompletion(): void {
    if (this.completions.length > 0) {
      this.selectedCompletionIndex = (this.selectedCompletionIndex + 1) % this.completions.length;
    }
  }

  selectPreviousCompletion(): void {
    if (this.completions.length > 0) {
      this.selectedCompletionIndex = this.selectedCompletionIndex === 0 
        ? this.completions.length - 1 
        : this.selectedCompletionIndex - 1;
    }
  }

  getSelectedCompletion(): CompletionSuggestion | null {
    if (this.completions.length === 0) return null;
    return this.completions[this.selectedCompletionIndex];
  }

  isShowingCompletions(): boolean {
    return this.showCompletions;
  }

  setDiagnostics(diagnostics: LSPDiagnostic[]): void {
    this.diagnostics = diagnostics;
  }

  private getDiagnosticsForLine(line: number): LSPDiagnostic[] {
    return this.diagnostics.filter(diag => 
      diag.range.start.line <= line && diag.range.end.line >= line
    );
  }

  markAsSaved(): void {
    this.lastSavedContent = this.buffer.getContent();
  }

  // Handle keyboard input
  handleKey(key: string, ctrl: boolean = false, shift: boolean = false): boolean {
    // Handle completion navigation
    if (this.showCompletions) {
      if (this.handleCompletionKey(key, ctrl, shift)) {
        return true;
      }
    }

    if (this.mode === 'command') {
      return this.handleCommandModeKey(key, ctrl, shift);
    } else {
      return this.handleInsertModeKey(key, ctrl, shift);
    }
  }

  private handleCompletionKey(key: string, ctrl: boolean, shift: boolean): boolean {
    switch (key) {
      case 'UP':
      case 'k': // Vim-like navigation
        this.selectPreviousCompletion();
        return true;
        
      case 'DOWN':
      case 'j': // Vim-like navigation
        this.selectNextCompletion();
        return true;
        
      case 'ENTER':
        this.acceptCompletion();
        return true;
        
      case 'ESCAPE':
        this.hideCompletions();
        return true;
        
      case 'TAB':
        if (this.showCompletions) {
          this.acceptCompletion();
          return true;
        }
        // Accept AI suggestion if showing
        if (this.isShowingAISuggestion) {
          this.acceptAISuggestion();
          return true;
        }
        // Regular Tab - don't trigger completions here since Shift+Tab is handled in Editor
        return false;
        
      case 'SPACE':
        // Space to accept completion (common in many editors)
        if (this.showCompletions) {
          this.acceptCompletion();
          return true;
        }
        return false;
        
      default:
        // Hide completions on any other key
        this.hideCompletions();
        return false;
    }
  }

  private acceptCompletion(): void {
    const selected = this.getSelectedCompletion();
    if (selected && this.editor) {
      this.editor.insertCompletion(selected);
    }
    this.hideCompletions();
  }

  private handleInsertModeKey(key: string, ctrl: boolean, shift: boolean): boolean {
    switch (key) {
      case 'ESCAPE':
        this.setMode('command');
        return true;

      case 'BACKSPACE':
        this.buffer.deleteChar();
        return true;

      case 'ENTER':
        this.buffer.insertNewline();
        return true;

      case 'UP':
        this.buffer.moveCursor(-1, 0);
        return true;

      case 'DOWN':
        this.buffer.moveCursor(1, 0);
        return true;

      case 'LEFT':
        this.buffer.moveCursor(0, -1);
        return true;

      case 'RIGHT':
        this.buffer.moveCursor(0, 1);
        return true;

      case 'HOME':
        this.buffer.setCursor(this.buffer.getCursor().row, 0);
        return true;

      case 'END':
        const currentRow = this.buffer.getCursor().row;
        this.buffer.setCursor(currentRow, this.buffer.getLineLength(currentRow));
        return true;

      default:
        if (key.length === 1 && !ctrl) {
          this.buffer.insertChar(key);
          return true;
        }
        return false;
    }
  }

  private handleCommandModeKey(key: string, ctrl: boolean, shift: boolean): boolean {
    switch (key) {
      case 'ESCAPE':
        this.setMode('insert');
        return true;

      case 'ENTER':
        this.executeCommand().catch(error => {
          console.error('Error executing command:', error);
        });
        return true;

      case 'BACKSPACE':
        if (this.commandInput.length > 0) {
          this.setCommandInput(this.commandInput.slice(0, -1));
        }
        return true;

      default:
        if (key.length === 1 && !ctrl) {
          this.setCommandInput(this.commandInput + key);
          return true;
        }
        return false;
    }
  }

  private async executeCommand(): Promise<void> {
    const command = this.commandInput.trim();
    
    // Handle AI commands
    if (command.startsWith('ai edit ') || command.startsWith('ai ask ')) {
      if (this.editor) {
        const parts = command.split(' ');
        if (parts.length >= 3) {
          const aiCommand = `${parts[0]} ${parts[1]}`;
          const prompt = parts.slice(2).join(' ');
          try {
            await this.editor.executeAICommand(aiCommand, prompt);
          } catch (error) {
            console.error('Error executing AI command:', error);
          }
        }
      }
      this.setMode('insert');
      return;
    }

    if (command === 'ai complete') {
      if (this.editor) {
        try {
          await this.editor.executeAICommand('ai complete', '');
        } catch (error) {
          console.error('Error executing AI complete:', error);
        }
      }
      this.setMode('insert');
      return;
    }

    // Handle simplified chat management commands
    if (command === 'chat show') {
      this.showChat();
      this.setMode('insert');
      return;
    }

    if (command === 'chat hide') {
      this.hideChat();
      this.setMode('insert');
      return;
    }

    if (command === 'chat scroll') {
      this.scrollChat();
      this.setMode('insert');
      return;
    }

    if (command === 'chat clear') {
      if (this.editor && this.editor.getChatManager) {
        this.editor.getChatManager().clearCurrentSession();
        // Update renderer with new chat state
        const currentSession = this.editor.getChatManager().getCurrentSession();
        if (currentSession) {
          const messages = currentSession.messages.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            mode: msg.mode
          }));
          this.setChatMessages(messages);
        }
      }
      this.setMode('insert');
      return;
    }
    
    switch (command) {
      case 'q':
        if (this.editor) {
          this.editor.quit();
        } else {
          process.exit(0);
        }
        break;
        
      case 'w':
        if (this.editor) {
          try {
            await this.editor.saveFile();
            this.setMode('insert');
          } catch (error) {
            // TODO: Show error message to user
            console.error('Error saving file:', error);
            this.setMode('insert');
          }
        } else {
          this.setMode('insert');
        }
        break;
        
      case 'wq':
        if (this.editor) {
          try {
            await this.editor.saveFile();
            this.editor.quit();
          } catch (error) {
            // TODO: Show error message to user
            console.error('Error saving file:', error);
            this.setMode('insert');
          }
        } else {
          process.exit(0);
        }
        break;
        
      default:
        // Unknown command, return to insert mode
        this.setMode('insert');
        break;
    }
  }
}


