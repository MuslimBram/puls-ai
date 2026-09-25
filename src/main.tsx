import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initializePWA } from "@/lib/pwaRegistration";
import { applyVisitorIpLanguage } from "@/lib/visitorLocale";

void initializePWA();
void applyVisitorIpLanguage();

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);

