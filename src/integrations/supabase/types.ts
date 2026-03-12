export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          ai_reply: string | null
          channel_type: string
          complexity: string
          created_at: string
          id: string
          is_auto_reply: boolean
          is_draft: boolean
          page_url: string | null
          status: string
          updated_at: string
          user_id: string
          visitor_email: string | null
          visitor_message: string
          visitor_name: string | null
          workspace_id: string | null
        }
        Insert: {
          ai_reply?: string | null
          channel_type?: string
          complexity?: string
          created_at?: string
          id?: string
          is_auto_reply?: boolean
          is_draft?: boolean
          page_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
          visitor_email?: string | null
          visitor_message: string
          visitor_name?: string | null
          workspace_id?: string | null
        }
        Update: {
          ai_reply?: string | null
          channel_type?: string
          complexity?: string
          created_at?: string
          id?: string
          is_auto_reply?: boolean
          is_draft?: boolean
          page_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          visitor_email?: string | null
          visitor_message?: string
          visitor_name?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          comment: string | null
          conversation_id: string
          created_at: string
          id: string
          rating: number | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          rating?: number | null
          user_id: string
        }
        Update: {
          comment?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      business_profiles: {
        Row: {
          ai_tone: string | null
          business_name: string
          created_at: string
          id: string
          industry: string | null
          language: string | null
          main_services: string | null
          mission_values: string | null
          short_description: string | null
          target_audience: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_tone?: string | null
          business_name: string
          created_at?: string
          id?: string
          industry?: string | null
          language?: string | null
          main_services?: string | null
          mission_values?: string | null
          short_description?: string | null
          target_audience?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_tone?: string | null
          business_name?: string
          created_at?: string
          id?: string
          industry?: string | null
          language?: string | null
          main_services?: string | null
          mission_values?: string | null
          short_description?: string | null
          target_audience?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_content: {
        Row: {
          body: string
          campaign_id: string
          content_post_id: string | null
          content_type: string
          created_at: string
          funnel_stage: string
          hashtags: string[] | null
          id: string
          media_suggestion: string | null
          sort_order: number | null
          status: string
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          body: string
          campaign_id: string
          content_post_id?: string | null
          content_type?: string
          created_at?: string
          funnel_stage?: string
          hashtags?: string[] | null
          id?: string
          media_suggestion?: string | null
          sort_order?: number | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          body?: string
          campaign_id?: string
          content_post_id?: string | null
          content_type?: string
          created_at?: string
          funnel_stage?: string
          hashtags?: string[] | null
          id?: string
          media_suggestion?: string | null
          sort_order?: number | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_content_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_content_content_post_id_fkey"
            columns: ["content_post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_content_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ai_generated: boolean | null
          audience_personas: Json | null
          budget_max: number | null
          budget_min: number | null
          created_at: string
          cta_strategy: string | null
          duration_end: string | null
          duration_start: string | null
          expected_kpis: Json | null
          funnel_stages: Json | null
          id: string
          messaging_pillars: Json | null
          name: string
          objective: string
          positioning_statement: string | null
          preferred_channels: string[] | null
          status: string
          target_audience: string | null
          updated_at: string
          user_id: string
          value_proposition: string | null
          workspace_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          audience_personas?: Json | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          cta_strategy?: string | null
          duration_end?: string | null
          duration_start?: string | null
          expected_kpis?: Json | null
          funnel_stages?: Json | null
          id?: string
          messaging_pillars?: Json | null
          name: string
          objective?: string
          positioning_statement?: string | null
          preferred_channels?: string[] | null
          status?: string
          target_audience?: string | null
          updated_at?: string
          user_id: string
          value_proposition?: string | null
          workspace_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          audience_personas?: Json | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          cta_strategy?: string | null
          duration_end?: string | null
          duration_start?: string | null
          expected_kpis?: Json | null
          funnel_stages?: Json | null
          id?: string
          messaging_pillars?: Json | null
          name?: string
          objective?: string
          positioning_statement?: string | null
          preferred_channels?: string[] | null
          status?: string
          target_audience?: string | null
          updated_at?: string
          user_id?: string
          value_proposition?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_registry: {
        Row: {
          category: string
          config_schema: Json | null
          description: string | null
          icon: string | null
          id: string
          is_available: boolean
          name: string
        }
        Insert: {
          category: string
          config_schema?: Json | null
          description?: string | null
          icon?: string | null
          id: string
          is_available?: boolean
          name: string
        }
        Update: {
          category?: string
          config_schema?: Json | null
          description?: string | null
          icon?: string | null
          id?: string
          is_available?: boolean
          name?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          category: string
          channel_name: string
          channel_type: string
          connection_status: string
          created_at: string
          id: string
          is_enabled: boolean
          settings: Json | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          category?: string
          channel_name: string
          channel_type: string
          connection_status?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          settings?: Json | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          category?: string
          channel_name?: string
          channel_type?: string
          connection_status?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          settings?: Json | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_scans: {
        Row: {
          competitor_id: string
          content_summary: string | null
          created_at: string
          detected_topics: string[] | null
          id: string
          promotion_signals: string[] | null
          raw_data: Json | null
          scan_type: string
          scanned_at: string
          source_url: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          competitor_id: string
          content_summary?: string | null
          created_at?: string
          detected_topics?: string[] | null
          id?: string
          promotion_signals?: string[] | null
          raw_data?: Json | null
          scan_type?: string
          scanned_at?: string
          source_url?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          competitor_id?: string
          content_summary?: string | null
          created_at?: string
          detected_topics?: string[] | null
          id?: string
          promotion_signals?: string[] | null
          raw_data?: Json | null
          scan_type?: string
          scanned_at?: string
          source_url?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_scans_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_scans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          ai_content_themes: Json | null
          ai_engagement_style: string | null
          ai_opportunities: Json | null
          ai_positioning: string | null
          ai_summary: string | null
          category: string | null
          created_at: string
          id: string
          is_active: boolean | null
          last_scanned_at: string | null
          name: string
          scan_frequency: string | null
          social_urls: Json | null
          updated_at: string
          user_id: string
          website_url: string | null
          workspace_id: string | null
        }
        Insert: {
          ai_content_themes?: Json | null
          ai_engagement_style?: string | null
          ai_opportunities?: Json | null
          ai_positioning?: string | null
          ai_summary?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_scanned_at?: string | null
          name: string
          scan_frequency?: string | null
          social_urls?: Json | null
          updated_at?: string
          user_id: string
          website_url?: string | null
          workspace_id?: string | null
        }
        Update: {
          ai_content_themes?: Json | null
          ai_engagement_style?: string | null
          ai_opportunities?: Json | null
          ai_positioning?: string | null
          ai_summary?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_scanned_at?: string | null
          name?: string
          scan_frequency?: string | null
          social_urls?: Json | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ideas: {
        Row: {
          content_type: string
          created_at: string
          id: string
          idea_text: string
          is_used: boolean
          suggested_media: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          idea_text: string
          is_used?: boolean
          suggested_media?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          idea_text?: string
          is_used?: boolean
          suggested_media?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_ideas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_knowledge: {
        Row: {
          created_at: string
          extracted_data: Json
          id: string
          scanned_at: string
          source_type: string
          source_url: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          extracted_data?: Json
          id?: string
          scanned_at?: string
          source_type?: string
          source_url?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          extracted_data?: Json
          id?: string
          scanned_at?: string
          source_type?: string
          source_url?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_knowledge_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_posts: {
        Row: {
          ai_generated: boolean
          approved_at: string | null
          caption: string
          content_type: string
          created_at: string
          cta: string | null
          engagement_metrics: Json | null
          hashtags: string[] | null
          id: string
          media_type: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          target_networks: string[] | null
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_generated?: boolean
          approved_at?: string | null
          caption: string
          content_type?: string
          created_at?: string
          cta?: string | null
          engagement_metrics?: Json | null
          hashtags?: string[] | null
          id?: string
          media_type?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          target_networks?: string[] | null
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_generated?: boolean
          approved_at?: string | null
          caption?: string
          content_type?: string
          created_at?: string
          cta?: string | null
          engagement_metrics?: Json | null
          hashtags?: string[] | null
          id?: string
          media_type?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          target_networks?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_messages: {
        Row: {
          channel_id: string | null
          channel_type: string
          created_at: string
          id: string
          intent_score: number | null
          is_unread: boolean
          lead_id: string | null
          matched_keywords: string[] | null
          message_content: string
          message_timestamp: string
          metadata: Json | null
          priority: string
          sender_identifier: string | null
          sender_name: string | null
          source_name: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          channel_id?: string | null
          channel_type?: string
          created_at?: string
          id?: string
          intent_score?: number | null
          is_unread?: boolean
          lead_id?: string | null
          matched_keywords?: string[] | null
          message_content: string
          message_timestamp?: string
          metadata?: Json | null
          priority?: string
          sender_identifier?: string | null
          sender_name?: string | null
          source_name: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          channel_id?: string | null
          channel_type?: string
          created_at?: string
          id?: string
          intent_score?: number | null
          is_unread?: boolean
          lead_id?: string | null
          matched_keywords?: string[] | null
          message_content?: string
          message_timestamp?: string
          metadata?: Json | null
          priority?: string
          sender_identifier?: string | null
          sender_name?: string | null
          source_name?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          keyword: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keywords_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number | null
          content: string
          content_type: string | null
          created_at: string
          id: string
          page_title: string | null
          page_url: string | null
          source_id: string
          summary: string | null
          topic_tags: string[] | null
          updated_at: string
          user_id: string
          word_count: number | null
          workspace_id: string | null
        }
        Insert: {
          chunk_index?: number | null
          content: string
          content_type?: string | null
          created_at?: string
          id?: string
          page_title?: string | null
          page_url?: string | null
          source_id: string
          summary?: string | null
          topic_tags?: string[] | null
          updated_at?: string
          user_id: string
          word_count?: number | null
          workspace_id?: string | null
        }
        Update: {
          chunk_index?: number | null
          content?: string
          content_type?: string | null
          created_at?: string
          id?: string
          page_title?: string | null
          page_url?: string | null
          source_id?: string
          summary?: string | null
          topic_tags?: string[] | null
          updated_at?: string
          user_id?: string
          word_count?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          last_scanned_at: string | null
          metadata: Json | null
          scan_frequency: string | null
          source_name: string
          source_type: string
          source_url: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_scanned_at?: string | null
          metadata?: Json | null
          scan_frequency?: string | null
          source_name: string
          source_type?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_scanned_at?: string | null
          metadata?: Json | null
          scan_frequency?: string | null
          source_name?: string
          source_type?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          detected_keyword: string | null
          id: string
          intent_score: number | null
          message_content: string
          message_date: string
          source_name: string
          source_type: string
          status: string
          suggested_reply: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          detected_keyword?: string | null
          id?: string
          intent_score?: number | null
          message_content: string
          message_date?: string
          source_name: string
          source_type?: string
          status?: string
          suggested_reply?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          detected_keyword?: string | null
          id?: string
          intent_score?: number | null
          message_content?: string
          message_date?: string
          source_name?: string
          source_type?: string
          status?: string
          suggested_reply?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      market_trends: {
        Row: {
          created_at: string
          first_seen_at: string | null
          frequency: number | null
          id: string
          last_seen_at: string | null
          source_competitor_ids: string[] | null
          trend_type: string
          trend_value: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          first_seen_at?: string | null
          frequency?: number | null
          id?: string
          last_seen_at?: string | null
          source_competitor_ids?: string[] | null
          trend_type?: string
          trend_value: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          first_seen_at?: string | null
          frequency?: number | null
          id?: string
          last_seen_at?: string | null
          source_competitor_ids?: string[] | null
          trend_type?: string
          trend_value?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_trends_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_accounts: {
        Row: {
          billing_model: string
          commission_rate: number | null
          created_at: string
          discount_percent: number
          id: string
          monthly_revenue: number | null
          partner_name: string
          status: string
          total_businesses: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_model?: string
          commission_rate?: number | null
          created_at?: string
          discount_percent?: number
          id?: string
          monthly_revenue?: number | null
          partner_name: string
          status?: string
          total_businesses?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_model?: string
          commission_rate?: number | null
          created_at?: string
          discount_percent?: number
          id?: string
          monthly_revenue?: number | null
          partner_name?: string
          status?: string
          total_businesses?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_businesses: {
        Row: {
          added_at: string
          id: string
          partner_id: string
          workspace_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          partner_id: string
          workspace_id: string
        }
        Update: {
          added_at?: string
          id?: string
          partner_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_businesses_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_businesses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_suspended: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_suspended?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_suspended?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reply_drafts: {
        Row: {
          created_at: string
          id: string
          inbox_message_id: string | null
          internal_notes: string | null
          is_preferred: boolean
          lead_id: string | null
          reply_content: string
          tone: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inbox_message_id?: string | null
          internal_notes?: string | null
          is_preferred?: boolean
          lead_id?: string | null
          reply_content: string
          tone?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inbox_message_id?: string | null
          internal_notes?: string | null
          is_preferred?: boolean
          lead_id?: string | null
          reply_content?: string
          tone?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reply_drafts_inbox_message_id_fkey"
            columns: ["inbox_message_id"]
            isOneToOne: false
            referencedRelation: "inbox_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          tone: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          tone?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          tone?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reply_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          ai_replies_reset_at: string
          ai_replies_today: number
          billing_cycle_start: string
          channels_limit: number
          created_at: string
          grace_period_end: string | null
          id: string
          keywords_limit: number
          leads_limit: number
          leads_used: number
          plan: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_replies_reset_at?: string
          ai_replies_today?: number
          billing_cycle_start?: string
          channels_limit?: number
          created_at?: string
          grace_period_end?: string | null
          id?: string
          keywords_limit?: number
          leads_limit?: number
          leads_used?: number
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_replies_reset_at?: string
          ai_replies_today?: number
          billing_cycle_start?: string
          channels_limit?: number
          created_at?: string
          grace_period_end?: string | null
          id?: string
          keywords_limit?: number
          leads_limit?: number
          leads_used?: number
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          device_info: Json | null
          id: string
          ip_address: string | null
          is_active: boolean | null
          last_active_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_active_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_active_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      reset_daily_ai_replies: { Args: never; Returns: undefined }
      reset_monthly_usage: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "support_agent" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "support_agent", "staff"],
    },
  },
} as const
