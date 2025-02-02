
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

  async sendLoanApplicationLink(
    toNumber: string,
    merchantName: string,
    applicationUrl: string
  ): Promise<{success: boolean; error?: string}> {
    try {
      // Clean and validate phone number
      let cleanPhone = toNumber.replace(/\D/g, '');
      // Remove leading 1 if present
      cleanPhone = cleanPhone.replace(/^1/, '');
      // Take last 10 digits
      cleanPhone = cleanPhone.slice(-10);
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
        to: toNumber,
        merchant: merchantName,
        url: applicationUrl
      });

      const message = await this.client.messages.create({
        body: `${merchantName} has invited you to complete a loan application. Click here to start: ${applicationUrl}`,
        from: this.config.fromNumber,
        to: toNumber,
        statusCallback: process.env.TWILIO_STATUS_CALLBACK
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

  async sendOTP(phoneNumber: string, code: string): Promise<boolean> {
    try {
      // Clean the phone number to only digits
      let cleanPhone = phoneNumber.replace(/\D/g, '');
      // Remove leading 1 if present
      cleanPhone = cleanPhone.replace(/^1/, '');
      // Add +1 prefix for E.164 format
      phoneNumber = '+1' + cleanPhone;
      
      // Basic validation
      if (!/^\+\d{10,15}$/.test(phoneNumber)) {
        console.error("[SMSService] Invalid phone number format:", phoneNumber);
        return false;
      }

      console.log("[SMSService] Sending OTP to:", phoneNumber);

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
        details: error.details
      });
      return false;
    }
  }
}

export const smsService = new SMSService();
