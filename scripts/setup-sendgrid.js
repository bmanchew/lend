const fs = require('fs');
const path = require('path');

// Read the API key
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.error('SENDGRID_API_KEY environment variable is not set');
  process.exit(1);
}

// Test it's in the right format
if (!apiKey.startsWith('SG.') || apiKey.length < 50) {
  console.error('Invalid SendGrid API key format. It should start with "SG." and be at least 50 characters long');
  process.exit(1);
}

// Additional validation for key structure
const [prefix, encoded] = apiKey.split('.');
if (!encoded || encoded.length < 40) {
  console.error('Invalid SendGrid API key structure. The key appears to be malformed');
  process.exit(1);
}

try {
  // Verify the key is base64 encoded after the SG. prefix
  Buffer.from(encoded, 'base64');
  console.log('SendGrid API key is properly formatted and set in the environment');
} catch (error) {
  console.error('Invalid SendGrid API key encoding. The key appears to be malformed');
  process.exit(1);
}