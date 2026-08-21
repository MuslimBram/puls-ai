/**
 * PublicDevelopers — public Developers page.
 *
 * Canonical route: /platform/developers
 * Authenticated Go-To destination: /public-api
 * DO NOT use /developer as a public navigation target.
 *
 * Wave 1: structural shell only. Full content authored in Wave 2+.
 */
import ComingSoon from "./ComingSoon";

export default function PublicDevelopers() {
  return <ComingSoon title="Developers" />;
}
