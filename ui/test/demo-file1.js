// Demo File 1 - JavaScript
// Use this file to test XLR8's buffer system!

function greet(name) {
  console.log(`Hello, ${name}!`);
  return `Greeting sent to ${name}`;
}

const users = ['Alice', 'Bob', 'Charlie'];

users.forEach(user => {
  greet(user);
});

// Try these commands:
// :e demo-file2.py  - Open another file
// :bn               - Switch to next buffer
// :ls               - List all buffers

