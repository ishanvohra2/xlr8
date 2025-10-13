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

// Import AI Manager for AI features
import { AIManager } from './ai-manager.js';

// Import Buffer Manager for multifile support
import { BufferManager } from './buffer-manager.js';

// Import Fuzzy Finder for file navigation
import { FuzzyFinder } from './fuzzy-finder.js';

// Import Project Search for text search
import { ProjectSearch } from './project-search.js';

// Import Node.js path module for path resolution
import path from 'path';

console.log('[XLR8] Backend provider imported');

class XLR8Editor {
  constructor() {
    // Editor state
    this.mode = 'normal'; // 'normal', 'insert', or 'command'
    this.bufferManager = new BufferManager();
    this.waitingForSecondKey = null; // For multi-key commands like 'gd'
    
    // Deprecated: kept for backward compatibility during transition
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
    this.tabsContainer = document.getElementById('tabs-container');

    // Autocomplete state
    this.completionItems = [];
    this.allCompletionItems = []; // Store unfiltered completions
    this.selectedCompletion = -1;
    this.completionTriggerPos = -1; // Position where completion was triggered

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
    
    // Initialize AI Manager
    this.aiManager = new AIManager(this);
    console.log('[XLR8] AI Manager initialized');
    
    // Initialize Fuzzy Finder
    this.fuzzyFinder = new FuzzyFinder(this);
    console.log('[XLR8] Fuzzy Finder initialized');
    
    // Initialize Project Search
    this.projectSearch = new ProjectSearch(this);
    console.log('[XLR8] Project Search initialized');
    
    console.log('[XLR8] Editor initialized in NORMAL mode. Press "i" to insert, Ctrl+P for files, Ctrl+Shift+F for search, or :e <file> to load.');
  }

  setupEventListeners() {
    // Editor keyboard events
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    
    // Editor content changes - with syntax highlighting
    this.editor.addEventListener('input', (e) => {
      this.isDirty = true;
      
      // Update buffer with current content
      if (this.bufferManager.getCurrentBuffer()) {
        this.bufferManager.updateCurrentBuffer(this.editor.value, true);
      }
      
      this.updateSyntaxHighlighting();
      this.updateLineNumbers();
      this.updateStatusBar();
      this.renderTabs(); // Update dirty indicator on tab
      
      // If completions are visible, filter them as user types
      if (this.autocompletePopup.style.display === 'block' && this.mode === 'insert') {
        const cursorPos = this.editor.selectionStart;
        
        // If cursor moved before trigger position, hide completions
        if (cursorPos < this.completionTriggerPos) {
          this.hideAutocomplete();
          return;
        }
        
        // Get the text typed after the trigger
        const typedText = this.editor.value.substring(this.completionTriggerPos, cursorPos);
        
        // Filter completions based on typed text
        this.filterAndShowCompletions(typedText);
        return;
      }
      
      // Trigger completions on '.' in insert mode
      if (this.mode === 'insert' && e.inputType === 'insertText') {
        const text = this.editor.value;
        const cursorPos = this.editor.selectionStart;
        const charBefore = text[cursorPos - 1];
        
        if (charBefore === '.') {
          // Small delay to let the UI update
          setTimeout(() => this.requestCompletion(), 50);
        }
      }
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
      // Go to definition (gd in normal mode)
      if (e.key === 'g') {
        // Wait for next key
        this.waitingForSecondKey = 'd';
        setTimeout(() => { this.waitingForSecondKey = null; }, 1000);
        return;
      }
      if (this.waitingForSecondKey === 'd' && e.key === 'd') {
        e.preventDefault();
        this.waitingForSecondKey = null;
        this.goToDefinition();
        return;
      }
    }

    // Global keyboard shortcuts (work in any mode)
    // Note: File picker (Cmd+O) disabled - use :e <path> instead
    // Pear runtime doesn't support native file dialogs

    // Trigger completion (Ctrl+Space) in insert mode
    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault();
      if (this.mode === 'insert') {
        this.requestCompletion();
      }
      return;
    }

    // Fuzzy Finder (Ctrl+P)
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      this.fuzzyFinder.open();
      return;
    }

