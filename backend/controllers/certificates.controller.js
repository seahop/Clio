// backend/controllers/certificates.controller.js
const path = require('path');
const fs = require('fs').promises;
const eventLogger = require('../lib/eventLogger');
const forge = require('node-forge');

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
        
        // Parse certificate using node-forge
        const certObj = forge.pki.certificateFromPem(certData);
        
        // Extract certificate information
        const subject = formatDN(certObj.subject.attributes);
        const issuer = formatDN(certObj.issuer.attributes);
        const validFrom = certObj.validity.notBefore;
        const validTo = certObj.validity.notAfter;
        
        // Calculate days until expiry
        const expiryDate = validTo;
        const today = new Date();
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

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
 * Helper function to format Distinguished Name (DN) from certificate attributes
 */
function formatDN(attributes) {
  return attributes.reduce((result, attr) => {
    // Map attribute types to human-readable names
    const typeMap = {
      'CN': 'commonName',
      'O': 'organizationName',
      'OU': 'organizationalUnitName',
      'C': 'countryName',
      'ST': 'stateOrProvinceName',
      'L': 'localityName',
      'E': 'emailAddress'
    };
    
    const type = typeMap[attr.type] || attr.type;
    result[type] = attr.value;
    return result;
  }, {});
}

module.exports = {
  getCertificateStatus
};