import { Target } from "lucide-react";
import PlatformPage from "./PlatformPage";

const config = {
  title: "Marketing",
  subtitle: "Campaigns that convert — on autopilot.",
  description:
    "Design, launch and optimise multi-channel marketing campaigns with AI copywriting, audience segmentation, and performance analytics built in.",
  Icon: Target,
  appDestination: "/campaigns",
  features: [
    "AI-powered copywriting",
    "Audience segmentation",
    "Email & WhatsApp campaigns",
    "A/B testing",
    "Campaign analytics",
    "Drip automation",
  ],
};

export default function PublicMarketing() {
  return <PlatformPage config={config} />;
}
