import twilio from 'twilio';
const { Twilio } = twilio;
import { logger } from '../lib/logger';
import { slackService } from './slack';

// Configuration validation
const validateConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    throw new Error('Missing Twilio configuration. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER');
  }

  return { accountSid, authToken, twilioPhone };
};

// Initialize client with validation
const getClient = () => {
  const { accountSid, authToken } = validateConfig();
  return new Twilio(accountSid, authToken);
};

export const smsService = {
  formatPhoneNumber(phone: string): string {
    if (!phone) {
      throw new Error('Phone number is required');
    }

    // Remove all non-numeric characters and spaces
    const cleanNumber = phone.replace(/\D/g, '');

    // Validate length
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
      throw new Error('Invalid phone number length');
    }

    // Handle US numbers
    if (cleanNumber.length === 10) {
      return `+1${cleanNumber}`;
    } else if (cleanNumber.length === 11 && cleanNumber.startsWith('1')) {
      return `+${cleanNumber}`;
    }

    // For international numbers
    return `+${cleanNumber}`;
  },

  async sendSMS(to: string, message: string): Promise<boolean> {
    const requestId = Date.now().toString(36);
    try {
      const { twilioPhone } = validateConfig();
      const formattedPhone = this.formatPhoneNumber(to);

      logger.info('[SMS] Attempting to send message', {
        requestId,
        to: formattedPhone,
        fromNumber: twilioPhone,
        messageLength: message.length,
        messagePreview: message.substring(0, 50)
      });

      const client = getClient();
      const result = await client.messages.create({
        body: message,
        to: formattedPhone,
        from: twilioPhone,
      });

      logger.info('[SMS] Message sent successfully', {
        requestId,
        messageId: result.sid,
        to: formattedPhone,
        status: result.status,
        direction: result.direction,
        price: result.price,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage
      });

      return true;
    } catch (error: any) {
      const errorDetails = {
        requestId,
        message: error.message,
        code: error.code,
        status: error.status,
        moreInfo: error.moreInfo,
        details: error.details,
        to,
        twilioError: error.toString(),
        stack: error.stack,
        timestamp: new Date().toISOString()
      };

      logger.error('[SMS] Failed to send message', errorDetails);

      await slackService.notifySMSFailure({
        phone: to,
        error: `${error.code}: ${error.message}`,
        context: 'sendSMS'
      });

      return false;
    }
  },

  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  async sendOTP(phone: string, code: string): Promise<boolean> {
    try {
      logger.info('[SMS] Sending OTP', { phone, codeLength: code.length });
      const message = `Your verification code is: ${code}`;
      const sent = await this.sendSMS(phone, message);

      if (!sent) {
        await slackService.notifySMSFailure({
          phone,
          error: 'Failed to send OTP',
          context: 'sendOTP'
        });
      }

      return sent;
    } catch (error) {
      logger.error('[SMS] Failed to send OTP', {
        error: error instanceof Error ? error.message : 'Unknown error',
        phone
      });
      return false;
    }
  },

  async sendLoanApplicationLink(
    phone: string, 
    merchantName: string, 
    url: string, 
    userId?: number
  ): Promise<{success: boolean, error?: string}> {
    const requestId = Date.now().toString(36);
    try {
      logger.info('[SMS] Preparing loan application link', {
        requestId,
        phone,
        merchantName,
        userId,
        urlLength: url.length
      });

      // Add userId to URL if provided
      const finalUrl = userId ? `${url}&userId=${userId}` : url;
      const message = `${merchantName} has invited you to complete a loan application. Click here to begin: ${finalUrl}`;

      logger.info('[SMS] Sending loan application message', {
        requestId,
        phone,
        messageLength: message.length,
        urlLength: finalUrl.length
      });

      const sent = await this.sendSMS(phone, message);

      logger.info('[SMS] Loan application message status', {
        requestId,
        success: sent,
        phone,
        userId
      });

      return { success: sent };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[SMS] Failed to send loan application link', {
        requestId,
        error: errorMessage,
        phone,
        userId,
        stack: error instanceof Error ? error.stack : undefined
      });

      await slackService.notifySMSFailure({
        phone,
        error: errorMessage,
        context: 'sendLoanApplicationLink'
      });

      return { success: false, error: errorMessage };
    }
  }
};

export default smsService;