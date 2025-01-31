const fs = require('fs');
const path = require('path');

// Read the API key
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.error('SENDGRID_API_KEY environment variable is not set');
  process.exit(1);
}

// Test it's in the right format
if (!apiKey.startsWith('SG.')) {
  console.error('Invalid SendGrid API key format. It should start with "SG."');
  process.exit(1);
}

console.log('SendGrid API key is properly formatted and set in the environment');
