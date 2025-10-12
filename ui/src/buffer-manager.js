/**
 * BufferManager - Manages multiple file buffers in the editor
 * 
 * A buffer represents an open file with its content, state, and metadata.
 * Similar to Vim's buffer system.
 */

export class BufferManager {
  constructor() {
    this.buffers = new Map(); // bufferId -> Buffer
    this.nextBufferId = 1;
    this.currentBufferId = null;
    this.alternateBufferId = null; // For :b# (previous buffer)
  }

  /**
   * Creates a new buffer for a file
   * @param {string} filePath - Full path to the file
   * @param {string} content - File content
   * @param {string} language - Programming language
   * @returns {number} bufferId
   */
  createBuffer(filePath, content = '', language = 'javascript') {
    const bufferId = this.nextBufferId++;
    
    const buffer = {
      id: bufferId,
      filePath: filePath,
      content: content,
      language: language,
      isDirty: false,
      cursorPosition: 0, // Cursor position in the textarea
      scrollTop: 0,
      scrollLeft: 0,
      createdAt: Date.now(),
      lastModified: Date.now()
    };
    
    this.buffers.set(bufferId, buffer);
    
    // If this is the first buffer, make it current
    if (this.currentBufferId === null) {
      this.currentBufferId = bufferId;
    }
    
    console.log(`[BufferManager] Created buffer ${bufferId} for ${filePath}`);
    return bufferId;
  }

  /**
   * Switches to a different buffer
   * @param {number} bufferId - Buffer to switch to
   * @returns {Object|null} The buffer object, or null if not found
   */
  switchToBuffer(bufferId) {
    if (!this.buffers.has(bufferId)) {
      return null;
    }
    
    // Save current buffer as alternate
    if (this.currentBufferId !== null) {
      this.alternateBufferId = this.currentBufferId;
    }
    
    this.currentBufferId = bufferId;
    const buffer = this.buffers.get(bufferId);
    
    console.log(`[BufferManager] Switched to buffer ${bufferId}: ${buffer.filePath}`);
    return buffer;
  }

  /**
   * Gets the current buffer
   * @returns {Object|null}
   */
  getCurrentBuffer() {
    if (this.currentBufferId === null) {
      return null;
    }
    return this.buffers.get(this.currentBufferId);
  }

  /**
   * Updates the current buffer's content
   * @param {string} content - New content
   * @param {boolean} isDirty - Whether the buffer has unsaved changes
   */
  updateCurrentBuffer(content, isDirty = true) {
    const buffer = this.getCurrentBuffer();
    if (!buffer) return;
    
    buffer.content = content;
    buffer.isDirty = isDirty;
    buffer.lastModified = Date.now();
  }

  /**
   * Saves the current buffer's editor state (cursor, scroll)
   * @param {Object} state - { cursorPosition, scrollTop, scrollLeft }
   */
  saveCurrentBufferState(state) {
    const buffer = this.getCurrentBuffer();
    if (!buffer) return;
    
    if (state.cursorPosition !== undefined) {
      buffer.cursorPosition = state.cursorPosition;
    }
    if (state.scrollTop !== undefined) {
      buffer.scrollTop = state.scrollTop;
    }
    if (state.scrollLeft !== undefined) {
      buffer.scrollLeft = state.scrollLeft;
    }
  }

  /**
   * Marks current buffer as saved (not dirty)
   */
  markCurrentBufferSaved() {
    const buffer = this.getCurrentBuffer();
    if (!buffer) return;
    
    buffer.isDirty = false;
  }

  /**
   * Closes a buffer
   * @param {number} bufferId - Buffer to close
   * @returns {boolean} True if closed, false if not found
   */
  closeBuffer(bufferId) {
    if (!this.buffers.has(bufferId)) {
      return false;
    }
    
    const buffer = this.buffers.get(bufferId);
    console.log(`[BufferManager] Closing buffer ${bufferId}: ${buffer.filePath}`);
    
    this.buffers.delete(bufferId);
    
    // If we closed the current buffer, switch to another
    if (this.currentBufferId === bufferId) {
      // Try alternate buffer first
      if (this.alternateBufferId && this.buffers.has(this.alternateBufferId)) {
        this.currentBufferId = this.alternateBufferId;
        this.alternateBufferId = null;
      } else {
        // Otherwise, switch to any available buffer
        const availableIds = Array.from(this.buffers.keys());
        this.currentBufferId = availableIds.length > 0 ? availableIds[0] : null;
        this.alternateBufferId = null;
      }
    }
    
    return true;
  }

  /**
   * Finds buffer by file path
   * @param {string} filePath - Path to search for
   * @returns {number|null} bufferId or null if not found
   */
  findBufferByPath(filePath) {
    for (const [id, buffer] of this.buffers) {
      if (buffer.filePath === filePath) {
        return id;
      }
    }
    return null;
  }

  /**
   * Gets buffer by ID
   * @param {number} bufferId
   * @returns {Object|null}
   */
  getBuffer(bufferId) {
    return this.buffers.get(bufferId) || null;
  }

  /**
   * Lists all buffers
   * @returns {Array} Array of buffer objects
   */
  listBuffers() {
    return Array.from(this.buffers.values()).sort((a, b) => a.id - b.id);
  }

  /**
   * Gets next buffer in list (for :bn)
   * @returns {Object|null}
   */
  getNextBuffer() {
    const bufferIds = Array.from(this.buffers.keys()).sort((a, b) => a - b);
    if (bufferIds.length === 0) return null;
    if (bufferIds.length === 1) return this.getCurrentBuffer();
    
    const currentIndex = bufferIds.indexOf(this.currentBufferId);
    const nextIndex = (currentIndex + 1) % bufferIds.length;
    
    return this.buffers.get(bufferIds[nextIndex]);
  }

  /**
   * Gets previous buffer in list (for :bp)
   * @returns {Object|null}
   */
  getPreviousBuffer() {
    const bufferIds = Array.from(this.buffers.keys()).sort((a, b) => a - b);
    if (bufferIds.length === 0) return null;
    if (bufferIds.length === 1) return this.getCurrentBuffer();
    
    const currentIndex = bufferIds.indexOf(this.currentBufferId);
    const prevIndex = (currentIndex - 1 + bufferIds.length) % bufferIds.length;
    
    return this.buffers.get(bufferIds[prevIndex]);
  }

  /**
   * Gets alternate buffer (for :b#)
   * @returns {Object|null}
   */
  getAlternateBuffer() {
    if (!this.alternateBufferId || !this.buffers.has(this.alternateBufferId)) {
      return null;
    }
    return this.buffers.get(this.alternateBufferId);
  }

  /**
   * Checks if there are unsaved buffers
   * @returns {Array} Array of dirty buffers
   */
  getDirtyBuffers() {
    return this.listBuffers().filter(buffer => buffer.isDirty);
  }

  /**
   * Gets count of open buffers
   * @returns {number}
   */
  getBufferCount() {
    return this.buffers.size;
  }
}

