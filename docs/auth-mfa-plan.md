# Auth MFA plan

- Email/password login must complete a second factor before protected navigation.
- Email registration must complete MFA after account confirmation.
- OAuth registration must complete MFA after the provider callback.
- TOTP is the stable second factor today.
- Email OTP remains a fallback only where TOTP is unavailable or not enrolled.
- The existing trusted-device approval flow is not treated as a second factor until its caller identity binding is hardened.
- Passkey/FIDO2 is the preferred device-bound future factor. It requires Supabase Passkeys/WebAuthn configuration and a compatible `@supabase/supabase-js` version before enablement.
