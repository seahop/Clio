// backend/controllers/certificates.controller.js
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const eventLogger = require('../lib/eventLogger');

/**
 * Get certificate information
 */
const getCertificateStatus = async (req, res) => {
  try {
    // Set the base path for certificates
    const certsDir = path.join(__dirname, '../certs');
    
    // Define certificate files to check
    const certificates = [
      { name: 'server', file: 'server.crt', type: 'self-signed', service: 'All services' },
      { name: 'backend', file: 'backend.crt', type: 'self-signed', service: 'Backend' },
      { name: 'redis', file: 'redis.crt', type: 'self-signed', service: 'Redis' },
      { name: 'db', file: 'db.crt', type: 'self-signed', service: 'Database' }
    ];
    
    // Check if Let's Encrypt certificate exists - try various common filenames
    const letsEncryptFiles = [
      'letsencrypt-fullchain.pem',
      'fullchain.pem',
      'cert.pem'
    ];
    
    // Try to find Let's Encrypt certificate
    let foundLetsEncrypt = false;
    for (const letsEncryptFile of letsEncryptFiles) {
      try {
        const letsEncryptPath = path.join(certsDir, letsEncryptFile);
        await fs.access(letsEncryptPath);
        certificates.push({
          name: 'letsencrypt', 
          file: letsEncryptFile,
          type: 'lets-encrypt',
          service: 'External connections (nginx)'
        });
        foundLetsEncrypt = true;
        console.log(`Found Let's Encrypt certificate at: ${letsEncryptPath}`);
        break; // Found one, stop looking
      } catch (err) {
        // Continue checking other filenames
      }
    }

    if (!foundLetsEncrypt) {
      console.log("No Let's Encrypt certificates found in the certs directory");
    }

    // Get details for each certificate
    const certDetails = await Promise.all(certificates.map(async (cert) => {
      try {
        const certPath = path.join(certsDir, cert.file);
        
        // Check if the file exists
        try {
          await fs.access(certPath);
        } catch (accessError) {
          console.log(`Certificate file ${cert.file} not accessible: ${accessError.message}`);
          return {
            name: cert.name,
            type: cert.type,
            service: cert.service,
            error: 'Certificate file not found',
            status: 'missing'
          };
        }
        
        // Read certificate file
        const certData = await fs.readFile(certPath, 'utf8');

        // Parse using Node's built-in X509Certificate — handles RSA, ECDSA, chain
        // files (full chains in one PEM), and certs from custom CAs without needing
        // the third-party node-forge library.
        const certObj = new crypto.X509Certificate(certData);

        const subject = parseDNString(certObj.subject);
        const issuer  = parseDNString(certObj.issuer);
        const validFrom = new Date(certObj.validFrom);
        const validTo   = new Date(certObj.validTo);

        // Calculate days until expiry
        const today = new Date();
        const daysUntilExpiry = Math.ceil((validTo - today) / (1000 * 60 * 60 * 24));

        return {
          name: cert.name,
          type: cert.type,
          service: cert.service,
          subject,
          issuer,
          validFrom,
          validTo,
          daysUntilExpiry,
          status: daysUntilExpiry <= 0 ? 'expired' : 
                 daysUntilExpiry <= 30 ? 'expiring-soon' : 'valid'
        };
      } catch (error) {
        console.error(`Error processing certificate ${cert.name}:`, error);
        return {
          name: cert.name,
          type: cert.type,
          service: cert.service,
          error: error.message,
          status: 'error'
        };
      }
    }));

    // Log the certificate check
    await eventLogger.logAuditEvent('view_certificates', req.user.username, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    res.json(certDetails);
  } catch (error) {
    console.error('Error getting certificate status:', error);
    res.status(500).json({ error: 'Failed to get certificate status', message: error.message });
  }
};

/**
 * Parse the DN string returned by crypto.X509Certificate (e.g. "CN=example.com\nO=Org\n")
 * into the same {commonName, organizationName, ...} shape the UI expects.
 */
function parseDNString(dn) {
  const typeMap = {
    CN: 'commonName',
    O:  'organizationName',
    OU: 'organizationalUnitName',
    C:  'countryName',
    ST: 'stateOrProvinceName',
    L:  'localityName',
    E:  'emailAddress',
  };
  const result = {};
  // DN lines are separated by '\n'; each looks like "CN=example.com"
  for (const line of dn.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;
    const key   = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    result[typeMap[key] || key] = value;
  }
  return result;
}

module.exports = {
  getCertificateStatus
};