
import twilio from 'twilio';
import { SMSConfig } from '../index';

export class SMSService {
  private client: twilio.Twilio;
  private config: SMSConfig;

  constructor(config: SMSConfig) {
    if (!config.fromNumber) {
      throw new Error('Twilio from number is required');
    }
    this.config = config;
    this.client = twilio(config.accountSid, config.authToken);
  }

  async sendLoanApplicationLink(toNumber: string, merchantName: string, applicationUrl: string): Promise<{ success: boolean, error?: string }> {
    try {
      const formattedPhone = this.formatPhoneNumber(toNumber);

      console.log("[SMSService] Sending loan application link:", {
        originalNumber: toNumber,
        formattedNumber: formattedPhone,
        merchant: merchantName,
        url: applicationUrl,
        timestamp: new Date().toISOString()
      });

      try {
        new URL(applicationUrl);
      } catch {
        console.error("[SMSService] Invalid URL:", applicationUrl);
        return {success: false, error: 'Invalid application URL'};
      }

      const message = await this.client.messages.create({
        body: `${merchantName} has invited you to apply for financing. Click here to start: ${applicationUrl}`,
        from: this.config.fromNumber,
        to: formattedPhone
      });

      console.log("[SMSService] Successfully sent application link:", {
        messageId: message.sid,
        status: message.status,
        timestamp: new Date().toISOString()
      });

      return {success: true};
    } catch (error) {
      console.error("[SMSService] Error sending application link:", {
        error,
        originalNumber: toNumber,
        timestamp: new Date().toISOString()
      });
      return {success: false, error: error.message};
    }
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-digits and any leading/trailing whitespace
    const cleaned = phone.trim().replace(/\D/g, '');
    
    // Handle already formatted numbers with country code
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }
    
    // Handle 10-digit numbers
    if (cleaned.length === 10) {
      return '+1' + cleaned;
    }

    console.error("[SMSService] Invalid phone format:", {
      original: phone,
      cleaned: cleaned,
      length: cleaned.length
    });
    throw new Error('Invalid phone number format');
  }

  async sendOTP(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      console.log('[SMSService] Sending OTP:', {
        original: phoneNumber,
        formatted: formattedPhone,
        timestamp: new Date().toISOString()
      });

      const message = await this.client.messages.create({
        body: `Your ShiFi login code is: ${code}. Valid for 5 minutes.`,
        from: this.config.fromNumber,
        to: formattedPhone
      });

      console.log("[SMSService] Successfully sent OTP:", {
        messageId: message.sid,
        status: message.status,
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error("[SMSService] Error sending OTP:", {
        error,
        phoneNumber,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }
}

// Create and export an instance
const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;
if (!twilioFromNumber) {
  console.error('[SMSService] Missing TWILIO_FROM_NUMBER environment variable');
}

export const smsService = new SMSService({
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: twilioFromNumber || ''
});
