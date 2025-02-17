import { WebClient } from '@slack/web-api';

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

export const slackService = {
  async notifySMSFailure({ phone, error, context }: { phone: string; error: string; context: string }) {
    try {
      await client.chat.postMessage({
        channel: process.env.SLACK_NOTIFICATION_CHANNEL || '#notifications',
        text: `:warning: SMS Failure (${context})\nPhone: ${phone}\nError: ${error}`
      });
    } catch (err) {
      console.error('[Slack] Failed to send notification:', err);
    }
  },

  async notifyLoanApplication({ merchantName, customerName, amount, phone }: { 
    merchantName: string; 
    customerName: string; 
    amount: number;
    phone: string;
  }) {
    try {
      await client.chat.postMessage({
        channel: process.env.SLACK_NOTIFICATION_CHANNEL || '#notifications',
        text: `:memo: New Loan Application\nMerchant: ${merchantName}\nCustomer: ${customerName}\nAmount: $${amount}\nPhone: ${phone}`
      });
    } catch (err) {
      console.error('[Slack] Failed to send loan application notification:', err);
    }
  }
};

export default slackService;