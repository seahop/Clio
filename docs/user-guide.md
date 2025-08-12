# User Guide

This guide explains how to use the Clio Logging Platform for red team operations. Clio provides a collaborative environment for tracking activities, managing file status, and analyzing relationships between different entities.

## Getting Started

### Authentication

1. Access the application at https://localhost (or your configured domain)
2. Log in with your provided credentials:
   - For the first login, use the credentials generated during setup
   - You will be prompted to change your password on first login

### User Roles

- **Admin**: Full access to all features, including user management, exports, system settings, and operations management
- **User**: Access to log entries, relationships, file status tracking, and assigned operations

## Main Interface

The Clio interface consists of several primary views accessible from the top navigation:

<p align="center">
<img src="../images/Clio_user_init.png" alt="Clio User View" width="1000"/>
</p>

### Logs View

The Logs view is the main logging interface for recording and tracking activities.

**Key Features:**
- **Add Row**: Create a new log entry
- **Edit Cells**: Click on any cell to edit its content
- **Row Locking**: Lock a row to prevent others from editing it while you work
- **Cell Navigation**: Use Tab key to navigate between cells
- **Templates**: Save and reuse common log patterns across the team
- **Evidence Management**: Attach files and evidence to log entries
- **Tags**: Organize and categorize logs with tags
- **Auto-tagging**: Logs are automatically tagged with your active operation

<p align="center">
<img src="../images/Clio_user_card_view.png" alt="Clio Card View Expanded" width="1000"/>
</p>
<p align="center">
<img src="../images/Clio_user_card_view2.png" alt="Clio Card View Condensed" width="1000"/>
</p>
<br>
There is a legacy view which might not be supported for long term support<br>
If there is interest in keeping it, let me know
<p>
</p>
<p align="center">
<img src="../images/Clio_user_table_view.png" alt="Clio Table View" width="1000"/>
</p>

**Working with Log Entries:**
1. Click "Add Row" to create a new log entry
2. Fill in relevant details such as IPs, hostnames, commands, and status
3. Use the lock icon to lock/unlock rows as needed
4. Add evidence files by clicking the file icon in each row
5. Add or remove tags to categorize your logs

**Log Entry Fields:**
- **Internal IP**: Target system internal IP address
- **External IP**: External/public IP address
- **Hostname**: System hostname
- **Domain**: Associated domain
- **Username**: User account being used
- **Command**: Command executed on the system
- **Notes**: Additional context or observations
- **Filename**: Name of relevant files
- **Hash Algorithm**: Algorithm of following file hash
- **Hash Value**: Hash value of file or other
- **Status**: Current status (ON_DISK, IN_MEMORY, etc.)
- **Tags**: Labels for categorization and filtering

## Tags System

Clio includes a comprehensive tagging system to organize and categorize your logs. Tags help you quickly filter, search, and report on specific activities.

### Tag Categories

Tags are organized into the following categories:

- **Technique**: MITRE ATT&CK techniques (e.g., reconnaissance, lateral-movement, persistence)
- **Tool**: Common red team tools (e.g., mimikatz, cobalt-strike, metasploit)
- **Workflow**: Process status tags (e.g., in-progress, needs-review, completed)
- **Evidence**: Evidence type indicators (e.g., screenshot, packet-capture, log-file)
- **Security**: Classification levels (e.g., sensitive, pii, classified)
- **Operation**: Operation-specific tags (automatically created for each operation)

### Working with Tags

**Adding Tags to Logs:**
1. Click on a log entry to view its details
2. Click the tag icon or "Add Tag" button
3. Select from existing tags or create a new one
4. Tags are immediately applied and visible on the log

**Filtering by Tags:**
1. Use the tag filter dropdown in the logs view
2. Select one or more tags to filter logs
3. You can combine multiple tags for advanced filtering

**Tag Management (Admin Only):**
- Create new tags with custom colors and descriptions
- Edit existing tags (except operation tags which are protected)
- View tag usage statistics
- Delete unused tags

### Operations and Auto-tagging

When you're assigned to an operation, your logs are automatically tagged with that operation's tag. This ensures consistent tracking across team members working on the same engagement.

## Operations Management

Operations allow teams to organize their work by engagement, project, or campaign. Each operation automatically creates an associated tag for tracking all related activities.

### For Users

**Viewing Your Operations:**
1. Navigate to "My Operations" in the user menu
2. View all operations you're assigned to
3. See your currently active operation highlighted

**Setting Your Active Operation:**
1. Go to "My Operations"
2. Select the operation you want to work under
3. Click "Set as Active"
4. All new logs will be automatically tagged with this operation

**Operation Auto-tagging:**
- When you create a new log, it's automatically tagged with your active operation
- This ensures all team activities are properly categorized
- You can add additional tags as needed

### For Administrators

**Creating Operations:**
1. Navigate to Admin → Operations Management
2. Click "Create Operation"
3. Enter operation details:
   - **Name**: Unique operation identifier
   - **Description**: Details about the engagement
4. An operation tag (prefixed with "OP:") is automatically created

**Managing User Assignments:**
1. Select an operation from the list
2. Click "Manage Users"
3. Assign users to the operation:
   - Search for users by username
   - Click "Assign" to add them to the operation
   - Remove users when they complete their work

**Operation Features:**
- Each operation generates a unique tag for tracking
- Users can be assigned to multiple operations
- Users can switch between operations as needed
- Operation tags are protected from editing/deletion
- View all users assigned to each operation

