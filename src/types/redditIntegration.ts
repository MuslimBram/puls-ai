/**
 * PULSE AI — REDDIT ACCESS-GATED INTEGRATION TYPES (PHASE R2)
 *
 * Defines commercial access status and integration contracts for Reddit.
 * Access status default: COMMERCIAL_ACCESS_REQUIRED / NOT_CONFIGURED.
 * NO live Reddit API calls allowed in R2.
 */

export type RedditAccessStatus =
  | "NOT_CONFIGURED"
  | "COMMERCIAL_ACCESS_REQUIRED"
  | "READY"
  | "REVOKED";

export interface RedditWorkspaceConfig {
  workspace_id: string;
  reddit_account_id?: string;
  monitored_subreddits?: string[];
  connection_status: "connected" | "disconnected" | "error";
  access_status: RedditAccessStatus;
  scopes?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface RedditSyncOptions {
  workspace_id: string;
  limit?: number;
}

export interface RedditPostOptions {
  workspace_id: string;
  subreddit: string;
  title: string;
  content: string;
  kind?: "self" | "link";
}

export interface RedditReplyOptions {
  workspace_id: string;
  thing_id: string; // post ID (t3_...) or comment ID (t1_...)
  content: string;
}

export interface RedditAdapterResult<T = unknown> {
  success: boolean;
  access_status: RedditAccessStatus;
  error_code?: string;
  error_message?: string;
  data?: T;
}
