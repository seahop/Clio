"""Utility functions for file operations."""

import os
from pathlib import Path

def ensure_directory(directory_path):
    """Create a directory if it doesn't exist."""
    directory = Path(directory_path)
    if not directory.exists():
        directory.mkdir(parents=True)
        print(f"\033[36mCreated directory: {directory}\033[0m")
    return directory

def write_file(file_path, content):
    """Write content to a file."""
    try:
        with open(file_path, 'w') as file:
            file.write(content)
        return True
    except Exception as e:
        print(f"\033[31mError writing to file {file_path}: {str(e)}\033[0m")
        return False

def read_file(file_path):
    """Read content from a file."""
    try:
        with open(file_path, 'r') as file:
            return file.read()
    except FileNotFoundError:
        return None
    except Exception as e:
        print(f"\033[31mError reading file {file_path}: {str(e)}\033[0m")
        return None

def append_to_gitignore(entries):
    """Add entries to .gitignore file."""
    gitignore_path = '.gitignore'
    
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r') as f:
            current_gitignore = f.read().splitlines()
        
        # Find which entries need to be added
        new_entries = [entry for entry in entries if entry not in current_gitignore]
        
        if new_entries:
            with open(gitignore_path, 'a') as f:
                f.write('\n' + '\n'.join(new_entries) + '\n')
            print("\033[32mUpdated .gitignore with new entries\033[0m")
            return True
        else:
            print("\033[36mNo new entries needed for .gitignore\033[0m")
            return False
    else:
        with open(gitignore_path, 'w') as f:
            f.write('\n'.join(entries) + '\n')
        print("\033[32mCreated .gitignore with necessary entries\033[0m")
        return True

def make_executable(file_path):
    """Make a file executable."""
    if os.name == 'posix':  # Linux/Mac
        try:
            current_permissions = os.stat(file_path).st_mode
            os.chmod(file_path, current_permissions | 0o111)  # Add executable bit
            return True
        except Exception as e:
            print(f"\033[31mError making file executable: {str(e)}\033[0m")
            return False
    return False  # Windows or other OS