    // Project Search (Ctrl+Shift+F)
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      this.projectSearch.open();
      return;
    }

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
        
        // Buffer commands
        case 'bn':
        case 'bnext':
          this.switchToNextBuffer();
          break;
        
        case 'bp':
        case 'bprevious':
          this.switchToPreviousBuffer();
          break;
        
        case 'b#':
          this.switchToAlternateBuffer();
          break;
        
        case 'ls':
        case 'buffers':
          this.listBuffers();
          break;
        
        case 'bd':
          this.closeBuffer();
          break;
        
        case 'bd!':
          this.forceCloseBuffer();
          break;
        
        default:
          // Handle :w filename
          if (trimmedCmd.startsWith('w ')) {
            const filename = trimmedCmd.substring(2).trim();
            await this.saveFile(filename);
          } 
          // Handle :e filename
          else if (trimmedCmd.startsWith('e ')) {
            const filename = trimmedCmd.substring(2).trim();
            await this.loadFile(filename);
          }
          // Handle :b <number> (switch to buffer by ID)
          else if (trimmedCmd.startsWith('b ')) {
            const bufferIdStr = trimmedCmd.substring(2).trim();
            const bufferId = parseInt(bufferIdStr, 10);
            if (isNaN(bufferId)) {
              this.showMessage(`Invalid buffer number: ${bufferIdStr}`);
            } else {
              this.switchToBufferById(bufferId);
            }
          }
          // Handle :bd <number> (close buffer by ID)
          else if (trimmedCmd.startsWith('bd ')) {
            const bufferIdStr = trimmedCmd.substring(3).trim();
            const bufferId = parseInt(bufferIdStr, 10);
            if (isNaN(bufferId)) {
              this.showMessage(`Invalid buffer number: ${bufferIdStr}`);
            } else {
              this.closeBuffer(bufferId);
            }
          }
          // Handle :bd! <number> (force close buffer by ID)
          else if (trimmedCmd.startsWith('bd! ')) {
            const bufferIdStr = trimmedCmd.substring(4).trim();
            const bufferId = parseInt(bufferIdStr, 10);
            if (isNaN(bufferId)) {
              this.showMessage(`Invalid buffer number: ${bufferIdStr}`);
            } else {
              this.forceCloseBuffer(bufferId);
            }
          }
          // Handle :grep <pattern> (project search)
          else if (trimmedCmd.startsWith('grep ')) {
            const searchPattern = trimmedCmd.substring(5).trim();
            if (searchPattern) {
              this.projectSearch.open(searchPattern);
            } else {
              this.showMessage('Usage: :grep <pattern>');
            }
          }
          else {
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
      
      // Update buffer if it exists
      const buffer = this.bufferManager.getCurrentBuffer();
      if (buffer) {
        buffer.filePath = fullPath;
        this.bufferManager.markCurrentBufferSaved();
      }
      
      // Update tabs (dirty flag changed)
      this.renderTabs();
      
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
      console.log('[XLR8] Resolving to:', fullPath);
      
      const result = await backendProvider.loadFile(fullPath);
      const fileData = result.fileData;
      
      // Check if file is already open in a buffer
      const existingBufferId = this.bufferManager.findBufferByPath(fullPath);
      if (existingBufferId !== null) {
        console.log(`[XLR8] File already open in buffer ${existingBufferId}`);
        this.switchToBufferById(existingBufferId);
        return;
      }
      
      console.log('[XLR8] File content length:', fileData.length);
      console.log('[XLR8] First 100 chars:', fileData.substring(0, 100));
      console.log('[XLR8] Successfully loaded from:', fullPath);
      
      // Save current editor state before loading new file
      if (this.bufferManager.getCurrentBuffer()) {
        this.saveEditorStateToBuffer();
      }
      
      // Detect language
      const language = this.detectLanguage(filename);
      
      // Create new buffer with the full path
      const bufferId = this.bufferManager.createBuffer(fullPath, fileData, language);
      
      // Switch to new buffer
      this.bufferManager.switchToBuffer(bufferId);
      const buffer = this.bufferManager.getCurrentBuffer();
      
      // Load into editor
      this.loadBufferIntoEditor(buffer);
      
      // Update tabs
      this.renderTabs();
      
      this.showMessage(`"${filename}" loaded in buffer ${bufferId} (${this.currentLanguage})`);
      
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
    // Check for unsaved changes in any buffer
    if (!force) {
      const dirtyBuffers = this.bufferManager.getDirtyBuffers();
      if (dirtyBuffers.length > 0) {
        const fileList = dirtyBuffers.map(b => b.filePath || '[No Name]').join(', ');
        this.showMessage(`${dirtyBuffers.length} unsaved buffer(s): ${fileList} (use :q! to override)`);
        return;
      }
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

    // Store all completions and trigger position
    this.allCompletionItems = items;
    this.completionItems = items;
    this.selectedCompletion = 0;
    this.completionTriggerPos = this.editor.selectionStart;
    
    // Get cursor position
    const cursorPos = this.getCursorCoordinates();
    
    // Calculate better position - below the current line
    // Get line height from computed style
    const lineHeight = parseFloat(window.getComputedStyle(this.editor).lineHeight) || 22;
    
    // Position popup below the current line with some padding
    const popupLeft = cursorPos.left;
    const popupTop = cursorPos.top + lineHeight + 4; // 4px padding
    
    // Check if popup would go off-screen bottom
    const viewportHeight = window.innerHeight;
    const popupHeight = 200; // max-height from CSS
    
    let finalTop = popupTop;
    if (popupTop + popupHeight > viewportHeight - 50) {
      // Position above the line instead
      finalTop = cursorPos.top - popupHeight - 4;
    }
    
    // Position popup
    this.autocompletePopup.style.left = popupLeft + 'px';
    this.autocompletePopup.style.top = finalTop + 'px';
    
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
    this.allCompletionItems = [];
    this.selectedCompletion = -1;
    this.completionTriggerPos = -1;
  }

  filterAndShowCompletions(prefix) {
    // Filter completions based on prefix
    const filtered = this.allCompletionItems.filter(item => {
      const label = item.label || item.insertText || item;
      const labelStr = typeof label === 'string' ? label : String(label);
      return labelStr.toLowerCase().startsWith(prefix.toLowerCase());
    });

    if (filtered.length === 0) {
      this.hideAutocomplete();
      return;
    }

    // Update displayed completions
    this.completionItems = filtered;
    this.selectedCompletion = 0;
    
    // Re-render the list
    this.autocompleteList.innerHTML = '';
    filtered.forEach((item, index) => {
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
    
    // Get current state
    const cursorPos = this.editor.selectionStart;
    const text = this.editor.value;
    
    // Replace from trigger position to current cursor
    // This removes any partially typed text
    const before = text.substring(0, this.completionTriggerPos);
    const after = text.substring(cursorPos);
    
    this.editor.value = before + insertText + after;
    this.editor.selectionStart = this.editor.selectionEnd = this.completionTriggerPos + insertText.length;
    
    this.hideAutocomplete();
    this.editor.dispatchEvent(new Event('input'));
  }

  getCursorCoordinates() {
    // Get the editor's bounding rectangle
    const editorRect = this.editor.getBoundingClientRect();
    
    // Get cursor position in the textarea
    const cursorPos = this.editor.selectionStart;
    const text = this.editor.value;
    const textBeforeCursor = text.substring(0, cursorPos);
    
    // Calculate line and column
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines.length - 1;
    const currentCol = lines[lines.length - 1].length;
    
    // Get computed styles
    const style = window.getComputedStyle(this.editor);
    const lineHeight = parseFloat(style.lineHeight) || 22;
    const fontSize = parseFloat(style.fontSize) || 14;
    const paddingLeft = parseFloat(style.paddingLeft) || 16;
    const paddingTop = parseFloat(style.paddingTop) || 12;
    
    // Approximate character width (monospace)
    const charWidth = fontSize * 0.6;
    
    // Calculate position relative to viewport
    const left = editorRect.left + paddingLeft + (currentCol * charWidth) - this.editor.scrollLeft;
    const top = editorRect.top + paddingTop + (currentLine * lineHeight) - this.editor.scrollTop;
    
    return { left, top };
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

  // LSP-powered completion with keyword fallback
  async requestCompletion() {
    // Only request completions if we have a file open
    if (!this.currentFile) {
      this.hideAutocomplete();
      return;
    }

    try {
      // Get cursor position
      const text = this.editor.value;
      const cursorPos = this.editor.selectionStart;
      
      // Calculate line and character position
      const textUpToCursor = text.substring(0, cursorPos);
      const lines = textUpToCursor.split('\n');
      const line = lines.length - 1;
      const character = lines[lines.length - 1].length;

      // Request completions from LSP via backend
      const completions = await backendProvider.requestCompletion(
        this.currentFile,
        line,
        character,
        this.editor.value
      );

      if (completions && completions.length > 0) {
        this.showAutocomplete(completions);
      } else {
        this.hideAutocomplete();
      }
    } catch (error) {
      // LSP failed, fallback to keyword completions
      const currentWord = this.getCurrentWord();
      if (currentWord.length >= 2) {
        this.showKeywordCompletions(currentWord);
      } else {
        this.hideAutocomplete();
      }
    }
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

  // ============================================================================
  // Buffer Management Methods
  // ============================================================================

  /**
   * Saves current editor state to the current buffer
   */
  saveEditorStateToBuffer() {
    const buffer = this.bufferManager.getCurrentBuffer();
    if (!buffer) return;
    
    this.bufferManager.updateCurrentBuffer(this.editor.value, this.isDirty);
    this.bufferManager.saveCurrentBufferState({
      cursorPosition: this.editor.selectionStart,
      scrollTop: this.editor.scrollTop,
      scrollLeft: this.editor.scrollLeft
    });
  }

  /**
   * Loads buffer state into the editor
   * @param {Object} buffer - Buffer to load
   */
  loadBufferIntoEditor(buffer) {
    if (!buffer) return;
    
    console.log(`[XLR8] Loading buffer ${buffer.id}: ${buffer.filePath}`);
    
    // Update editor content
    this.editor.value = buffer.content;
    
    // Update editor state
    this.currentFile = buffer.filePath;
    this.isDirty = buffer.isDirty;
    this.currentLanguage = buffer.language;
    
    // Restore cursor and scroll position
    this.editor.selectionStart = buffer.cursorPosition;
    this.editor.selectionEnd = buffer.cursorPosition;
    this.editor.scrollTop = buffer.scrollTop;
    this.editor.scrollLeft = buffer.scrollLeft;
    
    // Update UI
    this.updateSyntaxHighlighting();
    this.updateLineNumbers();
    this.updateStatusBar();
    
    this.editor.focus();
  }

  /**
   * Switches to a different buffer
   * @param {number} bufferId - Buffer ID to switch to
   * @returns {boolean} True if successful
   */
  switchToBufferById(bufferId) {
    // Save current editor state before switching
    this.saveEditorStateToBuffer();
    
    const buffer = this.bufferManager.switchToBuffer(bufferId);
    if (!buffer) {
      this.showMessage(`Buffer ${bufferId} not found`);
      return false;
    }
    
    this.loadBufferIntoEditor(buffer);
    this.renderTabs();
    this.showMessage(`Switched to buffer ${bufferId}: ${buffer.filePath}`);
    return true;
  }

  /**
   * Switches to next buffer (:bn)
   */
  switchToNextBuffer() {
    this.saveEditorStateToBuffer();
    
    const nextBuffer = this.bufferManager.getNextBuffer();
    if (!nextBuffer) {
      this.showMessage('No buffers');
      return;
    }
    
    this.bufferManager.switchToBuffer(nextBuffer.id);
    this.loadBufferIntoEditor(nextBuffer);
    this.renderTabs();
  }

  /**
   * Switches to previous buffer (:bp)
   */
  switchToPreviousBuffer() {
    this.saveEditorStateToBuffer();
    
    const prevBuffer = this.bufferManager.getPreviousBuffer();
    if (!prevBuffer) {
      this.showMessage('No buffers');
      return;
    }
    
    this.bufferManager.switchToBuffer(prevBuffer.id);
    this.loadBufferIntoEditor(prevBuffer);
    this.renderTabs();
  }

  /**
   * Switches to alternate buffer (:b#)
   */
  switchToAlternateBuffer() {
    this.saveEditorStateToBuffer();
    
    const altBuffer = this.bufferManager.getAlternateBuffer();
    if (!altBuffer) {
      this.showMessage('No alternate buffer');
      return;
    }
    
    this.bufferManager.switchToBuffer(altBuffer.id);
    this.loadBufferIntoEditor(altBuffer);
    this.renderTabs();
  }

  /**
   * Lists all buffers (:ls)
   */
  listBuffers() {
    const buffers = this.bufferManager.listBuffers();
    if (buffers.length === 0) {
      this.showMessage('No buffers');
      return;
    }
    
    const currentId = this.bufferManager.currentBufferId;
    const lines = buffers.map(buf => {
      const indicator = buf.id === currentId ? '%' : ' ';
      const modified = buf.isDirty ? '+' : ' ';
      const name = buf.filePath || '[No Name]';
      return `${indicator}${buf.id} ${modified} "${name}"`;
    });
    
    // Show in a temporary display
    console.log('[XLR8] Buffer list:');
    lines.forEach(line => console.log(line));
    
    // Show summary message
    this.showMessage(`${buffers.length} buffer(s) - see console for details`);
  }

  /**
   * Closes a buffer (:bd)
   * @param {number} bufferId - Buffer to close (optional, defaults to current)
   */
  closeBuffer(bufferId = null) {
    const targetId = bufferId !== null ? bufferId : this.bufferManager.currentBufferId;
    
    if (targetId === null) {
      this.showMessage('No buffer to close');
      return;
    }
    
    const buffer = this.bufferManager.getBuffer(targetId);
    if (!buffer) {
      this.showMessage(`Buffer ${targetId} not found`);
      return;
    }
    
    // Check if buffer has unsaved changes
    if (buffer.isDirty) {
      this.showMessage(`Buffer ${targetId} has unsaved changes (use :bd! to force)`);
      return;
    }
    
    const wasCurrentBuffer = (targetId === this.bufferManager.currentBufferId);
    
    this.bufferManager.closeBuffer(targetId);
    
    // If we closed the current buffer, load the new current buffer
    if (wasCurrentBuffer) {
      const newBuffer = this.bufferManager.getCurrentBuffer();
      if (newBuffer) {
        this.loadBufferIntoEditor(newBuffer);
      } else {
        // No buffers left - clear editor
        this.editor.value = '';
        this.currentFile = null;
        this.isDirty = false;
        this.currentLanguage = 'javascript';
        this.updateStatusBar();
      }
    }
    
    this.renderTabs();
    this.showMessage(`Buffer ${targetId} closed`);
  }

  /**
   * Force closes a buffer (:bd!)
   * @param {number} bufferId - Buffer to close (optional, defaults to current)
   */
  forceCloseBuffer(bufferId = null) {
    const targetId = bufferId !== null ? bufferId : this.bufferManager.currentBufferId;
    
    if (targetId === null) {
      this.showMessage('No buffer to close');
      return;
    }
    
    const wasCurrentBuffer = (targetId === this.bufferManager.currentBufferId);
    
    this.bufferManager.closeBuffer(targetId);
    
    // If we closed the current buffer, load the new current buffer
    if (wasCurrentBuffer) {
      const newBuffer = this.bufferManager.getCurrentBuffer();
      if (newBuffer) {
        this.loadBufferIntoEditor(newBuffer);
      } else {
        // No buffers left - clear editor
        this.editor.value = '';
        this.currentFile = null;
        this.isDirty = false;
        this.currentLanguage = 'javascript';
        this.updateStatusBar();
      }
    }
    
    this.renderTabs();
    this.showMessage(`Buffer ${targetId} closed (forced)`);
  }

  // ============================================================================
  // Tab Bar Methods
  // ============================================================================

  /**
   * Renders the tab bar with all open buffers
   */
  renderTabs() {
    const buffers = this.bufferManager.listBuffers();
    const currentId = this.bufferManager.currentBufferId;
    
    // Clear existing tabs
    this.tabsContainer.innerHTML = '';
    
    // Create tabs for each buffer
    buffers.forEach(buffer => {
      const tab = this.createTab(buffer, buffer.id === currentId);
      this.tabsContainer.appendChild(tab);
    });
  }

  /**
   * Creates a tab element for a buffer
   * @param {Object} buffer - Buffer object
   * @param {boolean} isActive - Whether this is the active buffer
   * @returns {HTMLElement} Tab element
   */
  createTab(buffer, isActive) {
    const tab = document.createElement('div');
    tab.className = 'tab';
    if (isActive) {
      tab.classList.add('active');
    }
    tab.dataset.bufferId = buffer.id;
    
    // Tab name (filename only, not full path)
    const tabName = document.createElement('span');
    tabName.className = 'tab-name';
    const fileName = buffer.filePath ? buffer.filePath.split('/').pop() : '[No Name]';
    tabName.textContent = fileName;
    tabName.title = buffer.filePath || '[No Name]'; // Full path on hover
    tab.appendChild(tabName);
    
    // Modified indicator (●)
    if (buffer.isDirty) {
      const modified = document.createElement('span');
      modified.className = 'tab-modified';
      modified.textContent = '●';
      modified.title = 'Modified';
      tab.appendChild(modified);
    }
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = `<svg viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent tab click
      this.handleTabClose(buffer.id);
    });
    tab.appendChild(closeBtn);
    
    // Click to switch buffer
    tab.addEventListener('click', () => {
      if (buffer.id !== this.bufferManager.currentBufferId) {
        this.switchToBufferById(buffer.id);
      }
    });
    
    return tab;
  }

  /**
   * Handles tab close button click
   * @param {number} bufferId - Buffer to close
   */
  handleTabClose(bufferId) {
    const buffer = this.bufferManager.getBuffer(bufferId);
    if (!buffer) return;
    
    // Check if buffer has unsaved changes
    if (buffer.isDirty) {
      // Show confirmation via status bar message
      const confirmMsg = `Buffer ${bufferId} has unsaved changes. Close anyway? (Run :bd! ${bufferId} to force)`;
      this.showMessage(confirmMsg);
      return;
    }
    
    this.closeBuffer(bufferId);
  }

  // ============================================================================
  // LSP Go-to-Definition
  // ============================================================================

  /**
   * Jump to a specific position in the current file
   */
  async jumpToPosition(line, column = 0) {
    // Move cursor to line and column
    this.cursorRow = Math.max(0, Math.min(line, this.lines.length - 1));
    this.cursorCol = Math.max(0, column);
    
    // Center the view on the target line
    const editorHeight = this.editorArea.clientHeight;
    const lineHeight = 20; // Approximate line height
    const visibleLines = Math.floor(editorHeight / lineHeight);
    const centerOffset = Math.floor(visibleLines / 2);
    
    this.scrollOffset = Math.max(0, this.cursorRow - centerOffset);
    
    // Update display
    this.renderEditor();
    this.updateLineNumbers();
    this.renderStatusBar();
    
    console.log(`[XLR8] Jumped to line ${line + 1}, column ${column + 1}`);
  }

  /**
   * Go to definition of symbol at cursor
   */
  async goToDefinition() {
    // Only works if we have a file open
    if (!this.currentFile) {
      this.showMessage('No file open');
      return;
    }

    try {
      // Get cursor position
      const text = this.editor.value;
      const cursorPos = this.editor.selectionStart;
      
      // Calculate line and character position
      const textUpToCursor = text.substring(0, cursorPos);
      const lines = textUpToCursor.split('\n');
      const line = lines.length - 1;
      const character = lines[lines.length - 1].length;

      console.log(`[XLR8] Requesting definition at ${this.currentFile}:${line}:${character}`);
      this.showMessage('Searching for definition...');

      // Request definition from LSP via backend
      const definition = await backendProvider.requestDefinition(
        this.currentFile,
        line,
        character,
        this.editor.value
      );

      if (!definition) {
        this.showMessage('Definition not found');
        return;
      }

      // Handle definition response
      // Definition can be Location, Location[], or null
      let targetLocation = definition;
      if (Array.isArray(definition) && definition.length > 0) {
        targetLocation = definition[0]; // Use first location if multiple
      }

      if (!targetLocation || !targetLocation.uri) {
        this.showMessage('Definition not found');
        return;
      }

      // Parse URI (format: "file:///path/to/file.js")
      let targetPath = targetLocation.uri;
      if (targetPath.startsWith('file://')) {
        targetPath = targetPath.substring(7); // Remove "file://"
      }

      // Get target position
      const targetLine = targetLocation.range?.start?.line || 0;
      const targetCharacter = targetLocation.range?.start?.character || 0;

      console.log(`[XLR8] Definition found at ${targetPath}:${targetLine}:${targetCharacter}`);

      // Check if file is already open
      const existingBufferId = this.bufferManager.findBufferByPath(targetPath);
      if (existingBufferId !== null) {
        // Switch to existing buffer
        this.switchToBufferById(existingBufferId);
      } else {
        // Open the file
        await this.loadFile(targetPath);
      }

      // Jump to the position
      await this.jumpToPosition(targetLine, targetCharacter);
      
      this.showMessage(`Jumped to definition in ${targetPath.split('/').pop()}`);

    } catch (error) {
      console.error('[XLR8] Error in goToDefinition:', error);
      this.showMessage(`Error: ${error.message}`);
    }
  }

  /**
   * Jump to a specific position in the current file
   * @param {number} line - Line number (0-based)
   * @param {number} character - Character position (0-based)
   */
  async jumpToPosition(line, character) {
    // Convert line/character to absolute position in textarea
    const lines = this.editor.value.split('\n');
    
    // Calculate absolute position
    let position = 0;
    for (let i = 0; i < line && i < lines.length; i++) {
      position += lines[i].length + 1; // +1 for newline
    }
    position += Math.min(character, lines[line]?.length || 0);

    // Set cursor position
    this.editor.selectionStart = position;
    this.editor.selectionEnd = position;
    
    // Scroll to line
    // Rough estimate: each line is ~22px
    const lineHeight = 22;
    const targetScrollTop = line * lineHeight;
    this.editor.scrollTop = targetScrollTop;
    
    // Focus editor
    this.editor.focus();

    console.log(`[XLR8] Jumped to line ${line}, character ${character} (position ${position})`);
  }

  // ============================================================================
  // Helper methods for AIManager
  // ============================================================================

  getEditorContent() {
    return this.editor.value;
  }

  setEditorContent(content) {
    this.editor.value = content;
    this.updateSyntaxHighlighting();
    this.updateLineNumbers();
    this.updateStatusBar();
  }

  getCursorPosition() {
    return {
      line: 0,
      character: this.editor.selectionStart
    };
  }

  setCursorPosition(pos) {
    if (typeof pos.character === 'number') {
      this.editor.selectionStart = pos.character;
      this.editor.selectionEnd = pos.character;
    }
  }
}

// Initialize editor when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new XLR8Editor());
} else {
  new XLR8Editor();
}
