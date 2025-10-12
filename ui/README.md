# 🚀 XLR8 Editor

A lightweight, Vim-inspired modal text editor with **syntax highlighting** and **LSP support** built with Pear (Electron/Chromium).

## Features

### Core Editor
- **Vim-style Modal Editing**: Normal, Insert, and Command modes
- **Vim Keybindings**: `i`, `a`, `o`, `O`, `A`, `I` for insert mode, `:` for commands
- **Vim Commands**: `:w`, `:q`, `:wq`, `:q!`, `:e`
- **Line Numbers**: Visual gutter for easy navigation
- **Terminal-inspired UI**: Clean, distraction-free interface
- **File Operations**: Save and load files from disk
- **Keyboard Shortcuts**: Cmd/Ctrl+S to save, Cmd/Ctrl+Q to quit

### Code Editing
- **🎨 Syntax Highlighting**: Real-time syntax highlighting powered by Prism.js
  - Supports 15+ languages: JavaScript, TypeScript, Python, Go, Rust, C/C++, Java, C#, and more
  - Automatic language detection from file extensions
  - Beautiful syntax theme optimized for dark backgrounds

- **🧠 Language Server Protocol (LSP) Support**:
  - **Autocomplete**: Intelligent code completion suggestions
  - **Diagnostics**: Real-time error and warning detection
  - **Go to Definition**: Jump to symbol definitions (coming soon)
  - **Hover Info**: Documentation on hover (coming soon)
  - Supports: TypeScript/JavaScript, Python, Rust, Go, Java
  
- **Tab Completion**: Smart indentation and keyword completion

## Installation & Running

### Basic Setup

```bash
# Install dependencies
bun install

# Launch the editor
bun run dev

# Or use
bun start

# The editor opens empty - use Cmd+O to open files
```

### LSP Setup (Optional, for enhanced code intelligence)

To enable LSP features, install the language servers for your preferred languages:

```bash
# TypeScript/JavaScript
npm install -g typescript-language-server typescript

# Python
pip install python-lsp-server

# Rust
rustup component add rust-analyzer

# Go
go install golang.org/x/tools/gopls@latest

# Ensure the language servers are in your PATH
```

The editor will automatically connect to the appropriate language server when you open a file.

## Usage

### Modes

XLR8 uses Vim-style modal editing with three modes:

**Normal Mode** (Default)
- Navigate and issue commands
- Press `i`, `a`, `o`, `O`, `A`, or `I` to enter Insert mode
- Press `:` to enter Command mode
- Cursor is blue in this mode

**Insert Mode**
- Type and edit text freely
- Press `Escape` to return to Normal mode
- Cursor is green in this mode

**Command Mode**
- Type commands after the `:` prompt
- Press `Enter` to execute
- Press `Escape` to return to Normal mode

### Commands

| Command | Action |
|---------|--------|
| `:w` | Save current file |
| `:w filename` | Save to specific filename |
| `:q` | Quit (warns if unsaved changes) |
| `:q!` | Force quit without saving |
| `:wq` or `:x` | Save and quit |
| `:e filename` | Load a file by path |
| `:o` or `:open` | Open file picker dialog 🆕 |

### Keyboard Shortcuts

#### Mode Switching
- `i` - Enter insert mode (before cursor)
- `a` - Enter insert mode (after cursor)
- `o` - Open new line below and enter insert mode
- `O` - Open new line above and enter insert mode
- `A` - Enter insert mode at end of line
- `I` - Enter insert mode at start of line
- `:` - Enter command mode
- `Escape` - Return to normal mode

#### Global Shortcuts (work in any mode)
- `Cmd+O` / `Ctrl+O` - **Open file picker** 🆕
- `Cmd+S` / `Ctrl+S` - Save file
- `Cmd+Q` / `Ctrl+Q` - Quit editor
- `Tab` - Insert 2 spaces (for indentation, insert mode only)

#### Autocomplete
- Type 2+ characters to trigger autocomplete
- `↑` / `↓` - Navigate suggestions
- `Tab` or `Enter` - Accept selected completion
- `Escape` - Close autocomplete popup

## Opening Files

Launch the editor and use one of these methods:

1. **File Picker (Recommended)**: Press `Cmd+O` (or `Ctrl+O`)
2. **Command**: Type `:open` or `:o`
3. **By Path**: Type `:e path/to/file.txt`

## Architecture

- **index.html** - Main UI structure with textarea overlay for syntax highlighting
- **style.css** - Terminal-inspired styling with Prism.js theme
- **app.js** - Main editor logic (XLR8Editor class)
- **lsp-client.js** - LSP client implementation for code intelligence

## Supported Languages

### Syntax Highlighting
JavaScript, TypeScript, Python, Java, C, C++, C#, Go, Rust, JSON, Markdown, CSS, HTML, Bash, SQL

### LSP Support (with server installed)
| Language | LSP Server | Install Command |
|----------|------------|-----------------|
| JavaScript/TypeScript | typescript-language-server | `npm i -g typescript-language-server typescript` |
| Python | python-lsp-server | `pip install python-lsp-server` |
| Rust | rust-analyzer | `rustup component add rust-analyzer` |
| Go | gopls | `go install golang.org/x/tools/gopls@latest` |
| Java | jdtls | See Eclipse JDT.LS documentation |

## Design Philosophy

- Minimal viable functionality first
- No heavy dependencies
- Fast startup time (< 200ms)
- Modular and hackable
- Terminal aesthetics
- Professional code editing features

## Future Enhancements

- Hover documentation tooltips
- Go to definition
- Find references
- Inline diagnostics with underlines
- Multi-file tabs
- Plugin system
- Configuration file support

## License

MIT License © 2025 Ishan Vohra

