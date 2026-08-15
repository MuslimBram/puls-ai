/**
 * PULSE AI — LIDHJET NATIVE MODULE
 * PR1 BACKEND & DOMAIN TYPES
 */

export type ProfileStatus = "active" | "under_review" | "suspended" | "banned";
export type PostStatus = "active" | "closed" | "flagged" | "archived";
export type ReportStatus = "pending" | "confirmed" | "dismissed";
export type InterestStatus = "pending" | "accepted" | "tax_paid" | "rejected" | "expired";
export type AiUsageStatus = "reserved" | "completed" | "failed";
export type AiVia = "system" | "workspace";

export interface CommunityProfile {
  user_id: string;
  status: ProfileStatus;
  verification_status: "pending" | "approved" | "rejected";
  offer_type: string | null;
  bio: string | null;
  avatar_url: string | null;
  display_name: string | null;
  suspended_until: string | null;
  activated_at: string;
  under_review_until: string;
  created_at: string;
  updated_at: string;
}

export interface PublicProfileResult {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  offer_type: string | null;
}

export interface CommunityPriceBand {
  id: string;
  category: "pune" | "sherbim" | "tregti" | "tjeter";
  min_price: number;
  max_price: number;
  currency: string;
}

export interface CommunityPost {
  id: string;
  author_user_id: string;
  workspace_id: string | null;
  title: string;
  content: string;
  category: string;
  price: number;
  currency: string;
  location: string | null;
  status: PostStatus;
  views_count: number;
  created_at: string;
  updated_at: string;
}

export interface CommunityInterest {
  id: string;
  post_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  offer_amount: number;
  message: string | null;
  status: InterestStatus;
  tax_paid: boolean;
  tax_paid_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceTaxResult {
  success: boolean;
  code: string;
  message?: string;
  tax_eur?: number;
  tax_lek?: number;
  lek_per_eur_used?: number;
}

export interface AiClaimResult {
  allowed: boolean;
  status: AiUsageStatus | "in_progress" | "capped";
  code?: string;
  reused?: boolean;
  usage_id?: string;
  record_id?: string;
  error?: string;
}

export interface AiUsageRecord {
  id: string;
  request_id: string | null;
  user_id: string;
  module: string;
  via: AiVia;
  workspace_id: string | null;
  status: AiUsageStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}
