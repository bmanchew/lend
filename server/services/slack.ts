import { WebClient } from "@slack/web-api";
import { logger } from "../lib/logger";

class SlackService {
  private client: WebClient;

  constructor() {
    const token = process.env.SLACK_BOT_TOKEN;
    const channelId = process.env.SLACK_CHANNEL_ID;

    if (!token || !channelId) {
      logger.warn('Slack integration not configured - notifications will be disabled');
      return;
    }

    this.client = new WebClient(token);
  }

  async sendNotification(message: string, details?: Record<string, any>) {
    if (!this.client) {
      logger.debug('Slack notification skipped - service not configured');
      return;
    }

    try {
      const channelId = process.env.SLACK_CHANNEL_ID;
      if (!channelId) {
        throw new Error('SLACK_CHANNEL_ID not configured');
      }

      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        }
      ];

      if (details) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '```' + JSON.stringify(details, null, 2) + '```'
          }
        });
      }

      await this.client.chat.postMessage({
        channel: channelId,
        blocks,
        text: message // Fallback text
      });

      logger.info('Slack notification sent successfully', { message });
    } catch (error) {
      logger.error('Failed to send Slack notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        message
      });
    }
  }

  async notifyLoanApplication(data: {
    merchantName: string;
    customerName: string;
    amount: number;
    phone: string;
  }) {
    const message = `:memo: New Loan Application\n*Merchant:* ${data.merchantName}\n*Customer:* ${data.customerName}\n*Amount:* $${data.amount.toLocaleString()}\n*Phone:* ${data.phone}`;
    
    await this.sendNotification(message, {
      type: 'loan_application',
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  async notifySMSFailure(data: {
    phone: string;
    error: string;
    context: string;
  }) {
    const message = `:warning: SMS Sending Failed\n*Phone:* ${data.phone}\n*Context:* ${data.context}\n*Error:* ${data.error}`;
    
    await this.sendNotification(message, {
      type: 'sms_failure',
      ...data,
      timestamp: new Date().toISOString()
    });
  }
}

export const slackService = new SlackService();
