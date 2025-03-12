# Command Filtering Guide

The C2 Log Forwarder provides robust command filtering capabilities to help focus on significant activities while reducing noise in your audit logs. This guide explains how the filtering system works and how to customize it for your specific needs.

## Filtering Concepts

The filtering system operates at two levels:

1. **Complete Exclusion**: Some entries are always excluded regardless of the filter mode. These are typically status messages or system outputs rather than actual commands (e.g., "session terminated", "download complete").

2. **Significance Filtering**: When using `--significant`, additional filtering is applied to remove common commands that don't provide significant audit value (e.g., "ls", "cd", "pwd").

## Command-Line Options

The forwarder provides two mutually exclusive options to control filtering behavior:

- `--all` - Forward all commands (default behavior)
- `--significant` - Forward only significant commands, filtering out common low-value commands

Example usage:

```bash
# Default behavior (all commands)
python log_exporter.py --api-key YOUR_KEY --clio-url URL --c2-type sliver

# Significant commands only
python log_exporter.py --api-key YOUR_KEY --clio-url URL --c2-type sliver --significant
```

## How Filtering Works

The filtering system is implemented in the `command_filters.py` module, which provides:

1. Lists of insignificant commands for each supported C2 framework
2. Lists of commands to exclude entirely
3. Functions to determine if a command should be excluded or filtered

When the forwarder processes log entries:
- First, it checks if the entry should be excluded entirely using `should_exclude_command()`
- If not excluded, and if `--significant` is specified, it then checks if the command is significant using `is_significant_command()`

Only commands that pass both checks are forwarded to Clio.

## Current Filtering Rules

### Commands Always Excluded

These commands are never forwarded, regardless of filter mode:

#### Sliver
- "session backgrounded"
- "session terminated"
- "interactive mode"
- "download complete"
- Commands starting with "use" (which typically just select a session)

#### Cobalt Strike
- Currently no specific exclusions (only uses significance filtering)

### Insignificant Commands (Filtered with `--significant`)

These commands are only forwarded when using the default `--all` mode, and are filtered out when using `--significant`:

#### Common (All C2 Frameworks)
```
ls, dir, pwd, cd, cls, clear, help, ?, exit, quit, history, echo, 
cat, type, more, whoami, hostname, uptime, uname, ver, version
```

#### Sliver-Specific
```
sessions, background, use, info, help, kill, exit, quit, back, close, interactive, 
ps, getuid, getpid, getgid, whoami, netstat, ifconfig, ping, env, processes, memory,
shell, execute, psexec, sideload, spawndll, spawnexec, version, tasks, jobs, ...
```

#### Cobalt Strike-Specific
```
sleep, checkin, mode, jobs, jobkill, back, cd, pwd, drives, ls, ps, netstat, 
ipconfig, getuid, sysinfo, time, screenshots, net user, net group, net localgroup, ...
```

## Customizing Filters

You can customize which commands are considered significant or which are excluded entirely by modifying the `command_filters.py` file.

### File Location

```
log_exporter/command_filters.py
```

### Modifying Command Lists

To customize which commands are filtered:

1. **Add a command to the insignificant list**:
   ```python
   # Example: Adding a custom command to Sliver's insignificant list
   SLIVER_INSIGNIFICANT_COMMANDS.append("my-custom-command")
   ```

2. **Remove a command from the insignificant list**:
   ```python
   # Example: Making 'ls' be considered significant for Cobalt Strike
   COBALT_STRIKE_INSIGNIFICANT_COMMANDS.remove("ls")
   ```

3. **Add a command to the excluded list**:
   ```python
   # Example: Always exclude a specific command from Sliver
   SLIVER_EXCLUDED_COMMANDS.append("my-noisy-command")
   ```

### When to Customize

Consider customizing the filters when:

- You have custom commands specific to your operations that should be filtered
- You want more detailed auditing of certain common commands
- You're working with a C2 framework that generates a lot of noise
- You have compliance requirements to capture specific command types

## Adding Filters for New C2 Frameworks

When adding support for a new C2 framework:

1. Update the `command_filters.py` file with new lists:
   ```python
   # Add a new list for your C2 framework
   MYCUSTOMC2_INSIGNIFICANT_COMMANDS = [
       "ls", "pwd", "customcommand", ...
   ]
   
   MYCUSTOMC2_EXCLUDED_COMMANDS = [
       "status message", "noise entry", ...
   ]
   
   # Add to the dictionary mappings
   FRAMEWORK_COMMANDS["mycustomc2"] = MYCUSTOMC2_INSIGNIFICANT_COMMANDS
   FRAMEWORK_EXCLUDED_COMMANDS["mycustomc2"] = MYCUSTOMC2_EXCLUDED_COMMANDS
   ```

2. When creating your parser class, ensure it inherits from `BaseLogParser` and passes the `filter_mode` parameter correctly:
   ```python
   class MyCustomC2Parser(BaseLogParser):
       def __init__(self, root_dir, historical_days=1, max_tracked_days=2, filter_mode="all"):
           super().__init__(root_dir, historical_days, max_tracked_days, filter_mode)
           # Your parser-specific initialization
   ```

## Best Practices

- **Balance Noise Reduction with Audit Completeness**: Don't filter out commands that might be significant for security audits or incident response
- **Test Filtering Rules**: Before deploying in production, test with `--significant` to ensure important commands aren't being filtered
- **Document Customizations**: Keep a record of any customizations you make to the filtering rules
- **Consider Compliance Requirements**: Some compliance frameworks may require capturing all commands, even trivial ones