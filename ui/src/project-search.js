/**
 * ProjectSearch - Project-wide text search (like :grep or Ctrl+Shift+F in VSCode)
 * 
 * Searches for text patterns across all project files.
 */

import { backendProvider } from './providers/backend-provider.js';

export class ProjectSearch {
  constructor(editor) {
    this.editor = editor;
    this.isOpen = false;
    this.results = [];
    this.selectedIndex = 0;
    this.searchQuery = '';
    
    // DOM elements
    this.container = document.getElementById('project-search');
    this.input = document.getElementById('project-search-input');
    this.status = document.getElementById('project-search-status');
    this.resultsContainer = document.getElementById('project-search-results');
    this.overlay = this.container.querySelector('.project-search-overlay');
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Input events
    this.input.addEventListener('input', () => this.handleInput());
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    
    // Click overlay to close
    this.overlay.addEventListener('click', () => this.close());
  }

  open(initialQuery = '') {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.container.style.display = 'flex';
    this.input.value = initialQuery;
    this.input.focus();
    this.results = [];
    this.selectedIndex = 0;
    
    if (initialQuery) {
      this.performSearch(initialQuery);
    } else {
      this.updateStatus('Enter search term');
      this.render();
    }
  }

  close() {
    if (!this.isOpen) return;
    
    this.isOpen = false;
    this.container.style.display = 'none';
    this.input.value = '';
    this.results = [];
    this.selectedIndex = 0;
    this.searchQuery = '';
  }

  handleInput() {
    const query = this.input.value.trim();
    
    if (!query) {
      this.results = [];
      this.updateStatus('Enter search term');
      this.render();
      return;
    }
    
    // Debounce search (wait 300ms after typing stops)
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.performSearch(query);
    }, 300);
  }

  async performSearch(query) {
    this.searchQuery = query;
    this.updateStatus('Searching...', 'searching');
    
    try {
      // For now, we'll do a simple client-side search through known files
      // In a real implementation, this would call a backend search service
      const results = await this.searchInFiles(query);
      
      this.results = results;
      this.selectedIndex = 0;
      
      if (results.length === 0) {
        this.updateStatus(`No results for "${query}"`);
      } else {
        this.updateStatus(`Found ${results.length} result${results.length === 1 ? '' : 's'}`, 'found');
      }
      
      this.render();
    } catch (error) {
      console.error('[ProjectSearch] Search error:', error);
      this.updateStatus(`Error: ${error.message}`);
      this.render();
    }
  }

  async searchInFiles(query) {
    // Use backend for real file system search
    try {
      // Get current working directory from Pear
      const searchPath = typeof Pear !== 'undefined' && Pear.cwd ? Pear.cwd() : process.cwd();
      
      console.log('[ProjectSearch] Searching in:', searchPath);
      console.log('[ProjectSearch] Query:', query);
      
      // Request search from backend
      const { results, totalCount, limited } = await backendProvider.requestProjectSearch(query, searchPath);
      
      console.log('[ProjectSearch] Results:', results.length, 'of', totalCount);
      
      if (limited) {
        console.log('[ProjectSearch] Results were limited to 100');
      }
      
      return results;
    } catch (error) {
      console.error('[ProjectSearch] Search error:', error);
      throw error;
    }
  }

  updateStatus(message, className = '') {
    this.status.textContent = message;
    this.status.className = 'project-search-status';
    if (className) {
      this.status.classList.add(className);
    }
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
      this.render();
      this.scrollToSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.render();
      this.scrollToSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.jumpToResult();
    }
  }

  scrollToSelected() {
    const selectedItem = this.resultsContainer.querySelector('.search-result-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  async jumpToResult() {
    if (this.results.length === 0) return;
    
    const result = this.results[this.selectedIndex];
    console.log('[ProjectSearch] Jumping to result:', result);
    
    // Close search
    this.close();
    
    // Open file
    try {
      await this.editor.loadFile(result.file);
      
      // Jump to line
      await this.editor.jumpToPosition(result.line - 1, result.column);
      
    } catch (error) {
      console.error('[ProjectSearch] Error jumping to result:', error);
      this.editor.showMessage(`Error: ${error.message}`);
    }
  }

  highlightMatch(text, query) {
    if (!query) return text;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text;
    
    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);
    
    return `${before}<span class="match">${match}</span>${after}`;
  }

  render() {
    if (this.results.length === 0) {
      this.resultsContainer.innerHTML = '<div class="project-search-empty">No results</div>';
      return;
    }
    
    this.resultsContainer.innerHTML = this.results
      .map((result, index) => {
        const isSelected = index === this.selectedIndex;
        const highlightedLine = this.highlightMatch(result.text, this.searchQuery);
        const fileName = result.file.split('/').pop();
        
        return `
          <div class="search-result-item ${isSelected ? 'selected' : ''}" data-index="${index}">
            <div class="search-result-header">
              <span class="search-result-file">${fileName}</span>
              <span class="search-result-location">${result.file}:${result.line}:${result.column}</span>
            </div>
            <div class="search-result-line">${highlightedLine}</div>
          </div>
        `;
      })
      .join('');
    
    // Add click handlers
    this.resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedIndex = parseInt(item.dataset.index);
        this.jumpToResult();
      });
    });
  }
}

