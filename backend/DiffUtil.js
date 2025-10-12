/**
 * DiffUtil - Utilities for generating and applying diffs
 * Simple line-based diff implementation
 */
class DiffUtil {
    /**
     * Generate a line-by-line diff between old and new text
     * @param {string} oldText - Original text
     * @param {string} newText - Modified text
     * @returns {Object} Diff object with hunks
     */
    static generateDiff(oldText, newText) {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        
        const hunks = [];
        let currentHunk = null;
        
        // Simple line-by-line comparison
        let i = 0, j = 0;
        
        while (i < oldLines.length || j < newLines.length) {
            if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
                // Lines match - context line
                if (currentHunk) {
                    currentHunk.lines.push({
                        type: 'context',
                        oldLineNum: i + 1,
                        newLineNum: j + 1,
                        content: oldLines[i]
                    });
                    
                    // End hunk if we have 3+ context lines
                    if (currentHunk.contextCount >= 3) {
                        hunks.push(currentHunk);
                        currentHunk = null;
                    } else {
                        currentHunk.contextCount++;
                    }
                }
                i++;
                j++;
            } else {
                // Start new hunk if needed
                if (!currentHunk) {
                    currentHunk = {
                        oldStart: Math.max(1, i - 2),
                        newStart: Math.max(1, j - 2),
                        lines: [],
                        contextCount: 0
                    };
                    
                    // Add context before change
                    for (let k = Math.max(0, i - 3); k < i; k++) {
                        currentHunk.lines.push({
                            type: 'context',
                            oldLineNum: k + 1,
                            newLineNum: k + 1,
                            content: oldLines[k]
                        });
                    }
                }
                
                currentHunk.contextCount = 0;
                
                // Check if line was removed
                if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
                    let found = false;
                    
                    // Look ahead to see if this line appears later in new text
                    for (let k = j; k < Math.min(j + 5, newLines.length); k++) {
                        if (oldLines[i] === newLines[k]) {
                            found = true;
                            break;
                        }
                    }
                    
                    if (!found || j >= newLines.length) {
                        currentHunk.lines.push({
                            type: 'remove',
                            oldLineNum: i + 1,
                            content: oldLines[i]
                        });
                        i++;
                        continue;
                    }
                }
                
                // Line was added
                if (j < newLines.length) {
                    currentHunk.lines.push({
                        type: 'add',
                        newLineNum: j + 1,
                        content: newLines[j]
                    });
                    j++;
                }
            }
        }
        
        // Add final hunk if exists
        if (currentHunk) {
            hunks.push(currentHunk);
        }
        
        return {
            oldText,
            newText,
            hunks,
            hasChanges: hunks.length > 0
        };
    }

    /**
     * Format diff as unified diff string
     * @param {Object} diff - Diff object from generateDiff
     * @param {string} filename - File name for diff header
     * @returns {string} Formatted unified diff
     */
    static formatUnifiedDiff(diff, filename = 'file') {
        if (!diff.hasChanges) {
            return 'No changes';
        }
        
        const lines = [];
        lines.push(`--- a/${filename}`);
        lines.push(`+++ b/${filename}`);
        
        for (const hunk of diff.hunks) {
            const oldCount = hunk.lines.filter(l => l.type !== 'add').length;
            const newCount = hunk.lines.filter(l => l.type !== 'remove').length;
            lines.push(`@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`);
            
            for (const line of hunk.lines) {
                switch (line.type) {
                    case 'context':
                        lines.push(` ${line.content}`);
                        break;
                    case 'remove':
                        lines.push(`-${line.content}`);
                        break;
                    case 'add':
                        lines.push(`+${line.content}`);
                        break;
                }
            }
        }
        
        return lines.join('\n');
    }

    /**
     * Apply a diff to original text
     * @param {string} originalText - Original text
     * @param {Object} diff - Diff object
     * @returns {string} Modified text
     */
    static applyDiff(originalText, diff) {
        return diff.newText;
    }

    /**
     * Extract code from LLM response (handles markdown code blocks)
     * @param {string} response - LLM response
     * @param {string} language - Expected language
     * @returns {string} Extracted code
     */
    static extractCodeFromResponse(response, language = '') {
        // Try to find code block with language specifier
        const codeBlockRegex = new RegExp(`\`\`\`${language}\\s*\\n([\\s\\S]*?)\\n\`\`\``, 'i');
        let match = response.match(codeBlockRegex);
        
        if (match) {
            return match[1].trim();
        }
        
        // Try any code block
        const anyCodeBlockRegex = /```[\w]*\s*\n([\s\S]*?)\n```/;
        match = response.match(anyCodeBlockRegex);
        
        if (match) {
            return match[1].trim();
        }
        
        // If no code block, return as is (but trim)
        return response.trim();
    }

    /**
     * Calculate similarity between two strings (0-1)
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Similarity score (0-1)
     */
    static calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) {
            return 1.0;
        }
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Edit distance
     */
    static levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }
}

module.exports = { DiffUtil };

