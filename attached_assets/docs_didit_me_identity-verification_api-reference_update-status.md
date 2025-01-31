URL: https://docs.didit.me/identity-verification/api-reference/update-status
---
🎉 Unlimited Free KYC - Forever!!

Identity Verification

API Reference

Update Status

# Updating a Verification Session Status

After obtaining a valid client access token, you can call the `/v1/session/{session_id}/status/` endpoint to update the status of a verification session.

- **Base URL:** `https://verification.didit.me`
- **Endpoint:** `/v1/session/{sessionId}/update-status/`
- **Method:** `PATCH`
- **Authentication:** `Client Token (Bearer Token)`

⚠️

The `Authentication` endpoint has a different `Base URL` than the verification
session endpoints. Ensure you are using the correct URLs for each endpoint to
avoid connectivity issues.

## Request [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/update-status\#request)

To update the status of a verification session programmatically, follow these steps:

### Authenticate [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/update-status\#authenticate)

To obtain the `access_token`, refer to the [Authentication](https://docs.didit.me/identity-verification/api-reference/authentication) documentation page.

ℹ️

The `access_token` is valid for a limited time (x minutes), so you do not need
to authenticate for every request until the token expires.

### Select Desired Parameters [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/update-status\#select-desired-parameters)

- **new\_status**: It can be `Approved`, or `Declined`.
- **comment** (optional): A comment to be added to the review.

### Update Session Status Request [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/update-status\#update-session-status-request)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
PATCH /v1/session/{session_id}/update-status/ HTTP/1.1
Host: verification.didit.me
Content-Type: application/json
Authorization: Bearer {access_token}

{
  "new_status": "Declined",
  "comment": "Duplicated user"
}
```

## Response [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/update-status\#response)

Returns session details including `session_id`, `session_token`, `url`. The `session_id` should be linked to your user in your User model, and you should open or send the `url` for your user to start the verification process.

### Example Response [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/update-status\#example-response)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
{
  "session_id": "your-session-id",
}
```

## Code Example: [Permalink for this section](https://docs.didit.me/identity-verification/api-reference/update-status\#code-example)

```nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border nx-py-0.5 nx-px-[.25em] nx-text-[.9em] dark:nx-border-white/10 dark:nx-bg-white/10
const updateSessionStatus = async (
  sessionId: string,
  new_status: string,
  comment: string,
) => {
  const url = `${BASE_URL}/v1/session/${sessionId}/update-status/`;
  const token = await getClientToken();

  if (!token) {
    console.error('Error fetching client token');
  } else {
    const body = {
      new_status: new_status,
      comment: comment,
    };

    const requestOptions = {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(body),
    };

    try {
      const response = await fetch(url, requestOptions);

      const data = await response.json();

      if (response.status === 200 && data) {
        return data;
      } else {
        console.error('Error updating session status:', data.message);
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Network error:', error);
      throw error;
    }
  }
};
```

Last updated on December 8, 2024

[Generate PDF](https://docs.didit.me/identity-verification/api-reference/generate-pdf "Generate PDF") [iOS & Android](https://docs.didit.me/identity-verification/ios-and-android "iOS & Android")