import { validateInternalPath } from "@/lib/safeNavigate";

export function buildLoggedOutCtaLoginHref(appDestination?: string) {
  const safeDestination = validateInternalPath(appDestination ?? "/dashboard") ?? "/dashboard";
  return `/login?next=${encodeURIComponent(safeDestination)}`;
}
