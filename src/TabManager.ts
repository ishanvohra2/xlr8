import { BufferTab } from './BufferTab';
import { LSPManager } from './LSPManager';
import * as path from 'path';

export class TabManager {
  private tabs: BufferTab[] = [];
  private currentTabIndex: number = 0;
  private lspManager: LSPManager;
  private debugMode: boolean = false;

  constructor(lspManager: LSPManager, debugMode: boolean = false) {
    this.lspManager = lspManager;
    this.debugMode = debugMode;
    // Start with one empty tab
    this.tabs.push(new BufferTab('', undefined, debugMode));
  }

  getCurrentTab(): BufferTab {
    return this.tabs[this.currentTabIndex];
  }

  getCurrentTabIndex(): number {
    return this.currentTabIndex;
  }

  getTabCount(): number {
    return this.tabs.length;
  }

  getTabs(): BufferTab[] {
    return [...this.tabs];
  }

  async switchToTab(index: number, editor?: any): Promise<void> {
    if (index >= 0 && index < this.tabs.length) {
      // Close current LSP document
      if (this.lspManager.isReady()) {
        this.lspManager.closeDocument();
      }

      this.currentTabIndex = index;
      const currentTab = this.getCurrentTab();

      // Set editor reference on the new tab's renderer
      if (editor) {
        currentTab.getRenderer().setEditor(editor);
      }

      // Open new LSP document if file exists
      if (currentTab.getFilename()) {
        await this.initializeLSPForCurrentTab();
      }
    }
  }

  async nextTab(editor?: any): Promise<void> {
    const nextIndex = (this.currentTabIndex + 1) % this.tabs.length;
    await this.switchToTab(nextIndex, editor);
  }

  async previousTab(editor?: any): Promise<void> {
    const prevIndex = this.currentTabIndex === 0 
      ? this.tabs.length - 1 
      : this.currentTabIndex - 1;
    await this.switchToTab(prevIndex, editor);
  }

  async newTab(filename?: string, editor?: any): Promise<void> {
    const newTab = new BufferTab(filename, undefined, this.debugMode);
    this.tabs.push(newTab);
    await this.switchToTab(this.tabs.length - 1, editor);
  }

  async closeCurrentTab(editor?: any): Promise<boolean> {
    if (this.tabs.length <= 1) {
      // Don't close the last tab
      return false;
    }

    const currentTab = this.getCurrentTab();
    
    // Check for unsaved changes
    if (currentTab.hasUnsavedChanges()) {
      // TODO: Show confirmation dialog
      console.log('Tab has unsaved changes, not closing');
      return false;
    }

    // Close LSP document if open
    if (this.lspManager.isReady()) {
      this.lspManager.closeDocument();
    }

    // Remove the tab
    this.tabs.splice(this.currentTabIndex, 1);

    // Adjust current index if necessary
    if (this.currentTabIndex >= this.tabs.length) {
      this.currentTabIndex = this.tabs.length - 1;
    }

    // Set editor reference on the new current tab
    if (editor) {
      this.getCurrentTab().getRenderer().setEditor(editor);
    }

    // Initialize LSP for the new current tab
    if (this.getCurrentTab().getFilename()) {
      await this.initializeLSPForCurrentTab();
    }

    return true;
  }

  async openFile(filename: string, editor?: any): Promise<void> {
    // Check if file is already open
    const existingTabIndex = this.tabs.findIndex(tab => tab.getFilename() === filename);
    if (existingTabIndex !== -1) {
      await this.switchToTab(existingTabIndex, editor);
      return;
    }

    // Create new tab with the file
    const newTab = new BufferTab('', undefined, this.debugMode);
    await newTab.loadFile(filename, this.debugMode);
    this.tabs.push(newTab);
    await this.switchToTab(this.tabs.length - 1, editor);
  }

  async saveCurrentTab(): Promise<void> {
    const currentTab = this.getCurrentTab();
    
    if (!currentTab.getFilename()) {
      // TODO: Implement save-as dialog
      throw new Error('No filename set for saving');
    }

    await currentTab.saveFile();
    
    // Notify LSP about save
    if (this.lspManager.isReady()) {
      this.lspManager.saveDocument(currentTab.getFilename(), currentTab.getBuffer());
    }
  }

  async saveCurrentTabAs(filename: string): Promise<void> {
    const currentTab = this.getCurrentTab();
    await currentTab.saveAsFile(filename);
    
    // Notify LSP about save
    if (this.lspManager.isReady()) {
      this.lspManager.saveDocument(filename, currentTab.getBuffer());
    }
  }

  getTabDisplayNames(): string[] {
    return this.tabs.map((tab, index) => {
      const name = tab.getDisplayName();
      const modified = tab.hasUnsavedChanges() ? '*' : '';
      const current = index === this.currentTabIndex ? '>' : ' ';
      return `${current}${name}${modified}`;
    });
  }

  private async initializeLSPForCurrentTab(): Promise<void> {
    const currentTab = this.getCurrentTab();
    const filename = currentTab.getFilename();
    
    if (!filename) return;

    try {
      const workspaceRoot = path.dirname(path.resolve(filename));
      await this.lspManager.initialize(workspaceRoot);
      
      if (this.lspManager.isReady()) {
        this.lspManager.openDocument(filename, currentTab.getBuffer());
      }
    } catch (error) {
      console.error('Failed to initialize LSP for tab:', error);
    }
  }

  updateCurrentTabContent(): void {
    const currentTab = this.getCurrentTab();
    if (currentTab.getFilename() && this.lspManager.isReady()) {
      this.lspManager.updateDocument(currentTab.getFilename(), currentTab.getBuffer());
    }
  }

  markCurrentTabAsModified(): void {
    this.getCurrentTab().markAsModified();
  }
}
