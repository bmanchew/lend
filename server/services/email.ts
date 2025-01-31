import { MailService } from '@sendgrid/mail';
import { users } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const mailService = new MailService();
const apiKey = process.env.SENDGRID_API_KEY;

if (!apiKey) {
  console.error('SendGrid API key is missing from environment variables');
  throw new Error('SendGrid API key is not set');
}

if (!apiKey.startsWith('SG.')) {
  console.error('Invalid SendGrid API key format - should start with SG.');
  throw new Error('Invalid SendGrid API key format');
}

mailService.setApiKey(apiKey);

const FROM_EMAIL = 'noreply@shifi.com'; // This should be your verified sender

// Test the SendGrid connection with detailed error logging
export async function testSendGridConnection(): Promise<boolean> {
  try {
    console.log('Testing SendGrid connection...');
    console.log('Using API key starting with:', apiKey.substring(0, 5));

    const msg = {
      to: 'test@example.com',
      from: FROM_EMAIL,
      subject: 'SendGrid Test',
      text: 'This is a test email to verify SendGrid configuration.',
      html: '<strong>This is a test email to verify SendGrid configuration.</strong>',
    };

    await mailService.send(msg);
    console.log('SendGrid test email sent successfully');
    return true;
  } catch (error: any) {
    console.error('SendGrid connection test failed:', {
      message: error.message,
      code: error.code,
      response: error.response?.body,
    });
    return false;
  }
}

// Generate verification token
export async function generateVerificationToken(): Promise<string> {
  return crypto.randomBytes(32).toString('hex');
}

// Send verification email
export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  try {
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:5000'}/verify-email?token=${token}`;

    const msg = {
      to,
      from: FROM_EMAIL,
      subject: 'Verify your ShiFi email address',
      html: `
        <div>
          <h1>Welcome to ShiFi!</h1>
          <p>Please click the link below to verify your email address:</p>
          <a href="${verificationUrl}">Verify Email Address</a>
          <p>If you did not create this account, please ignore this email.</p>
        </div>
      `,
    };

    await mailService.send(msg);
    console.log('Verification email sent successfully to:', to);
    return true;
  } catch (error: any) {
    console.error('Error sending verification email:', {
      message: error.message,
      code: error.code,
      response: error.response?.body,
    });
    return false;
  }
}