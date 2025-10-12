/** @typedef {import('pear-interface')} */ /* global Pear */

// ============================================================================
// XLR8 Editor - Vim-inspired Modal Text Editor with Syntax Highlighting
// ============================================================================

// Import Prism.js for syntax highlighting
import Prism from 'prismjs';
// Import common language support
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-csharp.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-markup.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-sql.js';

// Import Backend Provider for file operations and LSP
import { backendProvider } from './providers/backend-provider.js';

// Import Node.js path module for path resolution
import path from 'path';

console.log('[XLR8] Backend provider imported');

class XLR8Editor {
  constructor() {
    // Editor state
    this.mode = 'normal'; // 'normal', 'insert', or 'command'
    this.currentFile = null;
    this.isDirty = false;
    this.currentLanguage = 'javascript'; // Default language

    // DOM elements
    this.editor = document.getElementById('editor');
    this.highlighting = document.getElementById('highlighting-content');
    this.commandLine = document.getElementById('command-line');
    this.commandInput = document.getElementById('command-input');
    this.modeIndicator = document.getElementById('mode-indicator');
    this.fileInfo = document.getElementById('file-info');
    this.lineNumbers = document.getElementById('line-numbers');
    this.autocompletePopup = document.getElementById('autocomplete-popup');
    this.autocompleteList = document.getElementById('autocomplete-list');

    // Autocomplete state
    this.completionItems = [];
    this.selectedCompletion = -1;

    // Initialize
    this.init();
  }

  async init() {
    // Connect to backend worker
    try {
      await backendProvider.connect();
      console.log('[XLR8] Connected to backend worker');
    } catch (error) {
      console.error('[XLR8] Failed to connect to backend:', error);
      this.showMessage('Failed to connect to backend worker');
    }

    this.setupEventListeners();
    this.updateLineNumbers();
    this.setEditorReadonly(true); // Start in normal mode (readonly)
    this.updateStatusBar();
    this.editor.focus();
    
    console.log('[XLR8] Editor initialized in NORMAL mode. Press "i" to insert, or :e <file> to load a file.');
  }

