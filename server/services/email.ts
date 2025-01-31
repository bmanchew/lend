import { MailService } from '@sendgrid/mail';
import crypto from 'crypto';

const mailService = new MailService();
const apiKey = process.env.SENDGRID_API_KEY;

if (!apiKey) {
  console.error('SendGrid API key is missing from environment variables');
  throw new Error('SendGrid API key is not set');
}

mailService.setApiKey(apiKey);

const FROM_EMAIL = 'merchant@shifi.io'; // Sender email

// Generate verification token
export async function generateVerificationToken(): Promise<string> {
  return crypto.randomBytes(32).toString('hex');
}

// Send verification email
export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  try {
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:5000'}/verify-email?token=${token}`;
    console.log('Attempting to send email with configuration:', {
      to,
      from: FROM_EMAIL,
      verificationUrl
    });

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
      details: error.response?.headers,
    });
    return false;
  }
}