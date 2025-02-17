
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
  }
};

export default slackService;
