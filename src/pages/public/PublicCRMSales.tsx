import { Users } from "lucide-react";
import PlatformPage from "./PlatformPage";

const config = {
  title: "CRM & Sales",
  subtitle: "Close more. Chase less.",
  description:
    "A CRM built for the AI era. Automatically enrich contacts, track pipeline stages, and let AI surface the next best action for every deal.",
  Icon: Users,
  appDestination: "/crm",
  features: [
    "Visual pipeline management",
    "AI lead enrichment",
    "Automated follow-ups",
    "Deal health scoring",
    "Custom sales stages",
    "Revenue forecasting",
  ],
};

export default function PublicCRMSales() {
  return <PlatformPage config={config} />;
}
