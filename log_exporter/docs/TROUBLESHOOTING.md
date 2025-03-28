# C2 Log Forwarder Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the C2 Log Forwarder.

## Diagnostic Steps

When troubleshooting any issue, follow these steps:

1. **Enable debug mode**:
   ```bash
   python log_exporter.py --api-key YOUR_KEY --clio-url YOUR_URL --c2-type cobalt_strike --debug
   ```

2. **Check the log file**:
   ```bash
   tail -f clio_forwarder/forwarder.log
   ```

3. **Verify connectivity**:
   ```bash
   curl -k -H "X-API-Key: YOUR_KEY" https://your-clio-server/api/ingest/status
   ```

4. **Check file permissions**:
   ```bash
   ls -la /path/to/c2/logs/
   ```

5. **Verify the working directory**:
   ```bash
   pwd
   ls -la
   ```

## Common Issues and Solutions

### 1. "Logs base directory does not exist"

**Symptoms**:
- Error message: "Logs base directory does not exist"
- No logs are processed

**Causes**:
- Running the script from the wrong directory
- C2 framework doesn't have the expected directory structure
- Permissions issues

**Solutions**:
- Change to the C2 framework root directory before running the script
- Check if the logs directory exists and has the expected structure
- Verify the user running the script has read permissions on the log directory

### 2. Connection Errors to Clio

**Symptoms**:
- Error messages like "Failed to connect to Clio API"
- Logs are detected but not forwarded

**Causes**:
- Incorrect API key
- Incorrect Clio URL
- Network connectivity issues
- SSL certificate validation failures

