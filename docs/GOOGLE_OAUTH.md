# Google OAuth for the separate Windows estimator

**Google OAuth on Render is not automatically connected to Andrew's local estimator.** The local app expects a Desktop OAuth client ID/secret via private environment variables `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` on Andrew's Windows PC.

The app uses PKCE/state/nonce, Google ID token validation, and a loopback callback `http://127.0.0.1:8787/api/google/callback`. It can store a refresh token encrypted by Windows DPAPI CurrentUser; this is separate from business portal authorization.

## For Andrew's Google account
1. Confirm the account address he actually uses and controls. The requested address is `andrew@prescottsbest.com`; do not assume it is a working Google identity until confirmed.
2. Open Google Cloud Console → Google Auth Platform → Audience. For an External Testing OAuth app, select **Add test users** and add his verified Google account email.
3. Use the correctly typed **Desktop** OAuth client for this local app, rather than assuming a Render web client can be reused. Consider a separately issued Desktop client for his computer.
4. On Andrew's PC, copy `.env.example` to untracked `.env` and enter only his allowed local OAuth client configuration. Never commit or post that file.
5. In the estimator, consent separately to identity, Gmail read-only/search, Gmail send, and Drive project files (`drive.file`) as necessary. These scopes can have Google review and verification requirements.
6. Verify by connecting within his own browser and checking that the local status panel shows **his** Google account. Consent can expire in External Testing.

Google sign-in in this version is **not** a general role-based login to the public Render bid portal. A genuine multi-user hosted login still requires a verified Google ID token, session lifecycle, role/tenant authorization, safe OAuth callbacks and a production security review.

Official Google guide: https://developers.google.com/workspace/guides/configure-oauth-consent
