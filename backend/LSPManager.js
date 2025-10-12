const { LSPClient } = require('./LSPClient.js');
const process = require('bare-process');

/**
 * LSPManager - Manages multiple LSP clients (one per language)
 */
class LSPManager {
  constructor() {
    this.clients = new Map(); // languageId -> LSPClient
    this.rootPath = process.cwd();
    
    // Default server configurations
    this.serverConfigs = {
      javascript: {
        command: 'typescript-language-server',
        args: ['--stdio'],
        languageId: 'javascript'
      },
      typescript: {
        command: 'typescript-language-server',
        args: ['--stdio'],
        languageId: 'typescript'
      },
      python: {
        command: 'pyright-langserver',
        args: ['--stdio'],
        languageId: 'python'
      }
    };
  }

  /**
   * Set the workspace root path
   */
  setRootPath(rootPath) {
    this.rootPath = rootPath;
    console.log('[LSPManager] Root path set to:', rootPath);
  }

  /**
   * Get language ID from file extension
   */
  getLanguageIdFromFile(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const extMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python'
    };
    return extMap[ext] || null;
  }

  /**
   * Start an LSP server for a specific language
   */
  async startServer(languageId) {
    // Check if already running
    if (this.clients.has(languageId)) {
      console.log(`[LSPManager] Server for ${languageId} already running`);
      return this.clients.get(languageId);
    }

    // Get server config
    const config = this.serverConfigs[languageId];
    if (!config) {
      throw new Error(`No LSP server configured for language: ${languageId}`);
    }

    console.log(`[LSPManager] Starting ${languageId} language server...`);

    // Create and start client
    const client = new LSPClient(config.command, config.args);
    
    try {
      client.start();
      await client.initialize(this.rootPath);
      
      this.clients.set(languageId, client);
      console.log(`[LSPManager] ${languageId} server started successfully`);
      
      return client;
    } catch (error) {
      console.error(`[LSPManager] Failed to start ${languageId} server:`, error.message);
      throw error;
    }
  }

  /**
   * Get or start a client for a language
   */
  async getClient(languageId) {
    if (!this.clients.has(languageId)) {
      await this.startServer(languageId);
    }
    return this.clients.get(languageId);
  }

  /**
   * Stop all language servers
   */
  stopAll() {
    console.log('[LSPManager] Stopping all language servers');
    for (const [languageId, client] of this.clients.entries()) {
      console.log(`[LSPManager] Stopping ${languageId}`);
      client.stop();
    }
    this.clients.clear();
  }

  /**
   * Request completions for a file
   */
  async requestCompletion(filePath, line, character, content) {
    const languageId = this.getLanguageIdFromFile(filePath);
    if (!languageId) {
      throw new Error(`Unsupported file type: ${filePath}`);
    }

    const client = await this.getClient(languageId);
    
    // Make sure document is synced
    client.didOpen(filePath, languageId, content);
    
    // Small delay to let server process
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Request completions
    const completions = await client.completion(filePath, line, character);
    
    return completions;
  }
}

module.exports = { LSPManager };

