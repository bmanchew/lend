URL: https://docs.didit.me/identity-verification/api-reference/authentication
---
🎉 Unlimited Free KYC - Forever!!

Identity Verification

API Reference

Authentication

# Authentication

To interact with the Identity Verification API, you need to authenticate using an `access_token`. This token is required for all API requests to ensure secure access.

## Obtaining the `access_token` [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/authentication\#obtaining-the-access_token)

To obtain the token, follow these steps:

### 1\. Register Your Application and configure the Verification Settings [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/authentication\#1-register-your-application-and-configure-the-verification-settings)

First, you need to register your application with the Identity Verification service explained in the [Quick Start Guide](https://docs.didit.me/identity-verification/quick-start). This involves obtaining a `Client ID` and `Client secret`, which will be used to authenticate your application.

### 2\. Get the `access_token` [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/authentication\#2-get-the-access_token)

To retrieve the client `access_token`, call the `/auth/v2/token/` endpoint with the base64 encoded `${clientID}:${clientSecret}` and the `client_credentials` grant.

- **Base URL:** `https://apx.didit.me`
- **Endpoint:** `/auth/v2/token/`
- **Purpose:** Authenticate the service provider and obtain a token.
- **Process:** The service provider sends a POST request with their `Client ID` and `Client Secret`. The server responds with a client `access_token` if the credentials are valid.

⚠️

Keep your `Client ID` and `Client Secret` secure. Never share the `Client   Secret` credentials or expose them in client-side code.

#### Request [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/authentication\#request)

To retrieve the `encodedCredentials`, follow these steps:

1. **Combine Credentials**: Concatenate your `Client ID` and `Client Secret` with a colon ( `:`) in between.
2. **Base64 Encode**: Encode the combined string using Base64. This encoded string will be used as `encodedCredentials`.

Include the `encodedCredentials` in the Authorization header of your request and use the grant type `client_credentials` as shown below:

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
POST /auth/v2/token/ HTTP/1.1
Host: apx.didit.me
Content-Type: application/x-www-form-urlencoded
Authorization: Basic ${encodedCredentials}

grant_type=client_credentials
```

#### Response [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/authentication\#response)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
{
  "iss": "https://didit.me",
  "iat": 1617220000,
  "sub": "your-application-uuid",
  "client_id": "your-client-id",
  "organization_id": "your-organization-id",
  "expires_in": 86400,
  "exp": 1618084000,
  "access_token": "your-cient-access-token"
}
```

### Code Example [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/authentication\#code-example)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
const fetchClientToken = async () => {
  const url = process.env.NEXT_PUBLIC_API_URL + '/auth/v2/token/';
  const clientID = process.env.NEXT_PUBLIC_DIDIT_CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  const encodedCredentials = Buffer.from(
    `${clientID}:${clientSecret}`,
  ).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encodedCredentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const data = await response.json();

    if (response.ok) {
      // Return the entire data object if you need to use other properties
      return data;
    } else {
      console.error('Error fetching client token:', data.message);
      return null;
    }
  } catch (error) {
    console.error('Network error:', error);
    return null;
  }
};
```

Last updated on August 2, 2024

[Pricing](https://docs.didit.me/identity-verification/pricing "Pricing") [Create Session](https://docs.didit.me/identity-verification/api-reference/create-session "Create Session")