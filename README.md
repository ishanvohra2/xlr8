# XLR8 - Terminal Code Editor

<div align="center">

**A lightning-fast terminal-based code editor with AI integration and LSP support**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

## 🚀 Features

### ⚡ Core Editor Features
- **Lightning-fast terminal interface** - Vim-inspired keybindings for maximum efficiency
- **Multi-tab support** - Work with multiple files simultaneously
- **Syntax highlighting** - Powered by highlight.js for 180+ languages
- **Undo/Redo system** - Never lose your work with comprehensive history
- **Smart cursor movement** - Navigate code with precision

### 🧠 AI Integration
- **Local AI model support** - Powered by Tetherto QVAC SDK
- **AI-powered code completion** - Get intelligent suggestions as you type
- **AI code editing** - Let AI rewrite entire files based on your instructions
- **Interactive chat** - Ask questions about your code and get instant answers
- **Context-aware assistance** - AI understands your current file and project structure

### 🔧 Language Server Protocol (LSP)
- **TypeScript/JavaScript support** - Full IntelliSense with tsserver
- **Go to definition** - Jump to symbol definitions instantly
- **Real-time diagnostics** - See errors and warnings as you type
- **Auto-completion** - Smart code completion from LSP servers
- **Configurable servers** - Support for multiple LSP servers

### 📁 File Management
- **Smart file loading** - Automatic encoding detection
- **Save/Save-as functionality** - Flexible file operations
- **Project-aware** - Understands your workspace structure
- **Buffer management** - Efficient memory usage for large files

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- GitHub account with Personal Access Token

### Install from GitHub Package Registry
```bash
# 1. Configure npm to use GitHub Package Registry for @ishanvohra2 scope
echo "@ishanvohra2:registry=https://npm.pkg.github.com" >> ~/.npmrc

# 2. Authenticate with GitHub (requires Personal Access Token with 'read:packages' scope)
# Create token at: https://github.com/settings/tokens
npm login --scope=@ishanvohra2 --registry=https://npm.pkg.github.com

# 3. Install globally
npm install -g @ishanvohra2/xlr8

# 4. Or use directly without installing
npx @ishanvohra2/xlr8 [filename]
```

### Install from source
```bash
git clone https://github.com/ishanvohra2/xlr8.git
cd xlr8
npm install
npm run build
npm link  # Optional: make xlr8 available globally
```

### Run locally (development)
```bash
npm run dev [filename]
```

## 🎮 Usage

### Basic Commands

```bash
# Start editor with empty buffer
xlr8
# or if using npx
npx @ishanvohra2/xlr8

# Open a specific file
xlr8 main.ts
# or if using npx
npx @ishanvohra2/xlr8 main.ts

# Open with debug mode
xlr8 --debug main.js

# Show help
xlr8 --help
```

### LSP Commands

```bash
# Create default LSP configuration
xlr8 --lsp-config

# List available LSP servers
xlr8 --lsp-list

# The config file will be created at ~/.config/xlr8/lsp-config.json
```

### AI Model Commands

```bash
# Create default model configuration
xlr8 --model-config

# Show current model settings
xlr8 --model-show

# Reset model configuration
xlr8 --model-reset

# Configure model parameters
xlr8 --temp 0.7              # Set temperature (0.0-2.0)
xlr8 --ctx-size 4096         # Set context size (512-32768)
xlr8 --device gpu            # Set device (cpu/gpu)
xlr8 --gpu-layers 32         # Set GPU layers (0-100)
```

## ⌨️ Keybindings

### Navigation
- `h/j/k/l` - Move cursor left/down/up/right
- `w/b` - Move by word forward/backward
- `0/$` - Move to beginning/end of line
- `gg/G` - Go to first/last line
- `Ctrl+D` - Go to definition (LSP)

### Editing
- `i/a` - Enter insert mode (before/after cursor)
- `I/A` - Insert at beginning/end of line
- `o/O` - Open new line below/above
- `x` - Delete character
- `dd` - Delete line
- `yy` - Copy line
- `p` - Paste

### File Operations
- `Ctrl+S` - Save file
- `Ctrl+Q` - Quit editor
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo

### Tab Management
- `Ctrl+T` - New tab
- `Ctrl+W` - Close current tab
- `Ctrl+Tab` - Next tab
- `Ctrl+Shift+Tab` - Previous tab

### AI Features
- `Shift+Tab` - Trigger AI completion (in insert mode)
- `Ctrl+Shift+Z` - Undo AI edit
- `Ctrl+H` - Toggle chat panel
- `Ctrl+J/K` - Scroll chat up/down

### Command Mode
- `:w` - Save file
- `:q` - Quit
- `:wq` - Save and quit
- `:ai ask [question]` - Ask AI about code
- `:ai edit [instruction]` - Let AI edit your code
- `:ai complete` - Get AI code completion

## 🔧 Configuration

### LSP Configuration
Create `~/.config/xlr8/lsp-config.json`:

```json
{
  "servers": [
    {
      "name": "typescript-language-server",
      "command": "typescript-language-server",
      "args": ["--stdio"],
      "fileExtensions": [".ts", ".tsx", ".js", ".jsx"],
      "enabled": true
    }
  ],
  "defaultServer": "typescript-language-server"
}
```

### AI Model Configuration
Create `~/.config/xlr8/model-config.json`:

```json
{
  "defaultModel": "https://huggingface.co/microsoft/DialoGPT-medium/resolve/main/pytorch_model.bin",
  "modelConfig": {
    "ctx_size": 2048,
    "temp": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "device": "cpu",
    "gpu_layers": 0,
    "system_prompt": "You are a helpful coding assistant."
  }
}
```

## 🏗️ Architecture

XLR8 is built with a modular architecture:

- **Editor** - Main editor controller and event handling
- **BufferManager** - Text buffer operations and cursor management
- **TabManager** - Multi-tab functionality
- **LSPManager** - Language Server Protocol integration
- **InferenceManager** - AI model management and inference
- **ChatManager** - AI chat session management
- **TerminalRenderer** - Terminal UI rendering and display
- **SyntaxHighlighter** - Code syntax highlighting

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/yourusername/xlr8.git
cd xlr8
npm install
npm run dev
```

### Running Tests

```bash
npm test
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Ben 10 Series** - Inspiration for the XLR8 name and logo design
- **Vim** - Keybinding inspiration and modal editing concepts
- **VS Code** - LSP integration patterns
- **Tetherto QVAC SDK** - AI model integration
- **highlight.js** - Syntax highlighting engine
- **terminal-kit** - Terminal interface library

## 🐛 Known Issues

- Chat panel scrolling may be slow with very long conversations
- Some LSP servers may require additional configuration
- AI model loading can take time on first startup

## 🗺️ Roadmap

- [ ] Plugin system for extensibility
- [ ] More LSP server configurations
- [ ] Improved AI model selection
- [ ] File tree explorer
- [ ] Search and replace functionality
- [ ] Git integration
- [ ] Themes and customization
- [ ] Performance optimizations

---

<div align="center">

**Made with ⚡ by the XLR8 team**

*"It's hero time!"* - Ben Tennyson

</div>