### Relationships View

The Relationships view provides a visual representation of connections between various entities.

**Relationship Types:**
- **Host Relations**: Connections between different hosts
- **IP Relations**: Relationships between IP addresses
- **Domain Relations**: Domain interconnections
- **User Commands**: Commands executed by specific users

**Using the Relationships View:**
1. Select the relationship type from the top filter buttons
2. Expand nodes to view connected entities
3. Use the refresh button to update relationship data

<p align="center">
<img src="../images/Clio_user_relations_view1.png" alt="Clio Relations Overview" width="1000"/>
</p>
<p align="center">
<img src="../images/Clio_user_relations_view2.png" alt="Clio User Commands" width="1000"/>
</p>

### File Status View

The File Status view tracks files across systems with different statuses.

**Status Types:**
- **ON_DISK**: File is still present on the target system
- **IN_MEMORY**: File is loaded only in memory
- **ENCRYPTED**: File is present but encrypted
- **REMOVED**: File has been deleted
- **CLEANED**: File and traces have been removed
- **DORMANT**: Inactive but still present
- **DETECTED**: AV/EDR has flagged the file
- **UNKNOWN**: Status requires verification

**File Tracking Features:**
- Filter by status, hostname, or analyst
- View file history and changes over time
- Track hashes and file metadata
- Search for specific files
- Filter by operation tags

<p align="center">
<img src="../images/Clio_user_file_view.png" alt="Clio File View" width="1000"/>
</p>

## Admin Features

<p align="center">
<img src="../images/Clio_admin_init.png" alt="Clio Admin View" width="1000"/>
</p>

### Operations Management

Administrators can create and manage operations for organizing team activities:

1. **Create Operations**: Set up new engagements with automatic tag generation
2. **Assign Users**: Add team members to operations
3. **Monitor Activity**: Track which users are working on which operations
4. **Manage Lifecycle**: Deactivate completed operations while preserving history

### Tags Management

Administrators have full control over the tagging system:

1. **Create Tags**: Add new tags with custom colors and categories
2. **Edit Tags**: Modify tag properties (except protected operation tags)
3. **View Statistics**: See tag usage across all logs
4. **Delete Tags**: Remove unused tags from the system

### Export Database

Admins can export data for offline analysis or reporting:

1. Select columns to include in the export
2. Choose between CSV-only or full evidence package
3. Optional: Include relationship data and hash information
4. Filter by operation tags for operation-specific exports
5. Export files are saved on the server for secure handling

<p align="center">
<img src="../images/Clio_admin_export.png" alt="Clio Admin Report Export" width="1000"/>
</p>

### Session Management

Admins can monitor and manage active user sessions:

1. View all current user sessions
2. Revoke individual sessions as needed
3. Force global logout for all users in case of security concerns
4. Track session duration and last activity

<p align="center">
<img src="../images/Clio_admin_session_mgmt.png" alt="Clio Session Management" width="1000"/>
</p>

### API Key Management

Admins can create and manage API keys for integration with external tools:

1. Create API keys with specific permissions
2. Set optional expiration dates
3. View usage statistics and last used time
4. Revoke or delete keys as needed

<p align="center">
<img src="../images/Clio_admin_api_keys.png" alt="Clio API Key Management" width="1000"/>
</p>

### Log Management

Admins can manage the system logs:

1. Auto rotation of logs every 24 hours
2. Force logs to rotate and zip
3. Track the log exports
4. If file size exceeds limit, will auto zip and rotate

<p align="center">
<img src="../images/Clio_admin_logs.png" alt="Clio Log Management" width="1000"/>
</p>

### S3 Integration

Admins can configure S3 storage for log archives:

1. Navigate to the Log Management view
2. Click "S3 Export Configuration"
3. Enter your S3 credentials and bucket information
4. Enable automatic log archival to S3

## Best Practices

### Effective Tagging
- Use consistent tags across your team
- Apply MITRE ATT&CK technique tags for better reporting
- Tag evidence types for quick reference
- Use workflow tags to track log status

### Operation Management
- Set your active operation at the start of each work session
- Verify your active operation before creating logs
- Coordinate with your team lead on operation assignments

### Collaboration
- Lock rows when making extensive edits
- Use templates for consistent logging patterns
- Add detailed notes for complex activities
- Tag logs appropriately for team visibility

### Security
- Change default passwords immediately
- Use strong, unique passwords
- Log out when not actively using the system
- Report any suspicious activity to administrators

## Keyboard Shortcuts

- **Tab**: Navigate to next cell
- **Shift+Tab**: Navigate to previous cell
- **Enter**: Save current cell and move down
- **Escape**: Cancel current edit
- **Ctrl+S** / **Cmd+S**: Save current row

## Troubleshooting

### Common Issues

**Cannot edit a row:**
- Check if the row is locked by another user
- Verify you have the appropriate permissions

**Tags not appearing:**
- Refresh the page to load latest tags
- Check if you have permission to view certain tag categories

**Operation not available:**
- Verify you've been assigned to the operation
- Contact your administrator for assignment

**API key not working:**
- Verify the key hasn't expired
- Check that the key has appropriate permissions
- Ensure you're using the correct header format

## Support

For technical issues or questions:
1. Check this user guide for answers
2. Contact your system administrator
3. Report bugs through the designated channel
4. For security concerns, contact your security team immediately