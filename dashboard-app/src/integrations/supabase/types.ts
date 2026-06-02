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
      ai_followup_events: {
        Row: {
          agente: string | null
          ai_confidence: number | null
          ai_model_used: string | null
          ai_tokens_used: number | null
          cadence_name: string
          cadence_step: number
          cadence_total_steps: number | null
          card_id: string | null
          categoria: string | null
          channel: string
          client_id: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          delivered_at: string | null
          department: string | null
          engagement_score: number | null
          id: string
          lead_advanced: boolean | null
          lead_closed_contract: boolean | null
          message_id: string | null
          message_preview: string | null
          next_action_date: string | null
          next_action_type: string | null
          notes: string | null
          raw_payload: Json | null
          read_at: string | null
          responded_at: string | null
          response_time_seconds: number | null
          result: string | null
          sent_at: string
          status: string
          template_content: string | null
          template_error: string | null
          template_name: string | null
          template_status: string | null
          tipo_followup: string | null
          user_number: string | null
        }
        Insert: {
          agente?: string | null
          ai_confidence?: number | null
          ai_model_used?: string | null
          ai_tokens_used?: number | null
          cadence_name?: string
          cadence_step?: number
          cadence_total_steps?: number | null
          card_id?: string | null
          categoria?: string | null
          channel?: string
          client_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivered_at?: string | null
          department?: string | null
          engagement_score?: number | null
          id?: string
          lead_advanced?: boolean | null
          lead_closed_contract?: boolean | null
          message_id?: string | null
          message_preview?: string | null
          next_action_date?: string | null
          next_action_type?: string | null
          notes?: string | null
          raw_payload?: Json | null
          read_at?: string | null
          responded_at?: string | null
          response_time_seconds?: number | null
          result?: string | null
          sent_at?: string
          status?: string
          template_content?: string | null
          template_error?: string | null
          template_name?: string | null
          template_status?: string | null
          tipo_followup?: string | null
          user_number?: string | null
        }
        Update: {
          agente?: string | null
          ai_confidence?: number | null
          ai_model_used?: string | null
          ai_tokens_used?: number | null
          cadence_name?: string
          cadence_step?: number
          cadence_total_steps?: number | null
          card_id?: string | null
          categoria?: string | null
          channel?: string
          client_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivered_at?: string | null
          department?: string | null
          engagement_score?: number | null
          id?: string
          lead_advanced?: boolean | null
          lead_closed_contract?: boolean | null
          message_id?: string | null
          message_preview?: string | null
          next_action_date?: string | null
          next_action_type?: string | null
          notes?: string | null
          raw_payload?: Json | null
          read_at?: string | null
          responded_at?: string | null
          response_time_seconds?: number | null
          result?: string | null
          sent_at?: string
          status?: string
          template_content?: string | null
          template_error?: string | null
          template_name?: string | null
          template_status?: string | null
          tipo_followup?: string | null
          user_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_followup_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          api_key_hash: string
          client_id: string | null
          created_at: string
          id: string
          last_request_at: string
          locked_until: string | null
          request_count: number
          window_start: string
        }
        Insert: {
          api_key_hash: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_request_at?: string
          locked_until?: string | null
          request_count?: number
          window_start?: string
        }
        Update: {
          api_key_hash?: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_request_at?: string
          locked_until?: string | null
          request_count?: number
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_limits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metrics_cache: {
        Row: {
          assinado: number
          assinatura: number
          client_id: string
          closer: number
          contrato: number
          conversion_rate: number
          desqualificado: number
          id: string
          nao_assinou: number
          period: string
          sdr: number
          total_leads: number
          updated_at: string
        }
        Insert: {
          assinado?: number
          assinatura?: number
          client_id: string
          closer?: number
          contrato?: number
          conversion_rate?: number
          desqualificado?: number
          id?: string
          nao_assinou?: number
          period?: string
          sdr?: number
          total_leads?: number
          updated_at?: string
        }
        Update: {
          assinado?: number
          assinatura?: number
          client_id?: string
          closer?: number
          contrato?: number
          conversion_rate?: number
          desqualificado?: number
          id?: string
          nao_assinou?: number
          period?: string
          sdr?: number
          total_leads?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_metrics_cache_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_panels: {
        Row: {
          client_id: string
          created_at: string
          id: string
          panel_id: string
          panel_name: string
          sync_interval_minutes: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          panel_id: string
          panel_name: string
          sync_interval_minutes?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          panel_id?: string
          panel_name?: string
          sync_interval_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_panels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_step_mappings: {
        Row: {
          client_id: string
          created_at: string
          funnel_stage: string
          id: string
          step_id: string
          step_title: string
        }
        Insert: {
          client_id: string
          created_at?: string
          funnel_stage: string
          id?: string
          step_id: string
          step_title: string
        }
        Update: {
          client_id?: string
          created_at?: string
          funnel_stage?: string
          id?: string
          step_id?: string
          step_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_step_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          allowed_numbers: string[]
          client_level: number
          created_at: string
          features: Json
          helena_api_key: string
          helena_company_id: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          allowed_numbers?: string[]
          client_level?: number
          created_at?: string
          features?: Json
          helena_api_key: string
          helena_company_id?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          allowed_numbers?: string[]
          client_level?: number
          created_at?: string
          features?: Json
          helena_api_key?: string
          helena_company_id?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      crm_items: {
        Row: {
          assigned_to: string | null
          avatar_url: string | null
          client_id: string | null
          content: string | null
          created_at: string
          email: string | null
          id: string
          kind: string
          metadata: Json | null
          name: string | null
          parent_id: string | null
          phone: string | null
          role: string | null
          sender: string | null
          source: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          avatar_url?: string | null
          client_id?: string | null
          content?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kind: string
          metadata?: Json | null
          name?: string | null
          parent_id?: string | null
          phone?: string | null
          role?: string | null
          sender?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          avatar_url?: string | null
          client_id?: string | null
          content?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          name?: string | null
          parent_id?: string | null
          phone?: string | null
          role?: string | null
          sender?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "crm_items"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          card_id: string | null
          card_title: string | null
          client_id: string | null
          completed_date: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_type: string
          created_at: string
          id: string
          notes: string | null
          responsible: string | null
          result: string | null
          scheduled_date: string
          status: string
          updated_at: string
        }
        Insert: {
          card_id?: string | null
          card_title?: string | null
          client_id?: string | null
          completed_date?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          responsible?: string | null
          result?: string | null
          scheduled_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          card_id?: string | null
          card_title?: string | null
          client_id?: string | null
          completed_date?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          responsible?: string | null
          result?: string | null
          scheduled_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_snapshots: {
        Row: {
          client_id: string
          created_at: string
          data: Json
          gerado_em: string
          id: string
          periodo_dias: number
        }
        Insert: {
          client_id: string
          created_at?: string
          data?: Json
          gerado_em?: string
          id?: string
          periodo_dias?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          data?: Json
          gerado_em?: string
          id?: string
          periodo_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "followup_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      helena_agents: {
        Row: {
          avatar_url: string | null
          client_id: string
          created_at: string
          email: string | null
          helena_user_id: string
          id: string
          is_active: boolean
          name: string
          profile: string | null
          raw_data: Json | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          client_id: string
          created_at?: string
          email?: string | null
          helena_user_id: string
          id?: string
          is_active?: boolean
          name: string
          profile?: string | null
          raw_data?: Json | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          client_id?: string
          created_at?: string
          email?: string | null
          helena_user_id?: string
          id?: string
          is_active?: boolean
          name?: string
          profile?: string | null
          raw_data?: Json | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helena_agents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      helena_cards: {
        Row: {
          archived: boolean
          client_id: string | null
          client_name: string | null
          company_id: string | null
          contact_ids: Json | null
          contacts: Json | null
          contract_note: Json | null
          contract_parsed: Json | null
          created_at: string
          custom_fields: Json | null
          description: string | null
          due_date: string | null
          id: string
          is_overdue: boolean | null
          key: string | null
          metadata: Json | null
          monetary_amount: number | null
          number: number | null
          panel_id: string | null
          panel_title: string | null
          position: number | null
          responsible_user: Json | null
          responsible_user_id: string | null
          session_id: string | null
          sessions_synced: boolean
          step_id: string | null
          step_phase: string | null
          step_title: string | null
          synced_at: string
          tag_ids: Json | null
          tags_name: Json | null
          title: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          client_id?: string | null
          client_name?: string | null
          company_id?: string | null
          contact_ids?: Json | null
          contacts?: Json | null
          contract_note?: Json | null
          contract_parsed?: Json | null
          created_at: string
          custom_fields?: Json | null
          description?: string | null
          due_date?: string | null
          id: string
          is_overdue?: boolean | null
          key?: string | null
          metadata?: Json | null
          monetary_amount?: number | null
          number?: number | null
          panel_id?: string | null
          panel_title?: string | null
          position?: number | null
          responsible_user?: Json | null
          responsible_user_id?: string | null
          session_id?: string | null
          sessions_synced?: boolean
          step_id?: string | null
          step_phase?: string | null
          step_title?: string | null
          synced_at?: string
          tag_ids?: Json | null
          tags_name?: Json | null
          title?: string | null
          updated_at: string
        }
        Update: {
          archived?: boolean
          client_id?: string | null
          client_name?: string | null
          company_id?: string | null
          contact_ids?: Json | null
          contacts?: Json | null
          contract_note?: Json | null
          contract_parsed?: Json | null
          created_at?: string
          custom_fields?: Json | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_overdue?: boolean | null
          key?: string | null
          metadata?: Json | null
          monetary_amount?: number | null
          number?: number | null
          panel_id?: string | null
          panel_title?: string | null
          position?: number | null
          responsible_user?: Json | null
          responsible_user_id?: string | null
          session_id?: string | null
          sessions_synced?: boolean
          step_id?: string | null
          step_phase?: string | null
          step_title?: string | null
          synced_at?: string
          tag_ids?: Json | null
          tags_name?: Json | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helena_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      helena_sessions: {
        Row: {
          agent_name: string | null
          card_id: string | null
          channel_name: string | null
          channel_type: string | null
          classification: string | null
          client_id: string | null
          client_name: string | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          contact_phone: string | null
          department_name: string | null
          id: string
          session_closed_at: string | null
          session_created_at: string | null
          session_detail_full: Json | null
          status: string | null
          synced_at: string
          utm_campaign: string | null
          utm_clid: string | null
          utm_content: string | null
          utm_headline: string | null
          utm_medium: string | null
          utm_referral_url: string | null
          utm_source: string | null
          utm_source_id: string | null
          utm_term: string | null
        }
        Insert: {
          agent_name?: string | null
          card_id?: string | null
          channel_name?: string | null
          channel_type?: string | null
          classification?: string | null
          client_id?: string | null
          client_name?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          department_name?: string | null
          id: string
          session_closed_at?: string | null
          session_created_at?: string | null
          session_detail_full?: Json | null
          status?: string | null
          synced_at?: string
          utm_campaign?: string | null
          utm_clid?: string | null
          utm_content?: string | null
          utm_headline?: string | null
          utm_medium?: string | null
          utm_referral_url?: string | null
          utm_source?: string | null
          utm_source_id?: string | null
          utm_term?: string | null
        }
        Update: {
          agent_name?: string | null
          card_id?: string | null
          channel_name?: string | null
          channel_type?: string | null
          classification?: string | null
          client_id?: string | null
          client_name?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          department_name?: string | null
          id?: string
          session_closed_at?: string | null
          session_created_at?: string | null
          session_detail_full?: Json | null
          status?: string | null
          synced_at?: string
          utm_campaign?: string | null
          utm_clid?: string | null
          utm_content?: string | null
          utm_headline?: string | null
          utm_medium?: string | null
          utm_referral_url?: string | null
          utm_source?: string | null
          utm_source_id?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helena_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      live_messages: {
        Row: {
          client_id: string
          company_id: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          direction: string
          id: string
          origin: string
          sender_from: string | null
          sender_to: string | null
          session_id: string
          status: string | null
          text: string
        }
        Insert: {
          client_id: string
          company_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          direction: string
          id: string
          origin: string
          sender_from?: string | null
          sender_to?: string | null
          session_id: string
          status?: string | null
          text: string
        }
        Update: {
          client_id?: string
          company_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          direction?: string
          id?: string
          origin?: string
          sender_from?: string | null
          sender_to?: string | null
          session_id?: string
          status?: string | null
          text?: string
        }
        Relationships: []
      }
      notification_action_logs: {
        Row: {
          action_type: string
          actor_helena_user_id: string | null
          actor_name: string
          client_id: string | null
          created_at: string
          details: Json | null
          id: string
          lead_ids: string[]
        }
        Insert: {
          action_type: string
          actor_helena_user_id?: string | null
          actor_name?: string
          client_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          lead_ids?: string[]
        }
        Update: {
          action_type?: string
          actor_helena_user_id?: string | null
          actor_name?: string
          client_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          lead_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "notification_action_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean
          id: string
          phone: string
          report_daily: boolean
          report_mode: string
          report_monthly: boolean
          report_period: string
          report_time: string
          report_weekly: boolean
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          phone: string
          report_daily?: boolean
          report_mode?: string
          report_monthly?: boolean
          report_period?: string
          report_time?: string
          report_weekly?: boolean
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          phone?: string
          report_daily?: boolean
          report_mode?: string
          report_monthly?: boolean
          report_period?: string
          report_time?: string
          report_weekly?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notificativo_leads: {
        Row: {
          agente: string | null
          assigned_to: string | null
          client_id: string | null
          company_id: string | null
          created_at: string
          evaluation_stage: string
          external_id: number | null
          external_status: string | null
          horario_notificacao: string | null
          id: string
          id_campanha_link: string | null
          id_cardcrm: string | null
          id_chat: string | null
          id_linkconversa: string | null
          idcontato: string | null
          pipeline_stage: string
          status: string | null
          synced_at: string
          user_name: string | null
          user_number: string | null
        }
        Insert: {
          agente?: string | null
          assigned_to?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          evaluation_stage?: string
          external_id?: number | null
          external_status?: string | null
          horario_notificacao?: string | null
          id?: string
          id_campanha_link?: string | null
          id_cardcrm?: string | null
          id_chat?: string | null
          id_linkconversa?: string | null
          idcontato?: string | null
          pipeline_stage?: string
          status?: string | null
          synced_at?: string
          user_name?: string | null
          user_number?: string | null
        }
        Update: {
          agente?: string | null
          assigned_to?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          evaluation_stage?: string
          external_id?: number | null
          external_status?: string | null
          horario_notificacao?: string | null
          id?: string
          id_campanha_link?: string | null
          id_cardcrm?: string | null
          id_chat?: string | null
          id_linkconversa?: string | null
          idcontato?: string | null
          pipeline_stage?: string
          status?: string | null
          synced_at?: string
          user_name?: string | null
          user_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificativo_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_progress: {
        Row: {
          id: string
          last_offset: number
          updated_at: string
        }
        Insert: {
          id?: string
          last_offset?: number
          updated_at?: string
        }
        Update: {
          id?: string
          last_offset?: number
          updated_at?: string
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
      zapi_config: {
        Row: {
          client_id: string | null
          client_token: string
          created_at: string
          enabled: boolean
          id: string
          instance_id: string
          instance_token: string
          report_template: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_token?: string
          created_at?: string
          enabled?: boolean
          id?: string
          instance_id?: string
          instance_token?: string
          report_template?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_token?: string
          created_at?: string
          enabled?: boolean
          id?: string
          instance_id?: string
          instance_token?: string
          report_template?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_api_key_hash: string
          p_client_id: string
          p_increment?: number
          p_max_requests?: number
          p_window_seconds?: number
        }
        Returns: Json
      }
      cleanup_old_logs: { Args: never; Returns: undefined }
      compute_client_metrics: {
        Args: { p_client_id: string; p_period?: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lock_rate_limit: {
        Args: { p_api_key_hash: string; p_lock_seconds?: number }
        Returns: undefined
      }
      manage_client_cron: {
        Args: {
          p_action: string
          p_client_id?: string
          p_client_slug: string
          p_interval_minutes?: number
        }
        Returns: string
      }
      refresh_all_client_metrics: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
