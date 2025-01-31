# KYC Implementation Documentation

## Overview
This document describes the implementation of Know Your Customer (KYC) verification using the Didit API integration. The system provides a seamless verification flow for users while ensuring security and proper status tracking.

## Components

### 1. Frontend Components
- `KycVerificationModal`: React component that handles the verification UI and flow
- Location: `client/src/components/kyc/verification-modal.tsx`

### 2. Backend Services
- `DiditService`: Service class handling all Didit API interactions
- Location: `server/services/didit.ts`

### 3. API Routes
- KYC-related endpoints in `server/routes.ts`

## Verification Flow

1. **Initiation**
   - User clicks "Start Verification" in the KYC modal
   - Frontend calls `/api/kyc/start` endpoint
   - Backend creates a Didit session and returns redirect URL

2. **Verification Process**
   - User is redirected to Didit's verification platform
   - User completes document verification and face matching
   - Didit redirects back to our callback URL

3. **Status Updates**
   - Webhook endpoint receives status updates from Didit
   - User status is updated in the database
   - Frontend polls for status changes

## Security Measures

1. **Webhook Validation**
   - HMAC-SHA256 signature verification
   - Timestamp validation (5-minute window)
   - Proper error handling and logging

2. **Session Management**
   - Short-lived sessions
   - Secure token handling
   - State validation

## API Endpoints

### 1. Start KYC Session
```typescript
POST /api/kyc/start
Body: { userId: number }
Response: { redirectUrl: string }
```

### 2. Check KYC Status
```typescript
GET /api/kyc/status?userId=<userId>
Response: { status: KycStatus }
```

### 3. Webhook Endpoint
```typescript
POST /api/kyc/webhook
Headers: {
  'x-signature': string,
  'x-timestamp': string
}
Body: DiditWebhookPayload
```

### 4. Callback URL
```typescript
GET /api/kyc/callback?session_id=<sessionId>&status=<status>
Response: Redirect to frontend with status
```

## Status Types

```typescript
type KycStatus = 'pending' | 'verified' | 'failed' | 'in_review';
```

## Error Handling
- Invalid webhook signatures
- Expired timestamps
- Missing user data
- API communication errors
- Session validation errors

## Testing
Tests are located in `server/services/__tests__/didit.test.ts` and cover:
- Session initialization
- Webhook signature verification
- Status updates
- Error cases

## Environment Variables Required
```
DIDIT_CLIENT_ID=<client_id>
DIDIT_CLIENT_SECRET=<client_secret>
DIDIT_WEBHOOK_URL=<webhook_url>
DIDIT_WEBHOOK_SECRET=<webhook_secret>
```
