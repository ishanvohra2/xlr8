#!/usr/bin/env node

import { Editor } from './Editor';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const filename = args[0];

  const editor = new Editor();
  
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
