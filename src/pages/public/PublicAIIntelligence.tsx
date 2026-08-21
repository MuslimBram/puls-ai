import { Brain } from "lucide-react";
import PlatformPage from "./PlatformPage";

const config = {
  title: "AI & Intelligence",
  subtitle: "Your business brain — always on.",
  description:
    "Pulse AI's intelligence layer learns from every interaction, surfaces insights you'd otherwise miss, and automates decisions so your team can focus on what matters.",
  Icon: Brain,
  appDestination: "/dashboard",
  features: [
    "Predictive lead scoring",
    "Automated sentiment analysis",
    "Real-time business insights",
    "AI-driven recommendations",
    "Conversation intelligence",
    "Opportunity detection",
  ],
};

export default function PublicAIIntelligence() {
  return <PlatformPage config={config} />;
}
