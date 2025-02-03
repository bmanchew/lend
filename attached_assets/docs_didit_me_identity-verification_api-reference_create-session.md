URL: https://docs.didit.me/identity-verification/api-reference/create-session
---
🎉 Unlimited Free KYC - Forever!!

Identity Verification

API Reference

Create Session

# Creating a Verification Session

After obtaining a valid client access token, you can call the `/v1/session/` endpoint to create a new verification session.

- **Base URL:** `https://verification.didit.me`
- **Endpoint:** `/v1/session/`
- **Method:** `POST`
- **Authentication:** `Client Token (Bearer Token)`

⚠️

The `Authentication` endpoint has a different `Base URL` than the verification
session endpoints. Ensure you are using the correct URLs for each endpoint to
avoid connectivity issues.

## Request [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/create-session\#request)

To create a session programmatically, follow these steps:

### Authenticate [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/create-session\#authenticate)

To obtain the `access_token`, refer to the [Authentication](https://docs.didit.me/identity-verification/api-reference/authentication) documentation page.

ℹ️

The `access_token` is valid for a limited time (x minutes), so you do not need
to authenticate for every request until the token expires.

### Select Desired Parameters [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/create-session\#select-desired-parameters)

- **callback**: A URL for redirection post-verification.
  - **Example**: `"https://example.com/verification/callback"`
- **features** (optional): Verification features to be used. Choose from the following options:


  - `OCR`
  - `OCR + NFC`
  - `OCR + AML`
  - `OCR + NFC + AML`
  - `OCR + FACE`
  - `OCR + NFC + FACE`
  - `OCR + FACE + AML`
  - `OCR + NFC + FACE + AML`

If not specified, the system will use the features defined in the verification settings on the console. For more information, see [Verification Settings](https://docs.didit.me/identity-verification/verification-settings#3-verification-features).

- **vendor\_data**: Unique identifier or data for the vendor, typically the `uuid` of the user trying to verify.


### Create Session Request [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/create-session\#create-session-request)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
POST /v1/session/ HTTP/1.1
Host: verification.didit.me
Content-Type: application/json
Authorization: Bearer {access_token}

{
  "callback": "https://example.com/verification/callback",
  "features": "OCR + NFC + FACE",  // Optional: If omitted, uses settings from console
  "vendor_data": "your-vendor-data"
}
```

## Response [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/create-session\#response)

Returns session details including `session_id`, `session_token`, `url`. The `session_id` should be linked to your user in your User model, and you should open or send the `url` for your user to start the verification process.

### Example Response [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/create-session\#example-response)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
{
  "session_id": "your-session-id",
  "session_token": "your-session-token",
  "url": "https://verify.didit.me/session/{session_token}"
}
```

## Code Example: [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/create-session\#code-example)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
const createSession = async (
  features: string,
  callback: string,
  vendor_data: string,
) => {
  const url = `${BASE_URL}/v1/session/`;
  const token = await getClientToken();

  if (!token) {
    console.error('Error fetching client token');
  } else {
    const body = {
      vendor_data: vendor_data,
      callback: callback,
      features: features,
    };

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(body),
    };

    try {
      const response = await fetch(url, requestOptions);

      const data = await response.json();

      if (response.status === 201 && data) {
        return data;
      } else {
        console.error('Error creating session:', data.message);
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Network error:', error);
      throw error;
    }
  }
};
```

Last updated on January 22, 2025

[Authentication](https://docs.didit.me/identity-verification/api-reference/authentication "Authentication") [Retrieve Session](https://docs.didit.me/identity-verification/api-reference/retrieve-session "Retrieve Session")