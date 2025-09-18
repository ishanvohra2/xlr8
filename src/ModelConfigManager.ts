import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ModelConfig {
  ctx_size: number;
  temp: number;
  top_p: number;
  top_k: number;
  device: "cpu" | "gpu";
  gpu_layers: number;
  system_prompt: string;
}

export interface ModelSettings {
  defaultModel?: string;
  modelConfig: ModelConfig;
  autoLoad: boolean;
}

export class ModelConfigManager {
  private config: ModelSettings;
  private configPath: string;
  private defaultConfigPath: string;

  constructor() {
    // Config file locations (in order of preference)
    const configDir = path.join(os.homedir(), '.xlr8');
    this.configPath = path.join(configDir, 'model-config.json');
    this.defaultConfigPath = path.join(__dirname, '..', 'config', 'default-model-config.json');
    
    this.config = this.loadConfig();
  }

  private loadConfig(): ModelSettings {
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
      console.warn('Failed to load model config, using built-in defaults:', error);
      return this.getBuiltInDefaults();
    }
  }

  private validateAndMergeConfig(config: any): ModelSettings {
    // Validate the config structure
    if (!config || typeof config !== 'object') {
      return this.getBuiltInDefaults();
    }

    const defaults = this.getBuiltInDefaults();
    
    // Merge with defaults, validating each field
    const modelConfig: ModelConfig = {
      ctx_size: this.validateNumber(config.modelConfig?.ctx_size, defaults.modelConfig.ctx_size, 512, 32768),
      temp: this.validateNumber(config.modelConfig?.temp, defaults.modelConfig.temp, 0.0, 2.0),
      top_p: this.validateNumber(config.modelConfig?.top_p, defaults.modelConfig.top_p, 0.0, 1.0),
      top_k: this.validateNumber(config.modelConfig?.top_k, defaults.modelConfig.top_k, 1, 100),
      device: this.validateDevice(config.modelConfig?.device, defaults.modelConfig.device),
      gpu_layers: this.validateNumber(config.modelConfig?.gpu_layers, defaults.modelConfig.gpu_layers, 0, 100),
      system_prompt: this.validateString(config.modelConfig?.system_prompt, defaults.modelConfig.system_prompt)
    };

    return {
      defaultModel: this.validateString(config.defaultModel, defaults.defaultModel || ''),
      modelConfig,
      autoLoad: this.validateBoolean(config.autoLoad, defaults.autoLoad)
    };
  }

  private validateNumber(value: any, defaultValue: number, min?: number, max?: number): number {
    if (typeof value !== 'number' || isNaN(value)) {
      return defaultValue;
    }
    if (min !== undefined && value < min) return min;
    if (max !== undefined && value > max) return max;
    return value;
  }

  private validateString(value: any, defaultValue: string): string {
    return typeof value === 'string' ? value : defaultValue;
  }

  private validateBoolean(value: any, defaultValue: boolean): boolean {
    return typeof value === 'boolean' ? value : defaultValue;
  }

  private validateDevice(value: any, defaultValue: "cpu" | "gpu"): "cpu" | "gpu" {
    return (value === "cpu" || value === "gpu") ? value : defaultValue;
  }

  private getBuiltInDefaults(): ModelSettings {
    return {
      defaultModel: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q2_k.gguf",
      modelConfig: {
        ctx_size: 4096,
        temp: 0.7,
        top_p: 0.9,
        top_k: 40,
        device: "cpu",
        gpu_layers: 0,
        system_prompt: "You are a helpful AI coding assistant. Provide clear, concise, and accurate code suggestions and explanations."
      },
      autoLoad: true
    };
  }

  getConfig(): ModelSettings {
    return { ...this.config };
  }

  getModelConfig(): ModelConfig {
    return { ...this.config.modelConfig };
  }

  updateModelConfig(updates: Partial<ModelConfig>): void {
    this.config.modelConfig = {
      ...this.config.modelConfig,
      ...updates
    };
    this.saveConfig();
  }

  updateSettings(updates: Partial<ModelSettings>): void {
    this.config = {
      ...this.config,
      ...updates
    };
    this.saveConfig();
  }

  private saveConfig(): void {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save model config:', error);
    }
  }

  getConfigPath(): string {
    return this.configPath;
  }

  createDefaultConfigFile(): void {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const defaultConfig = this.getBuiltInDefaults();
      fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
    } catch (error) {
      console.error('Failed to create default model config file:', error);
      throw error;
    }
  }

  resetToDefaults(): void {
    this.config = this.getBuiltInDefaults();
    this.saveConfig();
  }

  // Helper methods for common operations
  setTemperature(temp: number): void {
    this.updateModelConfig({ temp: this.validateNumber(temp, 0.7, 0.0, 2.0) });
  }

  setContextSize(ctx_size: number): void {
    this.updateModelConfig({ ctx_size: this.validateNumber(ctx_size, 4096, 512, 32768) });
  }

  setDevice(device: "cpu" | "gpu"): void {
    this.updateModelConfig({ device });
  }

  setGpuLayers(gpu_layers: number): void {
    this.updateModelConfig({ gpu_layers: this.validateNumber(gpu_layers, 0, 0, 100) });
  }

  setSystemPrompt(system_prompt: string): void {
    this.updateModelConfig({ system_prompt });
  }

  // Get formatted config for display
  getFormattedConfig(): string {
    const config = this.getConfig();
    return `Model Configuration:
  Default Model: ${config.defaultModel || 'Not set'}
  Auto Load: ${config.autoLoad}
  
  Model Parameters:
    Context Size: ${config.modelConfig.ctx_size}
    Temperature: ${config.modelConfig.temp}
    Top P: ${config.modelConfig.top_p}
    Top K: ${config.modelConfig.top_k}
    Device: ${config.modelConfig.device}
    GPU Layers: ${config.modelConfig.gpu_layers}
    System Prompt: "${config.modelConfig.system_prompt}"
    
  Config File: ${this.configPath}`;
  }
}
