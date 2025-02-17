
const { MailService } = require('@sendgrid/mail');

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

const mailService = new MailService();
mailService.setApiKey(apiKey);

// Test connection
async function testConnection() {
  try {
    await mailService.send({
      to: 'test@example.com',
      from: 'merchant@shifi.io',
      subject: 'SendGrid Test',
      text: 'Testing SendGrid configuration',
    });
    console.log('SendGrid configuration verified successfully');
  } catch (error) {
    console.error('SendGrid verification failed:', error.message);
    process.exit(1);
  }
}

testConnection();
