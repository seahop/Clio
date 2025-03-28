// utils/constants.js
export const COLUMNS = [
  { field: 'timestamp', header: 'Timestamp', width: 'w-32 md:w-40' },
  { field: 'internal_ip', header: 'Internal IP', width: 'w-28 md:w-36' },
  { field: 'external_ip', header: 'External IP', width: 'w-28 md:w-36' },
  { field: 'mac_address', header: 'MAC Address', width: 'w-32 md:w-40' },
  { field: 'hostname', header: 'Hostname', width: 'w-36 md:w-48' },
  { field: 'domain', header: 'Domain', width: 'w-36 md:w-48' },
  { field: 'username', header: 'User', width: 'w-24 md:w-32' },
  { field: 'secrets', header: 'Secrets', width: 'w-48 md:w-64 lg:w-96' },
  { field: 'command', header: 'Command', width: 'w-48 md:w-64 lg:w-96' },
  { field: 'notes', header: 'Notes', width: 'w-64 md:w-80 lg:w-96' },  
  { field: 'filename', header: 'Filename', width: 'w-36 md:w-48' },
  { field: 'hash_algorithm', header: 'Hash Algorithm', width: 'w-32 md:w-40' },
  { field: 'hash_value', header: 'Hash Value', width: 'w-48 md:w-64' },
  { field: 'pid', header: 'PID', width: 'w-20 md:w-24' },
  { field: 'status', header: 'Status', width: 'w-24 md:w-32' },
  { field: 'analyst', header: 'Analyst', width: 'w-24 md:w-32' }
];

// Hash algorithm options
export const HASH_ALGORITHMS = [
  { value: 'MD5', label: 'MD5' },
  { value: 'SHA1', label: 'SHA-1' },
  { value: 'SHA256', label: 'SHA-256' },
  { value: 'SHA512', label: 'SHA-512' },
  { value: 'BLAKE2', label: 'BLAKE2' },
  { value: 'RIPEMD160', label: 'RIPEMD-160' },
  { value: 'CRC32', label: 'CRC32' },
  { value: 'SHA3', label: 'SHA-3' },
  { value: 'OTHER', label: 'Other' }
];