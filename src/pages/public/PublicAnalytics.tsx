import { BarChart3 } from "lucide-react";
import PlatformPage from "./PlatformPage";

const config = {
  title: "Analytics",
  subtitle: "Data you can act on.",
  description:
    "From revenue trends to customer churn signals, Pulse AI turns raw data into clear narratives and recommended next steps — no analyst required.",
  Icon: BarChart3,
  appDestination: "/analytics",
  features: [
    "Revenue & growth dashboards",
    "Customer behaviour analytics",
    "Churn risk indicators",
    "Funnel visualisation",
    "Custom report builder",
    "AI-generated summaries",
  ],
};

export default function PublicAnalytics() {
  return <PlatformPage config={config} />;
}
