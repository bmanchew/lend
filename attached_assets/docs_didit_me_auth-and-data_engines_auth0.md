URL: https://docs.didit.me/auth-and-data/engines/auth0
---
🎉 Unlimited Free KYC - Forever!!

Auth + Data

Engines

Auth0

# Auth0 Integration

Sign in with Didit provides secure human authentication while protecting user privacy. Auth0 serves as one of our supported identity platforms, allowing you to integrate Sign in with Didit into your Auth0-powered applications.

## Prerequisites [Permalink for this section](https://docs.didit.me/auth-and-data/engines/auth0\#prerequisites)

1. An Auth0 account and tenant. [Sign up for free (opens in a new tab)](https://auth0.com/signup).
2. A [Didit Business Console (opens in a new tab)](https://business.didit.me/) account.

## Set up Didit [Permalink for this section](https://docs.didit.me/auth-and-data/engines/auth0\#set-up-didit)

1. Log in to your [Didit Business Console (opens in a new tab)](https://business.didit.me/).
2. Navigate to **Applications** in the left sidebar.
3. Click **Create Application**.
4. Enter a name for your application.
5. For **Redirect URI**, enter: `https://{YOUR_AUTH0_DOMAIN}/login/callback`, replacing `{YOUR_AUTH0_DOMAIN}` with your Auth0 tenant domain.
6. Click **Create**.
7. On the application details page, note the following values - you'll need them to configure the Auth0 connection:
   - **Client ID**
   - **Client Secret**

## Configure Auth0 Connection [Permalink for this section](https://docs.didit.me/auth-and-data/engines/auth0\#configure-auth0-connection)

1. Access the [Didit integration (opens in a new tab)](https://marketplace.auth0.com/integrations/didit) in the Auth0 Marketplace.
2. Select **Add Integration** to begin the setup process.
3. Review and accept the required access permissions, then select **Continue**.
4. Configure the integration with your Didit credentials:
   - **Client ID** \- From your Didit application
   - **Client Secret** \- From your Didit application
5. Select the **Permissions** that align with your application requirements.
6. Configure user profile synchronization settings:
   - Enable profile sync for automatic updates when users modify their Didit profile data
7. Select **Create** to establish the connection.
8. In the **Applications** section, enable the connection for your desired Auth0 applications.

## Test Connection [Permalink for this section](https://docs.didit.me/auth-and-data/engines/auth0\#test-connection)

You're ready to [test this Connection (opens in a new tab)](https://auth0.com/docs/authenticate/identity-providers/test-connections).

## Troubleshooting [Permalink for this section](https://docs.didit.me/auth-and-data/engines/auth0\#troubleshooting)

- For implementation support, refer to:
  - [Sign in with Didit documentation (opens in a new tab)](https://docs.didit.me/auth-and-data/sign-in/how-it-works)
  - [Sign in API Reference (opens in a new tab)](https://docs.didit.me/auth-and-data/sign-in-api-reference/full-flow)
  - [Auth0 Identity Provider Documentation (opens in a new tab)](https://auth0.com/docs/authenticate/identity-providers)

Last updated on January 23, 2025

[Retrieve Session](https://docs.didit.me/auth-and-data/data-api-reference/retrieve-session "Retrieve Session") [NextAuth.js](https://docs.didit.me/auth-and-data/engines/next-auth "NextAuth.js")