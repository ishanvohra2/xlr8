# 📄 Technical Specification Document
**Project: XLR8 – Terminal-based Code Editor with JS/TS LSP**

## 1. Overview

XLR8 is a terminal-first code editor written in Node.js. It combines a minimal vim-like interface with Language Server Protocol (LSP) support for JavaScript and TypeScript. XLR8 provides autocomplete, diagnostics, and basic file editing directly in the terminal.

*Note: The name "XLR8" is inspired by the Ben 10 alien character who was known for his incredible speed, reflecting our goal of creating a fast and efficient code editor.*

## 2. Core Features

### Text Buffer & Editing
- Open, create, and edit text files
- Supports insert and command modes (vim-style)
- Undo/redo stack

### Command Mode
- `:w` → Save file
- `:q` → Quit
- `:wq` → Save & quit
- Extensible command system (JSON mapping)

### Navigation
- Arrow keys or hjkl for movement
- Jump to line (`:42`)
- Scrollable viewport for large files

### LSP Integration
- Autocomplete (completion suggestions)
- Go-to-definition
- Diagnostics (errors, warnings, hints)
- Works with typescript-language-server out of the box

### UI Layer
- Terminal-based rendering using terminal-kit
- Status bar (mode, filename, cursor position)
- Command input line
- Highlighted diagnostics inline

### Syntax Highlighting
- Basic highlighting via highlight.js initially
- Optional advanced parsing with tree-sitter

## 3. Architecture

### Components

#### Core Editor (Buffer Manager)
Handles text storage, editing operations, and undo/redo.

#### UI Layer (Terminal Renderer)
Uses terminal-kit to draw text buffer, status bar, and handle keyboard input.

#### Command Processor
Parses and executes `:` commands.

#### LSP Client
- Manages connection to typescript-language-server
- Sends document changes (didOpen, didChange, didSave)
- Requests completions, hover, and diagnostics

#### File Manager
Handles reading/writing from the filesystem.

## 4. Technology Stack

- **Runtime:** Node.js (>=18)
- **Languages:** TypeScript
- **UI Framework:** terminal-kit
- **LSP Integration:** vscode-languageserver-node
- **Syntax Highlighting:** highlight.js (MVP), tree-sitter (future)
- **Testing:** Jest + snapshot testing for rendering

## 5. MVP Roadmap

### Phase 1 – Core Editor
- Open file, edit text, save
- Insert/command mode toggle
- Basic navigation & cursor movement

### Phase 2 – Commands & Status Bar
- Implement `:w`, `:q`, `:wq`
- Status bar with filename, mode, line/col

### Phase 3 – LSP Integration
- Connect to typescript-language-server
- Autocomplete suggestions
- Diagnostics shown inline

### Phase 4 – Enhancements
- Syntax highlighting
- Go-to-definition
- Configurable keybindings

## 6. Future Enhancements

- Multiple buffers/tabs
- Plugin system (load external JS modules)
- Git integration (`:Gstatus`, `:Gcommit`)
- Remote editing via SSH (like vim)
- Collaborative editing (Yjs or CRDT-based)

## 7. Example Usage

```bash
xlr8 index.ts
```

**Inside editor:**

**NORMAL MODE:**
- `:w` → Save file
- `:q` → Quit
- `:wq` → Save & quit
- `Ctrl+Space` → Autocomplete

⚡ This way, XLR8 starts as a lean, hackable vim-like editor for JS/TS, but can grow into something powerful and fast – just like its namesake!
