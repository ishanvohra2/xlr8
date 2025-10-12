/**
 * FuzzyFinder - CtrlP/fzf-style file finder for XLR8
 * 
 * Provides fast, fuzzy file search across the project.
 */

import path from 'path';

export class FuzzyFinder {
  constructor(editor) {
    this.editor = editor;
    this.isOpen = false;
    this.files = [];
    this.filteredFiles = [];
    this.selectedIndex = 0;
    this.currentWorkingDir = null;
    
    // DOM elements
    this.container = document.getElementById('fuzzy-finder');
    this.input = document.getElementById('fuzzy-finder-input');
    this.results = document.getElementById('fuzzy-finder-results');
    this.overlay = this.container.querySelector('.fuzzy-finder-overlay');
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Input events
    this.input.addEventListener('input', () => this.handleInput());
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    
    // Click overlay to close
    this.overlay.addEventListener('click', () => this.close());
  }

  async open() {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.container.style.display = 'flex';
    this.input.value = '';
    this.input.focus();
    
    // Get current working directory from Pear
    try {
      if (typeof Pear !== 'undefined' && Pear.cwd) {
        this.currentWorkingDir = Pear.cwd();
      } else if (typeof process !== 'undefined' && process.cwd) {
        this.currentWorkingDir = process.cwd();
      }
    } catch (err) {
      console.error('[FuzzyFinder] Could not get cwd:', err);
    }
    
    console.log('[FuzzyFinder] Opening with cwd:', this.currentWorkingDir);
    
    // Load files
    await this.loadFiles();
    
    // Show all files initially
    this.filteredFiles = [...this.files];
    this.selectedIndex = 0;
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    
    this.isOpen = false;
    this.container.style.display = 'none';
    this.input.value = '';
    this.files = [];
    this.filteredFiles = [];
    this.selectedIndex = 0;
  }

  async loadFiles() {
    // Paths relative to where the app is running (ui directory)
    // In a real implementation, we'd recursively scan the project and respect .gitignore
    
    this.files = [
      // Test files (relative to ui/)
      { path: 'test/test-example.js', name: 'test-example.js', dir: 'test' },
      { path: 'test/test-example.py', name: 'test-example.py', dir: 'test' },
      { path: 'test/test.txt', name: 'test.txt', dir: 'test' },
      { path: 'test/demo-file1.js', name: 'demo-file1.js', dir: 'test' },
      { path: 'test/demo-file2.py', name: 'demo-file2.py', dir: 'test' },
      { path: 'test/demo-file3.md', name: 'demo-file3.md', dir: 'test' },
      { path: 'test/test-completion.js', name: 'test-completion.js', dir: 'test' },
      { path: 'test/index.test.js', name: 'index.test.js', dir: 'test' },
      
      // Source files (relative to ui/)
      { path: 'src/app.js', name: 'app.js', dir: 'src' },
      { path: 'src/ai-manager.js', name: 'ai-manager.js', dir: 'src' },
      { path: 'src/buffer-manager.js', name: 'buffer-manager.js', dir: 'src' },
      { path: 'src/fuzzy-finder.js', name: 'fuzzy-finder.js', dir: 'src' },
      { path: 'src/providers/backend-provider.js', name: 'backend-provider.js', dir: 'src/providers' },
      
      // Root files (relative to ui/)
      { path: 'index.html', name: 'index.html', dir: '.' },
      { path: 'style.css', name: 'style.css', dir: '.' },
      { path: 'package.json', name: 'package.json', dir: '.' },
      
      // Backend files (relative to ui/, go up one level)
      { path: '../backend/index.js', name: 'index.js', dir: '../backend' },
      { path: '../backend/WorkerManager.js', name: 'WorkerManager.js', dir: '../backend' },
      { path: '../backend/LSPManager.js', name: 'LSPManager.js', dir: '../backend' },
      { path: '../backend/LSPClient.js', name: 'LSPClient.js', dir: '../backend' },
      { path: '../backend/InferenceManager.js', name: 'InferenceManager.js', dir: '../backend' },
      { path: '../backend/ChatHistoryManager.js', name: 'ChatHistoryManager.js', dir: '../backend' },
      { path: '../backend/DiffUtil.js', name: 'DiffUtil.js', dir: '../backend' },
      { path: '../backend/package.json', name: 'package.json', dir: '../backend' },
      
      // Docs (relative to ui/, go up one level)
      { path: '../README.md', name: 'README.md', dir: '..' },
    ];
    
    console.log('[FuzzyFinder] Loaded', this.files.length, 'files');
  }

  handleInput() {
    const query = this.input.value;
    
    if (!query.trim()) {
      // Show all files if no query
      this.filteredFiles = [...this.files];
    } else {
      // Fuzzy filter
      this.filteredFiles = this.fuzzyFilter(query, this.files);
    }
    
    this.selectedIndex = 0;
    this.render();
  }

