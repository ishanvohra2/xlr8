import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { LSPServerConfig } from './LSPConfigManager';

export interface LSPPosition {
  line: number;
  character: number;
}

export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

export interface LSPCompletionItem {
  label: string;
  kind: number;
  sortText: string;
  textEdit?: {
    range: LSPRange;
    newText: string;
  };
  data?: any;
}

export interface LSPCompletionResponse {
  items: LSPCompletionItem[];
  isIncomplete: boolean;
}

export interface LSPDiagnostic {
  range: LSPRange;
  severity: number;
  message: string;
  source?: string;
}

export interface LSPPublishDiagnosticsParams {
  uri: string;
  diagnostics: LSPDiagnostic[];
}

export interface LSPLocation {
  uri: string;
  range: LSPRange;
}

export interface LSPDefinitionResponse {
  locations?: LSPLocation[];
  location?: LSPLocation;
}

export interface LSPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export type LSPMessageHandler = (message: LSPMessage) => void;
export type DiagnosticsHandler = (params: LSPPublishDiagnosticsParams) => void;

export class LSPClient {
  private server: ChildProcess | null = null;
  private messageBuffer: string = '';
  private nextId: number = 1;
  private messageHandlers: Map<number, (response: LSPMessage) => void> = new Map();
  private notificationHandlers: Map<string, LSPMessageHandler> = new Map();
  private isInitialized: boolean = false;
  private rootUri: string = '';
  private diagnosticsHandler: DiagnosticsHandler | null = null;
  private messageCount: number = 0;
  private errorCount: number = 0;
  private serverConfig: LSPServerConfig | null = null;

  constructor(serverConfig?: LSPServerConfig) {
    this.serverConfig = serverConfig || null;
    this.setupNotificationHandlers();
  }

  private setupNotificationHandlers(): void {
    this.notificationHandlers.set('textDocument/publishDiagnostics', (message) => {
      if (this.diagnosticsHandler && message.params) {
        this.diagnosticsHandler(message.params);
      }
    });
  }

  setDiagnosticsHandler(handler: DiagnosticsHandler): void {
    this.diagnosticsHandler = handler;
  }

