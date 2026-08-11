import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listLeadsTool from "./tools/list-leads";
import createLeadTool from "./tools/create-lead";
import listInboxMessagesTool from "./tools/list-inbox-messages";
import listDealsTool from "./tools/list-deals";
import listBusinessProfilesTool from "./tools/list-business-profiles";
import listInboxThreadsTool from "./tools/list-inbox-threads";
import searchKnowledgeTool from "./tools/search-knowledge";

// Issuer MUST be the direct Supabase host, not the .lovable.cloud proxy.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "pulse-ai-mcp",
  title: "Pulse AI",
  version: "0.1.0",
  instructions:
    "Pulse AI tools. Read and manage the signed-in user's leads, deals, unified inbox messages, and business profiles. All actions run as the authenticated user under existing row-level security policies.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    whoamiTool,
    listLeadsTool,
    createLeadTool,
    listInboxMessagesTool,
    listDealsTool,
    listBusinessProfilesTool,
    listInboxThreadsTool,
    searchKnowledgeTool,
  ],
});
