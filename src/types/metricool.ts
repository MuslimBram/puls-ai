/**
 * PULSE AI — METRICOOL ADAPTER CONTRACT (PHASE M1)
 *
 * Workspace-scoped normalized types for Metricool social aggregation layer.
 * All records and operations are strictly scoped to Pulse workspace_id.
 * 0 real API calls / 0 provider calls / 0 credits consumed.
 */

export type SocialNetwork =
  | "facebook"
  | "instagram"
  | "threads"
  | "twitter"
  | "linkedin"
  | "pinterest"
  | "tiktok"
  | "youtube"
  | "google_business"
  | "twitch";

export type AdNetwork = "meta_ads" | "google_ads" | "tiktok_ads";

export type MetricoolPostStatus = "draft" | "scheduled" | "published" | "failed";

export interface MetricoolConnection {
  workspace_id: string;
  brand_id: string;
  user_id: string;
  connected_at: string;
  connected_networks: SocialNetwork[];
  status: "connected" | "expired" | "pending_oauth";
}

export interface MetricoolSocialAccount {
  workspace_id: string;
  brand_id: string;
  network: SocialNetwork;
  account_id: string;
  account_name: string;
  profile_url?: string;
  avatar_url?: string;
}

export interface MetricoolPost {
  id: string;
  workspace_id: string;
  brand_id: string;
  title?: string;
  content: string;
  media_urls?: string[];
  target_networks: SocialNetwork[];
  status: MetricoolPostStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  remote_post_ids?: Record<SocialNetwork, string>;
  created_at: string;
  updated_at: string;
}

export interface MetricoolSocialMetric {
  workspace_id: string;
  brand_id: string;
  network: SocialNetwork;
  period_start: string;
  period_end: string;
  followers_total: number;
  followers_growth: number;
  impressions: number;
  reach: number;
  clicks: number;
  engagement_rate: number;
  posts_count: number;
}

export interface MetricoolAdMetric {
  workspace_id: string;
  brand_id: string;
  network: AdNetwork;
  campaign_id: string;
  campaign_name: string;
  spend_amount: number;
  currency: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  period_start: string;
  period_end: string;
}

export interface MetricoolInboxSummary {
  workspace_id: string;
  brand_id: string;
  unread_comments_count: number;
  unread_messages_count: number;
  last_activity_at: string;
}
