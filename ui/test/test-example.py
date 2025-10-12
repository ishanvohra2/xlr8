"""
XLR8 Editor Test File - Python
Test syntax highlighting and autocomplete for Python
"""

import json
from typing import List, Dict, Optional


class Calculator:
    """A simple calculator class demonstrating Python syntax"""
    
    def __init__(self):
        self.result = 0
    
    def add(self, value: float) -> 'Calculator':
        """Add a value to the result"""
        self.result += value
        return self
    
    def subtract(self, value: float) -> 'Calculator':
        """Subtract a value from the result"""
        self.result -= value
        return self
    
    def get_result(self) -> float:
        """Get the current result"""
        return self.result


def greet_user(name: str) -> str:
    """
    Greet a user by name
    
    Args:
        name: The user's name
    
    Returns:
        A greeting message
    """
    greeting = f"Hello, {name}!"
    print(greeting)
    return greeting


async def fetch_data(url: str) -> Dict:
    """Fetch data from a URL asynchronously"""
    import aiohttp
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            data = await response.json()
            return data


def process_numbers(numbers: List[int]) -> Dict[str, int]:
    """Process a list of numbers and return statistics"""
    total = sum(numbers)
    average = total / len(numbers) if numbers else 0
    maximum = max(numbers) if numbers else 0
    minimum = min(numbers) if numbers else 0
    
    return {
        'total': total,
        'average': average,
        'max': maximum,
        'min': minimum,
        'count': len(numbers)
    }


# List comprehension
squares = [x**2 for x in range(10)]

# Dictionary comprehension
number_names = {i: str(i) for i in range(5)}

# Lambda function
add = lambda a, b: a + b

# With statement
with open('example.txt', 'w') as f:
    f.write('Hello, World!')

# Exception handling
try:
    result = 10 / 0
except ZeroDivisionError as e:
    print(f"Error: {e}")
finally:
    print("Cleanup")


if __name__ == '__main__':
    calc = Calculator()
    result = calc.add(10).subtract(3).get_result()
    print(f"Calculator result: {result}")
    
    numbers = [1, 2, 3, 4, 5]
    stats = process_numbers(numbers)
    print(json.dumps(stats, indent=2))

