#!/usr/bin/env python3
"""
Main entry point for the Clio environment generator.
This script serves as a user-friendly wrapper around the generate_env package.
"""
import sys
import os

# Ensure the generate_env package is in the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the main function from the package
from generate_env import main

if __name__ == "__main__":
    # Call the main function from the package
    sys.exit(main())