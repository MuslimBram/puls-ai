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
        }
        Relationships: []
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
        }
        Relationships: []
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
        ]
      }
      keywords: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          keyword: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string
          user_id?: string
        }
        Relationships: []
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
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
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
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          tone?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          tone?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle_start: string
          channels_limit: number
          created_at: string
          id: string
          keywords_limit: number
          leads_limit: number
          leads_used: number
          plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle_start?: string
          channels_limit?: number
          created_at?: string
          id?: string
          keywords_limit?: number
          leads_limit?: number
          leads_used?: number
          plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle_start?: string
          channels_limit?: number
          created_at?: string
          id?: string
          keywords_limit?: number
          leads_limit?: number
          leads_used?: number
          plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
