import { MailService } from '@sendgrid/mail';
import { users } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY!);

const FROM_EMAIL = 'noreply@shifi.com'; // Update this with your verified sender

export async function generateVerificationToken(): Promise<string> {
  return crypto.randomBytes(32).toString('hex');
}

export async function sendVerificationEmail(to: string, token: string) {
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

  try {
    await mailService.send(msg);
    console.log('Verification email sent successfully to:', to);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
}

// Test the SendGrid connection
export async function testSendGridConnection(): Promise<boolean> {
  try {
    await mailService.send({
      to: 'test@example.com',
      from: FROM_EMAIL,
      subject: 'SendGrid Test',
      text: 'This is a test email to verify SendGrid configuration.',
    });
    return true;
  } catch (error) {
    console.error('SendGrid connection test failed:', error);
    return false;
  }
}