  async start(workspaceRoot: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.rootUri = `file://${workspaceRoot}`;
        
        // Use configured server or fall back to TypeScript language server
        const command = this.serverConfig?.command || 'typescript-language-server';
        const args = this.serverConfig?.args || ['--stdio'];
        
        console.log(`Starting LSP server: ${command} ${args.join(' ')}`);
        this.server = spawn(command, args, {
          cwd: workspaceRoot
        });

        // Handle server output
        this.server.stdout?.on('data', (data) => {
          this.handleServerData(data);
        });

        // Handle server errors
        this.server.stderr?.on('data', (data) => {
          console.error('LSP Server Error:', data.toString());
        });

        this.server.on('error', (error) => {
          console.error('Failed to start LSP server:', error);
          reject(error);
        });

        this.server.on('exit', (code) => {
          console.log(`LSP server exited with code ${code}`);
        });

        // Initialize the server
        this.initialize().then(() => {
          this.isInitialized = true;
          resolve();
        }).catch(reject);

      } catch (error) {
        reject(error);
      }
    });
  }

  private async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const initId = this.nextId++;
      
      this.messageHandlers.set(initId, (response) => {
        if (response.error) {
          reject(new Error(`LSP initialization failed: ${response.error.message}`));
          return;
        }
        
        // Send initialized notification
        this.notify('initialized', {});
        resolve();
      });

      const initializationOptions = this.serverConfig?.initializationOptions || {};
      
      this.send('initialize', {
        processId: process.pid,
        rootUri: this.rootUri,
        initializationOptions,
        capabilities: {
          textDocument: {
            completion: {
              dynamicRegistration: false,
              completionItem: {
                snippetSupport: false
              }
            },
            definition: {
              dynamicRegistration: false
            },
            publishDiagnostics: {}
          }
        }
      }, initId);
    });
  }

  private handleServerData(data: Buffer): void {
    this.messageBuffer += data.toString();
    
    while (true) {
      const headerEnd = this.messageBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.messageBuffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/);
      if (!match) {
        // Invalid header, clear buffer to prevent infinite loop
        console.error('Invalid LSP header, clearing buffer:', header);
        this.messageBuffer = '';
        break;
      }

      const length = parseInt(match[1], 10);
      
      // Validate length to prevent memory issues
      if (length < 0 || length > 1000000) { // 1MB max
        console.error('Invalid LSP message length:', length);
        this.messageBuffer = '';
        break;
      }
      
      const total = headerEnd + 4 + length;
      if (this.messageBuffer.length < total) break;

      const body = this.messageBuffer.slice(headerEnd + 4, total);
      this.messageBuffer = this.messageBuffer.slice(total);

      // Validate JSON before parsing
      if (body.trim().length === 0) {
        console.warn('Empty LSP message body, skipping');
        continue;
      }

      try {
        this.messageCount++;
        const message: LSPMessage = JSON.parse(body);
        this.handleMessage(message);
      } catch (error) {
        this.errorCount++;
        console.error(`Failed to parse LSP message #${this.messageCount} (error #${this.errorCount}):`, error);
        console.error('Expected length:', length, 'Actual body length:', body.length);
        console.error('Message body (first 200 chars):', body.substring(0, 200));
        console.error('Message body (last 200 chars):', body.substring(Math.max(0, body.length - 200)));
        
        // Try to recover by finding valid JSON boundaries
        this.tryRecoverFromCorruptedMessage(body);
        
        // If we have too many errors, consider restarting the LSP server
        if (this.errorCount > 10) {
          console.error('Too many LSP parsing errors, consider restarting the editor');
        }
        
        // Continue processing other messages
      }
    }
  }

  private tryRecoverFromCorruptedMessage(body: string): void {
    // Try to find valid JSON objects in the corrupted message
    const jsonStart = body.indexOf('{');
    if (jsonStart === -1) {
      console.error('No JSON object found in corrupted message');
      return;
    }

    // Try to parse from the first { to the end
    let braceCount = 0;
    let endPos = jsonStart;
    
    for (let i = jsonStart; i < body.length; i++) {
      if (body[i] === '{') braceCount++;
      if (body[i] === '}') braceCount--;
      if (braceCount === 0) {
        endPos = i + 1;
        break;
      }
    }

    if (braceCount === 0) {
      const validJson = body.substring(jsonStart, endPos);
      try {
        const message: LSPMessage = JSON.parse(validJson);
        console.log('Recovered valid JSON from corrupted message');
        this.handleMessage(message);
      } catch (recoveryError) {
        console.error('Failed to recover JSON:', recoveryError);
      }
    } else {
      console.error('Could not find complete JSON object in corrupted message');
    }
  }

  private handleMessage(message: LSPMessage): void {
    // Handle responses to requests
    if (message.id !== undefined && this.messageHandlers.has(message.id)) {
      const handler = this.messageHandlers.get(message.id)!;
      this.messageHandlers.delete(message.id);
      handler(message);
      return;
    }

    // Handle notifications
    if (message.method && this.notificationHandlers.has(message.method)) {
      const handler = this.notificationHandlers.get(message.method)!;
      handler(message);
      return;
    }

    // Log unhandled messages for debugging
    console.log('Unhandled LSP message:', message);
  }

  private send(method: string, params: any, id?: number): void {
    if (!this.server || !this.server.stdin) {
      throw new Error('LSP server not started');
    }

    const message: LSPMessage = {
      jsonrpc: '2.0',
      method,
      params
    };

    if (id !== undefined) {
      message.id = id;
    }

    const msg = JSON.stringify(message);
    const contentLength = Buffer.byteLength(msg, 'utf8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    
    this.server.stdin.write(header + msg);
  }

  private notify(method: string, params: any): void {
    this.send(method, params);
  }

  async requestCompletion(uri: string, position: LSPPosition): Promise<LSPCompletionResponse> {
    return new Promise((resolve, reject) => {
      if (!this.isInitialized) {
        reject(new Error('LSP client not initialized'));
        return;
      }

      const id = this.nextId++;
      this.messageHandlers.set(id, (response) => {
        if (response.error) {
          reject(new Error(`Completion request failed: ${response.error.message}`));
          return;
        }
        resolve(response.result || { items: [], isIncomplete: false });
      });

      this.send('textDocument/completion', {
        textDocument: { uri },
        position
      }, id);
    });
  }

  async requestDefinition(uri: string, position: LSPPosition): Promise<LSPDefinitionResponse> {
    return new Promise((resolve, reject) => {
      if (!this.isInitialized) {
        reject(new Error('LSP client not initialized'));
        return;
      }

      const id = this.nextId++;
      this.messageHandlers.set(id, (response) => {
        if (response.error) {
          reject(new Error(`Definition request failed: ${response.error.message}`));
          return;
        }
        resolve(response.result || {});
      });

      this.send('textDocument/definition', {
        textDocument: { uri },
        position
      }, id);
    });
  }

  notifyDidOpen(uri: string, languageId: string, version: number, text: string): void {
    if (!this.isInitialized) return;

    this.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text
      }
    });
  }

  notifyDidChange(uri: string, version: number, text: string): void {
    if (!this.isInitialized) return;

    this.notify('textDocument/didChange', {
      textDocument: {
        uri,
        version
      },
      contentChanges: [{
        text
      }]
    });
  }

  notifyDidSave(uri: string, text: string): void {
    if (!this.isInitialized) return;

    this.notify('textDocument/didSave', {
      textDocument: {
        uri
      },
      text
    });
  }

  notifyDidClose(uri: string): void {
    if (!this.isInitialized) return;

    this.notify('textDocument/didClose', {
      textDocument: {
        uri
      }
    });
  }

  stop(): void {
    if (this.server) {
      this.server.kill();
      this.server = null;
    }
    this.isInitialized = false;
    this.messageHandlers.clear();
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getServerConfig(): LSPServerConfig | null {
    return this.serverConfig;
  }

  setServerConfig(config: LSPServerConfig): void {
    this.serverConfig = config;
  }
}
