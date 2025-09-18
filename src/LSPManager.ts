import { LSPClient, LSPPosition, LSPCompletionResponse, LSPDiagnostic, LSPPublishDiagnosticsParams, LSPDefinitionResponse, LSPLocation } from './LSPClient';
import { BufferManager, Position } from './BufferManager';
import { LSPConfigManager, LSPServerConfig } from './LSPConfigManager';
import * as path from 'path';

export interface CompletionSuggestion {
  label: string;
  kind: string;
  insertText: string;
  range: {
    start: Position;
    end: Position;
  };
}

export interface DefinitionLocation {
  filePath: string;
  position: Position;
}

export class LSPManager {
  private client: LSPClient;
  private currentUri: string | null = null;
  private diagnostics: Map<string, LSPDiagnostic[]> = new Map();
  private isEnabled: boolean = false;
  private debugMode: boolean = false;
  private configManager: LSPConfigManager;
  private currentServerConfig: LSPServerConfig | null = null;

  constructor(debugMode: boolean = false) {
    this.configManager = new LSPConfigManager();
    this.client = new LSPClient();
    this.debugMode = debugMode;
    this.setupDiagnosticsHandler();
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  private debugLog(message: string, ...args: any[]): void {
    if (this.debugMode) {
      console.log(message, ...args);
    }
  }

  private setupDiagnosticsHandler(): void {
    this.client.setDiagnosticsHandler((params: LSPPublishDiagnosticsParams) => {
      this.diagnostics.set(params.uri, params.diagnostics);
    });
  }

  async initialize(workspaceRoot: string, filePath?: string): Promise<void> {
    try {
      // Determine which LSP server to use based on the file
      if (filePath) {
        this.currentServerConfig = this.configManager.getServerForFile(filePath);
        if (!this.currentServerConfig) {
          this.debugLog(`No LSP server configured for file: ${filePath}`);
          this.isEnabled = false;
          return;
        }
        
        this.debugLog(`Using LSP server: ${this.currentServerConfig.name} for file: ${filePath}`);
        
        // Create a new client with the appropriate server config
        this.client = new LSPClient(this.currentServerConfig);
        this.setupDiagnosticsHandler();
      }
      
      await this.client.start(workspaceRoot);
      this.isEnabled = true;
    } catch (error) {
      console.error('Failed to initialize LSP:', error);
      this.isEnabled = false;
    }
  }

  isReady(): boolean {
    return this.isEnabled && this.client.isReady();
  }

  openDocument(filePath: string, buffer: BufferManager): void {
    if (!this.isReady()) return;

    const uri = this.getFileUri(filePath);
    this.currentUri = uri;
    
    const languageId = this.getLanguageId(filePath);
    const content = buffer.getContent();
    
    this.client.notifyDidOpen(uri, languageId, 1, content);
  }

  updateDocument(filePath: string, buffer: BufferManager): void {
    if (!this.isReady() || !this.currentUri) return;

    const content = buffer.getContent();
    this.client.notifyDidChange(this.currentUri, 1, content);
  }

  saveDocument(filePath: string, buffer: BufferManager): void {
    if (!this.isReady() || !this.currentUri) return;

    const content = buffer.getContent();
    this.client.notifyDidSave(this.currentUri, content);
  }

  closeDocument(): void {
    if (!this.isReady() || !this.currentUri) return;

    this.client.notifyDidClose(this.currentUri);
    this.currentUri = null;
  }

  async getCompletions(filePath: string, position: Position): Promise<CompletionSuggestion[]> {
    if (!this.isReady() || !this.currentUri) return [];

    try {
      const lspPosition: LSPPosition = {
        line: position.row,
        character: position.col
      };

      // console.log('Sending completion request to LSP:', { filePath, position, lspPosition });

      const response = await this.client.requestCompletion(this.currentUri, lspPosition);
      return this.convertCompletions(response, position);
    } catch (error) {
      console.error('Failed to get completions:', error);
      return [];
    }
  }

  private convertCompletions(response: LSPCompletionResponse, position: Position): CompletionSuggestion[] {
    return response.items.map(item => {
      // console.log('LSP Completion Item:', { label: item.label, textEdit: item.textEdit, sortText: item.sortText });
      
      const completion = {
        label: item.label,
        kind: this.getCompletionKind(item.kind),
        insertText: item.textEdit?.newText || item.label,
        range: item.textEdit ? {
          start: {
            row: item.textEdit.range.start.line,
            col: item.textEdit.range.start.character
          },
          end: {
            row: item.textEdit.range.end.line,
            col: item.textEdit.range.end.character
          }
        } : {
          start: position,
          end: position
        }
      };
      
      // Fix: If the LSP returns a range on the wrong row, correct it
      if (completion.range.start.row !== position.row) {
        console.log('Fixing LSP range - LSP returned row', completion.range.start.row, 'but position is row', position.row);
        completion.range.start.row = position.row;
        completion.range.end.row = position.row;
      }
      
      // console.log('Converted completion:', completion.label, 'range:', completion.range, 'insertText:', completion.insertText);
      return completion;
    });
  }

  private getCompletionKind(kind: number): string {
    // LSP CompletionItemKind enum values
    switch (kind) {
      case 1: return 'text';
      case 2: return 'method';
      case 3: return 'function';
      case 4: return 'constructor';
      case 5: return 'field';
      case 6: return 'variable';
      case 7: return 'class';
      case 8: return 'interface';
      case 9: return 'module';
      case 10: return 'property';
      case 11: return 'unit';
      case 12: return 'value';
      case 13: return 'enum';
      case 14: return 'keyword';
      case 15: return 'snippet';
      case 16: return 'color';
      case 17: return 'file';
      case 18: return 'reference';
      case 19: return 'folder';
      case 20: return 'enumMember';
      case 21: return 'constant';
      case 22: return 'struct';
      case 23: return 'event';
      case 24: return 'operator';
      case 25: return 'typeParameter';
      default: return 'text';
    }
  }

  private getFileUri(filePath: string): string {
    return `file://${path.resolve(filePath)}`;
  }

  private getLanguageId(filePath: string): string {
    return this.configManager.getLanguageId(filePath);
  }

  getDiagnostics(filePath: string): LSPDiagnostic[] {
    const uri = this.getFileUri(filePath);
    return this.diagnostics.get(uri) || [];
  }

  async getDefinition(filePath: string, position: Position): Promise<DefinitionLocation[]> {
    if (!this.isReady() || !this.currentUri) return [];

    try {
      const lspPosition: LSPPosition = {
        line: position.row,
        character: position.col
      };

      const response = await this.client.requestDefinition(this.currentUri, lspPosition);
      return this.convertDefinitionResponse(response);
    } catch (error) {
      console.error('Failed to get definition:', error);
      return [];
    }
  }

  private convertDefinitionResponse(response: LSPDefinitionResponse): DefinitionLocation[] {
    const locations: DefinitionLocation[] = [];

    // Handle single location
    if (response.location) {
      locations.push(this.convertLSPLocation(response.location));
    }

    // Handle multiple locations
    if (response.locations) {
      for (const location of response.locations) {
        locations.push(this.convertLSPLocation(location));
      }
    }

    return locations;
  }

  private convertLSPLocation(location: LSPLocation): DefinitionLocation {
    const filePath = this.getFilePathFromUri(location.uri);
    return {
      filePath,
      position: {
        row: location.range.start.line,
        col: location.range.start.character
      }
    };
  }

  private getFilePathFromUri(uri: string): string {
    // Convert file:// URI to file path
    if (uri.startsWith('file://')) {
      return uri.substring(7); // Remove 'file://' prefix
    }
    return uri;
  }

  stop(): void {
    this.client.stop();
    this.isEnabled = false;
    this.currentUri = null;
    this.diagnostics.clear();
  }

  // Configuration management methods
  getConfigManager(): LSPConfigManager {
    return this.configManager;
  }

  getCurrentServerConfig(): LSPServerConfig | null {
    return this.currentServerConfig;
  }

  async switchServer(serverName: string, workspaceRoot: string): Promise<void> {
    const servers = this.configManager.listEnabledServers();
    const newServerConfig = servers.find(s => s.name === serverName);
    
    if (!newServerConfig) {
      throw new Error(`Server '${serverName}' not found or not enabled`);
    }

    // Stop current server
    if (this.isEnabled) {
      this.stop();
    }

    // Start new server
    this.currentServerConfig = newServerConfig;
    this.client = new LSPClient(newServerConfig);
    this.setupDiagnosticsHandler();
    
    await this.client.start(workspaceRoot);
    this.isEnabled = true;
    
    this.debugLog(`Switched to LSP server: ${serverName}`);
  }

  listAvailableServers(): LSPServerConfig[] {
    return this.configManager.listServers();
  }

  listEnabledServers(): LSPServerConfig[] {
    return this.configManager.listEnabledServers();
  }

  enableServer(serverName: string): void {
    this.configManager.enableServer(serverName);
  }

  disableServer(serverName: string): void {
    this.configManager.disableServer(serverName);
  }

  setDefaultServer(serverName: string): void {
    this.configManager.setDefaultServer(serverName);
  }

  getConfigPath(): string {
    return this.configManager.getConfigPath();
  }

  createDefaultConfigFile(): void {
    this.configManager.createDefaultConfigFile();
  }
}
