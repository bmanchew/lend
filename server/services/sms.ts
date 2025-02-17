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

    // Remove all non-numeric characters
    const cleanNumber = phone.replace(/\D/g, '');

    // Enforce 10-digit US numbers only
    if (cleanNumber.length !== 10) {
      throw new Error('Phone number must be exactly 10 digits');
    }

    // Format as +1XXXXXXXXXX
    return `+1${cleanNumber}`;
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
    requestId: string
  ): Promise<{ success: boolean; error?: string }> {
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
      // This format has the highest chance of link detection
      const message = [
        `${merchantName} loan application link:`,
        'Link:',
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
  }
};

export default smsService;