**Solutions**:
- Verify your API key is correct and has the "logs:write" permission
- Double-check the URL format (include https:// and correct port)
- Test network connectivity with curl or wget
- If using self-signed certificates, add the `--insecure-ssl` flag

Example of testing connectivity:
```bash
# Test with curl (using --insecure for self-signed certs)
curl -k -v -H "X-API-Key: YOUR_API_KEY" https://your-clio-server/api/ingest/status
```

### 3. No Logs Being Found or Processed

**Symptoms**:
- Forwarder runs without errors but no logs are processed
- Message: "No new lines to process"

**Causes**:
- No new log entries since last run
- Log files don't match the expected pattern
- Parser not recognizing the log format
- Wrong C2 framework type specified

**Solutions**:
- Generate some new log entries in your C2 framework
- Check the log file names to ensure they match the pattern expected by the parser
- Verify you're using the correct `--c2-type` parameter
- Check the permissions on the log files

Debug commands:
```bash
# Check log file names
ls -la /path/to/c2/logs/$(date +%Y-%m-%d)/

# Check log file structure (first 10 lines)
head -n 10 /path/to/c2/logs/$(date +%Y-%m-%d)/beacon_*.log
```

### 4. Duplicate Log Entries in Clio

**Symptoms**:
- Same commands appear multiple times in Clio
- Message: "Processed N entries from [file]" appears repeatedly for the same file

**Causes**:
- State file corruption or deletion
- Multiple instances of the forwarder running
- Recent code changes affecting state tracking

**Solutions**:
- Check for multiple running instances: `ps aux | grep forwarder`
- Verify the state file exists: `ls -la clio_forwarder/forwarder_state.pkl`
- If needed, clear state and start fresh:
  ```bash
  rm clio_forwarder/forwarder_state.pkl
  python log_exporter.py --api-key YOUR_KEY --clio-url YOUR_URL --historical-days 1
  ```

### 5. Parsing Errors or Missing Data

**Symptoms**:
- Logs are found but not correctly parsed
- Some fields are missing in Clio entries
- Error messages about regex pattern matching

**Causes**:
- Log format doesn't match the parser's expectations
- C2 framework version differences affecting log format
- Custom configuration of C2 framework changing the log format

**Solutions**:
- Check a few log entries to verify format
- Compare the format with what the parser expects (see parser documentation)
- For Cobalt Strike, ensure Beacon logs use the expected format:
  `[time] Beacon ID (user@host): command`

### 6. Performance Issues

**Symptoms**:
- High CPU usage
- Slow response when processing logs
- Delayed appearance of logs in Clio

**Causes**:
- Too many historical days being processed
- Very large log files
- Too many directories being monitored
- Short polling interval

**Solutions**:
- Reduce the `--historical-days` parameter
- Increase the `--interval` parameter
- Limit `--max-tracked-days` to a reasonable value (2-3 days)
- Run on a system with more resources

### 7. File System Monitoring Issues

**Symptoms**:
- New log files not detected automatically
- Changes only detected after restart or long delay
- "Too many open files" or "inotify instance limit reached" errors

**Causes**:
- System limits on inotify watches
- Too many directories being monitored
- File system not supporting inotify events

**Solutions**:
- Increase system limits for inotify:
  ```bash
  echo fs.inotify.max_user_watches=65536 | sudo tee -a /etc/sysctl.conf
  echo fs.inotify.max_user_instances=256 | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p
  ```
- Reduce the number of directories being monitored
- Use a more frequent polling interval as a fallback

### 8. Service Management Issues

**Symptoms**:
- Systemd service fails to start
- Service starts but immediately exits
- "Failed with result 'exit-code'" in journal logs

**Causes**:
- Incorrect working directory
- Wrong permissions
- Missing dependencies
- Environment issues

**Solutions**:
- Check service status and logs:
  ```bash
  sudo systemctl status c2-log-forwarder
  sudo journalctl -u c2-log-forwarder -n 100 --no-pager
  ```
- Verify the working directory exists and is accessible
- Check that the user running the service has appropriate permissions
- Test running the command manually with the same user
- Verify paths in the service file are absolute and correct

### 9. SSL/TLS Certificate Issues

**Symptoms**:
- "SSL certificate verification failed" errors
- "SSL: CERTIFICATE_VERIFY_FAILED" errors
- Connection failures to Clio

**Causes**:
- Self-signed certificates
- Internal CA not trusted
- Certificate hostname mismatch
- Expired certificates

**Solutions**:
- Use the `--insecure-ssl` flag to disable verification (less secure but works)
- Add your CA to the system's trusted certificate store
- Update your Clio server's certificate to use a trusted CA
- Make sure the certificate's Common Name (CN) matches the hostname in your URL

### 10. Parser-Specific Issues

#### Cobalt Strike Parser

**Issue**: Parser doesn't extract domain information
- Check if your username format is "DOMAIN\user" or "DOMAIN/user"
- The parser extracts domain information from these formats

**Issue**: Timestamps not showing in local timezone
- Timestamps are stored as-is from log files
- They're included in the "notes" field in Clio

## Advanced Troubleshooting

### State File Inspection

If you need to inspect the state file contents:

```python
import pickle

with open('clio_forwarder/forwarder_state.pkl', 'rb') as f:
    state = pickle.load(f)
    
# Print processed files
for file_path, lines in state['processed_lines'].items():
    print(f"{file_path}: {lines} lines processed")
```

### Log File Inspection

To verify log file contents are in the expected format:

```bash
# Show the first 5 lines of all beacon logs today
find $(pwd)/logs/$(date +%Y-%m-%d) -name 'beacon_*.log' -exec head -n 5 {} \;
```

### Debug Mode File Processing Check

To check exactly which files are being considered for processing:

```bash
python log_exporter.py --api-key YOUR_KEY --clio-url YOUR_URL --debug 2>&1 | grep "is_valid_log_file"
```

## Getting Help

If you've tried the troubleshooting steps above and still have issues:

1. Collect the following information:
   - Exact command line used to run the forwarder
   - Debug logs from a run with `--debug` enabled
   - C2 framework type and version
   - Operating system details
   - A few sample log entries with sensitive information redacted

2. Submit an issue on the GitHub repository with this information

## Common Error Messages and Their Meaning

| Error Message | Meaning | Solution |
|---------------|---------|----------|
| "Logs base directory does not exist" | The forwarder can't find the logs directory | Run from C2 framework root directory |
| "Error connecting to Clio API" | Connection to Clio server failed | Check URL, API key, and network connectivity |
| "CSRF token validation failed" | Clio API rejected the request due to CSRF protection | Check Clio configuration, may need an updated version |
| "Failed to parse log file" | Log file format couldn't be processed | Check log format and update parser if needed |
| "File has changed: [file]" | File was modified since last check | Normal operation, logs will be processed |
| "Setting up file watcher for: [dir]" | Starting to monitor a directory | Normal operation |
| "Too many open files" | System limit on open file descriptors reached | Increase system limits or reduce monitored directories |