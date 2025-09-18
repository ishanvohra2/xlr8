import { InferenceManager } from './InferenceManager';

export type ChatMessage = {
    id: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp: number;
    mode: 'edit' | 'ask';
    attachments?: string[];
};

export type ChatSession = {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    lastActivity: number;
    currentFile?: string;
};

export class ChatManager {
    private sessions: ChatSession[] = [];
    private currentSessionId: string | null = null;
    private nextMessageId: number = 1;
    private maxSessions: number = 10;
    private maxMessagesPerSession: number = 100;

    constructor() {
        this.createNewSession();
    }

    createNewSession(title?: string): ChatSession {
        const session: ChatSession = {
            id: this.generateSessionId(),
            title: title || `Chat ${this.sessions.length + 1}`,
            messages: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
            currentFile: undefined
        };

        this.sessions.unshift(session); // Add to beginning
        this.currentSessionId = session.id;

        // Limit number of sessions
        if (this.sessions.length > this.maxSessions) {
            this.sessions = this.sessions.slice(0, this.maxSessions);
        }

        return session;
    }

    getCurrentSession(): ChatSession | null {
        if (!this.currentSessionId) {
            return null;
        }
        return this.sessions.find(s => s.id === this.currentSessionId) || null;
    }

    getAllSessions(): ChatSession[] {
        return [...this.sessions];
    }

    switchToSession(sessionId: string): boolean {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSessionId = sessionId;
            session.lastActivity = Date.now();
            return true;
        }
        return false;
    }

    deleteSession(sessionId: string): boolean {
        const index = this.sessions.findIndex(s => s.id === sessionId);
        if (index !== -1) {
            this.sessions.splice(index, 1);
            if (this.currentSessionId === sessionId) {
                this.currentSessionId = this.sessions.length > 0 ? this.sessions[0].id : null;
            }
            return true;
        }
        return false;
    }

    addMessage(role: 'user' | 'assistant', content: string, mode: 'edit' | 'ask', attachments?: string[]): ChatMessage {
        const session = this.getCurrentSession();
        if (!session) {
            throw new Error('No active chat session');
        }

        const message: ChatMessage = {
            id: this.generateMessageId(),
            role,
            content,
            timestamp: Date.now(),
            mode,
            attachments
        };

        session.messages.push(message);
        session.lastActivity = Date.now();

        // Update session title if it's the first user message
        if (role === 'user' && session.messages.filter(m => m.role === 'user').length === 1) {
            session.title = this.generateTitleFromContent(content);
        }

        // Limit messages per session
        if (session.messages.length > this.maxMessagesPerSession) {
            session.messages = session.messages.slice(-this.maxMessagesPerSession);
        }

        return message;
    }

    getMessages(sessionId?: string): ChatMessage[] {
        const session = sessionId ? 
            this.sessions.find(s => s.id === sessionId) : 
            this.getCurrentSession();
        
        return session ? [...session.messages] : [];
    }

    getRecentMessages(count: number = 10): ChatMessage[] {
        const session = this.getCurrentSession();
        if (!session) return [];
        
        return session.messages.slice(-count);
    }

    clearCurrentSession(): void {
        const session = this.getCurrentSession();
        if (session) {
            session.messages = [];
            session.lastActivity = Date.now();
        }
    }

    updateCurrentFile(filename?: string): void {
        const session = this.getCurrentSession();
        if (session) {
            session.currentFile = filename;
        }
    }

    getConversationHistoryForAI(): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
        const session = this.getCurrentSession();
        if (!session) return [];

        // Convert chat messages to AI format, including system prompt
        const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
        
        // Add system prompt based on the most recent mode
        const lastUserMessage = session.messages.filter(m => m.role === 'user').pop();
        const mode = lastUserMessage?.mode || 'ask';
        
        // Note: We'll need to get the system prompt from InferenceManager
        // For now, we'll add a placeholder that will be replaced
        history.push({
            role: 'system',
            content: `__SYSTEM_PROMPT_PLACEHOLDER__${mode}`
        });

        // Add conversation history
        for (const message of session.messages) {
            history.push({
                role: message.role,
                content: message.content
            });
        }

        return history;
    }

    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateMessageId(): string {
        return `msg_${this.nextMessageId++}_${Date.now()}`;
    }

    private generateTitleFromContent(content: string): string {
        // Generate a title from the first few words of the content
        const words = content.trim().split(/\s+/);
        const title = words.slice(0, 6).join(' ');
        return title.length > 50 ? title.substring(0, 47) + '...' : title;
    }

    // Export/Import functionality for persistence
    exportSessions(): string {
        return JSON.stringify({
            sessions: this.sessions,
            currentSessionId: this.currentSessionId,
            nextMessageId: this.nextMessageId
        }, null, 2);
    }

    importSessions(data: string): boolean {
        try {
            const parsed = JSON.parse(data);
            this.sessions = parsed.sessions || [];
            this.currentSessionId = parsed.currentSessionId || null;
            this.nextMessageId = parsed.nextMessageId || 1;
            return true;
        } catch (error) {
            console.error('Failed to import chat sessions:', error);
            return false;
        }
    }
}
