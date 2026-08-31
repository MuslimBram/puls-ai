import { Navigate } from "react-router-dom";

/**
 * Legacy landing page is intentionally retired.
 * Product-facing claims, pricing and account guidance now live on the
 * canonical localized homepage and Pricing surfaces.
 */
export default function Landing() {
  return <Navigate to="/" replace />;
}
