#!/usr/bin/env node

import { Editor } from './Editor';
import { LSPClient } from './LSPClient';
import { LSPManager } from './LSPManager';
import { ModelConfigManager } from './ModelConfigManager';
import * as path from 'path';

function showHelp() {
  console.log(`
xlr8 - Terminal-based Code Editor with JS/TS LSP

USAGE:
  xlr8 [file]                    Open a file in the editor
  xlr8 [options]                 Run with specific options

OPTIONS:
  --help, -h                     Show this help message
  --debug, -d                    Enable debug mode
  
LSP COMMANDS:
  --lsp-config                   Create default LSP configuration file
  --lsp-list                     List available LSP servers and their status
  
MODEL COMMANDS:
  --model-config                 Create default model configuration file
  --model-show                   Show current model configuration
  --model-reset                  Reset model configuration to defaults
  --temp <value>                 Set model temperature (0.0-2.0)
  --ctx-size <value>             Set context size (512-32768)
  --device <cpu|gpu>             Set device type
  --gpu-layers <value>           Set number of GPU layers (0-100)

EXAMPLES:
  xlr8                           Start editor with empty buffer
  xlr8 main.ts                   Open main.ts file
  xlr8 --debug main.js           Open main.js with debug mode
  xlr8 --lsp-list                Show available LSP servers
  xlr8 --temp 0.7                Set model temperature to 0.7
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Handle help command
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  // Handle LSP configuration commands
  if (args.includes('--lsp-config')) {
    const lspManager = new LSPManager();
    lspManager.createDefaultConfigFile();
    console.log(`Created LSP config file at: ${lspManager.getConfigPath()}`);
    console.log('Edit this file to configure your LSP servers.');
    return;
  }

  if (args.includes('--lsp-list')) {
    const lspManager = new LSPManager();
    const servers = lspManager.listAvailableServers();
    const enabledServers = lspManager.listEnabledServers();
    
    console.log('📋 Available LSP Servers:\n');
    
    for (const server of servers) {
      const isEnabled = enabledServers.some(s => s.name === server.name);
      const status = isEnabled ? '✅ enabled' : '❌ disabled';
      const extensions = server.fileExtensions.join(', ');
      
      console.log(`• ${server.name} (${status})`);
      console.log(`  Command: ${server.command} ${server.args.join(' ')}`);
      console.log(`  Extensions: ${extensions}\n`);
    }
    
    console.log(`Config file: ${lspManager.getConfigPath()}`);
    return;
  }

  // Handle Model configuration commands
  if (args.includes('--model-config')) {
    const modelConfigManager = new ModelConfigManager();
    modelConfigManager.createDefaultConfigFile();
    console.log(`Created model config file at: ${modelConfigManager.getConfigPath()}`);
    console.log('Edit this file to configure your AI model settings.');
    return;
  }

  if (args.includes('--model-show')) {
    const modelConfigManager = new ModelConfigManager();
    console.log('🤖 Current Model Configuration:\n');
    console.log(modelConfigManager.getFormattedConfig());
    return;
  }

  if (args.includes('--model-reset')) {
    const modelConfigManager = new ModelConfigManager();
    modelConfigManager.resetToDefaults();
    console.log('✅ Model configuration reset to defaults');
    console.log(`Config file: ${modelConfigManager.getConfigPath()}`);
    return;
  }

  // Handle model parameter updates
  const tempIndex = args.findIndex(arg => arg === '--temp');
  if (tempIndex !== -1 && args[tempIndex + 1]) {
    const temp = parseFloat(args[tempIndex + 1]);
    if (!isNaN(temp)) {
      const modelConfigManager = new ModelConfigManager();
      modelConfigManager.setTemperature(temp);
      console.log(`✅ Temperature set to ${temp}`);
      return;
    } else {
      console.error('❌ Invalid temperature value. Must be a number between 0.0 and 2.0');
      return;
    }
  }

  const ctxIndex = args.findIndex(arg => arg === '--ctx-size');
  if (ctxIndex !== -1 && args[ctxIndex + 1]) {
    const ctx_size = parseInt(args[ctxIndex + 1]);
    if (!isNaN(ctx_size)) {
      const modelConfigManager = new ModelConfigManager();
      modelConfigManager.setContextSize(ctx_size);
      console.log(`✅ Context size set to ${ctx_size}`);
      return;
    } else {
      console.error('❌ Invalid context size value. Must be a number between 512 and 32768');
      return;
    }
  }

  const deviceIndex = args.findIndex(arg => arg === '--device');
  if (deviceIndex !== -1 && args[deviceIndex + 1]) {
    const device = args[deviceIndex + 1];
    if (device === 'cpu' || device === 'gpu') {
      const modelConfigManager = new ModelConfigManager();
      modelConfigManager.setDevice(device);
      console.log(`✅ Device set to ${device}`);
      return;
    } else {
      console.error('❌ Invalid device. Must be "cpu" or "gpu"');
      return;
    }
  }

  const gpuLayersIndex = args.findIndex(arg => arg === '--gpu-layers');
  if (gpuLayersIndex !== -1 && args[gpuLayersIndex + 1]) {
    const gpu_layers = parseInt(args[gpuLayersIndex + 1]);
    if (!isNaN(gpu_layers)) {
      const modelConfigManager = new ModelConfigManager();
      modelConfigManager.setGpuLayers(gpu_layers);
      console.log(`✅ GPU layers set to ${gpu_layers}`);
      return;
    } else {
      console.error('❌ Invalid GPU layers value. Must be a number between 0 and 100');
      return;
    }
  }

  const filename = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-'));
  const debugMode = args.includes('--debug') || args.includes('-d');

  const editor = new Editor(filename, debugMode);
  
  if (filename) {
    await editor.loadFile(path.resolve(filename));
  }

  editor.start();
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

main().catch((error) => {
  console.error('Error starting editor:', error);
  process.exit(1);
});
