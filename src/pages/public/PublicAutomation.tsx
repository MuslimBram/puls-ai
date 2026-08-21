import { Zap } from "lucide-react";
import PlatformPage from "./PlatformPage";

const config = {
  title: "Automation",
  subtitle: "Work less. Achieve more.",
  description:
    "Build powerful automations without code. Trigger actions across your entire stack — from lead capture to invoice sending — based on any event or condition.",
  Icon: Zap,
  appDestination: "/automations",
  features: [
    "Visual workflow builder",
    "Cross-channel triggers",
    "Conditional logic",
    "Third-party integrations",
    "Scheduled automations",
    "Execution audit logs",
  ],
};

export default function PublicAutomation() {
  return <PlatformPage config={config} />;
}
