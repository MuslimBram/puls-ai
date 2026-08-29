# Auth MFA plan

- Email/password login must complete a second factor before protected navigation.
- Email registration must complete MFA after account confirmation.
- OAuth registration must complete MFA after the provider callback.
- TOTP is the stable second factor today.
- Email OTP remains a fallback only where TOTP is unavailable or not enrolled.
- The protected-app boundary enforces AAL2 and closes session-restore/direct-navigation paths that would otherwise enter the app at AAL1.
- The existing trusted-device approval flow is not treated as a second factor or a silent 2FA bypass.
- Passkey/WebAuthn is available as a device-bound, phishing-resistant credential for users who have already completed mandatory MFA. It is kept separate from the current TOTP MFA flow because Supabase currently documents Passkeys as an experimental authentication feature while the stable MFA API documents TOTP and phone verification.
- Passkey support requires `@supabase/supabase-js` v2.105.0+ and `{ auth: { experimental: { passkey: true } } }` on the client, plus Supabase Authentication → Passkeys/WebAuthn project configuration.
