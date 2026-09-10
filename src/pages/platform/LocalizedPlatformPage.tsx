import PlatformHub from "./PlatformHub";
import PlatformAi from "./PlatformAi";
import PlatformInbox from "./PlatformInbox";
import PlatformCrm from "./PlatformCrm";
import PlatformMarketing from "./PlatformMarketing";
import PlatformAutomation from "./PlatformAutomation";
import PlatformAnalytics from "./PlatformAnalytics";
import PlatformDevelopers from "./PlatformDevelopers";
import PlatformPartners from "./PlatformPartners";
import PlatformLidhjet from "./PlatformLidhjet";

type PlatformSlug =
  | "platform"
  | "platform/ai"
  | "platform/unified-inbox"
  | "platform/crm"
  | "platform/marketing"
  | "platform/automation"
  | "platform/analytics"
  | "platform/developers"
  | "platform/partners"
  | "platform/lidhjet";

const PAGES: Record<PlatformSlug, React.ComponentType> = {
  platform: PlatformHub,
  "platform/ai": PlatformAi,
  "platform/unified-inbox": PlatformInbox,
  "platform/crm": PlatformCrm,
  "platform/marketing": PlatformMarketing,
  "platform/automation": PlatformAutomation,
  "platform/analytics": PlatformAnalytics,
  "platform/developers": PlatformDevelopers,
  "platform/partners": PlatformPartners,
  "platform/lidhjet": PlatformLidhjet,
};

export default function LocalizedPlatformPage({ slug }: { slug: string }) {
  const Page = PAGES[slug as PlatformSlug];
  return Page ? <Page /> : null;
}
