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
      ai_conversation_memory: {
        Row: {
          contact_identifier: string
          contact_name: string | null
          created_at: string
          embedding_vector: string | null
          id: string
          interaction_count: number | null
          key_facts: Json | null
          last_interaction_at: string | null
          memory_type: string
          sentiment_trend: string | null
          summary: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          contact_identifier: string
          contact_name?: string | null
          created_at?: string
          embedding_vector?: string | null
          id?: string
          interaction_count?: number | null
          key_facts?: Json | null
          last_interaction_at?: string | null
          memory_type?: string
          sentiment_trend?: string | null
          summary?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          contact_identifier?: string
          contact_name?: string | null
          created_at?: string
          embedding_vector?: string | null
          id?: string
          interaction_count?: number | null
          key_facts?: Json | null
          last_interaction_at?: string | null
          memory_type?: string
          sentiment_trend?: string | null
          summary?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_memory_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
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
      analytics_cache: {
        Row: {
          cache_data: Json
          cache_key: string
          computed_at: string
          expires_at: string
          id: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          cache_data?: Json
          cache_key: string
          computed_at?: string
          expires_at?: string
          id?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          cache_data?: Json
          cache_key?: string
          computed_at?: string
          expires_at?: string
          id?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_cache_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      automation_logs: {
        Row: {
          actions_executed: Json | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          metadata: Json | null
          status: string
          trigger_event: string | null
          user_id: string
          workflow_id: string
        }
        Insert: {
          actions_executed?: Json | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          trigger_event?: string | null
          user_id: string
          workflow_id: string
        }
        Update: {
          actions_executed?: Json | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          trigger_event?: string | null
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          actions: Json
          conditions: Json | null
          created_at: string
          description: string | null
          execution_count: number | null
          id: string
          is_active: boolean | null
          last_executed_at: string | null
          name: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          actions?: Json
          conditions?: Json | null
          created_at?: string
          description?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          name: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          actions?: Json
          conditions?: Json | null
          created_at?: string
          description?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          name?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_history: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          description: string | null
          discount_amount: number | null
          id: string
          invoice_pdf: string | null
          invoice_url: string | null
          period_end: string | null
          period_start: string | null
          plan_name: string | null
          refund_amount: number | null
          status: string | null
          stripe_invoice_id: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          discount_amount?: number | null
          id?: string
          invoice_pdf?: string | null
          invoice_url?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_name?: string | null
          refund_amount?: number | null
          status?: string | null
          stripe_invoice_id?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          discount_amount?: number | null
          id?: string
          invoice_pdf?: string | null
          invoice_url?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_name?: string | null
          refund_amount?: number | null
          status?: string | null
          stripe_invoice_id?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_optouts: {
        Row: {
          channel_type: string
          contact_identifier: string
          created_at: string
          id: string
          opted_out_at: string
          reason: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          channel_type?: string
          contact_identifier: string
          created_at?: string
          id?: string
          opted_out_at?: string
          reason?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          channel_type?: string
          contact_identifier?: string
          created_at?: string
          id?: string
          opted_out_at?: string
          reason?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_optouts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          broadcast_id: string
          clicked_at: string | null
          contact_identifier: string
          contact_name: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          opened_at: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          clicked_at?: string | null
          contact_identifier: string
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          clicked_at?: string | null
          contact_identifier?: string
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          bounce_count: number | null
          campaign_id: string | null
          channel_type: string
          clicked_count: number | null
          completed_at: string | null
          compliance_notes: string | null
          created_at: string
          delivered_count: number | null
          failed_count: number | null
          id: string
          message_content: string
          name: string
          opened_count: number | null
          response_count: number | null
          scheduled_at: string | null
          segment_id: string | null
          sent_count: number | null
          spam_score: number | null
          started_at: string | null
          status: string
          subject: string | null
          template_data: Json | null
          throttle_per_minute: number | null
          total_recipients: number | null
          unsubscribe_count: number | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bounce_count?: number | null
          campaign_id?: string | null
          channel_type?: string
          clicked_count?: number | null
          completed_at?: string | null
          compliance_notes?: string | null
          created_at?: string
          delivered_count?: number | null
          failed_count?: number | null
          id?: string
          message_content: string
          name: string
          opened_count?: number | null
          response_count?: number | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_count?: number | null
          spam_score?: number | null
          started_at?: string | null
          status?: string
          subject?: string | null
          template_data?: Json | null
          throttle_per_minute?: number | null
          total_recipients?: number | null
          unsubscribe_count?: number | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bounce_count?: number | null
          campaign_id?: string | null
          channel_type?: string
          clicked_count?: number | null
          completed_at?: string | null
          compliance_notes?: string | null
          created_at?: string
          delivered_count?: number | null
          failed_count?: number | null
          id?: string
          message_content?: string
          name?: string
          opened_count?: number | null
          response_count?: number | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_count?: number | null
          spam_score?: number | null
          started_at?: string | null
          status?: string
          subject?: string | null
          template_data?: Json | null
          throttle_per_minute?: number | null
          total_recipients?: number | null
          unsubscribe_count?: number | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "contact_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      business_notifications: {
        Row: {
          action_url: string | null
          category: string
          created_at: string
          id: string
          is_dismissed: boolean
          is_read: boolean
          message: string
          metadata: Json | null
          notification_type: string
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action_url?: string | null
          category?: string
          created_at?: string
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          message: string
          metadata?: Json | null
          notification_type?: string
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action_url?: string | null
          category?: string
          created_at?: string
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          message?: string
          metadata?: Json | null
          notification_type?: string
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      business_referral_codes: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          referral_code: string
          referred_count: number | null
          reward_type: string | null
          reward_value: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          referral_code: string
          referred_count?: number | null
          reward_type?: string | null
          reward_value?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          referral_code?: string
          referred_count?: number | null
          reward_type?: string | null
          reward_value?: number | null
          user_id?: string
        }
        Relationships: []
      }
      business_referrals: {
        Row: {
          converted_at: string | null
          created_at: string | null
          id: string
          referral_code: string
          referred_email: string | null
          referred_user_id: string | null
          referrer_user_id: string
          reward_amount: number | null
          reward_status: string | null
          status: string | null
          subscription_plan: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string | null
          id?: string
          referral_code: string
          referred_email?: string | null
          referred_user_id?: string | null
          referrer_user_id: string
          reward_amount?: number | null
          reward_status?: string | null
          status?: string | null
          subscription_plan?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string | null
          id?: string
          referral_code?: string
          referred_email?: string | null
          referred_user_id?: string | null
          referrer_user_id?: string
          reward_amount?: number | null
          reward_status?: string | null
          status?: string | null
          subscription_plan?: string | null
        }
        Relationships: []
      }
      business_registrations: {
        Row: {
          business_data: Json | null
          business_name: string
          created_at: string | null
          created_by_user_id: string
          discount_applied: number | null
          discount_reason: string | null
          id: string
          industry: string | null
          package_type: string | null
          referral_code_used: string | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          business_data?: Json | null
          business_name: string
          created_at?: string | null
          created_by_user_id: string
          discount_applied?: number | null
          discount_reason?: string | null
          id?: string
          industry?: string | null
          package_type?: string | null
          referral_code_used?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          business_data?: Json | null
          business_name?: string
          created_at?: string | null
          created_by_user_id?: string
          discount_applied?: number | null
          discount_reason?: string | null
          id?: string
          industry?: string | null
          package_type?: string | null
          referral_code_used?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_registrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      call_records: {
        Row: {
          ai_call_summary: string | null
          ai_transcription: string | null
          call_direction: string
          call_duration: number | null
          call_outcome: string | null
          call_status: string
          channel_provider: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          deal_id: string | null
          follow_up_recommendation: string | null
          id: string
          notes: string | null
          recording_url: string | null
          tags: string[] | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_call_summary?: string | null
          ai_transcription?: string | null
          call_direction?: string
          call_duration?: number | null
          call_outcome?: string | null
          call_status?: string
          channel_provider?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deal_id?: string | null
          follow_up_recommendation?: string | null
          id?: string
          notes?: string | null
          recording_url?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_call_summary?: string | null
          ai_transcription?: string | null
          call_direction?: string
          call_duration?: number | null
          call_outcome?: string | null
          call_status?: string
          channel_provider?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deal_id?: string | null
          follow_up_recommendation?: string | null
          id?: string
          notes?: string | null
          recording_url?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_records_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_records_workspace_id_fkey"
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
          credential_fields: Json | null
          description: string | null
          help_url: string | null
          icon: string | null
          id: string
          integration_status: string
          is_available: boolean
          min_plan: string
          name: string
          setup_instructions: string | null
        }
        Insert: {
          category: string
          config_schema?: Json | null
          credential_fields?: Json | null
          description?: string | null
          help_url?: string | null
          icon?: string | null
          id: string
          integration_status?: string
          is_available?: boolean
          min_plan?: string
          name: string
          setup_instructions?: string | null
        }
        Update: {
          category?: string
          config_schema?: Json | null
          credential_fields?: Json | null
          description?: string | null
          help_url?: string | null
          icon?: string | null
          id?: string
          integration_status?: string
          is_available?: boolean
          min_plan?: string
          name?: string
          setup_instructions?: string | null
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
      chatbot_flows: {
        Row: {
          completion_message: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          questions: Json
          scoring_rules: Json | null
          target_pipeline_stage_id: string | null
          updated_at: string
          user_id: string
          welcome_message: string | null
          workspace_id: string | null
        }
        Insert: {
          completion_message?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          questions?: Json
          scoring_rules?: Json | null
          target_pipeline_stage_id?: string | null
          updated_at?: string
          user_id: string
          welcome_message?: string | null
          workspace_id?: string | null
        }
        Update: {
          completion_message?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          questions?: Json
          scoring_rules?: Json | null
          target_pipeline_stage_id?: string | null
          updated_at?: string
          user_id?: string
          welcome_message?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_flows_target_pipeline_stage_id_fkey"
            columns: ["target_pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_sessions: {
        Row: {
          ai_summary: string | null
          channel_type: string | null
          completed_at: string | null
          created_at: string
          deal_id: string | null
          flow_id: string
          id: string
          lead_id: string | null
          quality_score: number | null
          responses: Json
          status: string
          updated_at: string
          user_id: string
          visitor_email: string | null
          visitor_name: string | null
          visitor_phone: string | null
          workspace_id: string | null
        }
        Insert: {
          ai_summary?: string | null
          channel_type?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id?: string | null
          flow_id: string
          id?: string
          lead_id?: string | null
          quality_score?: number | null
          responses?: Json
          status?: string
          updated_at?: string
          user_id: string
          visitor_email?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
          workspace_id?: string | null
        }
        Update: {
          ai_summary?: string | null
          channel_type?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id?: string | null
          flow_id?: string
          id?: string
          lead_id?: string | null
          quality_score?: number | null
          responses?: Json
          status?: string
          updated_at?: string
          user_id?: string
          visitor_email?: string | null
          visitor_name?: string | null
          visitor_phone?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_sessions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      churn_risk_scores: {
        Row: {
          computed_at: string
          created_at: string
          days_inactive: number | null
          id: string
          inbox_trend: number | null
          last_active_at: string | null
          leads_trend: number | null
          login_count_30d: number | null
          risk_level: string
          risk_score: number | null
          signals: Json | null
          updated_at: string
          usage_trend: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          computed_at?: string
          created_at?: string
          days_inactive?: number | null
          id?: string
          inbox_trend?: number | null
          last_active_at?: string | null
          leads_trend?: number | null
          login_count_30d?: number | null
          risk_level?: string
          risk_score?: number | null
          signals?: Json | null
          updated_at?: string
          usage_trend?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          computed_at?: string
          created_at?: string
          days_inactive?: number | null
          id?: string
          inbox_trend?: number | null
          last_active_at?: string | null
          leads_trend?: number | null
          login_count_30d?: number | null
          risk_level?: string
          risk_score?: number | null
          signals?: Json | null
          updated_at?: string
          usage_trend?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "churn_risk_scores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_alerts: {
        Row: {
          alert_type: string
          competitor_id: string
          created_at: string
          description: string | null
          id: string
          is_read: boolean
          metadata: Json | null
          severity: string
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          alert_type?: string
          competitor_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          severity?: string
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          alert_type?: string
          competitor_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          severity?: string
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_alerts_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_alerts_workspace_id_fkey"
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
          posting_frequency: Json | null
          previous_scan_data: Json | null
          pricing_snapshot: Json | null
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
          posting_frequency?: Json | null
          previous_scan_data?: Json | null
          pricing_snapshot?: Json | null
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
          posting_frequency?: Json | null
          previous_scan_data?: Json | null
          pricing_snapshot?: Json | null
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
      config_versions: {
        Row: {
          change_summary: string | null
          change_type: string
          created_at: string
          current_snapshot: Json
          entity_id: string
          entity_type: string
          id: string
          previous_snapshot: Json
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          change_summary?: string | null
          change_type?: string
          created_at?: string
          current_snapshot?: Json
          entity_id: string
          entity_type: string
          id?: string
          previous_snapshot?: Json
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          change_summary?: string | null
          change_type?: string
          created_at?: string
          current_snapshot?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          previous_snapshot?: Json
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_segments: {
        Row: {
          contact_count: number | null
          created_at: string
          description: string | null
          filter_criteria: Json
          id: string
          name: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          contact_count?: number | null
          created_at?: string
          description?: string | null
          filter_criteria?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          contact_count?: number | null
          created_at?: string
          description?: string | null
          filter_criteria?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_segments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_identifier: string
          contact_name: string | null
          created_at: string
          id: string
          tag_type: string
          tag_value: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          contact_identifier: string
          contact_name?: string | null
          created_at?: string
          id?: string
          tag_type?: string
          tag_value: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          contact_identifier?: string
          contact_name?: string | null
          created_at?: string
          id?: string
          tag_type?: string
          tag_value?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_workspace_id_fkey"
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
      conversation_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          is_ai_generated: boolean | null
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_ai_generated?: boolean | null
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_ai_generated?: boolean | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_threads: {
        Row: {
          ai_summary: string | null
          assigned_to: string | null
          channel_type: string
          contact_identifier: string | null
          contact_name: string | null
          created_at: string
          first_response_at: string | null
          id: string
          is_auto_reply_enabled: boolean | null
          last_message_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string
          resolved_at: string | null
          sla_response_due: string | null
          status: string
          subject: string | null
          tags: string[] | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_summary?: string | null
          assigned_to?: string | null
          channel_type?: string
          contact_identifier?: string | null
          contact_name?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          is_auto_reply_enabled?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string
          resolved_at?: string | null
          sla_response_due?: string | null
          status?: string
          subject?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_summary?: string | null
          assigned_to?: string | null
          channel_type?: string
          contact_identifier?: string | null
          contact_name?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          is_auto_reply_enabled?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string
          resolved_at?: string | null
          sla_response_due?: string | null
          status?: string
          subject?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_threads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_letter_queue: {
        Row: {
          created_at: string
          error_message: string | null
          error_stack: string | null
          escalated: boolean | null
          escalated_at: string | null
          failed_at: string
          id: string
          job_type: string
          last_retry_at: string | null
          max_retries: number
          next_retry_at: string | null
          original_queue: string | null
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          error_stack?: string | null
          escalated?: boolean | null
          escalated_at?: string | null
          failed_at?: string
          id?: string
          job_type: string
          last_retry_at?: string | null
          max_retries?: number
          next_retry_at?: string | null
          original_queue?: string | null
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          error_stack?: string | null
          escalated?: boolean | null
          escalated_at?: string | null
          failed_at?: string
          id?: string
          job_type?: string
          last_retry_at?: string | null
          max_retries?: number
          next_retry_at?: string | null
          original_queue?: string | null
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          activity_type: string
          created_at: string
          deal_id: string
          description: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          activity_type?: string
          created_at?: string
          deal_id: string
          description: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          deal_id?: string
          description?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_notes: {
        Row: {
          content: string
          created_at: string
          deal_id: string
          id: string
          is_ai_generated: boolean | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deal_id: string
          id?: string
          is_ai_generated?: boolean | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deal_id?: string
          id?: string
          is_ai_generated?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          deal_id: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean | null
          priority: string | null
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deal_id: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          priority?: string | null
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deal_id?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          priority?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          assigned_to: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          currency: string | null
          deal_value: number | null
          expected_close_date: string | null
          id: string
          lead_id: string | null
          lost_at: string | null
          lost_reason: string | null
          priority: string | null
          source_channel: string | null
          stage_id: string | null
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
          won_at: string | null
          workspace_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string | null
          deal_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          priority?: string | null
          source_channel?: string | null
          stage_id?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
          won_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string | null
          deal_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          priority?: string | null
          source_channel?: string | null
          stage_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
          won_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string | null
          details: Json | null
          id: string
          registration_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          registration_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          registration_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_audit_log_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "business_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      discovered_items: {
        Row: {
          author_name: string | null
          content_text: string | null
          content_url: string | null
          created_at: string
          discovered_at: string
          engagement: Json | null
          external_id: string | null
          id: string
          platform: string
          scan_id: string
          source_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          author_name?: string | null
          content_text?: string | null
          content_url?: string | null
          created_at?: string
          discovered_at?: string
          engagement?: Json | null
          external_id?: string | null
          id?: string
          platform?: string
          scan_id: string
          source_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          author_name?: string | null
          content_text?: string | null
          content_url?: string | null
          created_at?: string
          discovered_at?: string
          engagement?: Json | null
          external_id?: string | null
          id?: string
          platform?: string
          scan_id?: string
          source_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovered_items_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "source_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovered_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scan_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovered_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      enriched_contacts: {
        Row: {
          ai_profile_summary: string | null
          avg_intent_score: number | null
          broadcast_interactions: number | null
          campaign_interactions: number | null
          channel_types: string[] | null
          contact_identifier: string
          contact_name: string | null
          created_at: string
          enriched_at: string
          first_seen_at: string | null
          id: string
          is_opted_out: boolean | null
          last_channel: string | null
          last_seen_at: string | null
          sentiment_summary: string | null
          tags: string[] | null
          total_deal_value: number | null
          total_deals: number | null
          total_leads: number | null
          total_messages: number | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_profile_summary?: string | null
          avg_intent_score?: number | null
          broadcast_interactions?: number | null
          campaign_interactions?: number | null
          channel_types?: string[] | null
          contact_identifier: string
          contact_name?: string | null
          created_at?: string
          enriched_at?: string
          first_seen_at?: string | null
          id?: string
          is_opted_out?: boolean | null
          last_channel?: string | null
          last_seen_at?: string | null
          sentiment_summary?: string | null
          tags?: string[] | null
          total_deal_value?: number | null
          total_deals?: number | null
          total_leads?: number | null
          total_messages?: number | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_profile_summary?: string | null
          avg_intent_score?: number | null
          broadcast_interactions?: number | null
          campaign_interactions?: number | null
          channel_types?: string[] | null
          contact_identifier?: string
          contact_name?: string | null
          created_at?: string
          enriched_at?: string
          first_seen_at?: string | null
          id?: string
          is_opted_out?: boolean | null
          last_channel?: string | null
          last_seen_at?: string | null
          sentiment_summary?: string | null
          tags?: string[] | null
          total_deal_value?: number | null
          total_deals?: number | null
          total_leads?: number | null
          total_messages?: number | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enriched_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      external_integrations: {
        Row: {
          category: string
          config: Json | null
          created_at: string
          credentials: Json | null
          description: string | null
          id: string
          integration_key: string
          integration_name: string
          is_enabled: boolean
          keyword_match_threshold: number
          last_scan_at: string | null
          last_used_at: string | null
          min_scan_interval_minutes: number
          rate_limit_per_hour: number
          status: string
          updated_at: string
          usage_count: number
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          category?: string
          config?: Json | null
          created_at?: string
          credentials?: Json | null
          description?: string | null
          id?: string
          integration_key: string
          integration_name: string
          is_enabled?: boolean
          keyword_match_threshold?: number
          last_scan_at?: string | null
          last_used_at?: string | null
          min_scan_interval_minutes?: number
          rate_limit_per_hour?: number
          status?: string
          updated_at?: string
          usage_count?: number
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          category?: string
          config?: Json | null
          created_at?: string
          credentials?: Json | null
          description?: string | null
          id?: string
          integration_key?: string
          integration_name?: string
          is_enabled?: boolean
          keyword_match_threshold?: number
          last_scan_at?: string | null
          last_used_at?: string | null
          min_scan_interval_minutes?: number
          rate_limit_per_hour?: number
          status?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      health_scores: {
        Row: {
          automation_usage_score: number | null
          breakdown: Json | null
          campaign_engagement_score: number | null
          channel_activity_score: number | null
          computed_at: string
          id: string
          lead_volume_score: number | null
          overall_score: number
          response_speed_score: number | null
          suggestions: Json | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          automation_usage_score?: number | null
          breakdown?: Json | null
          campaign_engagement_score?: number | null
          channel_activity_score?: number | null
          computed_at?: string
          id?: string
          lead_volume_score?: number | null
          overall_score?: number
          response_speed_score?: number | null
          suggestions?: Json | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          automation_usage_score?: number | null
          breakdown?: Json | null
          campaign_engagement_score?: number | null
          channel_activity_score?: number | null
          computed_at?: string
          id?: string
          lead_volume_score?: number | null
          overall_score?: number
          response_speed_score?: number | null
          suggestions?: Json | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_scores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_messages: {
        Row: {
          ai_summary: string | null
          assigned_to: string | null
          channel_id: string | null
          channel_type: string
          created_at: string
          first_response_at: string | null
          id: string
          intent_score: number | null
          intent_type: string
          internal_notes_count: number | null
          is_unread: boolean
          lead_id: string | null
          matched_keywords: string[] | null
          message_content: string
          message_timestamp: string
          metadata: Json | null
          priority: string
          recommended_action: string
          sender_identifier: string | null
          sender_name: string | null
          sla_response_due: string | null
          source_name: string
          status: string
          thread_id: string | null
          updated_at: string
          urgency_level: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_summary?: string | null
          assigned_to?: string | null
          channel_id?: string | null
          channel_type?: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          intent_score?: number | null
          intent_type?: string
          internal_notes_count?: number | null
          is_unread?: boolean
          lead_id?: string | null
          matched_keywords?: string[] | null
          message_content: string
          message_timestamp?: string
          metadata?: Json | null
          priority?: string
          recommended_action?: string
          sender_identifier?: string | null
          sender_name?: string | null
          sla_response_due?: string | null
          source_name: string
          status?: string
          thread_id?: string | null
          updated_at?: string
          urgency_level?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_summary?: string | null
          assigned_to?: string | null
          channel_id?: string | null
          channel_type?: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          intent_score?: number | null
          intent_type?: string
          internal_notes_count?: number | null
          is_unread?: boolean
          lead_id?: string | null
          matched_keywords?: string[] | null
          message_content?: string
          message_timestamp?: string
          metadata?: Json | null
          priority?: string
          recommended_action?: string
          sender_identifier?: string | null
          sender_name?: string | null
          sla_response_due?: string | null
          source_name?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
          urgency_level?: string
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
            foreignKeyName: "inbox_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
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
      integration_event_logs: {
        Row: {
          created_at: string
          event_message: string
          event_type: string
          id: string
          integration_id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_message: string
          event_type?: string
          id?: string
          integration_id: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_message?: string
          event_type?: string
          id?: string
          integration_id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_event_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "external_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_payload: Json
          job_type: string
          max_attempts: number | null
          scheduled_for: string
          started_at: string | null
          status: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_payload?: Json
          job_type: string
          max_attempts?: number | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_payload?: Json
          job_type?: string
          max_attempts?: number | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_queue_workspace_id_fkey"
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
      lead_matches: {
        Row: {
          ai_summary: string | null
          created_at: string
          discovered_item_id: string
          id: string
          intent_score: number | null
          matched_keyword: string
          suggested_reply: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          discovered_item_id: string
          id?: string
          intent_score?: number | null
          matched_keyword: string
          suggested_reply?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          discovered_item_id?: string
          id?: string
          intent_score?: number | null
          matched_keyword?: string
          suggested_reply?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_matches_discovered_item_id_fkey"
            columns: ["discovered_item_id"]
            isOneToOne: false
            referencedRelation: "discovered_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_matches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scores: {
        Row: {
          churn_factors: Json | null
          churn_risk: number | null
          created_at: string
          id: string
          last_scored_at: string
          lead_id: string | null
          predicted_value: number | null
          score: number
          score_factors: Json | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          churn_factors?: Json | null
          churn_risk?: number | null
          created_at?: string
          id?: string
          last_scored_at?: string
          lead_id?: string | null
          predicted_value?: number | null
          score?: number
          score_factors?: Json | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          churn_factors?: Json | null
          churn_risk?: number | null
          created_at?: string
          id?: string
          last_scored_at?: string
          lead_id?: string | null
          predicted_value?: number | null
          score?: number
          score_factors?: Json | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_scores_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_scores_workspace_id_fkey"
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
          intent_type: string
          message_content: string
          message_date: string
          recommended_action: string
          source_name: string
          source_type: string
          status: string
          suggested_reply: string | null
          urgency_level: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          detected_keyword?: string | null
          id?: string
          intent_score?: number | null
          intent_type?: string
          message_content: string
          message_date?: string
          recommended_action?: string
          source_name: string
          source_type?: string
          status?: string
          suggested_reply?: string | null
          urgency_level?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          detected_keyword?: string | null
          id?: string
          intent_score?: number | null
          intent_type?: string
          message_content?: string
          message_date?: string
          recommended_action?: string
          source_name?: string
          source_type?: string
          status?: string
          suggested_reply?: string | null
          urgency_level?: string
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
      media_addons: {
        Row: {
          addon_type: string
          expires_at: string | null
          id: string
          price_paid: number | null
          purchased_at: string | null
          quantity: number
          remaining: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          addon_type: string
          expires_at?: string | null
          id?: string
          price_paid?: number | null
          purchased_at?: string | null
          quantity?: number
          remaining?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          addon_type?: string
          expires_at?: string | null
          id?: string
          price_paid?: number | null
          purchased_at?: string | null
          quantity?: number
          remaining?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_addons_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_generations: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string
          media_type: string
          prompt: string | null
          result_url: string | null
          status: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          media_type?: string
          prompt?: string | null
          result_url?: string | null
          status?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          media_type?: string
          prompt?: string | null
          result_url?: string | null
          status?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_generations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completion_score: number
          created_at: string
          id: string
          is_dismissed: boolean
          last_seen_step: string | null
          steps_completed: Json
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          completion_score?: number
          created_at?: string
          id?: string
          is_dismissed?: boolean
          last_seen_step?: string | null
          steps_completed?: Json
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          completion_score?: number
          created_at?: string
          id?: string
          is_dismissed?: boolean
          last_seen_step?: string | null
          steps_completed?: Json
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_workspace_id_fkey"
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
          discount_duration_months: number
          discount_percent: number
          id: string
          monthly_revenue: number | null
          partner_name: string
          payout_details: Json | null
          referral_code: string | null
          referral_discount_percent: number
          refund_window_days: number | null
          status: string
          stripe_connect_id: string | null
          total_businesses: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_model?: string
          commission_rate?: number | null
          created_at?: string
          discount_duration_months?: number
          discount_percent?: number
          id?: string
          monthly_revenue?: number | null
          partner_name: string
          payout_details?: Json | null
          referral_code?: string | null
          referral_discount_percent?: number
          refund_window_days?: number | null
          status?: string
          stripe_connect_id?: string | null
          total_businesses?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_model?: string
          commission_rate?: number | null
          created_at?: string
          discount_duration_months?: number
          discount_percent?: number
          id?: string
          monthly_revenue?: number | null
          partner_name?: string
          payout_details?: Json | null
          referral_code?: string | null
          referral_discount_percent?: number
          refund_window_days?: number | null
          status?: string
          stripe_connect_id?: string | null
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
      partner_clients: {
        Row: {
          created_at: string | null
          id: string
          partner_id: string
          relationship_status: string
          total_revenue_generated: number | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          partner_id: string
          relationship_status?: string
          total_revenue_generated?: number | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          partner_id?: string
          relationship_status?: string
          total_revenue_generated?: number | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_clients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_commissions: {
        Row: {
          billing_period_end: string | null
          billing_period_start: string | null
          commission_amount: number
          commission_percent: number
          commission_status: string
          created_at: string
          gross_amount: number
          id: string
          partner_id: string
          plan_name: string
          subscription_id: string | null
          workspace_id: string
        }
        Insert: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          commission_amount?: number
          commission_percent?: number
          commission_status?: string
          created_at?: string
          gross_amount?: number
          id?: string
          partner_id: string
          plan_name?: string
          subscription_id?: string | null
          workspace_id: string
        }
        Update: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          commission_amount?: number
          commission_percent?: number
          commission_status?: string
          created_at?: string
          gross_amount?: number
          id?: string
          partner_id?: string
          plan_name?: string
          subscription_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_risk_flags: {
        Row: {
          created_at: string | null
          description: string | null
          flag_type: string
          id: string
          is_resolved: boolean | null
          metadata: Json | null
          partner_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          flag_type?: string
          id?: string
          is_resolved?: boolean | null
          metadata?: Json | null
          partner_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          flag_type?: string
          id?: string
          is_resolved?: boolean | null
          metadata?: Json | null
          partner_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_risk_flags_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          partner_id: string
          reference_id: string | null
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          partner_id: string
          reference_id?: string | null
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          partner_id?: string
          reference_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_wallet_transactions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_wallets: {
        Row: {
          current_balance: number
          id: string
          lifetime_earnings: number
          partner_id: string
          pending_amount: number
          updated_at: string
        }
        Insert: {
          current_balance?: number
          id?: string
          lifetime_earnings?: number
          partner_id: string
          pending_amount?: number
          updated_at?: string
        }
        Update: {
          current_balance?: number
          id?: string
          lifetime_earnings?: number
          partner_id?: string
          pending_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_wallets_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_account_verifications: {
        Row: {
          account_index: number
          created_at: string | null
          flag_reason: string | null
          flagged: boolean | null
          id: string
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
          workspace_id: string
        }
        Insert: {
          account_index?: number
          created_at?: string | null
          flag_reason?: string | null
          flagged?: boolean | null
          id?: string
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          workspace_id: string
        }
        Update: {
          account_index?: number
          created_at?: string | null
          flag_reason?: string | null
          flagged?: boolean | null
          id?: string
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_account_verifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          severity: string | null
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type?: string
          severity?: string | null
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          severity?: string | null
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          partner_id: string
          payout_details: Json | null
          payout_method: string
          payout_status: string
          processed_at: string | null
          requested_amount: number
          stripe_transfer_id: string | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          partner_id: string
          payout_details?: Json | null
          payout_method?: string
          payout_status?: string
          processed_at?: string | null
          requested_amount: number
          stripe_transfer_id?: string | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          partner_id?: string
          payout_details?: Json | null
          payout_method?: string
          payout_status?: string
          processed_at?: string | null
          requested_amount?: number
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_default: boolean | null
          name: string
          sort_order: number
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          name: string
          sort_order?: number
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          name?: string
          sort_order?: number
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_roadmap: {
        Row: {
          created_at: string | null
          description: string | null
          feature_key: string
          id: string
          priority: string | null
          status: string | null
          target_phase: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          feature_key: string
          id?: string
          priority?: string | null
          status?: string | null
          target_phase?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          feature_key?: string
          id?: string
          priority?: string | null
          status?: string | null
          target_phase?: string | null
          title?: string
        }
        Relationships: []
      }
      pricing_settings: {
        Row: {
          annual_price: number
          donation_label: string | null
          id: string
          is_donation: boolean
          monthly_price: number
          plan_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          annual_price?: number
          donation_label?: string | null
          id?: string
          is_donation?: boolean
          monthly_price?: number
          plan_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          annual_price?: number
          donation_label?: string | null
          id?: string
          is_donation?: boolean
          monthly_price?: number
          plan_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      reengagement_tasks: {
        Row: {
          channel: string
          completed_at: string | null
          created_at: string
          id: string
          metadata: Json | null
          scheduled_at: string | null
          status: string
          suggested_message: string | null
          task_type: string
          updated_at: string
          user_id: string
          visitor_id: string
          workspace_id: string | null
        }
        Insert: {
          channel?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          scheduled_at?: string | null
          status?: string
          suggested_message?: string | null
          task_type?: string
          updated_at?: string
          user_id: string
          visitor_id: string
          workspace_id?: string | null
        }
        Update: {
          channel?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          scheduled_at?: string | null
          status?: string
          suggested_message?: string | null
          task_type?: string
          updated_at?: string
          user_id?: string
          visitor_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reengagement_tasks_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reengagement_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      scan_insights: {
        Row: {
          confidence_score: number
          created_at: string
          description: string | null
          id: string
          insight_type: string
          is_important: boolean
          raw_value_json: Json
          scan_id: string
          source_id: string
          title: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          id?: string
          insight_type?: string
          is_important?: boolean
          raw_value_json?: Json
          scan_id: string
          source_id: string
          title: string
          user_id: string
          workspace_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          id?: string
          insight_type?: string
          is_important?: boolean
          raw_value_json?: Json
          scan_id?: string
          source_id?: string
          title?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_insights_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "source_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_insights_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scan_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_insights_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          last_scan_at: string | null
          platform: string
          scan_status: string
          source_type: string
          updated_at: string
          url_or_identifier: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_scan_at?: string | null
          platform?: string
          scan_status?: string
          source_type?: string
          updated_at?: string
          url_or_identifier: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_scan_at?: string | null
          platform?: string
          scan_status?: string
          source_type?: string
          updated_at?: string
          url_or_identifier?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      source_scans: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          insights_found: number
          items_found: number
          pages_scanned: number
          scan_phase: string
          source_id: string
          started_at: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          insights_found?: number
          items_found?: number
          pages_scanned?: number
          scan_phase?: string
          source_id: string
          started_at?: string
          status?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          insights_found?: number
          items_found?: number
          pages_scanned?: number
          scan_phase?: string
          source_id?: string
          started_at?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_scans_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scan_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_scans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_refunds: {
        Row: {
          created_at: string | null
          id: string
          payment_intent_id: string | null
          refund_amount: number | null
          refund_reason: string | null
          refund_status: string
          refund_window_expires_at: string | null
          subscription_id: string | null
          updated_at: string | null
          usage_snapshot_json: Json | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          payment_intent_id?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refund_status?: string
          refund_window_expires_at?: string | null
          subscription_id?: string | null
          updated_at?: string | null
          usage_snapshot_json?: Json | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          payment_intent_id?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refund_status?: string
          refund_window_expires_at?: string | null
          subscription_id?: string | null
          updated_at?: string | null
          usage_snapshot_json?: Json | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_refunds_workspace_id_fkey"
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
          images_generated_this_month: number | null
          keywords_limit: number
          leads_limit: number
          leads_used: number
          media_reset_at: string | null
          package_discount_percent: number | null
          package_duration_months: number | null
          package_end_at: string | null
          package_start_at: string | null
          package_type: string | null
          plan: string
          qualifying_package_type: string | null
          referral_discount_expires_at: string | null
          referral_discount_months_remaining: number | null
          referral_discount_percent: number | null
          referral_eligible: boolean | null
          referral_eligible_at: string | null
          referred_by_partner_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          total_discount_savings: number | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
          videos_generated_this_month: number | null
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
          images_generated_this_month?: number | null
          keywords_limit?: number
          leads_limit?: number
          leads_used?: number
          media_reset_at?: string | null
          package_discount_percent?: number | null
          package_duration_months?: number | null
          package_end_at?: string | null
          package_start_at?: string | null
          package_type?: string | null
          plan?: string
          qualifying_package_type?: string | null
          referral_discount_expires_at?: string | null
          referral_discount_months_remaining?: number | null
          referral_discount_percent?: number | null
          referral_eligible?: boolean | null
          referral_eligible_at?: string | null
          referred_by_partner_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          total_discount_savings?: number | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
          videos_generated_this_month?: number | null
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
          images_generated_this_month?: number | null
          keywords_limit?: number
          leads_limit?: number
          leads_used?: number
          media_reset_at?: string | null
          package_discount_percent?: number | null
          package_duration_months?: number | null
          package_end_at?: string | null
          package_start_at?: string | null
          package_type?: string | null
          plan?: string
          qualifying_package_type?: string | null
          referral_discount_expires_at?: string | null
          referral_discount_months_remaining?: number | null
          referral_discount_percent?: number | null
          referral_eligible?: boolean | null
          referral_eligible_at?: string | null
          referred_by_partner_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          total_discount_savings?: number | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
          videos_generated_this_month?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
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
      visitor_events: {
        Row: {
          created_at: string
          event_description: string | null
          event_title: string | null
          event_type: string
          id: string
          metadata: Json | null
          user_id: string
          visitor_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          event_description?: string | null
          event_title?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id: string
          visitor_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          event_description?: string | null
          event_title?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
          visitor_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_events_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_profiles: {
        Row: {
          classification: string
          created_at: string
          deal_id: string | null
          first_seen_at: string | null
          id: string
          intent_score: number | null
          is_active: boolean | null
          last_visit_at: string | null
          lead_id: string | null
          metadata: Json | null
          tags: string[] | null
          total_conversations: number | null
          total_pages_viewed: number | null
          total_time_seconds: number | null
          total_visits: number | null
          updated_at: string
          user_id: string
          visitor_email: string | null
          visitor_identifier: string
          visitor_name: string | null
          visitor_phone: string | null
          workspace_id: string | null
        }
        Insert: {
          classification?: string
          created_at?: string
          deal_id?: string | null
          first_seen_at?: string | null
          id?: string
          intent_score?: number | null
          is_active?: boolean | null
          last_visit_at?: string | null
          lead_id?: string | null
          metadata?: Json | null
          tags?: string[] | null
          total_conversations?: number | null
          total_pages_viewed?: number | null
          total_time_seconds?: number | null
          total_visits?: number | null
          updated_at?: string
          user_id: string
          visitor_email?: string | null
          visitor_identifier: string
          visitor_name?: string | null
          visitor_phone?: string | null
          workspace_id?: string | null
        }
        Update: {
          classification?: string
          created_at?: string
          deal_id?: string | null
          first_seen_at?: string | null
          id?: string
          intent_score?: number | null
          is_active?: boolean | null
          last_visit_at?: string | null
          lead_id?: string | null
          metadata?: Json | null
          tags?: string[] | null
          total_conversations?: number | null
          total_pages_viewed?: number | null
          total_time_seconds?: number | null
          total_visits?: number | null
          updated_at?: string
          user_id?: string
          visitor_email?: string | null
          visitor_identifier?: string
          visitor_name?: string | null
          visitor_phone?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_profiles_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_profiles_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          billing_mode: string
          created_at: string
          id: string
          name: string
          owner_id: string
          payment_accounts: Json | null
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null
          referred_by_partner_id: string | null
          slug: string | null
          updated_at: string
          workspace_owner_partner_id: string | null
        }
        Insert: {
          billing_mode?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          payment_accounts?: Json | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          referred_by_partner_id?: string | null
          slug?: string | null
          updated_at?: string
          workspace_owner_partner_id?: string | null
        }
        Update: {
          billing_mode?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          payment_accounts?: Json | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          referred_by_partner_id?: string | null
          slug?: string | null
          updated_at?: string
          workspace_owner_partner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_workspace_owner_partner_id_fkey"
            columns: ["workspace_owner_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
        ]
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
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "support_agent"
        | "staff"
        | "controller"
        | "worker"
        | "super_admin"
        | "business_owner"
        | "partner"
      payment_mode: "declared_payment" | "undeclared_payment"
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
      app_role: [
        "admin",
        "moderator",
        "user",
        "support_agent",
        "staff",
        "controller",
        "worker",
        "super_admin",
        "business_owner",
        "partner",
      ],
      payment_mode: ["declared_payment", "undeclared_payment"],
    },
  },
} as const
