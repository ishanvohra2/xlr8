// XLR8 Editor Test File
// Test syntax highlighting and autocomplete

/**
 * Sample function demonstrating syntax highlighting
 * @param {string} name - User's name
 * @returns {string} Greeting message
 */
function greetUser(name) {
  const greeting = `Hello, ${name}!`;
  console.log(greeting);
  return greeting;
}

function goodbye(name) {
  const goodbyeString = `Goodbye ${name}`;
  console.log(goodbyeString);
  return goodbyeString;
}

// Arrow function example
const add = (a, b) => a + b;

// Class example
class Calculator {
  constructor() {
    this.result = 0;
  }

  add(value) {
    this.result += value;
    return this;
  }

  subtract(value) {
    this.result -= value;
    return this;
  }

  getResult() {
    return this.result;
  }
}

// Async/await example
async function fetchData(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
}

// Array methods
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
const sum = numbers.reduce((acc, n) => acc + n, 0);

// Object destructuring
const user = {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
};

const { name, age } = user;

// Template literals
const message = `User ${name} is ${age} years old`;

// Export
export { greetUser, Calculator, fetchData };
export default add;

