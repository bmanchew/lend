import twilio from 'twilio';
const { Twilio } = twilio;
import { logger } from '../lib/logger';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

class SMSService {
  private client: twilio.Twilio | null = null;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient() {
    try {
      if (!accountSid || !authToken || !twilioPhone) {
        logger.error('Missing Twilio credentials:', {
          hasSid: !!accountSid,
          hasToken: !!authToken,
          hasPhone: !!twilioPhone
        });
        return;
      }

      // Validate credentials format
      if (!accountSid.startsWith('AC')) {
        logger.error('Invalid Twilio Account SID format');
        return;
      }

      if (!twilioPhone.startsWith('+')) {
        logger.error('Invalid Twilio phone number format:', {
          phone: twilioPhone
        });
        return;
      }

      this.client = new Twilio(accountSid, authToken);

      // Test the client connection
      const account = await this.client.api.accounts(accountSid).fetch();
      logger.info('SMS Service initialized successfully', {
        fromPhone: twilioPhone,
        accountStatus: account.status
      });
    } catch (error) {
      logger.error('Failed to initialize Twilio client:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      this.client = null;
    }
  }

  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      if (!this.client) {
        logger.error('Twilio client not initialized');
        await this.initializeClient(); // Try to reinitialize
        if (!this.client) {
          return false;
        }
      }

      if (!twilioPhone) {
        logger.error('Missing Twilio phone number');
        return false;
      }

      // Clean and format phone number
      let cleanNumber = to.replace(/[^\d+]/g, '');
      if (!cleanNumber.startsWith('+')) {
        cleanNumber = cleanNumber.startsWith('1') ? 
          `+${cleanNumber}` : 
          `+1${cleanNumber}`;
      }

      // Prevent sending to the same number as the Twilio number
      if (cleanNumber === twilioPhone) {
        logger.error('Cannot send SMS to Twilio number:', {
          to: cleanNumber,
          twilioPhone,
          timestamp: new Date().toISOString()
        });
        return false;
      }

      logger.info('Attempting to send SMS:', {
        to: cleanNumber,
        fromNumber: twilioPhone,
        messageLength: message.length,
        timestamp: new Date().toISOString()
      });

      const result = await this.client.messages.create({
        body: message,
        to: cleanNumber,
        from: twilioPhone
      });

      logger.info('SMS sent successfully:', {
        messageId: result.sid,
        to: cleanNumber,
        status: result.status,
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error: any) {
      logger.error('SMS sending failed:', {
        error: error.message,
        code: error.code,
        to,
        details: error.response?.data || error.stack,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  async sendOTP(phone: string, code: string): Promise<boolean> {
    try {
      logger.info('Sending OTP:', { 
        phone, 
        codeLength: code.length,
        timestamp: new Date().toISOString()
      });

      const message = `Your ShiFi verification code is: ${code}\nValid for 5 minutes.`;
      const result = await this.sendSMS(phone, message);

      logger.info('OTP send result:', { 
        success: result,
        phone,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      logger.error('Error in sendOTP:', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        phone,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  // Test method to verify Twilio configuration
  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        await this.initializeClient();
        if (!this.client) return false;
      }

      const account = await this.client.api.accounts(accountSid!).fetch();
      logger.info('Twilio test connection successful:', {
        status: account.status,
        timestamp: new Date().toISOString()
      });

      return account.status === 'active';
    } catch (error) {
      logger.error('Twilio test connection failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }

  async sendLoanApplicationLink(phone: string, merchantName: string, url: string, userId?: number): Promise<{success: boolean, error?: string}> {
    try {
      // Add userId to URL if provided
      const finalUrl = userId ? `${url}&userId=${userId}` : url;
      const message = `${merchantName} has invited you to complete a loan application. Click here to begin: ${finalUrl}`;

      const sent = await this.sendSMS(phone, message);
      logger.info('Loan application SMS sent:', {
        phone,
        userId,
        success: sent,
        timestamp: new Date().toISOString()
      });

      return { success: sent };
    } catch (error) {
      logger.error('Error sending loan application link:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        phone,
        userId 
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export const smsService = new SMSService();
export default smsService;