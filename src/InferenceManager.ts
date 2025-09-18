import { loadModel, completion, unloadModel } from '@tetherto/qvac-sdk';
import { type ModelProgressUpdate, type Tool } from '@tetherto/qvac-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { ModelConfigManager, type ModelConfig } from './ModelConfigManager';

type Message = {
    role: "system" | "user" | "assistant";
    content: string;
    attachments?: Attachment[];
};

type Attachment = {
    path: string
}

type EditorContext = {
    currentFile?: string;
    currentContent?: string;
    cursorPosition?: { row: number; col: number };
    projectRoot?: string;
    availableFiles?: string[];
}

export class InferenceManager {

    private modelId: string | null = null;
    private context: EditorContext = {};
    private modelLoading: boolean = false;
    private modelLoadPromise: Promise<void> | null = null;
    private modelConfigManager: ModelConfigManager;

    constructor() {
        this.modelId = null;
        this.modelConfigManager = new ModelConfigManager();
    }

    async loadLocalModel(url?: string, onProgress?: (progress: ModelProgressUpdate) => void) {
        // If already loading, return the existing promise
        if (this.modelLoading && this.modelLoadPromise) {
            return this.modelLoadPromise;
        }

        // If already loaded, return immediately
        if (this.modelId) {
            return Promise.resolve();
        }

        // Use configured model URL if not provided
        const modelUrl = url || this.modelConfigManager.getConfig().defaultModel;
        if (!modelUrl) {
            throw new Error('No model URL provided and no default model configured');
        }

        this.modelLoading = true;
        this.modelLoadPromise = this._loadModel(modelUrl, onProgress);
        
        try {
            await this.modelLoadPromise;
        } catch (error) {
            // Reset model state on error to allow retry
            this.modelId = null;
            console.error('Model loading failed, state reset for retry:', error);
            throw error;
        } finally {
            this.modelLoading = false;
            this.modelLoadPromise = null;
        }
    }

    private async _loadModel(url: string, onProgress?: (progress: ModelProgressUpdate) => void) {
        const modelConfig = this.modelConfigManager.getModelConfig();
        
        this.modelId = await loadModel(url, {
            modelType: "llm",
            modelConfig: {
                ctx_size: modelConfig.ctx_size,
                temp: modelConfig.temp,
                top_p: modelConfig.top_p,
                top_k: modelConfig.top_k,
                device: modelConfig.device,
                gpu_layers: modelConfig.gpu_layers,
                system_prompt: modelConfig.system_prompt
            },
            onProgress: onProgress ? (progress) => {
                onProgress(progress);
            } : undefined
        });
    }

    async unloadModel() {
        if (this.modelId) {
            await unloadModel(this.modelId);
            this.modelId = null;
        }
    }

    async generateResponse (history: Message[], onToken: (token: string) => void) {
        if (!this.modelId) {
            throw new Error('Model not loaded');
        }

        let response = "";
        let result;
        
        try {
            result = completion(this.modelId, history, true);
            
            for await (const token of result.tokenStream) {
                onToken(token);
                response += token;
            }
        } catch (error) {
            // Ensure we clean up any partial state
            console.error('Error during AI response generation:', error);
            throw error;
        }

        return response;
    }

    parseCodeFromResponse(response: string): string | null {
        // Look for code blocks in the response
        const codeBlockRegex = /```(?:[\w]*\n)?([\s\S]*?)```/g;
        const matches = [...response.matchAll(codeBlockRegex)];
        
        if (matches.length === 0) {
            return null;
        }
        
        // Return the first code block content
        return matches[0][1].trim();
    }


    setContext(context: EditorContext): void {
        this.context = { ...this.context, ...context };
    }

    isModelReady(): boolean {
        return this.modelId !== null;
    }

    isModelLoading(): boolean {
        return this.modelLoading;
    }

    getModelStatus(): 'ready' | 'loading' | 'not_loaded' {
        if (this.modelId) return 'ready';
        if (this.modelLoading) return 'loading';
        return 'not_loaded';
    }

    getSystemPrompt(mode: 'edit' | 'ask'): string {
        const currentFileContent = this.context.currentContent ? 
            `\n\nCurrent file content (${this.context.currentFile}):\n\`\`\`\n${this.context.currentContent}\n\`\`\`` : '';

        const configuredPrompt = this.modelConfigManager.getModelConfig().system_prompt;
        
        const basePrompt = `${configuredPrompt}

You are integrated into the XLR8 code editor.

Current context:
- Current file: ${this.context.currentFile || 'None'}
- Cursor position: ${this.context.cursorPosition ? `line ${this.context.cursorPosition.row + 1}, col ${this.context.cursorPosition.col + 1}` : 'Unknown'}
- Project root: ${this.context.projectRoot || 'Unknown'}${currentFileContent}`;

        if (mode === 'edit') {
            return basePrompt + `

You are in EDIT mode. You need to rewrite the entire file with the requested changes.

Instructions:
- Analyze the current file content and the user's request
- Rewrite the ENTIRE file with your modifications
- Wrap your response in code blocks like this:

\`\`\`
[your complete rewritten file content here]
\`\`\`

Rules:
- Always provide the complete file content, not just the changes
- Make only the changes requested while preserving the existing code structure
- Ensure the code is syntactically correct and functional
- Include all necessary imports and exports
- Maintain proper formatting and indentation`;
        } else {
            return basePrompt + `

You are in ASK mode. Your goal is to answer questions about the code without making any changes. You can:
- Explain how code works
- Suggest improvements
- Identify potential issues
- Provide best practices
- Answer questions about the codebase

IMPORTANT: You already have access to the current file content shown above. You can directly analyze and answer questions about the code that's already provided in the context.

Do not modify any files or make any edits. Only provide information and analysis.`;
        }
    }

    // Reset inference manager state (useful for recovery from errors)
    resetState(): void {
        this.modelLoading = false;
        this.modelLoadPromise = null;
        // Note: We don't reset modelId here as the model might still be valid
    }

    // Model configuration methods
    getModelConfigManager(): ModelConfigManager {
        return this.modelConfigManager;
    }

    getModelConfig(): ModelConfig {
        return this.modelConfigManager.getModelConfig();
    }

    updateModelConfig(updates: Partial<ModelConfig>): void {
        this.modelConfigManager.updateModelConfig(updates);
    }

    // Convenience methods for common config updates
    setTemperature(temp: number): void {
        this.modelConfigManager.setTemperature(temp);
    }

    setContextSize(ctx_size: number): void {
        this.modelConfigManager.setContextSize(ctx_size);
    }

    setDevice(device: "cpu" | "gpu"): void {
        this.modelConfigManager.setDevice(device);
    }

    setGpuLayers(gpu_layers: number): void {
        this.modelConfigManager.setGpuLayers(gpu_layers);
    }

    setSystemPrompt(system_prompt: string): void {
        this.modelConfigManager.setSystemPrompt(system_prompt);
    }

    // Method to reload model with new configuration
    async reloadModelWithNewConfig(): Promise<void> {
        if (this.modelId) {
            await this.unloadModel();
        }
        await this.loadLocalModel();
    }
}