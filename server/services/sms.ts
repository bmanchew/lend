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
  }

  async sendLoanApplicationLink(
    toNumber: string,
    merchantName: string,
    applicationUrl: string
  ): Promise<boolean> {
    try {
      console.log("[SMSService] Sending loan application link to:", toNumber);

      const message = await this.client.messages.create({
        body: `${merchantName} has invited you to complete a loan application. Click here to start: ${applicationUrl}`,
        from: this.config.fromNumber,
        to: toNumber
      });

      console.log("[SMSService] Successfully sent message:", {
        toNumber,
        messageId: message.sid,
        status: message.status
      });

      return true;
    } catch (error: any) {
      console.error("[SMSService] Error sending message:", {
        toNumber,
        error: error.message,
        code: error.code,
      });
      return false;
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
}

export const smsService = new SMSService();