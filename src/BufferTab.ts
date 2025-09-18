import { BufferManager } from './BufferManager';
import { TerminalRenderer } from './TerminalRenderer';
import { LSPManager } from './LSPManager';
import * as fs from 'fs';
import * as path from 'path';

export class BufferTab {
  private buffer: BufferManager;
  private renderer: TerminalRenderer;
  private filename: string;
  private isModified: boolean = false;
  private lastSavedContent: string = '';

  constructor(filename: string = '', initialContent?: string, debugMode: boolean = false) {
    this.filename = filename;
    this.buffer = new BufferManager(initialContent);
    this.renderer = new TerminalRenderer(this.buffer, this.filename, debugMode);
    this.lastSavedContent = this.buffer.getContent();
  }

  getBuffer(): BufferManager {
    return this.buffer;
  }

  getRenderer(): TerminalRenderer {
    return this.renderer;
  }

  getFilename(): string {
    return this.filename;
  }

  setFilename(filename: string): void {
    this.filename = filename;
    this.renderer.setFilename(filename);
  }

  getDisplayName(): string {
    if (!this.filename) {
      return '[No Name]';
    }
    return path.basename(this.filename);
  }

  getFullPath(): string {
    return this.filename;
  }

  isDirty(): boolean {
    return this.isModified;
  }

  markAsModified(): void {
    this.isModified = true;
  }

  markAsSaved(): void {
    this.isModified = false;
    this.lastSavedContent = this.buffer.getContent();
    this.renderer.markAsSaved();
  }

  async loadFile(filePath: string, debugMode: boolean = false): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      this.buffer = new BufferManager(content);
      this.filename = filePath;
      this.renderer = new TerminalRenderer(this.buffer, this.filename, debugMode);
      this.lastSavedContent = content;
      this.isModified = false;
    } catch (error) {
      // File doesn't exist or can't be read, start with empty buffer
      this.filename = filePath;
      this.buffer = new BufferManager();
      this.renderer = new TerminalRenderer(this.buffer, this.filename, debugMode);
      this.lastSavedContent = '';
      this.isModified = false;
    }
  }

  async saveFile(): Promise<void> {
    if (!this.filename) {
      throw new Error('No filename set for saving');
    }

    const content = this.buffer.getContent();
    fs.writeFileSync(this.filename, content, 'utf8');
    this.markAsSaved();
  }

  async saveAsFile(filePath: string): Promise<void> {
    const content = this.buffer.getContent();
    fs.writeFileSync(filePath, content, 'utf8');
    this.filename = filePath;
    this.renderer.setFilename(filePath);
    this.markAsSaved();
  }

  hasUnsavedChanges(): boolean {
    return this.buffer.getContent() !== this.lastSavedContent;
  }

  getContent(): string {
    return this.buffer.getContent();
  }

  setContent(content: string, debugMode: boolean = false): void {
    // Instead of creating new instances, just update the buffer content
    // This preserves all renderer state (chat, UI, completions, etc.)
    this.buffer = new BufferManager(content);
    
    // Update the renderer to use the new buffer
    this.renderer.setBuffer(this.buffer);
    
    this.isModified = true;
  }
}
