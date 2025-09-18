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

## Current Features

✅ **Core Editor Functionality**
- Open and edit text files
- Insert and command modes (vim-style)
- Basic navigation with arrow keys
- Text editing (insert, delete, newline)
- Undo/redo functionality (Ctrl+Z/Ctrl+Y)

✅ **Command Mode**
- `:q` - Quit editor
- `:w` - Save file
- `:wq` - Save and quit
- `:ai edit <prompt>` - AI-powered code editing
- `:ai ask <question>` - AI-powered code discussion

✅ **LSP Integration**
- Configurable LSP servers for multiple languages
- TypeScript/JavaScript, Python, Rust, Go, C/C++, Java support
- Autocomplete and go-to-definition (Ctrl+D)
- Real-time diagnostics and error highlighting
- User-configurable LSP server settings

✅ **Advanced Features**
- Syntax highlighting
- Multiple tabs (Ctrl+T, Ctrl+W, Ctrl+Tab)
- AI Assistant with local LLM
- Tool-based code editing

## AI Assistant

XLR8 includes an AI assistant powered by local LLMs:

- **`:ai edit <prompt>`** - AI-powered code editing and implementation
- **`:ai ask <question>`** - Ask questions about your code
- **Local LLM** - Uses Qwen2.5-Coder-7B-Instruct model
- **Tool Integration** - AI can read files, analyze code, and make edits
- **Streaming Responses** - Real-time token streaming

See [AI_DEMO.md](AI_DEMO.md) for detailed usage examples.

## LSP Configuration

XLR8 supports configurable Language Server Protocol (LSP) servers for multiple programming languages:

### Quick Setup
```bash
# Create default LSP configuration
xlr8 --lsp-config

# List available LSP servers
xlr8 --lsp-list
```

### Supported Languages
- **TypeScript/JavaScript** - `typescript-language-server` (enabled by default)
- **Python** - `pyright`
- **Rust** - `rust-analyzer`
- **Go** - `gopls`
- **C/C++** - `clangd`
- **Java** - `jdtls`
- **Lua** - `lua-language-server`
- **Shell** - `bash-language-server`
- **JSON** - `vscode-json-languageserver`
- **YAML** - `yaml-language-server`

### Configuration
Edit `~/.xlr8/lsp-config.json` to customize LSP servers, enable/disable languages, and configure server-specific settings.

See [LSP_CONFIG_README.md](LSP_CONFIG_README.md) for detailed configuration guide.

## Next Phases

- **Phase 6**: Advanced features (find/replace, configurable keybindings)
- **Phase 7**: Plugin system and extensions

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
