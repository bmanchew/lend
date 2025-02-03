URL: https://docs.didit.me/identity-verification/webhooks
---
🎉 Unlimited Free KYC - Forever!!

Identity Verification

Webhooks

# Webhooks

Webhooks allow your application to receive **real-time notifications** about changes to a verification status. Here’s how you can configure and handle these notifications **securely**.

## Configuring the Webhook Endpoint [Permalink for this section](https://docs.didit.me/identity-verification/webhooks\#configuring-the-webhook-endpoint)

### 1\. Follow Steps 1 and 2 from the Quick Start Guide [Permalink for this section](https://docs.didit.me/identity-verification/webhooks\#1-follow-steps-1-and-2-from-the-quick-start-guide)

- Refer to the [Quick Start Guide](https://docs.didit.me/identity-verification/quick-start) to set up your team and application if you haven’t already.

### 2\. Add Your Webhook URL and Copy the `Webhook Secret Key` [Permalink for this section](https://docs.didit.me/identity-verification/webhooks\#2-add-your-webhook-url-and-copy-the-webhook-secret-key)

- Go to your verification settings.
- Enter your webhook URL.
- Copy the `Webhook Secret Key`, which you’ll use to validate incoming requests.

![Webhook Configuration](https://docs.didit.me/_next/image?url=%2Fwebhook-settings.png&w=3840&q=75)

## Webhook Types [Permalink for this section](https://docs.didit.me/identity-verification/webhooks\#webhook-types)

We send webhooks in the following scenarios:

- **Session Starts** – When a new verification session begins, we immediately send its initial status.
- **Status Changes** – Whenever the verification status is updated (e.g., Approved, Declined, In Review, Abandoned).

If the status is one of **Approved**, **Declined**, **In Review**, or **Abandoned**, the webhook includes a `decision` field with detailed verification information. The `vendor_data` field is also included, if applicable.

## Code Examples [Permalink for this section](https://docs.didit.me/identity-verification/webhooks\#code-examples)

To ensure the security of your webhook endpoint, verify the authenticity of incoming requests using your `Webhook Secret Key`. The most important step is to always sign and verify the **exact raw JSON**—any re-stringification can alter the payload and invalidate the signature.

**Always store and HMAC the raw JSON string** (rather than re-stringifying after parsing). Differences in whitespace, float formatting, or key ordering will break the signature verification.

Node.jspythonphp

![Copy](https://docs.didit.me/icons/copy-icon.svg)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 1337;

// Load the webhook secret from your environment (or config)
const WEBHOOK_SECRET_KEY = process.env.WEBHOOK_SECRET_KEY || "YOUR_WEBHOOK_SECRET_KEY";

// 1) Capture the raw body
app.use(
  bodyParser.json({
    verify: (req, res, buf, encoding) => {
      if (buf && buf.length) {
        // Store the raw body in the request object
        req.rawBody = buf.toString(encoding || "utf8");
      }
    },
  })
);

// 2) Define the webhook endpoint
app.post("/webhook", (req, res) => {
  try {
    const signature = req.get("X-Signature");
    const timestamp = req.get("X-Timestamp");

    // Ensure all required data is present
    if (!signature || !timestamp || !req.rawBody || !WEBHOOK_SECRET_KEY) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 3) Validate the timestamp to ensure the request is fresh (within 5 minutes)
    const currentTime = Math.floor(Date.now() / 1000);
    const incomingTime = parseInt(timestamp, 10);
    if (Math.abs(currentTime - incomingTime) > 300) {
      return res.status(401).json({ message: "Request timestamp is stale." });
    }

    // 4) Generate an HMAC from the raw body using your shared secret
    const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET_KEY);
    const expectedSignature = hmac.update(req.rawBody).digest("hex");

    // 5) Compare using timingSafeEqual for security
    const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");
    const providedSignatureBuffer = Buffer.from(signature, "utf8");

    if (
      expectedSignatureBuffer.length !== providedSignatureBuffer.length ||
      !crypto.timingSafeEqual(expectedSignatureBuffer, providedSignatureBuffer)
    ) {
      return res.status(401).json({
        message: `Invalid signature. Computed (${expectedSignature}), Provided (${signature})`,
      });
    }

    // 6) Parse the JSON and proceed (signature is valid at this point)
    const jsonBody = JSON.parse(req.rawBody);
    const { session_id, status, vendor_data } = jsonBody;

    // Example: upsert to database, handle "Approved" status, etc.
    // e.g. upsertVerification(session_id, status, vendor_data);

    return res.json({ message: "Webhook event dispatched" });
  } catch (error) {
    console.error("Error in /webhook handler:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

![Copy](https://docs.didit.me/icons/copy-icon.svg)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
from fastapi import FastAPI, Request, HTTPException
from time import time
import json
import hmac
import hashlib
import os
from typing import Dict, Any
from prisma import Prisma  # You'll need to set up Prisma client for Python

app = FastAPI()
prisma = Prisma()

def verify_webhook_signature(request_body: str, signature_header: str, timestamp_header: str, secret_key: str) -> bool:
    """
    Verify incoming webhook signature
    """
    # Check if timestamp is recent (within 5 minutes)
    timestamp = int(timestamp_header)
    current_time = int(time())
    if abs(current_time - timestamp) > 300:  # 5 minutes
        return False

    # Calculate expected signature
    expected_signature = hmac.new(
        secret_key.encode("utf-8"),
        request_body.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    # Compare signatures using constant-time comparison
    return hmac.compare_digest(signature_header, expected_signature)

@app.post("/webhook")
async def handle_webhook(request: Request):
    # Get the raw request body as string
    body = await request.body()
    body_str = body.decode()

    # Parse JSON for later use
    json_body = json.loads(body_str)

    # Get headers
    signature = request.headers.get("x-signature")
    timestamp = request.headers.get("x-timestamp")
    secret = os.getenv("WEBHOOK_SECRET_KEY")

    if not all([signature, timestamp, secret]):
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not verify_webhook_signature(body_str, signature, timestamp, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")

    session_id = body.get("session_id")
    status = body.get("status")
    vendor_data = body.get("vendor_data")

    # Connect to database
    await prisma.connect()

    try:
        # Update or create verification record
        upsert_result = await prisma.verification.upsert(
            where={
                "id": session_id
            },
            data={
                "update": {
                    "verificationStatus": status
                },
                "create": {
                    "userId": vendor_data,
                    "id": session_id,
                    "verificationStatus": status
                    # Add other required fields for creation
                }
            }
        )

        # Handle approved status
        if status == "Approved":
            user_id = upsert_result.userId

            await prisma.user.upsert(
                where={
                    "id": user_id
                },
                data={
                    "update": {
                        "isVerified": True
                    },
                    "create": {
                        "id": user_id,
                        "isVerified": True
                        # Add other required fields for user creation
                    }
                }
            )

        return {"message": "Webhook event dispatched"}

    finally:
        await prisma.disconnect()
```

![Copy](https://docs.didit.me/icons/copy-icon.svg)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
<?php

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class WebhookController extends Controller
{
    /**
     * Handle incoming webhook request
     */
    public function handle(Request $request)
    {
        // Get the raw request body
        $bodyContent = $request->getContent();

        // Get headers
        $signature = $request->header('x-signature');
        $timestamp = $request->header('x-timestamp');
        $secret = env('WEBHOOK_SECRET_KEY');

        if (!$signature || !$timestamp || !$secret) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        if (!$this->verifyWebhookSignature($bodyContent, $signature, $timestamp, $secret)) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        // Parse JSON for processing
        $body = json_decode($bodyContent, true);

        $sessionId = $body['session_id'];
        $status = $body['status'];
        $vendorData = $body['vendor_data'];

        // Update or create verification record
        $verification = DB::table('verifications')->updateOrInsert(
            ['id' => $sessionId],
            [\
                'user_id' => $vendorData,\
                'verification_status' => $status,\
                'updated_at' => now(),\
            ]
        );

        // Handle approved status
        if ($status === 'Approved') {
            DB::table('users')->updateOrInsert(
                ['id' => $vendorData],
                [\
                    'is_verified' => true,\
                    'updated_at' => now(),\
                ]
            );
        }

    private function verifyWebhookSignature(
        string $requestBody,
        string $signatureHeader,
        string $timestampHeader,
        string $secretKey
    ): bool {
        // Check if timestamp is recent (within 5 minutes)
        $timestamp = (int)$timestampHeader;
        $currentTime = time();
        if (abs($currentTime - $timestamp) > 300) {
            return false;
        }

        // Calculate expected signature
        $expectedSignature = hash_hmac('sha256', $requestBody, $secretKey);

        // Compare signatures using constant-time comparison
        return hash_equals($signatureHeader, $expectedSignature);
    }
}
```

## Webhook Body Object Examples [Permalink for this section](https://docs.didit.me/identity-verification/webhooks\#webhook-body-object-examples)

The webhook payload varies depending on the status of the verification session. When the status is `Approved` or `Declined`, the body includes the `decision` field. For all other statuses, the `decision` field is not present.

#### Example with `decision` Field [Permalink for this section](https://docs.didit.me/identity-verification/webhooks\#example-with-decision-field)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
{
  "session_id": "11111111-2222-3333-4444-555555555555",
  "status": "Declined", // status of the verification session
  "created_at": 1627680000,
  "timestamp": 1627680000,
  "vendor_data": "11111111-1111-1111-1111-111111111111",
  "decision": {
    "session_id": "11111111-2222-3333-4444-555555555555",
    "session_number": 43762,
    "session_url": "https://verify.staging.didit.me/session/11111111-2222-3333-4444-555555555555",
    "status": "Declined",
    "vendor_data": "11111111-1111-1111-1111-111111111111",
    "callback": "https://verify.staging.didit.me/",
    "features": "OCR + FACE",
    "kyc": {
      "status": "Approved",
      "ocr_status": "Approved",
      "epassport_status": "Approved",
      "document_type": "Passport",
      "document_number": "BK123456",
      "personal_number": "999999999",
      "portrait_image": "https://example.com/portrait.jpg",
      "front_image": "https://example.com/front.jpg",
      "front_video": "https://example.com/front.mp4",
      "back_image": null,
      "back_video": null,
      "full_front_image": "https://example.com/full_front.jpg",
      "full_back_image": null,
      "date_of_birth": "1990-01-01",
      "expiration_date": "2026-03-24",
      "date_of_issue": "2019-03-24",
      "issuing_state": "ESP",
      "issuing_state_name": "Spain",
      "first_name": "Sergey",
      "last_name": "Kozlov",
      "full_name": "Sergey Kozlov",
      "gender": "M",
      "address": null,
      "formatted_address": null,
      "is_nfc_verified": false,
      "parsed_address": null,
      "place_of_birth": "Madrid, Spain",
      "marital_status": "SINGLE",
      "nationality": "ESP",
      "created_at": "2024-07-28T06:46:39.354573Z"
    },
    "aml": {
      "status": "In Review",
      "total_hits": 1,
      "score": 70.35, // score of the highest hit from 0 to 100
      "hits": [\
        {\
          "id": "aaaaaaa-1111-2222-3333-4444-555555555555",\
          "match": false,\
          "score": 0.7034920634920635, // score of the hit from 0 to 1\
          "target": true,\
          "caption": "Kozlov Sergey Alexandrovich",\
          "datasets": ["ru_acf_bribetakers"],\
          "features": {\
            "person_name_jaro_winkler": 0.8793650793650793,\
            "person_name_phonetic_match": 0.5\
          },\
          "last_seen": "2024-07-20T17:53:03",\
          "first_seen": "2023-06-23T12:02:51",\
          "properties": {\
            "name": ["Kozlov Sergey Alexandrovich"],\
            "alias": ["Козлов Сергей Александрович"],\
            "notes": [\
              "Assistant Prosecutor of the Soviet District of Voronezh. Involved in the case against the Ukrainian pilot Nadiya Savchenko"\
            ],\
            "gender": ["male"],\
            "topics": ["poi"],\
            "position": [\
              "Organizers of political repressions",\
              "Организаторы политических репрессий"\
            ]\
          },\
          "last_change": "2024-02-27T17:53:01"\
        }\
      ]
    },
    "face": {
      "status": "Approved",
      "face_match_status": "Approved",
      "liveness_status": "Approved",
      "face_match_similarity": 97.99,
      "liveness_confidence": 87.99,
      "source_image": "https://example.com/source.jpg",
      "target_image": "https://example.com/target.jpg",
      "video_url": "https://example.com/video.mp4"
    },
    "location": {
        "device_brand": "Apple",
        "device_model": "iPhone",
        "browser_family": "Mobile Safari",
        "os_family": "iOS",
        "platform": "mobile",
        "ip_country": "Spain",
        "ip_country_code": "ES",
        "ip_state": "Barcelona",
        "ip_city": "Barcelona",
        "latitude": 41.4022,
        "longitude": 2.1407,
        "ip_address": "83.50.226.71",
        "isp": null,
        "organization": null,
        "is_vpn_or_tor": false,
        "is_data_center": false,
        "time_zone": "Europe/Madrid",
        "time_zone_offset": "+0100",
        "status": "Approved",
        "document_location": {
          "latitude": 4,
          "longitude": -72
        },
        "ip_location": {
          "longitude": 2.1407,
          "latitude": 41.4022
        },
        "distance_from_document_to_ip_km": {
          "distance": 8393.68,
          "direction": "NE"
        }
    },
    "warnings": [\
      {\
        "feature": "AML",\
        "risk": "POSSIBLE_MATCH_FOUND",\
        "additional_data": null,\
        "log_type": "warning",\
        "short_description": "Possible match found in AML screening",\
        "long_description": "The Anti-Money Laundering (AML) screening process identified potential matches with watchlists or high-risk databases, requiring further review."\
      }\
    ],
    "reviews": [\
      {\
        "user": "compliance@example.com",\
        "new_status": "Declined",\
        "comment": "Possible match found in AML screening",\
        "created_at": "2024-07-18T13:29:00.366811Z"\
      }\
    ],
    "extra_images": [],
    "created_at": "2024-07-24T08:54:25.443172Z"
  }
}
```

For a complete list of possible properties and their values for the `decision`
field, please refer to our [API\\
Reference](https://docs.didit.me/identity-verification/api-reference/retrieve-session#response).

#### Example without `decision` Field [Permalink for this section](https://docs.didit.me/identity-verification/webhooks\#example-without-decision-field)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
{
  "session_id": "11111111-2222-3333-4444-555555555555",
  "status": "Kyc Expired",
  "created_at": 1627680000,
  "timestamp": 1627680000,
  "vendor_data": "11111111-1111-1111-1111-111111111111"
}
```

Last updated on January 7, 2025

[Zapier](https://docs.didit.me/identity-verification/zapier "Zapier") [Verification Statuses](https://docs.didit.me/identity-verification/verification-statuses "Verification Statuses")