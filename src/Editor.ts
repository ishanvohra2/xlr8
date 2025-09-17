import { terminal } from 'terminal-kit';
import { BufferManager } from './BufferManager';
import { TerminalRenderer } from './TerminalRenderer';
import * as fs from 'fs';
import * as path from 'path';

export class Editor {
  private buffer: BufferManager;
  private renderer: TerminalRenderer;
  private filename: string;
  private isRunning: boolean = false;

  constructor(filename?: string) {
    this.filename = filename || '';
    this.buffer = new BufferManager();
    this.renderer = new TerminalRenderer(this.buffer, this.filename);
    
    this.setupTerminal();
  }

  private setupTerminal(): void {
    // Enable raw mode for direct key handling
    terminal.grabInput(true);
    
    // Handle terminal resize
    terminal.on('resize', () => {
      this.renderer.render();
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
        this.buffer.undo();
        this.renderer.render();
        return;
      }

      if (ctrl && name === 'y') {
        this.buffer.redo();
        this.renderer.render();
        return;
      }

      // Handle regular key input
      const handled = this.renderer.handleKey(name, ctrl, shift);
      if (handled) {
        this.renderer.render();
      }
    });
  }

  async loadFile(filename: string): Promise<void> {
    try {
      const content = fs.readFileSync(filename, 'utf8');
      this.buffer = new BufferManager(content);
      this.filename = filename;
      this.renderer = new TerminalRenderer(this.buffer, this.filename);
    } catch (error) {
      // File doesn't exist or can't be read, start with empty buffer
      this.filename = filename;
      this.buffer = new BufferManager();
      this.renderer = new TerminalRenderer(this.buffer, this.filename);
    }
  }

  async saveFile(): Promise<void> {
    if (!this.filename) {
      // TODO: Implement save-as functionality
      return;
    }

    try {
      const content = this.buffer.getContent();
      fs.writeFileSync(this.filename, content, 'utf8');
    } catch (error) {
      // TODO: Show error message to user
      console.error('Error saving file:', error);
    }
  }

  start(): void {
    this.isRunning = true;
    this.renderer.render();
  }

  quit(): void {
    this.isRunning = false;
    terminal.grabInput(false);
    terminal.clear();
    process.exit(0);
  }

  getBuffer(): BufferManager {
    return this.buffer;
  }

  getRenderer(): TerminalRenderer {
    return this.renderer;
  }
}
