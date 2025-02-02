
import twilio from 'twilio';
const { Twilio } = twilio;
import { logger } from '../lib/logger';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const client = new Twilio(accountSid, authToken);

export const smsService = {
  formatPhoneNumber(phone: string): string {
    if (!phone) throw new Error('Phone number is required');

    // Remove all non-numeric characters
    const cleanNumber = phone.replace(/\D/g, '');

    // Validate length and format
    if (cleanNumber.length === 10) {
      return `+1${cleanNumber}`;
    } else if (cleanNumber.length === 11 && cleanNumber.startsWith('1')) {
      return `+${cleanNumber}`;
    }

    throw new Error('Invalid phone number format');
  },

  async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      
      if (!twilioPhone || !accountSid || !authToken) {
        logger.error('Missing Twilio configuration');
        return false;
      }

      const result = await client.messages.create({
        body: message,
        to: formattedPhone,
        from: twilioPhone,
      });

      logger.info(`SMS sent successfully to ${formattedPhone}`, { messageId: result.sid });
      return true;
    } catch (error: any) {
      logger.error('Error sending SMS:', {
        error: error.message,
        code: error.code,
        phone: to
      });
      return false;
    }
  },

  async sendOTP(phone: string, code: string): Promise<boolean> {
    const message = `Your verification code is: ${code}`;
    return this.sendSMS(phone, message);
  },

  generateOTP(): string {
    const { totp } = require('otplib');
    const secret = totp.generateSecret();
    return totp.generate(secret);
  },

  async sendLoanApplicationLink(phone: string, merchantName: string, url: string): Promise<{success: boolean, error?: string}> {
    try {
      const message = `${merchantName} has invited you to complete a loan application. Click here to begin: ${url}`;
      await this.sendSMS(phone, message);
      return { success: true };
    } catch (error) {
      logger.error('Error sending loan application link:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
};

export default smsService;
