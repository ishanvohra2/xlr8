import hljs from 'highlight.js';
import * as path from 'path';

export interface HighlightedToken {
  text: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
}

export interface HighlightedLine {
  tokens: HighlightedToken[];
}

export class SyntaxHighlighter {
  private language: string = 'plaintext';

  constructor() {
    // Configure highlight.js
    hljs.configure({
      ignoreUnescapedHTML: true,
      throwUnescapedHTML: false
    });
  }

  setLanguage(filename: string): void {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        this.language = 'typescript';
        break;
      case '.js':
      case '.jsx':
        this.language = 'javascript';
        break;
      case '.json':
        this.language = 'json';
        break;
      case '.html':
      case '.htm':
        this.language = 'html';
        break;
      case '.css':
        this.language = 'css';
        break;
      case '.py':
        this.language = 'python';
        break;
      case '.java':
        this.language = 'java';
        break;
      case '.cpp':
      case '.cc':
      case '.cxx':
        this.language = 'cpp';
        break;
      case '.c':
        this.language = 'c';
        break;
      case '.go':
        this.language = 'go';
        break;
      case '.rs':
        this.language = 'rust';
        break;
      case '.php':
        this.language = 'php';
        break;
      case '.rb':
        this.language = 'ruby';
        break;
      case '.sh':
      case '.bash':
        this.language = 'bash';
        break;
      case '.sql':
        this.language = 'sql';
        break;
      case '.xml':
        this.language = 'xml';
        break;
      case '.yaml':
      case '.yml':
        this.language = 'yaml';
        break;
      case '.md':
        this.language = 'markdown';
        break;
      default:
        this.language = 'plaintext';
    }
  }

  highlightLine(line: string): HighlightedLine {
    if (this.language === 'plaintext' || !line.trim()) {
      return {
        tokens: [{ text: line, color: 'default' }]
      };
    }

    try {
      const result = hljs.highlight(line, { language: this.language });
      return this.parseHighlightedHTML(result.value);
    } catch (error) {
      // Fallback to plain text if highlighting fails
      return {
        tokens: [{ text: line, color: 'default' }]
      };
    }
  }

  private parseHighlightedHTML(html: string): HighlightedLine {
    const tokens: HighlightedToken[] = [];
    let currentText = '';
    
    // Create a state object that can be modified by reference
    const state = {
      currentColor: 'default',
      currentBold: false,
      currentItalic: false
    };

    // Simple HTML parser for highlight.js output
    let i = 0;
    while (i < html.length) {
      if (html[i] === '<') {
        // Save current token if we have text
        if (currentText) {
          tokens.push({
            text: currentText,
            color: state.currentColor,
            bold: state.currentBold,
            italic: state.currentItalic
          });
          currentText = '';
        }

        // Find the end of the tag
        const tagEnd = html.indexOf('>', i);
        if (tagEnd === -1) break;

        const tag = html.substring(i + 1, tagEnd);
        i = tagEnd + 1;

        // Parse the tag
        if (tag.startsWith('/')) {
          // Closing tag
          const tagName = tag.substring(1);
          this.applyClosingTag(tagName, state);
        } else {
          // Opening tag - pass the full tag content to extract attributes
          this.applyOpeningTag(tag, state);
        }
      } else {
        // Regular character
        if (html[i] === '&') {
          // Handle HTML entities
          const entityEnd = html.indexOf(';', i);
          if (entityEnd !== -1) {
            const entity = html.substring(i, entityEnd + 1);
            currentText += this.decodeHTMLEntity(entity);
            i = entityEnd + 1;
          } else {
            currentText += html[i];
            i++;
          }
        } else {
          currentText += html[i];
          i++;
        }
      }
    }

    // Add any remaining text
    if (currentText) {
      tokens.push({
        text: currentText,
        color: state.currentColor,
        bold: state.currentBold,
        italic: state.currentItalic
      });
    }

    return { tokens };
  }

  private applyOpeningTag(tag: string, state: { currentColor: string; currentBold: boolean; currentItalic: boolean }): void {
    const spaceIndex = tag.indexOf(' ');
    const tagName = spaceIndex === -1 ? tag : tag.substring(0, spaceIndex);
    
    switch (tagName) {
      case 'span':
        // Extract class attribute and map to color
        const classMatch = tag.match(/class="([^"]*)"/);
        if (classMatch) {
          const className = classMatch[1];
          state.currentColor = this.getColorFromClass(className);
        }
        break;
      case 'strong':
      case 'b':
        state.currentBold = true;
        break;
      case 'em':
      case 'i':
        state.currentItalic = true;
        break;
    }
  }

  private applyClosingTag(tagName: string, state: { currentColor: string; currentBold: boolean; currentItalic: boolean }): void {
    switch (tagName) {
      case 'span':
        state.currentColor = 'default';
        break;
      case 'strong':
      case 'b':
        state.currentBold = false;
        break;
      case 'em':
      case 'i':
        state.currentItalic = false;
        break;
    }
  }

  private decodeHTMLEntity(entity: string): string {
    switch (entity) {
      case '&lt;': return '<';
      case '&gt;': return '>';
      case '&amp;': return '&';
      case '&quot;': return '"';
      case '&#39;': return "'";
      case '&nbsp;': return ' ';
      default: return entity;
    }
  }

  // Map highlight.js classes to terminal colors
  private getColorFromClass(className: string): string {
    if (!className) return 'default';

    // Common highlight.js class mappings
    if (className.includes('keyword')) return 'blue';
    if (className.includes('string')) return 'green';
    if (className.includes('number')) return 'yellow';
    if (className.includes('comment')) return 'gray';
    if (className.includes('function')) return 'cyan';
    if (className.includes('class')) return 'magenta';
    if (className.includes('variable')) return 'white';
    if (className.includes('operator')) return 'red';
    if (className.includes('punctuation')) return 'white';
    if (className.includes('built_in')) return 'cyan';
    if (className.includes('literal')) return 'yellow';
    if (className.includes('title')) return 'magenta';
    if (className.includes('params')) return 'white';
    if (className.includes('attr')) return 'green';
    if (className.includes('tag')) return 'blue';
    if (className.includes('value')) return 'yellow';
    if (className.includes('regexp')) return 'red';
    if (className.includes('link')) return 'blue';
    if (className.includes('symbol')) return 'yellow';
    if (className.includes('meta')) return 'gray';
    if (className.includes('doctag')) return 'red';
    if (className.includes('section')) return 'magenta';
    if (className.includes('name')) return 'cyan';
    if (className.includes('type')) return 'blue';
    if (className.includes('subst')) return 'white';
    if (className.includes('deletion')) return 'red';
    if (className.includes('addition')) return 'green';
    if (className.includes('emphasis')) return 'italic';
    if (className.includes('strong')) return 'bold';

    return 'default';
  }
}