  setupEventListeners() {
    // Editor keyboard events
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    
    // Editor content changes - with syntax highlighting
    this.editor.addEventListener('input', () => {
      this.isDirty = true;
      this.updateSyntaxHighlighting();
      this.updateLineNumbers();
      this.updateStatusBar();
    });

    // Sync scrolling between textarea and highlighting
    this.editor.addEventListener('scroll', () => {
      const highlightingContent = document.getElementById('highlighting-content');
      const scrollTop = this.editor.scrollTop;
      const scrollLeft = this.editor.scrollLeft;
      
      // Use CSS transform to move the highlighting content
      highlightingContent.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
      
      // Sync line numbers
      this.lineNumbers.scrollTop = scrollTop;
    });

    // Command input submission
    this.commandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.executeCommand(this.commandInput.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.exitCommandMode();
      }
    });

    // Autocomplete navigation
    this.editor.addEventListener('keydown', (e) => {
      if (this.autocompletePopup.style.display !== 'none' && this.completionItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectNextCompletion();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectPreviousCompletion();
        } else if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          this.acceptCompletion();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.hideAutocomplete();
        }
      }
    });

    // Tab key for indentation
    this.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && this.mode === 'insert' && this.autocompletePopup.style.display === 'none') {
        e.preventDefault();
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const value = this.editor.value;
        this.editor.value = value.substring(0, start) + '  ' + value.substring(end);
        this.editor.selectionStart = this.editor.selectionEnd = start + 2;
        this.editor.dispatchEvent(new Event('input'));
      }
    });
  }

  handleKeyDown(e) {
    // Handle Escape key - exit to normal mode
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.mode === 'command') {
        this.exitCommandMode();
      } else if (this.mode === 'insert') {
        this.enterNormalMode();
      }
      return;
    }

    // Normal mode keybindings
    if (this.mode === 'normal' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Enter insert mode
      if (e.key === 'i') {
        e.preventDefault();
        this.enterInsertMode();
        return;
      }
      // Append (insert after cursor)
      if (e.key === 'a') {
        e.preventDefault();
        this.enterInsertMode('append');
        return;
      }
      // Open line below
      if (e.key === 'o') {
        e.preventDefault();
        this.enterInsertMode('openBelow');
        return;
      }
      // Open line above
      if (e.key === 'O') {
        e.preventDefault();
        this.enterInsertMode('openAbove');
        return;
      }
      // Insert at end of line
      if (e.key === 'A') {
        e.preventDefault();
        this.enterInsertMode('appendEnd');
        return;
      }
      // Insert at start of line
      if (e.key === 'I') {
        e.preventDefault();
        this.enterInsertMode('insertStart');
        return;
      }
      // Enter command mode
      if (e.key === ':') {
        e.preventDefault();
        this.enterCommandMode();
        return;
      }
    }

    // Global keyboard shortcuts (work in any mode)
    // Note: File picker (Cmd+O) disabled - use :e <path> instead
    // Pear runtime doesn't support native file dialogs

    // Save shortcut (Cmd+S / Ctrl+S)
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      this.saveFile();
      return;
    }

    // Quit shortcut (Cmd+Q / Ctrl+Q)
    if ((e.metaKey || e.ctrlKey) && e.key === 'q') {
      e.preventDefault();
      this.quit();
      return;
    }
  }

  enterNormalMode() {
    this.mode = 'normal';
    this.setEditorReadonly(true);
    this.editor.focus();
    this.updateStatusBar();
  }

  enterInsertMode(position = 'before') {
    this.mode = 'insert';
    this.setEditorReadonly(false);
    
    const textarea = this.editor;
    const cursorPos = textarea.selectionStart;
    const value = textarea.value;
    const lines = value.substring(0, cursorPos).split('\n');
    const currentLineIndex = lines.length - 1;
    const currentLineStart = value.lastIndexOf('\n', cursorPos - 1) + 1;
    const currentLineEnd = value.indexOf('\n', cursorPos);
    const lineEnd = currentLineEnd === -1 ? value.length : currentLineEnd;
    
    switch (position) {
      case 'append':
        // Move cursor one position forward
        textarea.selectionStart = textarea.selectionEnd = Math.min(cursorPos + 1, value.length);
        break;
      case 'openBelow':
        // Insert new line below and move cursor there
        textarea.value = value.substring(0, lineEnd) + '\n' + value.substring(lineEnd);
        textarea.selectionStart = textarea.selectionEnd = lineEnd + 1;
        this.isDirty = true;
        this.updateSyntaxHighlighting();
        this.updateLineNumbers();
        break;
      case 'openAbove':
        // Insert new line above and move cursor there
        textarea.value = value.substring(0, currentLineStart) + '\n' + value.substring(currentLineStart);
        textarea.selectionStart = textarea.selectionEnd = currentLineStart;
        this.isDirty = true;
        this.updateSyntaxHighlighting();
        this.updateLineNumbers();
        break;
      case 'appendEnd':
        // Move cursor to end of line
        textarea.selectionStart = textarea.selectionEnd = lineEnd;
        break;
      case 'insertStart':
        // Move cursor to start of line (skip leading whitespace)
        const currentLine = value.substring(currentLineStart, lineEnd);
        const firstNonWhitespace = currentLine.search(/\S/);
        const targetPos = currentLineStart + (firstNonWhitespace === -1 ? 0 : firstNonWhitespace);
        textarea.selectionStart = textarea.selectionEnd = targetPos;
        break;
      // default 'before' - cursor stays where it is
    }
    
    textarea.focus();
    this.updateStatusBar();
  }

  enterCommandMode() {
    this.mode = 'command';
    this.commandLine.classList.add('active');
    this.commandInput.value = '';
    this.commandInput.focus();
    this.updateStatusBar();
  }

  exitCommandMode() {
    this.mode = 'normal';
    this.commandLine.classList.remove('active');
    this.setEditorReadonly(true);
    this.editor.focus();
    this.updateStatusBar();
  }

  setEditorReadonly(readonly) {
    this.editor.readOnly = readonly;
    if (readonly) {
      this.editor.classList.add('readonly');
    } else {
      this.editor.classList.remove('readonly');
    }
  }

  async executeCommand(cmd) {
    const trimmedCmd = cmd.trim();
    
    try {
      switch (trimmedCmd) {
        case 'w':
        case 'write':
          await this.saveFile();
          break;
        
        case 'q':
        case 'quit':
          await this.quit();
          break;
        
        case 'wq':
        case 'x':
          await this.saveFile();
          await this.quit();
          break;
        
        case 'q!':
          await this.quit(true);
          break;
        
        default:
          // Handle :w filename
          if (trimmedCmd.startsWith('w ')) {
            const filename = trimmedCmd.substring(2).trim();
            await this.saveFile(filename);
          } else if (trimmedCmd.startsWith('e ')) {
            const filename = trimmedCmd.substring(2).trim();
            await this.loadFile(filename);
          } else {
            this.showMessage(`Unknown command: ${trimmedCmd}`);
          }
      }
    } catch (error) {
      console.error('[XLR8] Command execution error:', error);
      this.showMessage(`Error: ${error.message}`);
    }
    
    this.exitCommandMode();
  }

  detectLanguage(filename) {
    if (!filename) return 'javascript';
    
    const extension = filename.split('.').pop().toLowerCase();
    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'json': 'json',
      'md': 'markdown',
      'css': 'css',
      'html': 'markup',
      'xml': 'markup',
      'sh': 'bash',
      'bash': 'bash',
      'sql': 'sql',
    };
    
    return languageMap[extension] || 'javascript';
  }

  updateSyntaxHighlighting() {
    const code = this.editor.value;
    let highlighted;
    
    try {
      if (Prism.languages[this.currentLanguage]) {
        highlighted = Prism.highlight(code, Prism.languages[this.currentLanguage], this.currentLanguage);
      } else {
        highlighted = code;
      }
    } catch (e) {
      console.error('Syntax highlighting error:', e);
      highlighted = code;
    }
    
    this.highlighting.innerHTML = highlighted + '\n';
    this.highlighting.className = `language-${this.currentLanguage}`;
  }

  async saveFile(filename = null) {
    if (filename) {
      this.currentFile = filename;
      this.currentLanguage = this.detectLanguage(filename);
      this.updateSyntaxHighlighting();
    }

    if (!this.currentFile) {
      this.currentFile = 'untitled.txt';
    }

    const content = this.editor.value;

    try {
      console.log('[XLR8] Saving file:', this.currentFile);
      
      // Resolve path relative to CWD
      const fullPath = path.resolve(this.currentFile);
      console.log('[XLR8] Full path:', fullPath);
      
      // Write file using backend provider
      await backendProvider.saveFile(fullPath, content);
      
      this.isDirty = false;
      this.currentFile = fullPath; // Update to full path
      this.showMessage(`"${this.currentFile}" written`);
      this.updateStatusBar();
      
      console.log('[XLR8] File saved successfully!');
    } catch (error) {
      this.showMessage(`Error saving file: ${error.message}`);
      console.error('[XLR8] Save error:', error);
    }
  }

  async loadFile(filename) {
    console.log('[XLR8] loadFile called with:', filename);
    
    try {
      // Resolve path relative to CWD
      const fullPath = path.resolve(filename);
      console.log('[XLR8] Full path:', fullPath);
      
      // Read file using backend provider
      const { fileData } = await backendProvider.loadFile(fullPath);
      console.log('[XLR8] File content length:', fileData.length);
      console.log('[XLR8] First 100 chars:', fileData.substring(0, 100));
      
      console.log('[XLR8] Setting editor.value...');
      this.editor.value = fileData;
      console.log('[XLR8] Editor.value set. Length:', this.editor.value.length);
      
      this.currentFile = fullPath;
      this.currentLanguage = this.detectLanguage(filename);
      this.isDirty = false;
      
      console.log('[XLR8] Updating syntax highlighting...');
      this.updateSyntaxHighlighting();
      this.updateLineNumbers();
      this.updateStatusBar();
      this.showMessage(`"${filename}" loaded (${this.currentLanguage})`);
      
      console.log('[XLR8] File loaded successfully!');
    } catch (error) {
      this.showMessage(`Error loading file: ${error.message}`);
      console.error('[XLR8] Load error:', error);
      console.error('[XLR8] Error stack:', error.stack);
    }
  }

  // openFilePicker() - DISABLED
  // Pear runtime doesn't support native file dialogs or file.path property
  // Use :e <path> command instead to load files

  // ============================================================================
  // LSP Integration Methods - REMOVED
  // Will be added back later with proper file-based implementation
  // ============================================================================

  async quit(force = false) {
    if (this.isDirty && !force) {
      this.showMessage('No write since last change (use :q! to override)');
      return;
    }

    if (typeof Pear !== 'undefined') {
      // Send exit message to backend worker
      backendProvider.disconnect();
      
      // Try multiple ways to quit the Pear app
      if (Pear.exit) {
        Pear.exit(0);
      } else if (typeof process !== 'undefined' && process.exit) {
        process.exit(0);
      } else if (window && window.close) {
        window.close();
      }
    } else {
      // Clear editor for web version
      this.editor.value = '';
      this.currentFile = null;
      this.isDirty = false;
      this.updateStatusBar();
    }
  }

  updateLineNumbers() {
    const content = this.editor.value;
    const lines = content.split('\n');
    const lineCount = Math.max(lines.length, 1);
    
    let lineNumbersHTML = '';
    for (let i = 1; i <= lineCount; i++) {
      lineNumbersHTML += `${i}\n`;
    }
    
    this.lineNumbers.innerText = lineNumbersHTML;
  }

  // ============================================================================
  // Autocomplete Methods
  // ============================================================================

  showAutocomplete(items) {
    if (!items || items.length === 0) {
      this.hideAutocomplete();
      return;
    }

    this.completionItems = items;
    this.selectedCompletion = 0;
    
    // Get cursor position
    const cursorPos = this.getCursorCoordinates();
    
    // Position popup
    this.autocompletePopup.style.left = cursorPos.left + 'px';
    this.autocompletePopup.style.top = (cursorPos.top + 20) + 'px';
    
    // Populate list
    this.autocompleteList.innerHTML = '';
    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.textContent = item.label || item;
      if (item.kind) {
        const kindSpan = document.createElement('span');
        kindSpan.className = 'completion-kind';
        kindSpan.textContent = this.getCompletionKindText(item.kind);
        li.appendChild(kindSpan);
      }
      if (index === 0) li.classList.add('selected');
      li.addEventListener('click', () => {
        this.selectedCompletion = index;
        this.acceptCompletion();
      });
      this.autocompleteList.appendChild(li);
    });
    
    this.autocompletePopup.style.display = 'block';
  }

  hideAutocomplete() {
    this.autocompletePopup.style.display = 'none';
    this.completionItems = [];
    this.selectedCompletion = -1;
  }

  selectNextCompletion() {
    if (this.completionItems.length === 0) return;
    
    const items = this.autocompleteList.querySelectorAll('li');
    items[this.selectedCompletion].classList.remove('selected');
    
    this.selectedCompletion = (this.selectedCompletion + 1) % this.completionItems.length;
    items[this.selectedCompletion].classList.add('selected');
    items[this.selectedCompletion].scrollIntoView({ block: 'nearest' });
  }

  selectPreviousCompletion() {
    if (this.completionItems.length === 0) return;
    
    const items = this.autocompleteList.querySelectorAll('li');
    items[this.selectedCompletion].classList.remove('selected');
    
    this.selectedCompletion = (this.selectedCompletion - 1 + this.completionItems.length) % this.completionItems.length;
    items[this.selectedCompletion].classList.add('selected');
    items[this.selectedCompletion].scrollIntoView({ block: 'nearest' });
  }

  acceptCompletion() {
    if (this.selectedCompletion < 0 || this.selectedCompletion >= this.completionItems.length) return;
    
    const completion = this.completionItems[this.selectedCompletion];
    const insertText = completion.insertText || completion.label || completion;
    
    // Insert the completion text
    const start = this.editor.selectionStart;
    const end = this.editor.selectionEnd;
    const text = this.editor.value;
    
    // Find the start of the current word
    let wordStart = start;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
      wordStart--;
    }
    
    this.editor.value = text.substring(0, wordStart) + insertText + text.substring(end);
    this.editor.selectionStart = this.editor.selectionEnd = wordStart + insertText.length;
    
    this.hideAutocomplete();
    this.editor.dispatchEvent(new Event('input'));
  }

  getCursorCoordinates() {
    // Create a temporary div to measure cursor position
    const div = document.createElement('div');
    const style = window.getComputedStyle(this.editor);
    
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.font = style.font;
    div.style.padding = style.padding;
    div.style.border = style.border;
    div.style.whiteSpace = style.whiteSpace;
    div.style.wordWrap = style.wordWrap;
    div.style.width = style.width;
    
    const text = this.editor.value.substring(0, this.editor.selectionStart);
    div.textContent = text;
    
    const span = document.createElement('span');
    span.textContent = '|';
    div.appendChild(span);
    
    document.body.appendChild(div);
    
    const coordinates = {
      left: span.offsetLeft + this.editor.offsetLeft,
      top: span.offsetTop + this.editor.offsetTop
    };
    
    document.body.removeChild(div);
    return coordinates;
  }

  getCompletionKindText(kind) {
    const kinds = {
      1: 'text', 2: 'method', 3: 'function', 4: 'constructor',
      5: 'field', 6: 'variable', 7: 'class', 8: 'interface',
      9: 'module', 10: 'property', 11: 'unit', 12: 'value',
      13: 'enum', 14: 'keyword', 15: 'snippet', 16: 'color',
      17: 'file', 18: 'reference'
    };
    return kinds[kind] || '';
  }

  // Basic keyword-based completion (LSP removed)
  async requestCompletion() {
    const currentWord = this.getCurrentWord();
    if (currentWord.length < 2) {
      this.hideAutocomplete();
      return;
    }
    
    // Show keyword completions
    this.showKeywordCompletions(currentWord);
  }

  showKeywordCompletions(currentWord) {
    const keywords = this.getLanguageKeywords();
    const filtered = keywords.filter(kw => kw.startsWith(currentWord));
    
    if (filtered.length > 0) {
      const items = filtered.map(kw => ({ label: kw, kind: 14 }));
      this.showAutocomplete(items);
    } else {
      this.hideAutocomplete();
    }
  }

  getLanguageKeywords() {
    const keywordMap = {
      javascript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
                   'return', 'class', 'import', 'export', 'default', 'async', 'await',
                   'try', 'catch', 'finally', 'throw', 'new', 'this', 'super'],
      typescript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
                   'return', 'class', 'import', 'export', 'default', 'async', 'await',
                   'try', 'catch', 'finally', 'throw', 'new', 'this', 'super',
                   'interface', 'type', 'enum', 'namespace', 'private', 'public', 'protected'],
      python: ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return',
               'import', 'from', 'try', 'except', 'finally', 'with', 'as', 'pass',
               'break', 'continue', 'lambda', 'yield', 'async', 'await'],
      go: ['func', 'var', 'const', 'if', 'else', 'for', 'range', 'return',
           'package', 'import', 'type', 'struct', 'interface', 'go', 'defer',
           'select', 'case', 'switch', 'break', 'continue'],
      rust: ['fn', 'let', 'mut', 'if', 'else', 'for', 'while', 'loop', 'return',
             'struct', 'enum', 'impl', 'trait', 'use', 'mod', 'pub', 'async',
             'await', 'match', 'break', 'continue']
    };
    
    return keywordMap[this.currentLanguage] || keywordMap.javascript;
  }

  getCurrentWord() {
    const text = this.editor.value;
    const pos = this.editor.selectionStart;
    let start = pos;
    
    while (start > 0 && /\w/.test(text[start - 1])) {
      start--;
    }
    
    return text.substring(start, pos);
  }

  updateStatusBar() {
    // Update mode indicator
    if (this.mode === 'normal') {
      this.modeIndicator.textContent = '-- NORMAL --';
      this.modeIndicator.style.color = 'var(--accent-blue, #61afef)';
    } else if (this.mode === 'insert') {
      this.modeIndicator.textContent = '-- INSERT --';
      this.modeIndicator.style.color = 'var(--accent-green)';
    } else if (this.mode === 'command') {
      this.modeIndicator.textContent = '-- COMMAND --';
      this.modeIndicator.style.color = 'var(--accent-yellow)';
    }

    // Update file info
    const filename = this.currentFile || '[No Name]';
    const modified = this.isDirty ? ' [+]' : '';
    const lines = this.editor.value.split('\n').length;
    const language = this.currentLanguage.toUpperCase();
    
    this.fileInfo.textContent = `${filename}${modified} | ${lines} lines | ${language}`;
  }

  showMessage(message) {
    const originalContent = this.modeIndicator.textContent;
    this.modeIndicator.textContent = message;
    this.modeIndicator.style.color = 'var(--accent-blue)';
    
    setTimeout(() => {
      this.updateStatusBar();
    }, 2000);
  }
}

// Initialize editor when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new XLR8Editor());
} else {
  new XLR8Editor();
}
