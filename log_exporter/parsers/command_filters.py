"""
Command filtering configuration for C2 log forwarder

This module provides configuration for filtering insignificant commands
for various C2 frameworks. This allows maintaining command filter lists
in a central location without modifying the parser code.
"""

# Common insignificant commands across most C2 frameworks
COMMON_INSIGNIFICANT_COMMANDS = [
    "ls", "dir", "pwd", "cd", "cls", "clear", "help", "?", "exit", "quit", 
    "history", "echo", "cat", "type", "more", "whoami", "hostname", "uptime",
    "uname", "ver", "version"
]

# Cobalt Strike specific insignificant commands
COBALT_STRIKE_INSIGNIFICANT_COMMANDS = [
    # Navigation and basic info commands
    "sleep", "checkin", "mode", "jobs", "jobkill", "back", "cd", "pwd", "drives",
    "ls", "ps", "netstat", "ipconfig", "getuid", "sysinfo", "time", "screenshots",
    
    # Basic information gathering
    "getuid", "getpid", "getprivs", "ipconfig", "ifconfig", "arp", "route", "netstat", "reg query",
    
    # Beacon management
    "clear", "help", "info", "note", "sleep",
    "sessions", "mode dns", "mode dns-txt", "mode http", "mode smb", 
    "jobs", "jobkill", "links", "connect", "unlink",
    
    # File navigation
    "cd", "pwd", "ls", "drives", "mkdir", "rm"
]

# Sliver specific insignificant commands
SLIVER_INSIGNIFICANT_COMMANDS = [
    # Session management
    "sessions", "background", "use", "info", "help", "kill", "exit", "quit",
    "back", "close", "interactive",
    
    # Navigation and basic info
    "ls", "cd", "pwd", "rm", "mkdir", "ps", "cat", "getuid", "getpid", "getgid",
    "whoami", "netstat", "ifconfig", "ping", "env", "processes", "memory",
    
    # Execution context
    "shell", "execute", "psexec", "sideload", "spawndll", "spawnexec",
    
    # Framework management
    "version", "tasks", "jobs", "mtls", "wg", "dns", "http", "https",
    "profiles", "generate", "regenerate", "implants", "canaries", "domains",
    "beacons", "builders", "compile", "websites", "traffic", "players", "msf",
    "armory", "alias", "licenses", "loot", "mount",
    
    # Basic information gathering
    "screenshot", "net", "env", "registry",
    
    # File operations
    "download", "upload", "ls", "cat", "cd", "pwd", "rm", "mkdir", "cp", "mv"
]

# Dictionary mapping C2 framework types to their insignificant command lists
FRAMEWORK_COMMANDS = {
    "cobalt_strike": COBALT_STRIKE_INSIGNIFICANT_COMMANDS,
    "sliver": SLIVER_INSIGNIFICANT_COMMANDS,
}

def get_insignificant_commands(framework_type):
    """
    Get the list of insignificant commands for a specific C2 framework
    
    Args:
        framework_type: String identifier for the C2 framework (e.g., "cobalt_strike", "sliver")
        
    Returns:
        list: Combined list of common and framework-specific insignificant commands
    """
    # Start with common commands
    all_commands = COMMON_INSIGNIFICANT_COMMANDS.copy()
    
    # Add framework-specific commands if available
    if framework_type in FRAMEWORK_COMMANDS:
        all_commands.extend(FRAMEWORK_COMMANDS[framework_type])
        
    # Remove duplicates while preserving order
    seen = set()
    unique_commands = [x for x in all_commands if not (x in seen or seen.add(x))]
    
    return unique_commands