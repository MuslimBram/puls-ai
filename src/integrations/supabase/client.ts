import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Compatibility bridge for older callers that still invoke the totp-manage
// Edge Function. TOTP itself must run through the browser Supabase Auth MFA
// APIs so enrollment/challenge/verification share the browser session context.
let supabaseClient: ReturnType<typeof createClient<Database>>;
let pendingTotpFactorId: string | null = null;

const getPendingFactorId = () => {
  try {
    return sessionStorage.getItem('pulse_totp_factor_id') || pendingTotpFactorId;
  } catch {
    return pendingTotpFactorId;
  }
};

const setPendingFactorId = (factorId: string | null) => {
  pendingTotpFactorId = factorId;
  try {
    if (factorId) sessionStorage.setItem('pulse_totp_factor_id', factorId);
    else sessionStorage.removeItem('pulse_totp_factor_id');
  } catch {
    // Ignore storage failures. The in-memory value still covers the active flow.
  }
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const totpCompatibilityFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

  if (!url.includes('/functions/v1/totp-manage')) {
    return fetch(input, init);
  }

  let body: { action?: string; token?: string; factor_id?: string } = {};
  try {
    const rawBody = init?.body;
    if (typeof rawBody === 'string') body = JSON.parse(rawBody);
  } catch {
    // Let the original function handle malformed/non-TOTP payloads.
    return fetch(input, init);
  }

  const action = body.action;
  const directTotpActions = new Set([
    'check_totp_status',
    'enroll',
    'verify_enroll',
    'verify_totp',
    'check',
    'status',
  ]);

  if (!action || !directTotpActions.has(action)) {
    return fetch(input, init);
  }

  try {
    const { data: factors, error: listError } = await supabaseClient.auth.mfa.listFactors();
    if (listError) throw listError;

    const verifiedFactors = factors.totp.filter((factor) => factor.status === 'verified');

    if (action === 'check_totp_status' || action === 'check' || action === 'status') {
      return jsonResponse({ enrolled: verifiedFactors.length > 0, enabled: verifiedFactors.length > 0 });
    }

    if (action === 'enroll') {
      for (const factor of factors.totp.filter((item) => item.status === 'unverified')) {
        await supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data: enrollData, error: enrollError } = await supabaseClient.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Pulse AI Authenticator',
      });
      if (enrollError) throw enrollError;

      setPendingFactorId(enrollData.id);
      return jsonResponse({
        enrolled: false,
        factorId: enrollData.id,
        qrCode: enrollData.totp.qr_code,
        secret: enrollData.totp.secret,
        uri: enrollData.totp.uri,
      });
    }

    const factorId = body.factor_id || getPendingFactorId();
    const verifiedFactorId = factorId || verifiedFactors[0]?.id;
    if (!verifiedFactorId) {
      return jsonResponse({ error: 'TOTP factor not found' }, 400);
    }

    const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({
      factorId: verifiedFactorId,
    });
    if (challengeError) throw challengeError;

    const { error: verifyError } = await supabaseClient.auth.mfa.verify({
      factorId: verifiedFactorId,
      challengeId: challengeData.id,
      code: body.token || '',
    });
    if (verifyError) throw verifyError;

    await supabaseClient.auth.refreshSession();
    setPendingFactorId(null);

    return jsonResponse({ verified: true, enrolled: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TOTP verification failed';
    return jsonResponse({ error: message }, 400);
  }
};

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

supabaseClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: totpCompatibilityFetch,
  },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    experimental: { passkey: true },
  }
});

export const supabase = supabaseClient;
