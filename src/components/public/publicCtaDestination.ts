import { validateInternalPath } from "@/lib/safeNavigate";

export function buildLoggedOutCtaRegisterHref(appDestination?: string) {
  const safeDestination = validateInternalPath(appDestination ?? "/dashboard") ?? "/dashboard";
  return `/register?next=${encodeURIComponent(safeDestination)}`;
}

/** @deprecated Public acquisition CTAs now start registration directly. */
export const buildLoggedOutCtaLoginHref = buildLoggedOutCtaRegisterHref;
