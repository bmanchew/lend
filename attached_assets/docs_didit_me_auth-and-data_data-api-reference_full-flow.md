URL: https://docs.didit.me/auth-and-data/data-api-reference/full-flow
---
🎉 Unlimited Free KYC - Forever!!

Auth + Data

Data API Reference

Full Flow

# How it works: Data Transfer Flow with QR Code

This document explains our the data transfer flow that incorporates QR code scanning for a seamless user experience across devices.

Didit API ServerApplication ServerApplication ClientMobile AppDidit API ServerApplication ServerApplication ClientMobile App1\. Trigger onSessionIdResolver2\. Create share session3\. Generate session URLReturn session infoReturn session info4\. Display QR code5\. User Scan QR code6\. Request more session infoUpdate session status to 'retrieved'7\. Return session info8\. Present confirmation screen9\. User confirms data sharingUpdate session status to 'confirmed'10\. Poll /session/{session\_id}/statusReturn 'confirmed' status11\. Triggers 'handleVerify' callback12\. Calls retrieve session dataReturn session data13\. Server processes user data shared and decides the next steps14\. onSuccess or onError callbacks from SDK are executed

### Client app initiates the flow [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#client-app-initiates-the-flow)

The client application SDK triggers the `onSessionIdResolver` function and sends a request to the application backend to generate a data transfer session.

Ensure that the scope are correctly set in this request if you are ordering data scopes dynamically. The vendor data should be included if you want to identify the request with some identifier, like the `id` of the user.

### Application backend creates a session [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#application-backend-creates-a-session)

The application backend creates a data transfer session. Check more information about this [here](https://docs.didit.me/auth-and-data/data-api-reference/create-session#response)

### Didit API generates a session [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#didit-api-generates-a-session)

The server creates a unique session and returns session details including `session_id`, `session_token`, and `url`. The session status is set to initialized.

⚠️

Ensure that the session is short-lived to prevent potential security risks.

### Client app displays QR code [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#client-app-displays-qr-code)

The client app generates and displays a QR code containing the session URL. This QR code serves as a bridge between the web/mobile app and the user's native app.

⚠️

Implement a mechanism to refresh the QR code if the session expires before confirmation.

### User scans QR code [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#user-scans-qr-code)

The user scans the QR code displayed on the client app. This action transfers the session information to the Didit's native app.

### Didit Native app processes the session URL [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#didit-native-app-processes-the-session-url)

Upon scanning, the mobile app extracts and opens the session URL, establishing a connection with the Didit API, and ask the Didit API `/session/{session_id}/information` endpoint for more information regarding the session, to display a confirmation screen with the requested scopes and data sharing details.

The Didit API will update the sessions status to `retrieved` so we can display in the UI of the website something like "Confirming data sharing request".

### Mobile app returns session info [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#mobile-app-returns-session-info)

The mobile app returns the session information to the user, including the requested scopes and data sharing details. The user can review this information and decide whether to proceed with the data sharing request.

### Didit native app presents confirmation screen [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#didit-native-app-presents-confirmation-screen)

The Didit's native app displays a screen in the mobile app, asking the user to confirm the data sharing request. This screen typically shows which data will be shared and with whom.

Ensure that requested scopes are clearly presented to the user during this confirmation step.

### User confirms data sharing [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#user-confirms-data-sharing)

The user reviews the information and confirms their willingness to share the requested data. The mobile app sends a POST request to the Didit API's `/session/{session_id}/update` endpoint. This request includes:

- The user's access token for authentication
- The session identifier
- The shared data accepted by the user

We also update the session status to `confirmed`.

⚠️

Ensuring the security of this step is crucial. The access token proves that the user is authenticated in the mobile app. We must make sure that the access token is from an internal organization and not from a third-party. Also, the session status must be `retrieved` in the Didit API to ensure that the session is still valid.

### Client app polls for session status [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#client-app-polls-for-session-status)

The client app regularly polls the `/session/{session_id}/status` endpoint to check for updates. When the session status is `confirmed`, the server responds to the polling request to the client with `confirmed` status, or sends a WebSocket notification.

In case the status is `declined`, the client app should handle the error and notify the user accordingly.

### Client SDK sends a request to the server [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#client-sdk-sends-a-request-to-the-server)

The client app SDK trigger the `handleVerify` callback to send a request to the application server to fetch the session data.

⚠️

Ensure that the exchange process is secure and that the user data is handled appropriately.

### Application server validates and returns user data [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#application-server-validates-and-returns-user-data)

The application server makes a request to `/session/{session_id}/decision` endpoint, to validate the session and retrieve the user data. Check more information about this [here](https://docs.didit.me/auth-and-data/data-api-reference/retrieve-session)

### Server processes user data [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#server-processes-user-data)

The application server processes the user data and decides the next steps in the user journey, such as updating the user profile or granting access to the application.

### SDK executes onSuccess or onError hooks [Permalink for this section](https://docs.didit.me/auth-and-data/data-api-reference/full-flow\#sdk-executes-onsuccess-or-onerror-hooks)

The SDK executes the appropriate hooks based on the response from the application server, allowing the client app to handle the user data accordingly.

Last updated on January 23, 2025

[Refresh Token](https://docs.didit.me/auth-and-data/sign-in-api-reference/refresh-token "Refresh Token") [Authentication](https://docs.didit.me/auth-and-data/data-api-reference/authentication "Authentication")