  /**
   * Fuzzy filter files by query
   * @param {string} query - Search query
   * @param {Array} files - Array of file objects
   * @returns {Array} Filtered and sorted files with match scores
   */
  fuzzyFilter(query, files) {
    const lowerQuery = query.toLowerCase();
    const results = [];
    
    for (const file of files) {
      const score = this.fuzzyMatch(lowerQuery, file.path.toLowerCase());
      if (score > 0) {
        results.push({ ...file, score });
      }
    }
    
    // Sort by score (higher is better)
    results.sort((a, b) => b.score - a.score);
    
    return results;
  }

  /**
   * Fuzzy match algorithm
   * Returns a score based on how well the query matches the text
   * @param {string} query - Search query (lowercase)
   * @param {string} text - Text to search in (lowercase)
   * @returns {number} Match score (0 = no match, higher = better match)
   */
  fuzzyMatch(query, text) {
    let score = 0;
    let queryIndex = 0;
    let textIndex = 0;
    let consecutiveMatches = 0;
    
    while (queryIndex < query.length && textIndex < text.length) {
      if (query[queryIndex] === text[textIndex]) {
        // Character matches
        score += 1;
        
        // Bonus for consecutive matches
        consecutiveMatches++;
        score += consecutiveMatches * 5;
        
        // Bonus for matches at word boundaries
        if (textIndex === 0 || text[textIndex - 1] === '/' || text[textIndex - 1] === '-' || text[textIndex - 1] === '_') {
          score += 10;
        }
        
        queryIndex++;
      } else {
        consecutiveMatches = 0;
      }
      textIndex++;
    }
    
    // All query characters must match
    if (queryIndex < query.length) {
      return 0;
    }
    
    // Bonus for shorter paths (prefer files closer to query length)
    const lengthBonus = 100 / (1 + Math.abs(text.length - query.length));
    score += lengthBonus;
    
    return score;
  }

  /**
   * Highlight matching characters in text
   * @param {string} text - Text to highlight
   * @param {string} query - Query to match
   * @returns {string} HTML with highlighted matches
   */
  highlightMatches(text, query) {
    if (!query) return text;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    let result = '';
    let queryIndex = 0;
    
    for (let i = 0; i < text.length; i++) {
      if (queryIndex < lowerQuery.length && lowerText[i] === lowerQuery[queryIndex]) {
        result += `<span class="match">${text[i]}</span>`;
        queryIndex++;
      } else {
        result += text[i];
      }
    }
    
    return result;
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredFiles.length - 1);
      this.render();
      this.scrollToSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.render();
      this.scrollToSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.selectFile();
    }
  }

  scrollToSelected() {
    const selectedItem = this.results.querySelector('.fuzzy-finder-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  async selectFile() {
    if (this.filteredFiles.length === 0) return;
    
    const selectedFile = this.filteredFiles[this.selectedIndex];
    console.log('[FuzzyFinder] Selected file:', selectedFile.path);
    
    // Close finder
    this.close();
    
    // Open file in editor
    try {
      await this.editor.loadFile(selectedFile.path);
    } catch (error) {
      console.error('[FuzzyFinder] Error opening file:', error);
      this.editor.showMessage(`Error opening file: ${error.message}`);
    }
  }

  render() {
    if (this.filteredFiles.length === 0) {
      this.results.innerHTML = '<div class="fuzzy-finder-empty">No files found</div>';
      return;
    }
    
    const query = this.input.value;
    
    this.results.innerHTML = this.filteredFiles
      .slice(0, 50) // Limit to 50 results for performance
      .map((file, index) => {
        const isSelected = index === this.selectedIndex;
        const highlightedName = this.highlightMatches(file.name, query);
        
        return `
          <div class="fuzzy-finder-item ${isSelected ? 'selected' : ''}" data-index="${index}">
            <svg class="fuzzy-finder-item-icon" viewBox="0 0 16 16" fill="none">
              <path d="M9 2H4C3.44772 2 3 2.44772 3 3V13C3 13.5523 3.44772 14 4 14H12C12.5523 14 13 13.5523 13 13V6L9 2Z" stroke="currentColor" stroke-width="1.5"/>
              <path d="M9 2V6H13" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            <div class="fuzzy-finder-item-content">
              <div class="fuzzy-finder-item-name">${highlightedName}</div>
              <div class="fuzzy-finder-item-path">${file.dir}</div>
            </div>
          </div>
        `;
      })
      .join('');
    
    // Add click handlers
    this.results.querySelectorAll('.fuzzy-finder-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedIndex = parseInt(item.dataset.index);
        this.selectFile();
      });
    });
  }
}

