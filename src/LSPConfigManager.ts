import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LSPServerConfig {
  name: string;
  command: string;
  args: string[];
  fileExtensions: string[];
  languageIds: string[];
  initializationOptions?: any;
  settings?: any;
  enabled: boolean;
}

export interface LSPConfig {
  servers: LSPServerConfig[];
  defaultServer?: string;
  autoDetect: boolean;
}

export class LSPConfigManager {
  private config: LSPConfig;
  private configPath: string;
  private defaultConfigPath: string;

  constructor() {
    // Config file locations (in order of preference)
    const configDir = path.join(os.homedir(), '.xlr8');
    this.configPath = path.join(configDir, 'lsp-config.json');
    this.defaultConfigPath = path.join(__dirname, '..', 'config', 'default-lsp-config.json');
    
    this.config = this.loadConfig();
  }

  private loadConfig(): LSPConfig {
    try {
      // Try to load user config first
      if (fs.existsSync(this.configPath)) {
        const userConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        return this.validateAndMergeConfig(userConfig);
      }

      // Fall back to default config
      if (fs.existsSync(this.defaultConfigPath)) {
        const defaultConfig = JSON.parse(fs.readFileSync(this.defaultConfigPath, 'utf8'));
        return this.validateAndMergeConfig(defaultConfig);
      }

      // If no config files exist, return built-in defaults
      return this.getBuiltInDefaults();
    } catch (error) {
      console.warn('Failed to load LSP config, using built-in defaults:', error);
      return this.getBuiltInDefaults();
    }
  }

  private validateAndMergeConfig(config: any): LSPConfig {
    // Validate the config structure
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid config format');
    }

    if (!Array.isArray(config.servers)) {
      throw new Error('Config must have a servers array');
    }

    // Validate each server config
    for (const server of config.servers) {
      if (!server.name || !server.command || !Array.isArray(server.args) || 
          !Array.isArray(server.fileExtensions) || !Array.isArray(server.languageIds)) {
        throw new Error(`Invalid server config: ${JSON.stringify(server)}`);
      }
    }

    return {
      servers: config.servers,
      defaultServer: config.defaultServer,
      autoDetect: config.autoDetect !== false // Default to true
    };
  }

  private getBuiltInDefaults(): LSPConfig {
    return {
      servers: [
        {
          name: 'typescript-language-server',
          command: 'typescript-language-server',
          args: ['--stdio'],
          fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
          languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
          enabled: true
        },
        {
          name: 'pyright',
          command: 'pyright-langserver',
          args: ['--stdio'],
          fileExtensions: ['.py'],
          languageIds: ['python'],
          enabled: false
        },
        {
          name: 'rust-analyzer',
          command: 'rust-analyzer',
          args: [],
          fileExtensions: ['.rs'],
          languageIds: ['rust'],
          enabled: false
        },
        {
          name: 'gopls',
          command: 'gopls',
          args: [],
          fileExtensions: ['.go'],
          languageIds: ['go'],
          enabled: false
        },
        {
          name: 'clangd',
          command: 'clangd',
          args: ['--background-index'],
          fileExtensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'],
          languageIds: ['c', 'cpp'],
          enabled: false
        },
        {
          name: 'java-language-server',
          command: 'java',
          args: ['-jar', '/path/to/java-language-server.jar'],
          fileExtensions: ['.java'],
          languageIds: ['java'],
          enabled: false
        }
      ],
      defaultServer: 'typescript-language-server',
      autoDetect: true
    };
  }

  getConfig(): LSPConfig {
    return this.config;
  }

  getServerForFile(filePath: string): LSPServerConfig | null {
    const ext = path.extname(filePath).toLowerCase();
    
    // Find enabled servers that support this file extension
    const compatibleServers = this.config.servers.filter(server => 
      server.enabled && server.fileExtensions.includes(ext)
    );

    if (compatibleServers.length === 0) {
      return null;
    }

    // If there's a default server and it's compatible, use it
    if (this.config.defaultServer) {
      const defaultServer = compatibleServers.find(server => 
        server.name === this.config.defaultServer
      );
      if (defaultServer) {
        return defaultServer;
      }
    }

    // Otherwise, return the first compatible server
    return compatibleServers[0];
  }

  getLanguageId(filePath: string): string {
    const server = this.getServerForFile(filePath);
    if (!server) {
      return 'plaintext';
    }

    const ext = path.extname(filePath).toLowerCase();
    
    // Map file extensions to language IDs based on server config
    switch (ext) {
      case '.ts':
        return 'typescript';
      case '.tsx':
        return 'typescriptreact';
      case '.js':
        return 'javascript';
      case '.jsx':
        return 'javascriptreact';
      case '.py':
        return 'python';
      case '.rs':
        return 'rust';
      case '.go':
        return 'go';
      case '.c':
        return 'c';
      case '.cpp':
      case '.cc':
      case '.cxx':
        return 'cpp';
      case '.h':
      case '.hpp':
        return server.languageIds.includes('cpp') ? 'cpp' : 'c';
      case '.java':
        return 'java';
      case '.json':
        return 'json';
      default:
        return 'plaintext';
    }
  }

  saveConfig(config: LSPConfig): void {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Save the config
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      this.config = config;
    } catch (error) {
      throw new Error(`Failed to save LSP config: ${error}`);
    }
  }

  createDefaultConfigFile(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const defaultConfig = this.getBuiltInDefaults();
      fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
      console.log(`Created default LSP config at: ${this.configPath}`);
    } catch (error) {
      throw new Error(`Failed to create default config file: ${error}`);
    }
  }

  getConfigPath(): string {
    return this.configPath;
  }

  enableServer(serverName: string): void {
    const server = this.config.servers.find(s => s.name === serverName);
    if (server) {
      server.enabled = true;
      this.saveConfig(this.config);
    }
  }

  disableServer(serverName: string): void {
    const server = this.config.servers.find(s => s.name === serverName);
    if (server) {
      server.enabled = false;
      this.saveConfig(this.config);
    }
  }

  setDefaultServer(serverName: string): void {
    const server = this.config.servers.find(s => s.name === serverName);
    if (server && server.enabled) {
      this.config.defaultServer = serverName;
      this.saveConfig(this.config);
    }
  }

  addCustomServer(server: LSPServerConfig): void {
    // Check if server with same name already exists
    const existingIndex = this.config.servers.findIndex(s => s.name === server.name);
    if (existingIndex >= 0) {
      // Replace existing server
      this.config.servers[existingIndex] = server;
    } else {
      // Add new server
      this.config.servers.push(server);
    }
    this.saveConfig(this.config);
  }

  removeServer(serverName: string): void {
    this.config.servers = this.config.servers.filter(s => s.name !== serverName);
    
    // If we removed the default server, clear the default
    if (this.config.defaultServer === serverName) {
      this.config.defaultServer = undefined;
    }
    
    this.saveConfig(this.config);
  }

  listServers(): LSPServerConfig[] {
    return [...this.config.servers];
  }

  listEnabledServers(): LSPServerConfig[] {
    return this.config.servers.filter(s => s.enabled);
  }
}
