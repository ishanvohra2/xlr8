# Demo File 3 - Markdown

## Testing XLR8's Buffer System

This is a **markdown** file to test multifile editing.

### Features to Test

1. **Open multiple files**
   - Use `:e filename` to open files
   
2. **Switch between buffers**
   - `:bn` - next buffer
   - `:bp` - previous buffer
   - `:b#` - alternate buffer
   - `:b 2` - switch to buffer 2

3. **List all buffers**
   - `:ls` - shows all open files
   
4. **Close buffers**
   - `:bd` - close current buffer
   - `:bd 2` - close buffer 2
   - `:bd!` - force close (discard changes)

### Try This Workflow

```vim
:e demo-file1.js
:e demo-file2.py
:e demo-file3.md
:ls
:bn
:bp
:b#
```

### Notes

Each buffer remembers:
- Content
- Cursor position
- Scroll position
- Whether it's modified

**Enjoy multifile editing!**

