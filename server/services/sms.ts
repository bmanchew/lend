import twilio from 'twilio';
import crypto from 'crypto';

interface SMSConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

class SMSService {
  private config: SMSConfig;
  private client: any;

  constructor() {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      throw new Error("Missing required Twilio credentials");
    }

    this.config = {
      accountSid: TWILIO_ACCOUNT_SID,
      authToken: TWILIO_AUTH_TOKEN,
      fromNumber: TWILIO_PHONE_NUMBER
    };

    this.client = twilio(this.config.accountSid, this.config.authToken);

    console.log("[SMSService] Initialized with configuration", {
      fromNumber: this.config.fromNumber,
      accountSid: this.config.accountSid.substring(0, 4) + '***'
    });

    // Test API connectivity
    this.testConnection().catch(err => {
      console.error("[SMSService] API connectivity test failed:", {
        error: err.message,
        code: err.code,
        timestamp: new Date().toISOString()
      });
    });
  }

  private async testConnection(): Promise<void> {
    try {
      await this.client.api.accounts(this.config.accountSid).fetch();
      console.log("[SMSService] API connection test successful");
    } catch (error: any) {
      console.error("[SMSService] API connection test failed:", {
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-digits
    let cleaned = (phone || '').toString().replace(/\D/g, '');
    
    // Handle numbers with country code
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = cleaned.substring(1);
    }
    
    // Validate length
    if (cleaned.length !== 10) {
      console.error("[SMSService] Invalid phone length:", {
        original: phone,
        cleaned: cleaned,
        length: cleaned.length,
        timestamp: new Date().toISOString()
      });
      throw new Error('Phone number must be exactly 10 digits');
    }
    
    // Add +1 prefix
    return '+1' + cleaned;
  }

  async sendLoanApplicationLink(
    toNumber: string,
    merchantName: string,
    applicationUrl: string
  ): Promise<{success: boolean; error?: string}> {
    try {
      const formattedPhone = this.formatPhoneNumber(toNumber);

      console.log("[SMSService] Phone formatting:", {
        input: toNumber,
        formatted: formattedPhone,
        timestamp: new Date().toISOString()
      });

      console.log("[SMSService] Phone number cleaning:", {
        original: toNumber,
        rawPhone: toNumber?.rawPhone,
        cleaned: cleanPhone
      });
      // Handle 10 or 11 digit numbers (with or without country code)
      if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
        cleanPhone = cleanPhone.substring(1);
      }
      if (cleanPhone.length !== 10) {
        console.error("[SMSService] Invalid phone number length:", {
          original: toNumber,
          cleaned: cleanPhone,
          length: cleanPhone.length
        });
        return {success: false, error: 'Invalid phone number format'};
      }
      const formattedPhone = `+1${cleanPhone}`;

      if (cleanPhone.length !== 10) {
        console.error("[SMSService] Invalid phone format:", {
          original: toNumber,
          cleaned: cleanPhone,
          formatted: formattedPhone,
          length: cleanPhone.length
        });
        return {success: false, error: 'Phone number must be 10 digits'};
      }

      // Validate URL
      try {
        new URL(applicationUrl);
      } catch {
        console.error("[SMSService] Invalid URL:", applicationUrl);
        return {success: false, error: 'Invalid application URL'};
      }

      console.log("[SMSService] Sending loan application link:", {
        originalNumber: toNumber,
        cleanNumber: cleanPhone,
        formattedNumber: formattedPhone,
        merchant: merchantName,
        url: applicationUrl,
        timestamp: new Date().toISOString()
      });

      const message = await this.client.messages.create({
        body: `${merchantName} has invited you to complete a loan application. Click here to start: ${applicationUrl}`,
        from: this.config.fromNumber,
        to: formattedPhone,
        statusCallback: process.env.TWILIO_STATUS_CALLBACK
      });

      console.log("[SMSService] Message details:", {
        messageId: message.sid,
        status: message.status,
        to: formattedPhone,
        timestamp: new Date().toISOString()
      });

      if (message.status === 'failed' || message.errorCode) {
        const error = `Message failed: ${message.errorMessage || message.errorCode}`;
        console.error("[SMSService] Message failed:", {
          toNumber,
          messageId: message.sid,
          status: message.status,
          errorCode: message.errorCode,
          error: message.errorMessage
        });
        return {success: false, error};
      }

      console.log("[SMSService] Successfully sent message:", {
        toNumber,
        messageId: message.sid,
        status: message.status
      });

      return {success: true};
    } catch (error: any) {
      console.error("[SMSService] Error sending message:", {
        toNumber,
        error: error.message,
        code: error.code,
        twilioCode: error.code,
        moreInfo: error.moreInfo
      });
      return {
        success: false, 
        error: error.message || 'Failed to send message'
      };
    }
  }

  async verifyPhoneNumber(phoneNumber: string): Promise<boolean> {
    try {
      const lookup = await this.client.lookups.v2.phoneNumbers(phoneNumber)
        .fetch();

      return lookup.valid || false;
    } catch (error) {
      console.error("[SMSService] Error verifying phone number:", {
        phoneNumber,
        error
      });
      return false;
    }
  }

  generateApplicationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-digits
    let clean = (phone || '').toString().replace(/\D/g, '');
    
    // Handle 11-digit numbers starting with 1
    if (clean.length === 11 && clean.startsWith('1')) {
      clean = clean.substring(1);
    }
    
    // Validate length after cleaning
    if (clean.length !== 10) {
      console.error("[SMSService] Invalid phone length:", {
        original: phone,
        cleaned: clean,
        length: clean.length
      });
      throw new Error('Phone number must be 10 digits');
    }
    
    // Add +1 prefix
    const formatted = '+1' + clean;
    
    console.log("[SMSService] Phone formatting:", {
      input: phone,
      cleaned: clean,
      formatted: formatted
    });
    
    return formatted;
  }

  async sendOTP(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      console.log('[SMSService] Sending OTP:', {
        original: phoneNumber,
        formatted: formattedPhone,
        timestamp: new Date().toISOString()
      });

      console.log("[SMSService] Sending OTP:", {
        originalNumber: phoneNumber,
        cleanNumber: cleanPhone,
        formattedNumber: '+1' + cleanPhone,
        code: code,
        timestamp: new Date().toISOString()
      });

      const message = await this.client.messages.create({
        body: `Your ShiFi login code is: ${code}. Valid for 5 minutes.`,
        from: this.config.fromNumber,
        to: phoneNumber
      });

      console.log("[SMSService] Successfully sent OTP:", {
        phoneNumber,
        messageId: message.sid,
        status: message.status
      });

      return true;
    } catch (error: any) {
      console.error("[SMSService] Error sending OTP:", {
        phoneNumber,
        error: error.message,
        code: error.code,
        statusCode: error.status,
        moreInfo: error.moreInfo,
        details: error.details,
        timestamp: new Date().toISOString(),
        stack: error.stack
      });
      return false;
    }
  }
}

export const smsService = new SMSService();