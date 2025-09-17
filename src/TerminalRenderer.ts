import { terminal } from 'terminal-kit';
import { BufferManager, Position } from './BufferManager';

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

  constructor(buffer: BufferManager, filename: string = '') {
    this.buffer = buffer;
    this.filename = filename;
    this.updateTerminalSize();
  }

  private updateTerminalSize(): void {
    this.terminalWidth = terminal.width;
    this.terminalHeight = terminal.height;
  }

  private getViewportEndRow(): number {
    return Math.min(
      this.viewportStartRow + this.terminalHeight - 2, // -2 for status bar
      this.buffer.getLineCount() - 1
    );
  }

  private getViewportEndCol(): number {
    return this.viewportStartCol + this.terminalWidth - 1;
  }

  private ensureCursorVisible(): void {
    const cursor = this.buffer.getCursor();
    
    // Adjust viewport to keep cursor visible
    if (cursor.row < this.viewportStartRow) {
      this.viewportStartRow = cursor.row;
    } else if (cursor.row > this.getViewportEndRow()) {
      this.viewportStartRow = cursor.row - (this.terminalHeight - 2) + 1;
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
    
    // Render text content
    this.renderTextContent();
    
    // Render status bar
    this.renderStatusBar();
    
    // Render command input if in command mode
    if (this.mode === 'command') {
      this.renderCommandInput();
    }
    
    // Position cursor
    this.positionCursor();
  }

  private renderTextContent(): void {
    const endRow = this.getViewportEndRow();
    
    for (let row = this.viewportStartRow; row <= endRow; row++) {
      const line = this.buffer.getLine(row);
      const displayLine = line.slice(this.viewportStartCol);
      
      // Truncate line if it's too long
      const truncatedLine = displayLine.length > this.terminalWidth 
        ? displayLine.slice(0, this.terminalWidth - 1) + '~'
        : displayLine;
      
      terminal.moveTo(1, row - this.viewportStartRow + 1);
      terminal(truncatedLine);
    }
  }

  private renderStatusBar(): void {
    const cursor = this.buffer.getCursor();
    const modeText = this.mode.toUpperCase();
    const positionText = `${cursor.row + 1}:${cursor.col + 1}`;
    const filenameText = this.filename || '[No Name]';
    
    // Status bar background
    terminal.moveTo(1, this.terminalHeight - 1);
    terminal.bgBlue.white(`${modeText} ${filenameText} ${positionText}`.padEnd(this.terminalWidth));
  }

  private renderCommandInput(): void {
    terminal.moveTo(1, this.terminalHeight);
    terminal.bgGreen.white(`:${this.commandInput}`.padEnd(this.terminalWidth));
  }

  private positionCursor(): void {
    const cursor = this.buffer.getCursor();
    const displayRow = cursor.row - this.viewportStartRow + 1;
    const displayCol = cursor.col - this.viewportStartCol + 1;
    
    terminal.moveTo(displayCol, displayRow);
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
  }

  getFilename(): string {
    return this.filename;
  }

  // Handle keyboard input
  handleKey(key: string, ctrl: boolean = false, shift: boolean = false): boolean {
    if (this.mode === 'command') {
      return this.handleCommandModeKey(key, ctrl, shift);
    } else {
      return this.handleInsertModeKey(key, ctrl, shift);
    }
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
        this.executeCommand();
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

  private executeCommand(): void {
    const command = this.commandInput.trim();
    
    switch (command) {
      case 'q':
        process.exit(0);
        break;
        
      case 'w':
        // Save functionality will be implemented later
        this.setMode('insert');
        break;
        
      case 'wq':
        // Save and quit functionality will be implemented later
        process.exit(0);
        break;
        
      default:
        // Unknown command, return to insert mode
        this.setMode('insert');
        break;
    }
  }
}
