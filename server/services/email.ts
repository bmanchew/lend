import { MailService } from '@sendgrid/mail';
import crypto from 'crypto';
import { z } from 'zod';

const mailService = new MailService();

// Email validation schema
const emailConfigSchema = z.object({
  apiKey: z.string().min(1, 'SendGrid API key is required'),
  fromEmail: z.string().email('Invalid sender email')
});

// Validate API key format and structure
function validateApiKey(apiKey: string): { isValid: boolean; error?: string } {
  if (!apiKey) {
    return { isValid: false, error: 'SendGrid API key is required' };
  }

  if (!apiKey.startsWith('SG.')) {
    return { isValid: false, error: 'SendGrid API key must start with "SG."' };
  }

  const [prefix, encoded] = apiKey.split('.');
  if (!encoded) {
    return { isValid: false, error: 'Invalid SendGrid API key format' };
  }

  try {
    Buffer.from(encoded, 'base64');
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid SendGrid API key encoding' };
  }
}

// Get API key from environment
const apiKey = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'merchant@shifi.io';

try {
  const config = emailConfigSchema.parse({
    apiKey,
    fromEmail: FROM_EMAIL
  });

  const validation = validateApiKey(config.apiKey);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  mailService.setApiKey(config.apiKey);
} catch (error) {
  console.error('Email service configuration error:', error instanceof Error ? error.message : 'Unknown error');
  console.warn('Email functionality will be disabled');
}

// Email sending types
const emailSchema = z.object({
  to: z.string().email('Invalid recipient email'),
  subject: z.string().min(1, 'Subject is required'),
  html: z.string().min(1, 'Email content is required')
});

type EmailData = z.infer<typeof emailSchema>;

// Test SendGrid connection
export async function testSendGridConnection(): Promise<boolean> {
  try {
    console.log('Testing SendGrid connection with configuration:', {
      fromEmail: FROM_EMAIL,
      apiKeyPrefix: apiKey?.substring(0, 5) + '...' // Log only the prefix for security
    });

    const msg = {
      to: 'test@example.com',
      from: FROM_EMAIL,
      subject: 'SendGrid Connection Test',
      text: 'This is a test email to verify SendGrid configuration.',
    };

    await mailService.send(msg);
    console.log('SendGrid test successful');
    return true;
  } catch (error: any) {
    console.error('SendGrid test failed:', {
      message: error.message,
      code: error.code,
      response: error.response?.body,
      details: error.response?.headers,
    });
    return false;
  }
}

// Send verification email
export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  try {
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:5000'}/verify-email?token=${token}`;

    const emailData = emailSchema.parse({
      to,
      subject: 'Verify your ShiFi email address',
      html: `
        <div>
          <h1>Welcome to ShiFi!</h1>
          <p>Please click the link below to verify your email address:</p>
          <a href="${verificationUrl}">Verify Email Address</a>
          <p>If you did not create this account, please ignore this email.</p>
        </div>
      `
    });

    await mailService.send({
      ...emailData,
      from: FROM_EMAIL
    });

    console.log('Verification email sent successfully to:', to);
    return true;
  } catch (error: any) {
    console.error('Error sending verification email:', {
      message: error.message,
      code: error.code,
      response: error.response?.body,
      details: error.response?.headers,
    });
    return false;
  }
}

// Generate verification token
export async function generateVerificationToken(): Promise<string> {
  return crypto.randomBytes(32).toString('hex');
}

export async function sendMerchantCredentials(
  to: string,
  username: string,
  password: string
): Promise<boolean> {
  try {
    const emailData = emailSchema.parse({
      to,
      subject: 'Your Merchant Account Credentials',
      html: `
        <div>
          <h1>Welcome to ShiFi!</h1>
          <p>Your merchant account has been created. Here are your login credentials:</p>
          <p><strong>Username:</strong> ${username}</p>
          <p><strong>Password:</strong> ${password}</p>
          <p>Please change your password after your first login.</p>
          <p>If you did not request this account, please contact support immediately.</p>
        </div>
      `
    });

    await mailService.send({
      ...emailData,
      from: FROM_EMAIL
    });

    console.log('Merchant credentials sent successfully to:', to);
    return true;
  } catch (error: any) {
    console.error('Error sending merchant credentials:', {
      message: error.message,
      code: error.code,
      response: error.response?.body,
      details: error.response?.headers,
    });
    return false;
  }
}