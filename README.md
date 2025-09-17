# XLR8 - Terminal-based Code Editor

A fast, terminal-based code editor with vim-like keybindings, written in TypeScript.

## Phase 1 Features (Current)

✅ **Core Editor Functionality**
- Open and edit text files
- Insert and command modes (vim-style)
- Basic navigation with arrow keys
- Text editing (insert, delete, newline)
- Undo/redo functionality (Ctrl+Z/Ctrl+Y)

✅ **Command Mode**
- `:q` - Quit editor
- `:w` - Save file (placeholder)
- `:wq` - Save and quit (placeholder)

✅ **Navigation**
- Arrow keys for movement
- Home/End keys
- Scrollable viewport for large files

## Installation & Usage

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Run the editor:**
   ```bash
   # Open a file
   npm start test.txt
   
   # Or open without a file (creates new document)
   npm start
   ```

3. **Development mode:**
   ```bash
   npm run dev test.txt
   ```

## Key Bindings

### Insert Mode (Default)
- **Arrow keys** - Move cursor
- **Home/End** - Jump to beginning/end of line
- **Backspace** - Delete character before cursor
- **Enter** - Insert newline
- **Escape** - Switch to command mode
- **Ctrl+Z** - Undo
- **Ctrl+Y** - Redo
- **Ctrl+C** - Quit editor

### Command Mode
- **Escape** - Return to insert mode
- **Enter** - Execute command
- **Backspace** - Delete character in command
- **:q** - Quit
- **:w** - Save (placeholder)
- **:wq** - Save and quit (placeholder)

## Project Structure

```
src/
├── BufferManager.ts    # Text buffer with undo/redo
├── TerminalRenderer.ts # UI rendering with terminal-kit
├── Editor.ts          # Main editor class
└── index.ts           # Entry point
```

## Next Phases

- **Phase 2**: Commands & Status Bar improvements
- **Phase 3**: LSP Integration (TypeScript support)
- **Phase 4**: Syntax highlighting and advanced features

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development
npm run dev

# Test
npm test
```
