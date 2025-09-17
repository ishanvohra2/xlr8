export interface Position {
  row: number;
  col: number;
}

export interface EditOperation {
  type: 'insert' | 'delete' | 'replace';
  position: Position;
  content?: string;
  deletedContent?: string;
}

export class BufferManager {
  private lines: string[] = [''];
  private cursor: Position = { row: 0, col: 0 };
  private undoStack: EditOperation[] = [];
  private redoStack: EditOperation[] = [];

  constructor(initialContent?: string) {
    if (initialContent) {
      this.lines = initialContent.split('\n');
      if (this.lines.length === 0) {
        this.lines = [''];
      }
    }
  }

  getContent(): string {
    return this.lines.join('\n');
  }

  getLines(): string[] {
    return [...this.lines];
  }

  getCursor(): Position {
    return { ...this.cursor };
  }

  setCursor(row: number, col: number): void {
    this.cursor.row = Math.max(0, Math.min(row, this.lines.length - 1));
    this.cursor.col = Math.max(0, Math.min(col, this.lines[this.cursor.row].length));
  }

  moveCursor(deltaRow: number, deltaCol: number): void {
    this.setCursor(this.cursor.row + deltaRow, this.cursor.col + deltaCol);
  }

  insertChar(char: string): void {
    const operation: EditOperation = {
      type: 'insert',
      position: { ...this.cursor },
      content: char
    };

    this.lines[this.cursor.row] = 
      this.lines[this.cursor.row].slice(0, this.cursor.col) + 
      char + 
      this.lines[this.cursor.row].slice(this.cursor.col);

    this.cursor.col++;
    this.undoStack.push(operation);
    this.redoStack = []; // Clear redo stack on new edit
  }

  insertNewline(): void {
    const operation: EditOperation = {
      type: 'insert',
      position: { ...this.cursor },
      content: '\n'
    };

    const currentLine = this.lines[this.cursor.row];
    const beforeCursor = currentLine.slice(0, this.cursor.col);
    const afterCursor = currentLine.slice(this.cursor.col);

    this.lines[this.cursor.row] = beforeCursor;
    this.lines.splice(this.cursor.row + 1, 0, afterCursor);

    this.cursor.row++;
    this.cursor.col = 0;
    this.undoStack.push(operation);
    this.redoStack = [];
  }

  deleteChar(): void {
    if (this.cursor.col > 0) {
      // Delete character before cursor
      const operation: EditOperation = {
        type: 'delete',
        position: { ...this.cursor },
        deletedContent: this.lines[this.cursor.row][this.cursor.col - 1]
      };

      this.lines[this.cursor.row] = 
        this.lines[this.cursor.row].slice(0, this.cursor.col - 1) + 
        this.lines[this.cursor.row].slice(this.cursor.col);

      this.cursor.col--;
      this.undoStack.push(operation);
      this.redoStack = [];
    } else if (this.cursor.row > 0) {
      // Merge with previous line
      const operation: EditOperation = {
        type: 'delete',
        position: { ...this.cursor },
        deletedContent: '\n'
      };

      const currentLine = this.lines[this.cursor.row];
      const prevLine = this.lines[this.cursor.row - 1];
      
      this.lines[this.cursor.row - 1] = prevLine + currentLine;
      this.lines.splice(this.cursor.row, 1);
      
      this.cursor.row--;
      this.cursor.col = prevLine.length;
      this.undoStack.push(operation);
      this.redoStack = [];
    }
  }

  undo(): void {
    if (this.undoStack.length === 0) return;

    const operation = this.undoStack.pop()!;
    this.redoStack.push(operation);

    switch (operation.type) {
      case 'insert':
        if (operation.content === '\n') {
          // Undo newline insertion
          const currentLine = this.lines[operation.position.row];
          const nextLine = this.lines[operation.position.row + 1];
          this.lines[operation.position.row] = currentLine + nextLine;
          this.lines.splice(operation.position.row + 1, 1);
          this.cursor = { ...operation.position };
        } else {
          // Undo character insertion
          const line = this.lines[operation.position.row];
          this.lines[operation.position.row] = 
            line.slice(0, operation.position.col) + 
            line.slice(operation.position.col + 1);
          this.cursor = { ...operation.position };
        }
        break;

      case 'delete':
        if (operation.deletedContent === '\n') {
          // Undo newline deletion
          const line = this.lines[operation.position.row - 1];
          const beforeCursor = line.slice(0, operation.position.col);
          const afterCursor = line.slice(operation.position.col);
          this.lines[operation.position.row - 1] = beforeCursor;
          this.lines.splice(operation.position.row, 0, afterCursor);
          this.cursor = { ...operation.position };
        } else {
          // Undo character deletion
          const line = this.lines[operation.position.row];
          this.lines[operation.position.row] = 
            line.slice(0, operation.position.col) + 
            operation.deletedContent + 
            line.slice(operation.position.col);
          this.cursor = { ...operation.position };
        }
        break;
    }
  }

  redo(): void {
    if (this.redoStack.length === 0) return;

    const operation = this.redoStack.pop()!;
    this.undoStack.push(operation);

    switch (operation.type) {
      case 'insert':
        if (operation.content === '\n') {
          this.insertNewline();
        } else {
          this.insertChar(operation.content!);
        }
        break;

      case 'delete':
        this.deleteChar();
        break;
    }
  }

  getLineCount(): number {
    return this.lines.length;
  }

  getLineLength(row: number): number {
    return this.lines[row]?.length || 0;
  }

  getLine(row: number): string {
    return this.lines[row] || '';
  }
}
