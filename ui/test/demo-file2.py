# Demo File 2 - Python
# Use this to test buffer switching!

def calculate_sum(numbers):
    """Calculate sum of a list of numbers"""
    total = 0
    for num in numbers:
        total += num
    return total

def main():
    data = [1, 2, 3, 4, 5]
    result = calculate_sum(data)
    print(f"Sum: {result}")

if __name__ == "__main__":
    main()

# Try these commands:
# :bp               - Go back to previous buffer
# :b#               - Toggle between last two buffers
# :w                - Save this buffer

