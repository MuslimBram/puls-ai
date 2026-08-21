import { MessageSquare } from "lucide-react";
import PlatformPage from "./PlatformPage";

const config = {
  title: "Unified Inbox",
  subtitle: "Every conversation. One place.",
  description:
    "Connect WhatsApp, email, Instagram, Facebook, SMS and more into a single intelligent inbox. AI triages, routes and drafts responses automatically.",
  Icon: MessageSquare,
  appDestination: "/inbox",
  features: [
    "Multi-channel inbox",
    "AI-assisted replies",
    "Smart conversation routing",
    "Team collaboration",
    "SLA tracking",
    "Contact history at a glance",
  ],
};

export default function PublicUnifiedInbox() {
  return <PlatformPage config={config} />;
}
