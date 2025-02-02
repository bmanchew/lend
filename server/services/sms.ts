import { Twilio } from 'twilio';
import { logger } from '../lib/logger';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const client = new Twilio(accountSid, authToken);

class SMSService {
  private static formatPhoneNumber(phone: string): string {
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
  }

  static async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      const formattedPhone = this.formatPhoneNumber(to);

      await client.messages.create({
        body: message,
        to: formattedPhone,
        from: twilioPhone,
      });

      logger.info(`SMS sent successfully to ${formattedPhone}`);
      return true;
    } catch (error) {
      logger.error('Error sending SMS:', error);
      throw error;
    }
  }

  static async sendOTP(phone: string, code: string): Promise<boolean> {
    const message = `Your verification code is: ${code}`;
    return this.sendSMS(phone, message);
  }
}

export default SMSService;