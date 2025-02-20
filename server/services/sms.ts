import twilio from 'twilio';
const { Twilio } = twilio;
import shorturl from 'shorturl';
import { promisify } from 'util';
import { logger } from '../lib/logger';
import { slackService } from './slack';

const shortenUrl = promisify(shorturl);

// Configuration validation
const validateConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    throw new Error('Missing Twilio configuration. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER');
  }

  logger.info('[SMS] Config validation successful', { 
    accountSidLength: accountSid.length,
    twilioPhone 
  });

  return { accountSid, authToken, twilioPhone };
};

// Initialize client with validation
const getClient = () => {
  const { accountSid, authToken } = validateConfig();
  return new Twilio(accountSid, authToken);
};

export const smsService = {
  async sendPaymentReminder(phone: string, amount: number, dueDate: string): Promise<boolean> {
    try {
      const message = `Payment Reminder: Your payment of $${amount} is due on ${dueDate}. Please ensure timely payment to avoid late fees.`;
      return await this.sendSMS(phone, message);
    } catch (error) {
      logger.error('[SMS] Failed to send payment reminder', {
        error: error instanceof Error ? error.message : 'Unknown error',
        phone
      });
      return false;
    }
  },

  formatPhoneNumber(phone: string): string {
    if (!phone) {
      throw new Error('Phone number is required');
    }

    // Remove all non-numeric characters first
    const cleanNumber = phone.replace(/\D/g, '');

    // Handle numbers that might start with 1
    const baseNumber = cleanNumber.startsWith('1') ? cleanNumber.slice(1) : cleanNumber;

    // Check if we have a valid 10-digit number after cleaning
    if (baseNumber.length !== 10) {
      throw new Error('Phone number must be exactly 10 digits after removing country code');
    }

    // Validate area code (first 3 digits)
    const areaCode = baseNumber.substring(0, 3);
    if (areaCode === '000' || areaCode === '911') {
      throw new Error('Invalid area code');
    }

    // Format as +1XXXXXXXXXX
    const formattedNumber = `+1${baseNumber}`;

    logger.info('[SMS] Formatted phone number:', {
      original: phone,
      cleaned: cleanNumber,
      formatted: formattedNumber
    });

    return formattedNumber;
  },

  async sendOTP(phone: string, code: string): Promise<boolean> {
    try {
      logger.info('[SMS] Sending OTP', { 
        phone,
        codeLength: code.length,
        timestamp: new Date().toISOString()
      });

      if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
        throw new Error('Invalid OTP format - must be 6 digits');
      }

      const formattedPhone = this.formatPhoneNumber(phone);
      const message = `Your verification code is: ${code}`;
      const sent = await this.sendSMS(formattedPhone, message);

      if (!sent) {
        logger.error('[SMS] Failed to send OTP', {
          phone: formattedPhone,
          error: 'SMS sending failed',
          timestamp: new Date().toISOString()
        });

        await slackService.notifySMSFailure({
          phone: formattedPhone,
          error: 'Failed to send OTP',
          context: 'sendOTP'
        });
      }

      return sent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[SMS] Failed to send OTP', {
        error: errorMessage,
        phone,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });

      await slackService.notifySMSFailure({
        phone,
        error: errorMessage,
        context: 'sendOTP'
      });

      return false;
    }
  },

  async tryUrlShortening(url: string, retries = 3): Promise<string> {
    const services = [
      async (u: string) => {
        try {
          const shortUrl = await shortenUrl(u);
          return shortUrl;
        } catch (e) {
          logger.error('[SMS] Primary shortening failed:', e);
          throw e;
        }
      },
      async (u: string) => {
        try {
          // Fallback to tinyurl method from shorturl
          const shortUrl = await shortenUrl(u, 'tinyurl');
          return shortUrl;
        } catch (e) {
          logger.error('[SMS] Tinyurl fallback failed:', e);
          throw e;
        }
      }
    ];

    let lastError;
    for (let i = 0; i < retries; i++) {
      for (const service of services) {
        try {
          const fullUrl = url.startsWith('http') ? url : `https://${url}`;
          const shortened = await service(fullUrl);

          if (!shortened) {
            throw new Error('URL shortening service returned empty result');
          }

          logger.info('[SMS] URL shortened successfully:', {
            originalUrl: fullUrl,
            shortUrl: shortened,
            attempt: i + 1,
            service: service.name
          });

          return shortened;
        } catch (error) {
          lastError = error;
          continue;
        }
      }
    }

    logger.error('[SMS] All URL shortening attempts failed:', {
      url,
      error: lastError,
      timestamp: new Date().toISOString()
    });

    // Return original URL if all shortening attempts fail
    return url;
  },

  async sendSMS(to: string, message: string): Promise<boolean> {
    const requestId = Date.now().toString(36);
    try {
      const { twilioPhone } = validateConfig();
      const formattedPhone = this.formatPhoneNumber(to);

      if (!formattedPhone.startsWith('+')) {
        throw new Error('Phone number must start with +');
      }

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

      logger.error('[SMS] Failed to send message', {
        ...errorDetails,
        timestamp: new Date().toISOString(),
        rawError: error instanceof Error ? error.toString() : 'Unknown error type'
      });

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

  async sendLoanApplicationLink(
    phone: string,
    url: string,
    merchantName: string,
    metadata: { requestId: string }
  ): Promise<{ success: boolean; error?: string }> {
    const requestId = metadata.requestId;
    try {
      logger.info('[SMS] Preparing loan application link', {
        requestId,
        phone,
        merchantName,
        urlLength: url.length
      });

      // Ensure base URL is properly formatted
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith('http')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      // Try to shorten the URL
      let shortUrl;
      try {
        shortUrl = await this.tryUrlShortening(formattedUrl);
        logger.info('[SMS] Successfully shortened URL', {
          originalUrl: formattedUrl,
          shortUrl,
          requestId
        });
      } catch (error) {
        logger.warn('[SMS] URL shortening failed, using original URL:', {
          error,
          originalUrl: formattedUrl,
          requestId
        });
        shortUrl = formattedUrl;
      }

      // Ensure proper URL prefix for mobile detection
      if (!shortUrl.startsWith('http')) {
        shortUrl = `https://${shortUrl}`;
      }

      // Use minimal format with URL on its own line
      const message = [
        `${merchantName} loan application:`,
        shortUrl
      ].join('\n');

      let attempt = 1;
      const maxAttempts = 3;
      let lastError;

      while (attempt <= maxAttempts) {
        try {
          logger.info(`[SMS] Sending attempt ${attempt}/${maxAttempts}`, {
            requestId,
            phone,
            messageLength: message.length
          });

          const sent = await this.sendSMS(phone, message);
          if (sent) {
            logger.info('[SMS] Successfully sent loan application message', {
              requestId,
              phone,
              attempt,
              messageFormat: 'minimal-with-link-keyword'
            });
            return { success: true };
          }
        } catch (error) {
          lastError = error;
          logger.error(`[SMS] Attempt ${attempt} failed`, {
            error,
            requestId,
            phone
          });
        }
        attempt++;
        if (attempt <= maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      const errorMessage = lastError instanceof Error ? lastError.message : 'Failed to send SMS after multiple attempts';
      logger.error('[SMS] All sending attempts failed', {
        requestId,
        error: errorMessage,
        phone,
        attempts: maxAttempts
      });

      await slackService.notifySMSFailure({
        phone,
        error: errorMessage,
        context: 'sendLoanApplicationLink'
      });

      return { success: false, error: errorMessage };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[SMS] Failed to send loan application link', {
        requestId,
        error: errorMessage,
        phone,
        stack: error instanceof Error ? error.stack : undefined
      });

      await slackService.notifySMSFailure({
        phone,
        error: errorMessage,
        context: 'sendLoanApplicationLink'
      });

      return { success: false, error: errorMessage };
    }
  },

  async sendMerchantWelcome(
    phone: string,
    { companyName, loginUrl, username, tempPassword }: {
      companyName: string;
      loginUrl: string;
      username: string;
      tempPassword: string;
    }
  ): Promise<boolean> {
    try {
      logger.info('[SMS] Preparing merchant welcome message', {
        phone,
        companyName,
        username
      });

      const message = [
        `Welcome to ShiFi Loans, ${companyName}!`,
        '',
        'Your login credentials:',
        `Username: ${username}`,
        `Temporary Password: ${tempPassword}`,
        '',
        `Login here: ${loginUrl}`,
        '',
        'Please change your password after first login.'
      ].join('\n');

      const sent = await this.sendSMS(phone, message);

      if (!sent) {
        logger.error('[SMS] Failed to send merchant welcome message', {
          phone,
          companyName
        });
      }

      return sent;
    } catch (error) {
      logger.error('[SMS] Error sending merchant welcome message:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        phone,
        companyName
      });
      return false;
    }
  }
};

export default smsService;