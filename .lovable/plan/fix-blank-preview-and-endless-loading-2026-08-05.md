# Fix blank preview and endless loading

## Confirmed diagnosis

- The frontend dev server is running and returns HTTP 200; a clean browser can load the app and reach the login page.
- The affected browser is failing to refresh its saved login session: the auth refresh request returned `504 upstream request timeout`.
- Lovable Cloud reports the backend as active, but both database health metrics and a read-only performance query timed out. This matches the very slow custom domain and endless loading.
- `AuthContext` waits for `ensure_current_user_bootstrap` before clearing the global loading state. When the backend stalls, every protected route can remain on its spinner.
- The PWA service worker is registered immediately in all environments, including Lovable preview. Its document and asset caches can preserve a stale/broken preview response.

## Recovery and fix

1. **Recover the backend**
   - Restart the Lovable Cloud backend because auth and database requests are timing out despite the lifecycle status appearing active.
   - Re-check backend health and verify that token refresh and a simple database read respond normally.

2. **Prevent authentication from freezing the UI**
   - Update `AuthContext` so the local session is applied and `loading` is cleared immediately.
   - Run user bootstrap after session hydration as non-blocking work, with guarded error handling and no duplicate concurrent call.
   - Keep protected-route behavior secure: unresolved/invalid sessions still redirect to login; backend bootstrap failure will not expose protected content.

3. **Make PWA caching safe for preview**
   - Do not register the app-shell service worker in development or Lovable preview contexts.
   - Clean up existing Pulse AI service-worker registrations and stale app-shell caches in preview only.
   - Preserve installability and offline support on the published/custom-domain app.

4. **Bound loading states**
   - Ensure subscription and role checks cannot show an infinite spinner when the backend is temporarily unavailable.
   - Show a recoverable error/retry state or return safely to login instead of leaving a blank page.

5. **End-to-end verification**
   - Test public pages, `/login`, `/admin`, and another protected route in a fresh browser.
   - Test the custom domain with both a clean session and an existing saved session.
   - Confirm no reload loop, stale service worker, blank screen, or permanent spinner remains.

## Expected result

Preview pages load without browser errors, public pages open immediately, expired/stale sessions recover to login, protected pages no longer spin forever, and `kohablerjeve.top` remains usable during temporary backend delays.
