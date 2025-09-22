# XLR8 - Terminal Code Editor

<div align="center">

<img src="logo.jpg" alt="XLR8 Logo" width="200" style="border-radius: 50%; object-fit: cover;"/>

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
# Create default model configuration file
xlr8 --model-config

# Show current model configuration and settings
xlr8 --model-show

# Reset model configuration to defaults
xlr8 --model-reset

# Configure individual model parameters
xlr8 --temp 0.7              # Set temperature (0.0-2.0, default: 0.7)
xlr8 --ctx-size 8192         # Set context size (512-32768, default: 8192)
xlr8 --device cpu            # Set device type (cpu/gpu, default: cpu)
xlr8 --gpu-layers 0          # Set GPU layers (0-100, default: 0)

# The config file will be created at ~/.config/xlr8/model-config.json

# Examples of combining commands
xlr8 --model-config --temp 0.8 --ctx-size 16384  # Create config and set parameters
xlr8 --device gpu --gpu-layers 32                # Configure for GPU acceleration
```

### Advanced AI Configuration

```bash
# View detailed configuration information
xlr8 --model-show

# Example output shows:
# 🤖 Current Model Configuration:
# 
# Model URL: https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/...
# Context Size: 8192 tokens
# Temperature: 0.7 (creativity level)
# Device: cpu
# GPU Layers: 0
# Auto Load: true

# Quick setup for different use cases
xlr8 --temp 0.3 --ctx-size 4096    # Conservative, focused coding
xlr8 --temp 1.0 --ctx-size 16384   # Creative, large context
xlr8 --device gpu --gpu-layers 50  # GPU acceleration setup
```

### AI Configuration Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `--temp` | 0.0-2.0 | 0.7 | Controls randomness/creativity. Lower = more focused, Higher = more creative |
| `--ctx-size` | 512-32768 | 8192 | Maximum context window size in tokens. Larger = more context awareness |
| `--device` | cpu/gpu | cpu | Processing device. GPU requires compatible hardware |
| `--gpu-layers` | 0-100 | 0 | Number of model layers to offload to GPU. Higher = more GPU usage |

### Configuration File Locations

- **AI Model Config**: `~/.config/xlr8/model-config.json`
- **LSP Config**: `~/.config/xlr8/lsp-config.json`

These files are automatically created when you run the respective `--config` commands.

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

### AI Commands (in command mode)
- `:ai ask [question]` - Ask AI about code
- `:ai edit [instruction]` - Let AI edit your code
- `:ai complete` - Get AI code completion

### Chat Management Commands
- `:chat show` - Show AI chat panel
- `:chat hide` - Hide AI chat panel
- `:chat clear` - Clear current chat session
- `:chat scroll` - Scroll through chat history

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
  "defaultModel": "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q2_k.gguf",
  "modelConfig": {
    "ctx_size": 8192,
    "temp": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "device": "cpu",
    "gpu_layers": 0,
    "system_prompt": "You are a helpful AI coding assistant. Provide clear, concise, and accurate code suggestions and explanations."
  },
  "autoLoad": true
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