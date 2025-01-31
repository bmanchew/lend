import { z } from 'zod';

// KYC Status schema
export const KycStatusSchema = z.enum([
  'pending',
  'verified',
  'failed',
  'in_review'
]);

export type KycStatus = z.infer<typeof KycStatusSchema>;

// Didit Session Response schema
export const DiditSessionResponseSchema = z.object({
  session_id: z.string(),
  session_token: z.string(),
  url: z.string().url()
});

export type DiditSessionResponse = z.infer<typeof DiditSessionResponseSchema>;

// Didit Webhook Payload schema
export const DiditWebhookPayloadSchema = z.object({
  session_id: z.string(),
  status: z.enum(['initialized', 'retrieved', 'confirmed', 'declined', 'Approved', 'Declined']),
  vendor_data: z.string().optional(),
  created_at: z.number(),
  timestamp: z.number(),
  decision: z.object({
    kyc: z.object({
      status: z.string(),
      document_type: z.string(),
      document_number: z.string(),
      first_name: z.string(),
      last_name: z.string(),
      date_of_birth: z.string(),
      created_at: z.string()
    }).optional()
  }).optional()
});

export type DiditWebhookPayload = z.infer<typeof DiditWebhookPayloadSchema>;
