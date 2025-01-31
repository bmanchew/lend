// Mock environment variables
process.env = {
  ...process.env,
  DIDIT_CLIENT_ID: 'test-client-id',
  DIDIT_CLIENT_SECRET: 'test-client-secret',
  DIDIT_WEBHOOK_URL: 'http://test.com/webhook',
  DIDIT_WEBHOOK_SECRET: 'test-webhook-secret',
  APP_URL: 'http://localhost:5000',
};
