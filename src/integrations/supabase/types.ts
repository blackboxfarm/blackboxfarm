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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      abused_tickers: {
        Row: {
          abuse_count: number | null
          first_seen_at: string | null
          is_permanent_block: boolean | null
          last_seen_at: string | null
          notes: string | null
          symbol: string
        }
        Insert: {
          abuse_count?: number | null
          first_seen_at?: string | null
          is_permanent_block?: boolean | null
          last_seen_at?: string | null
          notes?: string | null
          symbol: string
        }
        Update: {
          abuse_count?: number | null
          first_seen_at?: string | null
          is_permanent_block?: boolean | null
          last_seen_at?: string | null
          notes?: string | null
          symbol?: string
        }
        Relationships: []
      }
      access_passwords: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          password_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          password_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          password_hash?: string
        }
        Relationships: []
      }
      account_lockdowns: {
        Row: {
          alert_id: string | null
          id: string
          is_locked: boolean
          locked_at: string
          locked_reason: string
          metadata: Json | null
          unlock_method: string | null
          unlocked_at: string | null
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string
          locked_reason: string
          metadata?: Json | null
          unlock_method?: string | null
          unlocked_at?: string | null
          user_id: string
        }
        Update: {
          alert_id?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string
          locked_reason?: string
          metadata?: Json | null
          unlock_method?: string | null
          unlocked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_lockdowns_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "security_sms_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          id: string
          log_level: string | null
          message: string
          metadata: Json | null
          session_id: string | null
          timestamp: string | null
        }
        Insert: {
          id?: string
          log_level?: string | null
          message: string
          metadata?: Json | null
          session_id?: string | null
          timestamp?: string | null
        }
        Update: {
          id?: string
          log_level?: string | null
          message?: string
          metadata?: Json | null
          session_id?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trading_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_archived: boolean
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          read_at: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_archived?: boolean
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type: string
          read_at?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_archived?: boolean
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          read_at?: string | null
          title?: string
        }
        Relationships: []
      }
      admin_todo_items: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          priority: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      advertiser_accounts: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          payment_wallet_pubkey: string
          payment_wallet_secret_encrypted: string
          total_spent_sol: number | null
          twitter_handle: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          payment_wallet_pubkey: string
          payment_wallet_secret_encrypted: string
          total_spent_sol?: number | null
          twitter_handle?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          payment_wallet_pubkey?: string
          payment_wallet_secret_encrypted?: string
          total_spent_sol?: number | null
          twitter_handle?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      advertiser_inquiries: {
        Row: {
          additional_info: string | null
          budget: string
          campaign_goals: string
          company: string
          created_at: string
          email: string
          id: string
          name: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          additional_info?: string | null
          budget: string
          campaign_goals: string
          company: string
          created_at?: string
          email: string
          id?: string
          name: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          additional_info?: string | null
          budget?: string
          campaign_goals?: string
          company?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      ai_compute_log: {
        Row: {
          completion_tokens: number | null
          cost_estimate_usd: number | null
          created_at: string
          function_name: string | null
          id: string
          metadata: Json | null
          model: string
          platform: string
          prompt_tokens: number | null
          response_time_ms: number | null
          session_id: string | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          cost_estimate_usd?: number | null
          created_at?: string
          function_name?: string | null
          id?: string
          metadata?: Json | null
          model?: string
          platform?: string
          prompt_tokens?: number | null
          response_time_ms?: number | null
          session_id?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          cost_estimate_usd?: number | null
          created_at?: string
          function_name?: string | null
          id?: string
          metadata?: Json | null
          model?: string
          platform?: string
          prompt_tokens?: number | null
          response_time_ms?: number | null
          session_id?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_user_memory: {
        Row: {
          created_at: string
          id: string
          interaction_count: number | null
          interests: string[] | null
          language_preference: string | null
          last_platform: string | null
          notes: Json | null
          preferred_name: string | null
          referral_first_seen_at: string | null
          referral_tag: string | null
          session_id: string | null
          telegram_user_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          interaction_count?: number | null
          interests?: string[] | null
          language_preference?: string | null
          last_platform?: string | null
          notes?: Json | null
          preferred_name?: string | null
          referral_first_seen_at?: string | null
          referral_tag?: string | null
          session_id?: string | null
          telegram_user_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          interaction_count?: number | null
          interests?: string[] | null
          language_preference?: string | null
          last_platform?: string | null
          notes?: Json | null
          preferred_name?: string | null
          referral_first_seen_at?: string | null
          referral_tag?: string | null
          session_id?: string | null
          telegram_user_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      airdrop_configs: {
        Row: {
          amount_per_wallet: number
          created_at: string
          execution_count: number
          id: string
          last_executed_at: string | null
          memo: string | null
          name: string
          recipients: Json
          status: string
          token_mint: string
          updated_at: string
          wallet_id: string
        }
        Insert: {
          amount_per_wallet: number
          created_at?: string
          execution_count?: number
          id?: string
          last_executed_at?: string | null
          memo?: string | null
          name?: string
          recipients?: Json
          status?: string
          token_mint: string
          updated_at?: string
          wallet_id: string
        }
        Update: {
          amount_per_wallet?: number
          created_at?: string
          execution_count?: number
          id?: string
          last_executed_at?: string | null
          memo?: string | null
          name?: string
          recipients?: Json
          status?: string
          token_mint?: string
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "airdrop_configs_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "airdrop_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      airdrop_distributions: {
        Row: {
          amount_per_wallet: number
          completed_at: string | null
          config_id: string | null
          created_at: string
          id: string
          memo: string | null
          recipient_count: number
          recipients: Json
          status: string | null
          token_mint: string
          transaction_signatures: Json | null
          wallet_id: string
        }
        Insert: {
          amount_per_wallet: number
          completed_at?: string | null
          config_id?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          recipient_count: number
          recipients: Json
          status?: string | null
          token_mint: string
          transaction_signatures?: Json | null
          wallet_id: string
        }
        Update: {
          amount_per_wallet?: number
          completed_at?: string | null
          config_id?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          recipient_count?: number
          recipients?: Json
          status?: string | null
          token_mint?: string
          transaction_signatures?: Json | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "airdrop_distributions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "airdrop_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airdrop_distributions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "airdrop_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      airdrop_wallets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          is_archived: boolean | null
          nickname: string | null
          pubkey: string
          secret_key_encrypted: string
          sol_balance: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_archived?: boolean | null
          nickname?: string | null
          pubkey: string
          secret_key_encrypted: string
          sol_balance?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_archived?: boolean | null
          nickname?: string | null
          pubkey?: string
          secret_key_encrypted?: string
          sol_balance?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      allstar_alert_watch: {
        Row: {
          alert_id: string
          allstar_id: string | null
          allstar_tier: number | null
          baseline_captured_at: string
          baseline_holder_count: number | null
          baseline_liquidity: number | null
          baseline_mcap: number | null
          baseline_price: number | null
          baseline_volume_24h: number | null
          check_count: number
          close_reason: string | null
          closed_at: string | null
          created_at: string
          creator_wallet: string | null
          current_holder_count: number | null
          current_liquidity: number | null
          current_mcap: number | null
          current_price: number | null
          current_volume_24h: number | null
          decay_stage: string
          dissent_score: number | null
          enrolled_at: string
          exit_alert_sent_at: string | null
          expires_at: string
          history: Json
          id: string
          last_check_at: string | null
          last_realert_at: string | null
          next_check_at: string
          reinforce_alerts_sent: number
          token_mint: string
          updated_at: string
          verdict: Database["public"]["Enums"]["aftercare_verdict"]
          verdict_reasons: Json | null
          verdict_score: number | null
        }
        Insert: {
          alert_id: string
          allstar_id?: string | null
          allstar_tier?: number | null
          baseline_captured_at?: string
          baseline_holder_count?: number | null
          baseline_liquidity?: number | null
          baseline_mcap?: number | null
          baseline_price?: number | null
          baseline_volume_24h?: number | null
          check_count?: number
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          creator_wallet?: string | null
          current_holder_count?: number | null
          current_liquidity?: number | null
          current_mcap?: number | null
          current_price?: number | null
          current_volume_24h?: number | null
          decay_stage?: string
          dissent_score?: number | null
          enrolled_at?: string
          exit_alert_sent_at?: string | null
          expires_at?: string
          history?: Json
          id?: string
          last_check_at?: string | null
          last_realert_at?: string | null
          next_check_at?: string
          reinforce_alerts_sent?: number
          token_mint: string
          updated_at?: string
          verdict?: Database["public"]["Enums"]["aftercare_verdict"]
          verdict_reasons?: Json | null
          verdict_score?: number | null
        }
        Update: {
          alert_id?: string
          allstar_id?: string | null
          allstar_tier?: number | null
          baseline_captured_at?: string
          baseline_holder_count?: number | null
          baseline_liquidity?: number | null
          baseline_mcap?: number | null
          baseline_price?: number | null
          baseline_volume_24h?: number | null
          check_count?: number
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          creator_wallet?: string | null
          current_holder_count?: number | null
          current_liquidity?: number | null
          current_mcap?: number | null
          current_price?: number | null
          current_volume_24h?: number | null
          decay_stage?: string
          dissent_score?: number | null
          enrolled_at?: string
          exit_alert_sent_at?: string | null
          expires_at?: string
          history?: Json
          id?: string
          last_check_at?: string | null
          last_realert_at?: string | null
          next_check_at?: string
          reinforce_alerts_sent?: number
          token_mint?: string
          updated_at?: string
          verdict?: Database["public"]["Enums"]["aftercare_verdict"]
          verdict_reasons?: Json | null
          verdict_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "allstar_alert_watch_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "allstar_mint_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      allstar_audit_check_log: {
        Row: {
          error_msg: string | null
          family_wallet: string | null
          id: number
          latency_ms: number | null
          master_wallet: string
          mint_address: string | null
          source: string
          status: string
          ts: string
        }
        Insert: {
          error_msg?: string | null
          family_wallet?: string | null
          id?: number
          latency_ms?: number | null
          master_wallet: string
          mint_address?: string | null
          source: string
          status: string
          ts?: string
        }
        Update: {
          error_msg?: string | null
          family_wallet?: string | null
          id?: number
          latency_ms?: number | null
          master_wallet?: string
          mint_address?: string | null
          source?: string
          status?: string
          ts?: string
        }
        Relationships: []
      }
      allstar_dev_registry: {
        Row: {
          audit_count: number | null
          best_mcap_achieved: number | null
          best_tier: number
          best_token_mint: string | null
          best_token_symbol: string | null
          created_at: string
          developer_id: string | null
          family_wallets: Json | null
          id: string
          kyc_root_wallet: string | null
          last_audit_at: string | null
          last_mint_detected_at: string | null
          master_wallet: string
          new_mints_found: number | null
          notes: string | null
          status: string
          total_proven_tokens: number | null
          total_wallet_family_size: number | null
          twitter_handle: string | null
          updated_at: string
        }
        Insert: {
          audit_count?: number | null
          best_mcap_achieved?: number | null
          best_tier?: number
          best_token_mint?: string | null
          best_token_symbol?: string | null
          created_at?: string
          developer_id?: string | null
          family_wallets?: Json | null
          id?: string
          kyc_root_wallet?: string | null
          last_audit_at?: string | null
          last_mint_detected_at?: string | null
          master_wallet: string
          new_mints_found?: number | null
          notes?: string | null
          status?: string
          total_proven_tokens?: number | null
          total_wallet_family_size?: number | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Update: {
          audit_count?: number | null
          best_mcap_achieved?: number | null
          best_tier?: number
          best_token_mint?: string | null
          best_token_symbol?: string | null
          created_at?: string
          developer_id?: string | null
          family_wallets?: Json | null
          id?: string
          kyc_root_wallet?: string | null
          last_audit_at?: string | null
          last_mint_detected_at?: string | null
          master_wallet?: string
          new_mints_found?: number | null
          notes?: string | null
          status?: string
          total_proven_tokens?: number | null
          total_wallet_family_size?: number | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allstar_dev_registry_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "allstar_dev_registry_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allstar_dev_registry_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      allstar_mint_alerts: {
        Row: {
          acknowledged_at: string | null
          alert_level: string
          allstar_best_mcap: number | null
          allstar_id: string | null
          allstar_tier: number | null
          created_at: string
          creator_wallet: string
          detecting_wallet: string | null
          dev_balance_pct_at_alert: number | null
          developer_id: string | null
          id: string
          is_acknowledged: boolean | null
          is_suppressed: boolean
          launchpad: string | null
          metadata: Json | null
          suppressed_reason: string | null
          tg_broadcasted_at: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          wallet_depth: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          alert_level?: string
          allstar_best_mcap?: number | null
          allstar_id?: string | null
          allstar_tier?: number | null
          created_at?: string
          creator_wallet: string
          detecting_wallet?: string | null
          dev_balance_pct_at_alert?: number | null
          developer_id?: string | null
          id?: string
          is_acknowledged?: boolean | null
          is_suppressed?: boolean
          launchpad?: string | null
          metadata?: Json | null
          suppressed_reason?: string | null
          tg_broadcasted_at?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          wallet_depth?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          alert_level?: string
          allstar_best_mcap?: number | null
          allstar_id?: string | null
          allstar_tier?: number | null
          created_at?: string
          creator_wallet?: string
          detecting_wallet?: string | null
          dev_balance_pct_at_alert?: number | null
          developer_id?: string | null
          id?: string
          is_acknowledged?: boolean | null
          is_suppressed?: boolean
          launchpad?: string | null
          metadata?: Json | null
          suppressed_reason?: string | null
          tg_broadcasted_at?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          wallet_depth?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "allstar_mint_alerts_allstar_id_fkey"
            columns: ["allstar_id"]
            isOneToOne: false
            referencedRelation: "allstar_dev_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      allstar_sms_throttle: {
        Row: {
          last_sent_at: string
          master_wallet: string
          total_sent: number
        }
        Insert: {
          last_sent_at?: string
          master_wallet: string
          total_sent?: number
        }
        Update: {
          last_sent_at?: string
          master_wallet?: string
          total_sent?: number
        }
        Relationships: []
      }
      api_provider_config: {
        Row: {
          created_at: string | null
          error_count: number | null
          id: string
          is_enabled: boolean | null
          last_error_at: string | null
          priority: number | null
          provider_name: string
          rate_limit_remaining: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_count?: number | null
          id?: string
          is_enabled?: boolean | null
          last_error_at?: string | null
          priority?: number | null
          provider_name: string
          rate_limit_remaining?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_count?: number | null
          id?: string
          is_enabled?: boolean | null
          last_error_at?: string | null
          priority?: number | null
          provider_name?: string
          rate_limit_remaining?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      api_service_config: {
        Row: {
          alert_threshold_critical: number | null
          alert_threshold_exceeded: number | null
          alert_threshold_warning: number | null
          api_key_last_rotated: string | null
          api_key_rotation_date: string | null
          api_key_rotation_reminder_days: number | null
          billing_cycle_start: string | null
          cost_per_credit_usd: number | null
          cost_per_unit: number | null
          created_at: string | null
          currency: string | null
          dashboard_url: string | null
          description: string | null
          display_name: string
          documentation_url: string | null
          error_count_today: number | null
          id: string
          is_enabled: boolean | null
          is_paid_service: boolean | null
          last_error_at: string | null
          last_request_at: string | null
          metadata: Json | null
          monthly_cost_cap: number | null
          monthly_quota: number | null
          monthly_quota_used: number | null
          notes: string | null
          rate_limit_per_day: number | null
          rate_limit_per_hour: number | null
          rate_limit_per_minute: number | null
          service_name: string
          success_count_today: number | null
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          alert_threshold_critical?: number | null
          alert_threshold_exceeded?: number | null
          alert_threshold_warning?: number | null
          api_key_last_rotated?: string | null
          api_key_rotation_date?: string | null
          api_key_rotation_reminder_days?: number | null
          billing_cycle_start?: string | null
          cost_per_credit_usd?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          currency?: string | null
          dashboard_url?: string | null
          description?: string | null
          display_name: string
          documentation_url?: string | null
          error_count_today?: number | null
          id?: string
          is_enabled?: boolean | null
          is_paid_service?: boolean | null
          last_error_at?: string | null
          last_request_at?: string | null
          metadata?: Json | null
          monthly_cost_cap?: number | null
          monthly_quota?: number | null
          monthly_quota_used?: number | null
          notes?: string | null
          rate_limit_per_day?: number | null
          rate_limit_per_hour?: number | null
          rate_limit_per_minute?: number | null
          service_name: string
          success_count_today?: number | null
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          alert_threshold_critical?: number | null
          alert_threshold_exceeded?: number | null
          alert_threshold_warning?: number | null
          api_key_last_rotated?: string | null
          api_key_rotation_date?: string | null
          api_key_rotation_reminder_days?: number | null
          billing_cycle_start?: string | null
          cost_per_credit_usd?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          currency?: string | null
          dashboard_url?: string | null
          description?: string | null
          display_name?: string
          documentation_url?: string | null
          error_count_today?: number | null
          id?: string
          is_enabled?: boolean | null
          is_paid_service?: boolean | null
          last_error_at?: string | null
          last_request_at?: string | null
          metadata?: Json | null
          monthly_cost_cap?: number | null
          monthly_quota?: number | null
          monthly_quota_used?: number | null
          notes?: string | null
          rate_limit_per_day?: number | null
          rate_limit_per_hour?: number | null
          rate_limit_per_minute?: number | null
          service_name?: string
          success_count_today?: number | null
          tier?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          credits_used: number | null
          endpoint: string
          error_message: string | null
          function_name: string | null
          id: string
          is_cached: boolean | null
          metadata: Json | null
          method: string | null
          request_type: string | null
          response_status: number | null
          response_time_ms: number | null
          service_name: string
          session_id: string | null
          success: boolean | null
          timestamp: string
          token_mint: string | null
          user_id: string | null
        }
        Insert: {
          credits_used?: number | null
          endpoint: string
          error_message?: string | null
          function_name?: string | null
          id?: string
          is_cached?: boolean | null
          metadata?: Json | null
          method?: string | null
          request_type?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          service_name: string
          session_id?: string | null
          success?: boolean | null
          timestamp?: string
          token_mint?: string | null
          user_id?: string | null
        }
        Update: {
          credits_used?: number | null
          endpoint?: string
          error_message?: string | null
          function_name?: string | null
          id?: string
          is_cached?: boolean | null
          metadata?: Json | null
          method?: string | null
          request_type?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          service_name?: string
          session_id?: string | null
          success?: boolean | null
          timestamp?: string
          token_mint?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      apify_pause_state: {
        Row: {
          id: number
          last_failure_body: string | null
          last_failure_status: number | null
          paused_until: string | null
          reason: string | null
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          id: number
          last_failure_body?: string | null
          last_failure_status?: number | null
          paused_until?: string | null
          reason?: string | null
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          last_failure_body?: string | null
          last_failure_status?: number | null
          paused_until?: string | null
          reason?: string | null
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      arb_balances: {
        Row: {
          base_token_base: number
          created_at: string | null
          eth_base: number
          eth_mainnet: number
          id: string
          last_updated: string | null
          total_value_usd: number
          usdc_base: number
          usdc_mainnet: number
          user_id: string
        }
        Insert: {
          base_token_base?: number
          created_at?: string | null
          eth_base?: number
          eth_mainnet?: number
          id?: string
          last_updated?: string | null
          total_value_usd?: number
          usdc_base?: number
          usdc_mainnet?: number
          user_id: string
        }
        Update: {
          base_token_base?: number
          created_at?: string | null
          eth_base?: number
          eth_mainnet?: number
          id?: string
          last_updated?: string | null
          total_value_usd?: number
          usdc_base?: number
          usdc_mainnet?: number
          user_id?: string
        }
        Relationships: []
      }
      arb_bot_config: {
        Row: {
          auto_trade_enabled: boolean
          balance_aware_mode: boolean
          circuit_breaker_active: boolean
          created_at: string | null
          dry_run_enabled: boolean
          enable_dynamic_rebalancing: boolean
          enable_loop_a: boolean
          enable_loop_b: boolean
          enable_loop_c: boolean
          enable_profit_taking: boolean
          enable_usdc_to_base: boolean
          enable_usdc_to_eth: boolean
          id: string
          initial_base_tokens: number
          initial_eth_base: number
          initial_eth_mainnet: number
          initial_usdc_base: number
          initial_usdc_mainnet: number
          max_bridge_fee_pct: number
          max_daily_loss_eth: number
          max_daily_trades: number
          max_gas_per_tx_base: number
          max_gas_per_tx_eth: number
          max_loss_per_trade_eth: number
          max_open_loops: number
          max_price_impact_bps: number
          max_slippage_bps_per_hop: number
          max_usdc_deployment_pct: number
          min_base_gain_pct_for_sell: number
          min_eth_gain_pct_for_sell: number
          min_profit_bps: number
          partial_profit_take_pct: number
          polling_interval_sec: number
          rebalance_mode: boolean
          stale_quote_timeout_sec: number
          trade_size_fixed_eth: number
          trade_size_mode: string
          trade_size_pct_balance: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_trade_enabled?: boolean
          balance_aware_mode?: boolean
          circuit_breaker_active?: boolean
          created_at?: string | null
          dry_run_enabled?: boolean
          enable_dynamic_rebalancing?: boolean
          enable_loop_a?: boolean
          enable_loop_b?: boolean
          enable_loop_c?: boolean
          enable_profit_taking?: boolean
          enable_usdc_to_base?: boolean
          enable_usdc_to_eth?: boolean
          id?: string
          initial_base_tokens?: number
          initial_eth_base?: number
          initial_eth_mainnet?: number
          initial_usdc_base?: number
          initial_usdc_mainnet?: number
          max_bridge_fee_pct?: number
          max_daily_loss_eth?: number
          max_daily_trades?: number
          max_gas_per_tx_base?: number
          max_gas_per_tx_eth?: number
          max_loss_per_trade_eth?: number
          max_open_loops?: number
          max_price_impact_bps?: number
          max_slippage_bps_per_hop?: number
          max_usdc_deployment_pct?: number
          min_base_gain_pct_for_sell?: number
          min_eth_gain_pct_for_sell?: number
          min_profit_bps?: number
          partial_profit_take_pct?: number
          polling_interval_sec?: number
          rebalance_mode?: boolean
          stale_quote_timeout_sec?: number
          trade_size_fixed_eth?: number
          trade_size_mode?: string
          trade_size_pct_balance?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_trade_enabled?: boolean
          balance_aware_mode?: boolean
          circuit_breaker_active?: boolean
          created_at?: string | null
          dry_run_enabled?: boolean
          enable_dynamic_rebalancing?: boolean
          enable_loop_a?: boolean
          enable_loop_b?: boolean
          enable_loop_c?: boolean
          enable_profit_taking?: boolean
          enable_usdc_to_base?: boolean
          enable_usdc_to_eth?: boolean
          id?: string
          initial_base_tokens?: number
          initial_eth_base?: number
          initial_eth_mainnet?: number
          initial_usdc_base?: number
          initial_usdc_mainnet?: number
          max_bridge_fee_pct?: number
          max_daily_loss_eth?: number
          max_daily_trades?: number
          max_gas_per_tx_base?: number
          max_gas_per_tx_eth?: number
          max_loss_per_trade_eth?: number
          max_open_loops?: number
          max_price_impact_bps?: number
          max_slippage_bps_per_hop?: number
          max_usdc_deployment_pct?: number
          min_base_gain_pct_for_sell?: number
          min_eth_gain_pct_for_sell?: number
          min_profit_bps?: number
          partial_profit_take_pct?: number
          polling_interval_sec?: number
          rebalance_mode?: boolean
          stale_quote_timeout_sec?: number
          trade_size_fixed_eth?: number
          trade_size_mode?: string
          trade_size_pct_balance?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      arb_bot_status: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          is_running: boolean
          last_scan_at: string | null
          next_scan_at: string | null
          scan_count_today: number | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          is_running?: boolean
          last_scan_at?: string | null
          next_scan_at?: string | null
          scan_count_today?: number | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          is_running?: boolean
          last_scan_at?: string | null
          next_scan_at?: string | null
          scan_count_today?: number | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      arb_daily_stats: {
        Row: {
          date: string
          failed_loops: number
          id: string
          net_pnl_eth: number
          successful_loops: number
          total_gas_spent_eth: number
          total_loops_executed: number
          total_loss_eth: number
          total_profit_eth: number
          total_volume_eth: number
          user_id: string
        }
        Insert: {
          date: string
          failed_loops?: number
          id?: string
          net_pnl_eth?: number
          successful_loops?: number
          total_gas_spent_eth?: number
          total_loops_executed?: number
          total_loss_eth?: number
          total_profit_eth?: number
          total_volume_eth?: number
          user_id: string
        }
        Update: {
          date?: string
          failed_loops?: number
          id?: string
          net_pnl_eth?: number
          successful_loops?: number
          total_gas_spent_eth?: number
          total_loops_executed?: number
          total_loss_eth?: number
          total_profit_eth?: number
          total_volume_eth?: number
          user_id?: string
        }
        Relationships: []
      }
      arb_loop_executions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          final_amount_eth: number | null
          id: string
          legs: Json
          loop_id: string
          loop_type: string
          realized_profit_bps: number | null
          realized_profit_eth: number | null
          started_at: string | null
          starting_amount_eth: number
          status: string
          stranded_amount: number | null
          stranded_asset: string | null
          total_bridge_fees_eth: number | null
          total_gas_spent_eth: number | null
          total_swap_fees_eth: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          final_amount_eth?: number | null
          id?: string
          legs: Json
          loop_id: string
          loop_type: string
          realized_profit_bps?: number | null
          realized_profit_eth?: number | null
          started_at?: string | null
          starting_amount_eth: number
          status?: string
          stranded_amount?: number | null
          stranded_asset?: string | null
          total_bridge_fees_eth?: number | null
          total_gas_spent_eth?: number | null
          total_swap_fees_eth?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          final_amount_eth?: number | null
          id?: string
          legs?: Json
          loop_id?: string
          loop_type?: string
          realized_profit_bps?: number | null
          realized_profit_eth?: number | null
          started_at?: string | null
          starting_amount_eth?: number
          status?: string
          stranded_amount?: number | null
          stranded_asset?: string | null
          total_bridge_fees_eth?: number | null
          total_gas_spent_eth?: number | null
          total_swap_fees_eth?: number | null
          user_id?: string
        }
        Relationships: []
      }
      arb_opportunities: {
        Row: {
          detected_at: string | null
          executable: boolean
          expected_final_eth: number
          expected_profit_bps: number
          expected_profit_eth: number
          id: string
          leg_breakdown: Json
          loop_type: string
          meets_gas_limits: boolean
          meets_liquidity_depth: boolean
          meets_profit_threshold: boolean
          meets_slippage_threshold: boolean
          skip_reason: string | null
          trade_size_eth: number
          user_id: string
        }
        Insert: {
          detected_at?: string | null
          executable: boolean
          expected_final_eth: number
          expected_profit_bps: number
          expected_profit_eth: number
          id?: string
          leg_breakdown: Json
          loop_type: string
          meets_gas_limits: boolean
          meets_liquidity_depth: boolean
          meets_profit_threshold: boolean
          meets_slippage_threshold: boolean
          skip_reason?: string | null
          trade_size_eth: number
          user_id: string
        }
        Update: {
          detected_at?: string | null
          executable?: boolean
          expected_final_eth?: number
          expected_profit_bps?: number
          expected_profit_eth?: number
          id?: string
          leg_breakdown?: Json
          loop_type?: string
          meets_gas_limits?: boolean
          meets_liquidity_depth?: boolean
          meets_profit_threshold?: boolean
          meets_slippage_threshold?: boolean
          skip_reason?: string | null
          trade_size_eth?: number
          user_id?: string
        }
        Relationships: []
      }
      arb_positions: {
        Row: {
          amount: number
          asset: string
          chain: string
          closed_at: string | null
          created_at: string | null
          current_price_usd: number | null
          entry_price_usd: number
          id: string
          opened_at: string
          status: string
          unrealized_pnl_pct: number | null
          unrealized_pnl_usd: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          asset: string
          chain: string
          closed_at?: string | null
          created_at?: string | null
          current_price_usd?: number | null
          entry_price_usd: number
          id?: string
          opened_at?: string
          status?: string
          unrealized_pnl_pct?: number | null
          unrealized_pnl_usd?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          chain?: string
          closed_at?: string | null
          created_at?: string | null
          current_price_usd?: number | null
          entry_price_usd?: number
          id?: string
          opened_at?: string
          status?: string
          unrealized_pnl_pct?: number | null
          unrealized_pnl_usd?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      arb_price_snapshots: {
        Row: {
          base_token_eth: number
          base_token_usd: number
          bridge_fee_base_to_eth: number | null
          bridge_fee_eth_to_base: number | null
          eth_base_usd: number
          eth_mainnet_usd: number
          gas_price_base_gwei: number | null
          gas_price_eth_gwei: number | null
          id: string
          timestamp: string | null
        }
        Insert: {
          base_token_eth: number
          base_token_usd: number
          bridge_fee_base_to_eth?: number | null
          bridge_fee_eth_to_base?: number | null
          eth_base_usd: number
          eth_mainnet_usd: number
          gas_price_base_gwei?: number | null
          gas_price_eth_gwei?: number | null
          id?: string
          timestamp?: string | null
        }
        Update: {
          base_token_eth?: number
          base_token_usd?: number
          bridge_fee_base_to_eth?: number | null
          bridge_fee_eth_to_base?: number | null
          eth_base_usd?: number
          eth_mainnet_usd?: number
          gas_price_base_gwei?: number | null
          gas_price_eth_gwei?: number | null
          id?: string
          timestamp?: string | null
        }
        Relationships: []
      }
      arb_system_health: {
        Row: {
          base_rpc_error_rate: number | null
          base_rpc_latency_ms: number | null
          bridge_api_latency_ms: number | null
          eth_rpc_error_rate: number | null
          eth_rpc_latency_ms: number | null
          id: string
          status: string
          swap_api_error_rate: number | null
          swap_api_latency_ms: number | null
          timestamp: string | null
        }
        Insert: {
          base_rpc_error_rate?: number | null
          base_rpc_latency_ms?: number | null
          bridge_api_latency_ms?: number | null
          eth_rpc_error_rate?: number | null
          eth_rpc_latency_ms?: number | null
          id?: string
          status: string
          swap_api_error_rate?: number | null
          swap_api_latency_ms?: number | null
          timestamp?: string | null
        }
        Update: {
          base_rpc_error_rate?: number | null
          base_rpc_latency_ms?: number | null
          bridge_api_latency_ms?: number | null
          eth_rpc_error_rate?: number | null
          eth_rpc_latency_ms?: number | null
          id?: string
          status?: string
          swap_api_error_rate?: number | null
          swap_api_latency_ms?: number | null
          timestamp?: string | null
        }
        Relationships: []
      }
      autopsy_backlog: {
        Row: {
          ath_at: string | null
          ath_usd: number | null
          captured_at: string
          collapse_pct: number | null
          creator_wallet: string | null
          current_mcap_usd: number | null
          current_price_usd: number | null
          death_at: string | null
          death_cause: string | null
          death_confidence: number | null
          drafted_at: string | null
          drafted_slug: string | null
          holder_count: number | null
          is_frozen: boolean
          launchpad: string | null
          liquidity_usd: number | null
          name: string | null
          symbol: string | null
          token_mint: string
        }
        Insert: {
          ath_at?: string | null
          ath_usd?: number | null
          captured_at?: string
          collapse_pct?: number | null
          creator_wallet?: string | null
          current_mcap_usd?: number | null
          current_price_usd?: number | null
          death_at?: string | null
          death_cause?: string | null
          death_confidence?: number | null
          drafted_at?: string | null
          drafted_slug?: string | null
          holder_count?: number | null
          is_frozen?: boolean
          launchpad?: string | null
          liquidity_usd?: number | null
          name?: string | null
          symbol?: string | null
          token_mint: string
        }
        Update: {
          ath_at?: string | null
          ath_usd?: number | null
          captured_at?: string
          collapse_pct?: number | null
          creator_wallet?: string | null
          current_mcap_usd?: number | null
          current_price_usd?: number | null
          death_at?: string | null
          death_cause?: string | null
          death_confidence?: number | null
          drafted_at?: string | null
          drafted_slug?: string | null
          holder_count?: number | null
          is_frozen?: boolean
          launchpad?: string | null
          liquidity_usd?: number | null
          name?: string | null
          symbol?: string | null
          token_mint?: string
        }
        Relationships: []
      }
      autopsy_candidates: {
        Row: {
          age_hours: number | null
          analyzed_at: string | null
          ath_mcap_usd: number | null
          bonding_curve_pct: number | null
          boost_timeline: boolean
          boosts_paid_usd: number | null
          candidate_score: number | null
          created_at: string | null
          creator_wallet: string | null
          current_mcap_usd: number | null
          death_cause: string | null
          death_confidence: number | null
          death_intent: string | null
          decided_at: string | null
          dev_dossier: Json | null
          dev_holding_pct_at_death: number | null
          dev_realized_value_usd: number | null
          dex_paid: boolean | null
          discord_present: boolean | null
          draft_md_path: string | null
          drafted_at: string | null
          evidence_gaps: Json | null
          funneled_at: string | null
          holders_at_ath: number | null
          hydrated_at: string | null
          hydration_attempts: number
          hydration_status: Json | null
          id: string
          liquidity_usd: number | null
          manual_tg_join_completed: boolean | null
          matched_signals: Json | null
          published_at: string | null
          published_slug: string | null
          social_checked_at: string | null
          social_completeness: number | null
          social_last_admin_msg_at: string | null
          social_no_admin_hours: number | null
          social_spam_pct: number | null
          social_x_account_status: string | null
          social_x_checked_at: string | null
          source_feed: string
          status: string
          status_reason: string | null
          telegram_subscriber_count: number | null
          ticker: string | null
          tier: string | null
          token_mint: string
          token_name: string | null
          updated_at: string | null
          x_community_admin_count: number | null
          x_community_member_count: number | null
          x_community_mod_count: number | null
          youtube_url: string | null
        }
        Insert: {
          age_hours?: number | null
          analyzed_at?: string | null
          ath_mcap_usd?: number | null
          bonding_curve_pct?: number | null
          boost_timeline?: boolean
          boosts_paid_usd?: number | null
          candidate_score?: number | null
          created_at?: string | null
          creator_wallet?: string | null
          current_mcap_usd?: number | null
          death_cause?: string | null
          death_confidence?: number | null
          death_intent?: string | null
          decided_at?: string | null
          dev_dossier?: Json | null
          dev_holding_pct_at_death?: number | null
          dev_realized_value_usd?: number | null
          dex_paid?: boolean | null
          discord_present?: boolean | null
          draft_md_path?: string | null
          drafted_at?: string | null
          evidence_gaps?: Json | null
          funneled_at?: string | null
          holders_at_ath?: number | null
          hydrated_at?: string | null
          hydration_attempts?: number
          hydration_status?: Json | null
          id?: string
          liquidity_usd?: number | null
          manual_tg_join_completed?: boolean | null
          matched_signals?: Json | null
          published_at?: string | null
          published_slug?: string | null
          social_checked_at?: string | null
          social_completeness?: number | null
          social_last_admin_msg_at?: string | null
          social_no_admin_hours?: number | null
          social_spam_pct?: number | null
          social_x_account_status?: string | null
          social_x_checked_at?: string | null
          source_feed: string
          status?: string
          status_reason?: string | null
          telegram_subscriber_count?: number | null
          ticker?: string | null
          tier?: string | null
          token_mint: string
          token_name?: string | null
          updated_at?: string | null
          x_community_admin_count?: number | null
          x_community_member_count?: number | null
          x_community_mod_count?: number | null
          youtube_url?: string | null
        }
        Update: {
          age_hours?: number | null
          analyzed_at?: string | null
          ath_mcap_usd?: number | null
          bonding_curve_pct?: number | null
          boost_timeline?: boolean
          boosts_paid_usd?: number | null
          candidate_score?: number | null
          created_at?: string | null
          creator_wallet?: string | null
          current_mcap_usd?: number | null
          death_cause?: string | null
          death_confidence?: number | null
          death_intent?: string | null
          decided_at?: string | null
          dev_dossier?: Json | null
          dev_holding_pct_at_death?: number | null
          dev_realized_value_usd?: number | null
          dex_paid?: boolean | null
          discord_present?: boolean | null
          draft_md_path?: string | null
          drafted_at?: string | null
          evidence_gaps?: Json | null
          funneled_at?: string | null
          holders_at_ath?: number | null
          hydrated_at?: string | null
          hydration_attempts?: number
          hydration_status?: Json | null
          id?: string
          liquidity_usd?: number | null
          manual_tg_join_completed?: boolean | null
          matched_signals?: Json | null
          published_at?: string | null
          published_slug?: string | null
          social_checked_at?: string | null
          social_completeness?: number | null
          social_last_admin_msg_at?: string | null
          social_no_admin_hours?: number | null
          social_spam_pct?: number | null
          social_x_account_status?: string | null
          social_x_checked_at?: string | null
          source_feed?: string
          status?: string
          status_reason?: string | null
          telegram_subscriber_count?: number | null
          ticker?: string | null
          tier?: string | null
          token_mint?: string
          token_name?: string | null
          updated_at?: string | null
          x_community_admin_count?: number | null
          x_community_member_count?: number | null
          x_community_mod_count?: number | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      autopsy_comment_votes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
          value: number
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
          value?: number
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "autopsy_comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "autopsy_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      autopsy_comments: {
        Row: {
          autopsy_slug: string
          body: string
          body_clean: string
          created_at: string
          edited_at: string | null
          id: string
          is_hidden: boolean
          is_pinned: boolean
          parent_id: string | null
          updated_at: string
          upvote_count: number
          user_id: string
        }
        Insert: {
          autopsy_slug: string
          body: string
          body_clean: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_hidden?: boolean
          is_pinned?: boolean
          parent_id?: string | null
          updated_at?: string
          upvote_count?: number
          user_id: string
        }
        Update: {
          autopsy_slug?: string
          body?: string
          body_clean?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_hidden?: boolean
          is_pinned?: boolean
          parent_id?: string | null
          updated_at?: string
          upvote_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopsy_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "autopsy_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      autopsy_evidence_blobs: {
        Row: {
          candidate_id: string | null
          captured_at: string
          created_by: string | null
          id: string
          kind: string
          payload: Json
          token_mint: string
        }
        Insert: {
          candidate_id?: string | null
          captured_at?: string
          created_by?: string | null
          id?: string
          kind: string
          payload: Json
          token_mint: string
        }
        Update: {
          candidate_id?: string | null
          captured_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          payload?: Json
          token_mint?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopsy_evidence_blobs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "autopsy_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      autopsy_pipeline_events: {
        Row: {
          candidate_id: string
          created_at: string
          detail: string | null
          id: number
          outcome: string | null
          phase: string
          reason: string | null
          status: string
          step: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          detail?: string | null
          id?: number
          outcome?: string | null
          phase: string
          reason?: string | null
          status: string
          step: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          detail?: string | null
          id?: number
          outcome?: string | null
          phase?: string
          reason?: string | null
          status?: string
          step?: string
        }
        Relationships: []
      }
      autopsy_reports: {
        Row: {
          candidate_id: string | null
          created_at: string | null
          death_cause: string
          death_confidence: number | null
          death_intent: string | null
          harm_breakdown: Json | null
          harm_headline: string | null
          harm_score: number | null
          harm_scored_at: string | null
          hero_image_path: string | null
          id: string
          is_current: boolean
          md_content: string
          md_path: string | null
          published_at: string | null
          risk_score: string | null
          slug: string
          source_banner_url: string | null
          subtitle: string | null
          tags: string[] | null
          ticker: string | null
          title: string
          token_mint: string
          updated_at: string | null
          verdict: string | null
          version: number
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string | null
          death_cause: string
          death_confidence?: number | null
          death_intent?: string | null
          harm_breakdown?: Json | null
          harm_headline?: string | null
          harm_score?: number | null
          harm_scored_at?: string | null
          hero_image_path?: string | null
          id?: string
          is_current?: boolean
          md_content: string
          md_path?: string | null
          published_at?: string | null
          risk_score?: string | null
          slug: string
          source_banner_url?: string | null
          subtitle?: string | null
          tags?: string[] | null
          ticker?: string | null
          title: string
          token_mint: string
          updated_at?: string | null
          verdict?: string | null
          version?: number
        }
        Update: {
          candidate_id?: string | null
          created_at?: string | null
          death_cause?: string
          death_confidence?: number | null
          death_intent?: string | null
          harm_breakdown?: Json | null
          harm_headline?: string | null
          harm_score?: number | null
          harm_scored_at?: string | null
          hero_image_path?: string | null
          id?: string
          is_current?: boolean
          md_content?: string
          md_path?: string | null
          published_at?: string | null
          risk_score?: string | null
          slug?: string
          source_banner_url?: string | null
          subtitle?: string | null
          tags?: string[] | null
          ticker?: string | null
          title?: string
          token_mint?: string
          updated_at?: string | null
          verdict?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "autopsy_reports_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "autopsy_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      autopsy_tx_evidence: {
        Row: {
          atomic_snipe_pct: number | null
          candidate_id: string
          cluster_capture_pct: number | null
          cluster_dump_provenance: Json | null
          cluster_dump_verdict: string | null
          co_snipers: Json | null
          collapse_window: Json | null
          collected_at: string
          creator_wallet: string | null
          dev_buy_amount_tokens: number | null
          dev_buy_pct_of_curve: number | null
          dev_buy_sol: number | null
          dev_final_action_at: string | null
          dev_final_action_kind: string | null
          dev_final_action_signature: string | null
          dev_signatures: Json | null
          dump_cascade: Json | null
          exit_group: Json | null
          exit_group_linkage_summary: Json | null
          exit_pattern: string | null
          exit_verdict: string | null
          funder_funded_amount_sol: number | null
          funder_funded_at: string | null
          funder_minutes_before_launch: number | null
          funder_wallet: string | null
          launch_tx_at: string | null
          launch_tx_signature: string | null
          notes: string | null
          post_dump_flow: Json | null
          time_of_death_at: string | null
          token_mint: string
          updated_at: string
          usdc_consolidation_observed: boolean | null
        }
        Insert: {
          atomic_snipe_pct?: number | null
          candidate_id: string
          cluster_capture_pct?: number | null
          cluster_dump_provenance?: Json | null
          cluster_dump_verdict?: string | null
          co_snipers?: Json | null
          collapse_window?: Json | null
          collected_at?: string
          creator_wallet?: string | null
          dev_buy_amount_tokens?: number | null
          dev_buy_pct_of_curve?: number | null
          dev_buy_sol?: number | null
          dev_final_action_at?: string | null
          dev_final_action_kind?: string | null
          dev_final_action_signature?: string | null
          dev_signatures?: Json | null
          dump_cascade?: Json | null
          exit_group?: Json | null
          exit_group_linkage_summary?: Json | null
          exit_pattern?: string | null
          exit_verdict?: string | null
          funder_funded_amount_sol?: number | null
          funder_funded_at?: string | null
          funder_minutes_before_launch?: number | null
          funder_wallet?: string | null
          launch_tx_at?: string | null
          launch_tx_signature?: string | null
          notes?: string | null
          post_dump_flow?: Json | null
          time_of_death_at?: string | null
          token_mint: string
          updated_at?: string
          usdc_consolidation_observed?: boolean | null
        }
        Update: {
          atomic_snipe_pct?: number | null
          candidate_id?: string
          cluster_capture_pct?: number | null
          cluster_dump_provenance?: Json | null
          cluster_dump_verdict?: string | null
          co_snipers?: Json | null
          collapse_window?: Json | null
          collected_at?: string
          creator_wallet?: string | null
          dev_buy_amount_tokens?: number | null
          dev_buy_pct_of_curve?: number | null
          dev_buy_sol?: number | null
          dev_final_action_at?: string | null
          dev_final_action_kind?: string | null
          dev_final_action_signature?: string | null
          dev_signatures?: Json | null
          dump_cascade?: Json | null
          exit_group?: Json | null
          exit_group_linkage_summary?: Json | null
          exit_pattern?: string | null
          exit_verdict?: string | null
          funder_funded_amount_sol?: number | null
          funder_funded_at?: string | null
          funder_minutes_before_launch?: number | null
          funder_wallet?: string | null
          launch_tx_at?: string | null
          launch_tx_signature?: string | null
          notes?: string | null
          post_dump_flow?: Json | null
          time_of_death_at?: string | null
          token_mint?: string
          updated_at?: string
          usdc_consolidation_observed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "autopsy_tx_evidence_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "autopsy_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      banker_pool: {
        Row: {
          created_at: string
          current_capital: number
          daily_loss_limit_pct: number
          id: string
          is_active: boolean
          largest_loss: number
          largest_win: number
          losing_trades: number
          max_drawdown_pct: number
          max_open_positions: number
          max_position_pct: number
          min_score_to_enter: number
          peak_capital: number
          starting_capital: number
          stop_loss_pct: number
          take_profit_pct: number
          total_invested: number
          total_pnl: number
          total_returned: number
          total_trades: number
          trailing_stop_pct: number
          updated_at: string
          user_id: string
          winning_trades: number
        }
        Insert: {
          created_at?: string
          current_capital?: number
          daily_loss_limit_pct?: number
          id?: string
          is_active?: boolean
          largest_loss?: number
          largest_win?: number
          losing_trades?: number
          max_drawdown_pct?: number
          max_open_positions?: number
          max_position_pct?: number
          min_score_to_enter?: number
          peak_capital?: number
          starting_capital?: number
          stop_loss_pct?: number
          take_profit_pct?: number
          total_invested?: number
          total_pnl?: number
          total_returned?: number
          total_trades?: number
          trailing_stop_pct?: number
          updated_at?: string
          user_id?: string
          winning_trades?: number
        }
        Update: {
          created_at?: string
          current_capital?: number
          daily_loss_limit_pct?: number
          id?: string
          is_active?: boolean
          largest_loss?: number
          largest_win?: number
          losing_trades?: number
          max_drawdown_pct?: number
          max_open_positions?: number
          max_position_pct?: number
          min_score_to_enter?: number
          peak_capital?: number
          starting_capital?: number
          stop_loss_pct?: number
          take_profit_pct?: number
          total_invested?: number
          total_pnl?: number
          total_returned?: number
          total_trades?: number
          trailing_stop_pct?: number
          updated_at?: string
          user_id?: string
          winning_trades?: number
        }
        Relationships: []
      }
      banker_pool_daily_stats: {
        Row: {
          best_trade_pnl: number | null
          capital_at_risk: number
          closing_capital: number
          created_at: string
          daily_pnl: number
          daily_pnl_pct: number
          date: string
          id: string
          losses: number
          max_drawdown_pct: number | null
          open_positions: number
          opening_capital: number
          pool_id: string
          trades_closed: number
          trades_opened: number
          wins: number
          worst_trade_pnl: number | null
        }
        Insert: {
          best_trade_pnl?: number | null
          capital_at_risk?: number
          closing_capital: number
          created_at?: string
          daily_pnl?: number
          daily_pnl_pct?: number
          date: string
          id?: string
          losses?: number
          max_drawdown_pct?: number | null
          open_positions?: number
          opening_capital: number
          pool_id: string
          trades_closed?: number
          trades_opened?: number
          wins?: number
          worst_trade_pnl?: number | null
        }
        Update: {
          best_trade_pnl?: number | null
          capital_at_risk?: number
          closing_capital?: number
          created_at?: string
          daily_pnl?: number
          daily_pnl_pct?: number
          date?: string
          id?: string
          losses?: number
          max_drawdown_pct?: number | null
          open_positions?: number
          opening_capital?: number
          pool_id?: string
          trades_closed?: number
          trades_opened?: number
          wins?: number
          worst_trade_pnl?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "banker_pool_daily_stats_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "banker_pool"
            referencedColumns: ["id"]
          },
        ]
      }
      banker_pool_trades: {
        Row: {
          created_at: string
          current_multiplier: number | null
          current_price_usd: number | null
          entered_at: string
          entry_mcap: number | null
          entry_price_usd: number
          entry_reason: string | null
          entry_score: number | null
          exit_price_usd: number | null
          exit_reason: string | null
          exited_at: string | null
          fantasy_position_id: string | null
          id: string
          peak_multiplier: number | null
          peak_price_usd: number | null
          pnl_pct: number | null
          pnl_usd: number | null
          pool_id: string
          position_size_pct: number
          position_size_usd: number
          status: string
          stop_loss_price: number | null
          take_profit_price: number | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          trailing_stop_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_multiplier?: number | null
          current_price_usd?: number | null
          entered_at?: string
          entry_mcap?: number | null
          entry_price_usd: number
          entry_reason?: string | null
          entry_score?: number | null
          exit_price_usd?: number | null
          exit_reason?: string | null
          exited_at?: string | null
          fantasy_position_id?: string | null
          id?: string
          peak_multiplier?: number | null
          peak_price_usd?: number | null
          pnl_pct?: number | null
          pnl_usd?: number | null
          pool_id: string
          position_size_pct: number
          position_size_usd: number
          status?: string
          stop_loss_price?: number | null
          take_profit_price?: number | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          trailing_stop_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_multiplier?: number | null
          current_price_usd?: number | null
          entered_at?: string
          entry_mcap?: number | null
          entry_price_usd?: number
          entry_reason?: string | null
          entry_score?: number | null
          exit_price_usd?: number | null
          exit_reason?: string | null
          exited_at?: string | null
          fantasy_position_id?: string | null
          id?: string
          peak_multiplier?: number | null
          peak_price_usd?: number | null
          pnl_pct?: number | null
          pnl_usd?: number | null
          pool_id?: string
          position_size_pct?: number
          position_size_usd?: number
          status?: string
          stop_loss_price?: number | null
          take_profit_price?: number | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          trailing_stop_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banker_pool_trades_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "banker_pool"
            referencedColumns: ["id"]
          },
        ]
      }
      banner_ads: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_date: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string
          notes: string | null
          position: number
          start_date: string | null
          title: string
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url: string
          notes?: string | null
          position: number
          start_date?: string | null
          title: string
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string
          notes?: string | null
          position?: number
          start_date?: string | null
          title?: string
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      banner_clicks: {
        Row: {
          banner_id: string
          created_at: string | null
          id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          banner_id: string
          created_at?: string | null
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          banner_id?: string
          created_at?: string | null
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banner_clicks_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "banner_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      banner_impressions: {
        Row: {
          banner_id: string
          created_at: string | null
          id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          banner_id: string
          created_at?: string | null
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          banner_id?: string
          created_at?: string | null
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banner_impressions_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "banner_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      banner_orders: {
        Row: {
          activation_key: string | null
          advertiser_id: string | null
          banner_ad_id: string | null
          clawback_amount_sol: number | null
          created_at: string | null
          duration_hours: number
          end_time: string | null
          funds_swept_at: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string
          paid_composite_url: string | null
          payment_confirmed_at: string | null
          payment_sender_wallet: string | null
          payment_status: string | null
          price_sol: number | null
          price_usd: number
          refund_amount_sol: number | null
          refund_tx_signature: string | null
          refund_wallet: string | null
          refunded_at: string | null
          sol_price_at_order: number | null
          start_time: string
          sweep_tx_signature: string | null
          swept_amount_sol: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          activation_key?: string | null
          advertiser_id?: string | null
          banner_ad_id?: string | null
          clawback_amount_sol?: number | null
          created_at?: string | null
          duration_hours: number
          end_time?: string | null
          funds_swept_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url: string
          paid_composite_url?: string | null
          payment_confirmed_at?: string | null
          payment_sender_wallet?: string | null
          payment_status?: string | null
          price_sol?: number | null
          price_usd: number
          refund_amount_sol?: number | null
          refund_tx_signature?: string | null
          refund_wallet?: string | null
          refunded_at?: string | null
          sol_price_at_order?: number | null
          start_time: string
          sweep_tx_signature?: string | null
          swept_amount_sol?: number | null
          title?: string
          updated_at?: string | null
        }
        Update: {
          activation_key?: string | null
          advertiser_id?: string | null
          banner_ad_id?: string | null
          clawback_amount_sol?: number | null
          created_at?: string | null
          duration_hours?: number
          end_time?: string | null
          funds_swept_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string
          paid_composite_url?: string | null
          payment_confirmed_at?: string | null
          payment_sender_wallet?: string | null
          payment_status?: string | null
          price_sol?: number | null
          price_usd?: number
          refund_amount_sol?: number | null
          refund_tx_signature?: string | null
          refund_wallet?: string | null
          refunded_at?: string | null
          sol_price_at_order?: number | null
          start_time?: string
          sweep_tx_signature?: string | null
          swept_amount_sol?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banner_orders_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertiser_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banner_orders_banner_ad_id_fkey"
            columns: ["banner_ad_id"]
            isOneToOne: false
            referencedRelation: "banner_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      birdeye_api_usage: {
        Row: {
          created_at: string
          credits_used: number
          endpoint: string
          error_message: string | null
          function_name: string
          id: string
          method: string
          request_params: Json | null
          resolved_creator: string | null
          response_status: number | null
          response_time_ms: number | null
          success: boolean
          timestamp: string
          token_mint: string | null
        }
        Insert: {
          created_at?: string
          credits_used?: number
          endpoint: string
          error_message?: string | null
          function_name: string
          id?: string
          method?: string
          request_params?: Json | null
          resolved_creator?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          success?: boolean
          timestamp?: string
          token_mint?: string | null
        }
        Update: {
          created_at?: string
          credits_used?: number
          endpoint?: string
          error_message?: string | null
          function_name?: string
          id?: string
          method?: string
          request_params?: Json | null
          resolved_creator?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          success?: boolean
          timestamp?: string
          token_mint?: string | null
        }
        Relationships: []
      }
      blackbox_aggregator_runs: {
        Row: {
          ca_post_message_id: number | null
          ca_posted_at: string | null
          created_at: string
          digest_jsonb: Json | null
          digest_message_id: number | null
          digest_text: string | null
          error_message: string | null
          harvest_until: string
          id: string
          posted_at: string
          replies_collected: number
          source_chat_id: number
          source_message_id: number | null
          source_raw_text: string | null
          status: string
          token_mint: string
          updated_at: string
        }
        Insert: {
          ca_post_message_id?: number | null
          ca_posted_at?: string | null
          created_at?: string
          digest_jsonb?: Json | null
          digest_message_id?: number | null
          digest_text?: string | null
          error_message?: string | null
          harvest_until: string
          id?: string
          posted_at?: string
          replies_collected?: number
          source_chat_id: number
          source_message_id?: number | null
          source_raw_text?: string | null
          status?: string
          token_mint: string
          updated_at?: string
        }
        Update: {
          ca_post_message_id?: number | null
          ca_posted_at?: string | null
          created_at?: string
          digest_jsonb?: Json | null
          digest_message_id?: number | null
          digest_text?: string | null
          error_message?: string | null
          harvest_until?: string
          id?: string
          posted_at?: string
          replies_collected?: number
          source_chat_id?: number
          source_message_id?: number | null
          source_raw_text?: string | null
          status?: string
          token_mint?: string
          updated_at?: string
        }
        Relationships: []
      }
      blackbox_bot_replies: {
        Row: {
          bot_user_id: number | null
          bot_username: string | null
          edit_count: number
          edited_at: string | null
          id: string
          message_id: number
          parsed_jsonb: Json | null
          parser_used: string | null
          raw_text: string
          received_at: string
          run_id: string
        }
        Insert: {
          bot_user_id?: number | null
          bot_username?: string | null
          edit_count?: number
          edited_at?: string | null
          id?: string
          message_id: number
          parsed_jsonb?: Json | null
          parser_used?: string | null
          raw_text: string
          received_at?: string
          run_id: string
        }
        Update: {
          bot_user_id?: number | null
          bot_username?: string | null
          edit_count?: number
          edited_at?: string | null
          id?: string
          message_id?: number
          parsed_jsonb?: Json | null
          parser_used?: string | null
          raw_text?: string
          received_at?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blackbox_bot_replies_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "blackbox_aggregator_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      blackbox_campaigns: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          nickname: string
          token_address: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          nickname: string
          token_address: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          nickname?: string
          token_address?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      blackbox_channel_config: {
        Row: {
          chat_id: number
          created_at: string
          enabled: boolean
          id: string
          label: string | null
          notes: string | null
          role: string
          updated_at: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          notes?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          notes?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      blackbox_command_codes: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          user_id: string | null
          wallet_id: string | null
        }
        Insert: {
          config: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          user_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blackbox_command_codes_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      blackbox_contract_campaigns: {
        Row: {
          campaign_id: string
          contract_id: string
          created_at: string
          id: string
        }
        Insert: {
          campaign_id: string
          contract_id: string
          created_at?: string
          id?: string
        }
        Update: {
          campaign_id?: string
          contract_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blackbox_contract_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "blackbox_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blackbox_contract_campaigns_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "blackbox_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      blackbox_contract_commands: {
        Row: {
          command_id: string
          contract_id: string
          created_at: string
          id: string
          wallet_id: string
        }
        Insert: {
          command_id: string
          contract_id: string
          created_at?: string
          id?: string
          wallet_id: string
        }
        Update: {
          command_id?: string
          contract_id?: string
          created_at?: string
          id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blackbox_contract_commands_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "blackbox_command_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blackbox_contract_commands_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "blackbox_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blackbox_contract_commands_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      blackbox_contract_wallets: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          wallet_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          wallet_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blackbox_contract_wallets_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "blackbox_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blackbox_contract_wallets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      blackbox_contracts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blackbox_parser_samples: {
        Row: {
          bot_display_name: string | null
          bot_user_id: number | null
          bot_username: string | null
          caption: string | null
          created_at: string
          edited_at: string | null
          has_photo: boolean
          id: string
          inline_buttons_jsonb: Json | null
          message_id: number
          parser_attempt_jsonb: Json | null
          parser_used: string | null
          posted_at: string
          probe_run_id: string | null
          raw_entities_jsonb: Json | null
          raw_text: string
          received_at: string
          source: string
          token_mint: string
        }
        Insert: {
          bot_display_name?: string | null
          bot_user_id?: number | null
          bot_username?: string | null
          caption?: string | null
          created_at?: string
          edited_at?: string | null
          has_photo?: boolean
          id?: string
          inline_buttons_jsonb?: Json | null
          message_id: number
          parser_attempt_jsonb?: Json | null
          parser_used?: string | null
          posted_at?: string
          probe_run_id?: string | null
          raw_entities_jsonb?: Json | null
          raw_text?: string
          received_at?: string
          source?: string
          token_mint: string
        }
        Update: {
          bot_display_name?: string | null
          bot_user_id?: number | null
          bot_username?: string | null
          caption?: string | null
          created_at?: string
          edited_at?: string | null
          has_photo?: boolean
          id?: string
          inline_buttons_jsonb?: Json | null
          message_id?: number
          parser_attempt_jsonb?: Json | null
          parser_used?: string | null
          posted_at?: string
          probe_run_id?: string | null
          raw_entities_jsonb?: Json | null
          raw_text?: string
          received_at?: string
          source?: string
          token_mint?: string
        }
        Relationships: []
      }
      blackbox_transactions: {
        Row: {
          amount_sol: number
          campaign_id: string | null
          command_code_id: string | null
          executed_at: string | null
          gas_fee: number
          id: string
          service_fee: number
          signature: string | null
          status: string | null
          transaction_type: string
          wallet_id: string | null
        }
        Insert: {
          amount_sol: number
          campaign_id?: string | null
          command_code_id?: string | null
          executed_at?: string | null
          gas_fee: number
          id?: string
          service_fee: number
          signature?: string | null
          status?: string | null
          transaction_type: string
          wallet_id?: string | null
        }
        Update: {
          amount_sol?: number
          campaign_id?: string | null
          command_code_id?: string | null
          executed_at?: string | null
          gas_fee?: number
          id?: string
          service_fee?: number
          signature?: string | null
          status?: string | null
          transaction_type?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blackbox_transactions_command_code_id_fkey"
            columns: ["command_code_id"]
            isOneToOne: false
            referencedRelation: "blackbox_command_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blackbox_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      blackbox_users: {
        Row: {
          created_at: string | null
          id: string
          phone_number: string | null
          two_factor_enabled: boolean | null
          two_factor_secret: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          phone_number?: string | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          phone_number?: string | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      blackbox_wallets: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          nickname: string | null
          pubkey: string
          secret_key_encrypted: string
          sol_balance: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          nickname?: string | null
          pubkey: string
          secret_key_encrypted: string
          sol_balance?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          nickname?: string | null
          pubkey?: string
          secret_key_encrypted?: string
          sol_balance?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      boost_entries: {
        Row: {
          amount: number
          boost_date: string
          boost_type: string
          created_at: string
          id: string
          link_label: string | null
          link_url: string | null
          notes: string | null
          platform: string
          updated_at: string
        }
        Insert: {
          amount?: number
          boost_date?: string
          boost_type: string
          created_at?: string
          id?: string
          link_label?: string | null
          link_url?: string | null
          notes?: string | null
          platform: string
          updated_at?: string
        }
        Update: {
          amount?: number
          boost_date?: string
          boost_type?: string
          created_at?: string
          id?: string
          link_label?: string | null
          link_url?: string | null
          notes?: string | null
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_chat_settings: {
        Row: {
          ca_enabled: boolean
          chat_id: number
          updated_at: string
        }
        Insert: {
          ca_enabled?: boolean
          chat_id: number
          updated_at?: string
        }
        Update: {
          ca_enabled?: boolean
          chat_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot_guardrails: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          rule_content: string
          rule_name: string
          rule_type: Database["public"]["Enums"]["bot_guardrail_type"]
          severity: Database["public"]["Enums"]["bot_guardrail_severity"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          rule_content: string
          rule_name: string
          rule_type?: Database["public"]["Enums"]["bot_guardrail_type"]
          severity?: Database["public"]["Enums"]["bot_guardrail_severity"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          rule_content?: string
          rule_name?: string
          rule_type?: Database["public"]["Enums"]["bot_guardrail_type"]
          severity?: Database["public"]["Enums"]["bot_guardrail_severity"]
          updated_at?: string
        }
        Relationships: []
      }
      bot_knowledge_bins: {
        Row: {
          category: Database["public"]["Enums"]["bot_knowledge_category"]
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          keywords: string[]
          priority: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["bot_knowledge_category"]
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          priority?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["bot_knowledge_category"]
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          priority?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_personality_config: {
        Row: {
          expertise_areas: string[]
          fallback_response: string
          greeting_template: string
          id: number
          is_active: boolean
          language_behavior: string
          max_response_length: number
          persona_description: string
          persona_name: string
          tone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          expertise_areas?: string[]
          fallback_response?: string
          greeting_template?: string
          id: number
          is_active?: boolean
          language_behavior?: string
          max_response_length?: number
          persona_description?: string
          persona_name?: string
          tone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          expertise_areas?: string[]
          fallback_response?: string
          greeting_template?: string
          id?: number
          is_active?: boolean
          language_behavior?: string
          max_response_length?: number
          persona_description?: string
          persona_name?: string
          tone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      bubble_map_anon_usage: {
        Row: {
          count: number
          day: string
          first_seen: string
          id: string
          identifier_hash: string
          ip_hash: string | null
          last_seen: string
          user_agent_short: string | null
          visitor_hash: string | null
        }
        Insert: {
          count?: number
          day?: string
          first_seen?: string
          id?: string
          identifier_hash: string
          ip_hash?: string | null
          last_seen?: string
          user_agent_short?: string | null
          visitor_hash?: string | null
        }
        Update: {
          count?: number
          day?: string
          first_seen?: string
          id?: string
          identifier_hash?: string
          ip_hash?: string | null
          last_seen?: string
          user_agent_short?: string | null
          visitor_hash?: string | null
        }
        Relationships: []
      }
      bubble_snapshots: {
        Row: {
          commentary: string | null
          created_at: string
          id: string
          public_url: string
          storage_path: string
          ticker: string | null
          token_address: string
          user_id: string | null
          view_mode: string
        }
        Insert: {
          commentary?: string | null
          created_at?: string
          id?: string
          public_url: string
          storage_path: string
          ticker?: string | null
          token_address: string
          user_id?: string | null
          view_mode: string
        }
        Update: {
          commentary?: string | null
          created_at?: string
          id?: string
          public_url?: string
          storage_path?: string
          ticker?: string | null
          token_address?: string
          user_id?: string | null
          view_mode?: string
        }
        Relationships: []
      }
      bundle_reports: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          report_data: Json
          report_number: number
          risk_factors: Json
          risk_score: number
          verdict: string
          wallet_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          report_data?: Json
          report_number?: number
          risk_factors?: Json
          risk_score?: number
          verdict?: string
          wallet_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          report_data?: Json
          report_number?: number
          risk_factors?: Json
          risk_score?: number
          verdict?: string
          wallet_count?: number
        }
        Relationships: []
      }
      buyer_intent_signals: {
        Row: {
          checkout_attempts: number
          created_at: string
          funnel_tag: string | null
          id: string
          intent_level: string
          last_checkout_attempt: string | null
          last_pricing_visit: string | null
          nurture_email_sent: boolean
          pricing_page_views: number
          updated_at: string
          user_id: string
        }
        Insert: {
          checkout_attempts?: number
          created_at?: string
          funnel_tag?: string | null
          id?: string
          intent_level?: string
          last_checkout_attempt?: string | null
          last_pricing_visit?: string | null
          nurture_email_sent?: boolean
          pricing_page_views?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          checkout_attempts?: number
          created_at?: string
          funnel_tag?: string | null
          id?: string
          intent_level?: string
          last_checkout_attempt?: string | null
          last_pricing_visit?: string | null
          nurture_email_sent?: boolean
          pricing_page_views?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_notifications: {
        Row: {
          campaign_id: string
          campaign_type: string
          created_at: string
          id: string
          notification_type: string
          recipients_count: number
          sent_at: string
        }
        Insert: {
          campaign_id: string
          campaign_type: string
          created_at?: string
          id?: string
          notification_type: string
          recipients_count?: number
          sent_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_type?: string
          created_at?: string
          id?: string
          notification_type?: string
          recipients_count?: number
          sent_at?: string
        }
        Relationships: []
      }
      campaign_timing: {
        Row: {
          campaign_id: string
          campaign_type: string
          created_at: string
          ended_at: string | null
          id: string
          paused_at: string | null
          planned_duration_minutes: number | null
          started_at: string | null
          state_changes: Json
          total_runtime_minutes: number | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campaign_type: string
          created_at?: string
          ended_at?: string | null
          id?: string
          paused_at?: string | null
          planned_duration_minutes?: number | null
          started_at?: string | null
          state_changes?: Json
          total_runtime_minutes?: number | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_type?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          paused_at?: string | null
          planned_duration_minutes?: number | null
          started_at?: string | null
          state_changes?: Json
          total_runtime_minutes?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      campaign_wallets: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          wallet_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          wallet_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_wallets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "blackbox_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_wallets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_alert_config: {
        Row: {
          alert_type: string
          chat_id: number
          created_at: string
          enabled_by: string | null
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          alert_type: string
          chat_id: number
          created_at?: string
          enabled_by?: string | null
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          alert_type?: string
          chat_id?: number
          created_at?: string
          enabled_by?: string | null
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      channel_comparison_pairs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          pair_name: string
          public_channel_id: string
          public_channel_name: string | null
          updated_at: string
          vip_channel_id: string
          vip_channel_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          pair_name: string
          public_channel_id: string
          public_channel_name?: string | null
          updated_at?: string
          vip_channel_id: string
          vip_channel_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          pair_name?: string
          public_channel_id?: string
          public_channel_name?: string | null
          updated_at?: string
          vip_channel_id?: string
          vip_channel_name?: string | null
        }
        Relationships: []
      }
      channel_installations: {
        Row: {
          admin_config: Json
          chat_id: number
          chat_title: string | null
          chat_type: string
          id: string
          installed_at: string
          is_active: boolean
          is_paid: boolean
          kicked: boolean
          paid_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_config?: Json
          chat_id: number
          chat_title?: string | null
          chat_type?: string
          id?: string
          installed_at?: string
          is_active?: boolean
          is_paid?: boolean
          kicked?: boolean
          paid_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_config?: Json
          chat_id?: number
          chat_title?: string | null
          chat_type?: string
          id?: string
          installed_at?: string
          is_active?: boolean
          is_paid?: boolean
          kicked?: boolean
          paid_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      channel_pair_comparison_runs: {
        Row: {
          ai_summary: string | null
          ai_verdict: string | null
          created_at: string
          id: string
          is_manual: boolean
          overlap_tokens: Json
          pair_id: string
          public_avg_mcap_at_call: number | null
          public_call_count: number
          public_exclusives: Json
          public_pnl_summary: Json
          vip_avg_lead_seconds: number | null
          vip_avg_mcap_at_call: number | null
          vip_call_count: number
          vip_exclusives: Json
          vip_lead_overlap: Json
          vip_pnl_summary: Json
          window_end: string
          window_start: string
        }
        Insert: {
          ai_summary?: string | null
          ai_verdict?: string | null
          created_at?: string
          id?: string
          is_manual?: boolean
          overlap_tokens?: Json
          pair_id: string
          public_avg_mcap_at_call?: number | null
          public_call_count?: number
          public_exclusives?: Json
          public_pnl_summary?: Json
          vip_avg_lead_seconds?: number | null
          vip_avg_mcap_at_call?: number | null
          vip_call_count?: number
          vip_exclusives?: Json
          vip_lead_overlap?: Json
          vip_pnl_summary?: Json
          window_end: string
          window_start: string
        }
        Update: {
          ai_summary?: string | null
          ai_verdict?: string | null
          created_at?: string
          id?: string
          is_manual?: boolean
          overlap_tokens?: Json
          pair_id?: string
          public_avg_mcap_at_call?: number | null
          public_call_count?: number
          public_exclusives?: Json
          public_pnl_summary?: Json
          vip_avg_lead_seconds?: number | null
          vip_avg_mcap_at_call?: number | null
          vip_call_count?: number
          vip_exclusives?: Json
          vip_lead_overlap?: Json
          vip_pnl_summary?: Json
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_pair_comparison_runs_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "channel_comparison_pairs"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_payment_wallets: {
        Row: {
          created_at: string
          current_balance: number
          id: string
          installation_id: string
          is_paid: boolean
          pubkey: string
          required_sol: number
          secret_key_encrypted: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          current_balance?: number
          id?: string
          installation_id: string
          is_paid?: boolean
          pubkey: string
          required_sol?: number
          secret_key_encrypted: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          current_balance?: number
          id?: string
          installation_id?: string
          is_paid?: boolean
          pubkey?: string
          required_sol?: number
          secret_key_encrypted?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_payment_wallets_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: true
            referencedRelation: "channel_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_intents: {
        Row: {
          completed_at: string | null
          created_at: string | null
          email: string
          id: string
          price_id: string
          reminded_at: string | null
          reminder_count: number | null
          status: string
          stripe_session_id: string | null
          tier_key: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          price_id: string
          reminded_at?: string | null
          reminder_count?: number | null
          status?: string
          stripe_session_id?: string | null
          tier_key?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          price_id?: string
          reminded_at?: string | null
          reminder_count?: number | null
          status?: string
          stripe_session_id?: string | null
          tier_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      co_mint_clusters: {
        Row: {
          block_window: Json | null
          cluster_id: string
          confidence: number | null
          created_at: string
          id: string
          mint_addresses: Json
          wallet_addresses: Json
        }
        Insert: {
          block_window?: Json | null
          cluster_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          mint_addresses?: Json
          wallet_addresses?: Json
        }
        Update: {
          block_window?: Json | null
          cluster_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          mint_addresses?: Json
          wallet_addresses?: Json
        }
        Relationships: []
      }
      coingecko_error_alerts: {
        Row: {
          context: string | null
          created_at: string | null
          endpoint: string | null
          error_code: string
          fallback_price: number | null
          fallback_source: string | null
          http_status: number | null
          id: string
          message: string | null
          notified_at: string | null
          resolved_at: string | null
          retry_after_seconds: number | null
          severity: string | null
          tier: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          endpoint?: string | null
          error_code: string
          fallback_price?: number | null
          fallback_source?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          notified_at?: string | null
          resolved_at?: string | null
          retry_after_seconds?: number | null
          severity?: string | null
          tier?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string | null
          endpoint?: string | null
          error_code?: string
          fallback_price?: number | null
          fallback_source?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          notified_at?: string | null
          resolved_at?: string | null
          retry_after_seconds?: number | null
          severity?: string | null
          tier?: string | null
        }
        Relationships: []
      }
      community_campaign_executions: {
        Row: {
          campaign_id: string
          command_config: Json
          completed_at: string | null
          error_message: string | null
          execution_status: string
          id: string
          revenue_generated_sol: number | null
          started_at: string | null
          total_transactions: number | null
          wallet_address: string
        }
        Insert: {
          campaign_id: string
          command_config: Json
          completed_at?: string | null
          error_message?: string | null
          execution_status?: string
          id?: string
          revenue_generated_sol?: number | null
          started_at?: string | null
          total_transactions?: number | null
          wallet_address: string
        }
        Update: {
          campaign_id?: string
          command_config?: Json
          completed_at?: string | null
          error_message?: string | null
          execution_status?: string
          id?: string
          revenue_generated_sol?: number | null
          started_at?: string | null
          total_transactions?: number | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_campaign_executions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "community_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      community_campaigns: {
        Row: {
          blackbox_campaign_id: string | null
          campaign_parameters: Json
          contributor_count: number
          created_at: string
          creator_id: string
          current_funding_sol: number
          description: string | null
          executed_at: string | null
          funded_at: string | null
          funding_goal_sol: number | null
          id: string
          max_contribution_sol: number | null
          min_contribution_sol: number
          multisig_wallet_address: string | null
          status: string
          target_deadline: string
          title: string
          token_address: string
          updated_at: string
        }
        Insert: {
          blackbox_campaign_id?: string | null
          campaign_parameters?: Json
          contributor_count?: number
          created_at?: string
          creator_id: string
          current_funding_sol?: number
          description?: string | null
          executed_at?: string | null
          funded_at?: string | null
          funding_goal_sol?: number | null
          id?: string
          max_contribution_sol?: number | null
          min_contribution_sol?: number
          multisig_wallet_address?: string | null
          status?: string
          target_deadline: string
          title: string
          token_address: string
          updated_at?: string
        }
        Update: {
          blackbox_campaign_id?: string | null
          campaign_parameters?: Json
          contributor_count?: number
          created_at?: string
          creator_id?: string
          current_funding_sol?: number
          description?: string | null
          executed_at?: string | null
          funded_at?: string | null
          funding_goal_sol?: number | null
          id?: string
          max_contribution_sol?: number | null
          min_contribution_sol?: number
          multisig_wallet_address?: string | null
          status?: string
          target_deadline?: string
          title?: string
          token_address?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_campaigns_blackbox_campaign_id_fkey"
            columns: ["blackbox_campaign_id"]
            isOneToOne: false
            referencedRelation: "blackbox_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      community_contributions: {
        Row: {
          amount_sol: number
          campaign_id: string
          contribution_timestamp: string
          contributor_id: string
          id: string
          refund_signature: string | null
          refunded: boolean
          refunded_at: string | null
          transaction_signature: string | null
        }
        Insert: {
          amount_sol: number
          campaign_id: string
          contribution_timestamp?: string
          contributor_id: string
          id?: string
          refund_signature?: string | null
          refunded?: boolean
          refunded_at?: string | null
          transaction_signature?: string | null
        }
        Update: {
          amount_sol?: number
          campaign_id?: string
          contribution_timestamp?: string
          contributor_id?: string
          id?: string
          refund_signature?: string | null
          refunded?: boolean
          refunded_at?: string | null
          transaction_signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "community_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      community_dissent_signals: {
        Row: {
          ai_confidence: number | null
          candidate_id: string | null
          captured_at: string
          community_id: string | null
          handle: string | null
          id: string
          post_url: string | null
          posted_at: string | null
          quote: string | null
          signal_kind: string
          token_mint: string | null
        }
        Insert: {
          ai_confidence?: number | null
          candidate_id?: string | null
          captured_at?: string
          community_id?: string | null
          handle?: string | null
          id?: string
          post_url?: string | null
          posted_at?: string | null
          quote?: string | null
          signal_kind: string
          token_mint?: string | null
        }
        Update: {
          ai_confidence?: number | null
          candidate_id?: string | null
          captured_at?: string
          community_id?: string | null
          handle?: string | null
          id?: string
          post_url?: string | null
          posted_at?: string | null
          quote?: string | null
          signal_kind?: string
          token_mint?: string | null
        }
        Relationships: []
      }
      community_follow_targets: {
        Row: {
          community_id: string
          community_role: string | null
          created_at: string | null
          error_message: string | null
          follow_back_detected_at: string | null
          follow_status: string | null
          followed_at: string | null
          followers_count: number | null
          id: string
          is_blue_verified: boolean | null
          target_handle: string
          target_x_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          community_id: string
          community_role?: string | null
          created_at?: string | null
          error_message?: string | null
          follow_back_detected_at?: string | null
          follow_status?: string | null
          followed_at?: string | null
          followers_count?: number | null
          id?: string
          is_blue_verified?: boolean | null
          target_handle: string
          target_x_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          community_id?: string
          community_role?: string | null
          created_at?: string | null
          error_message?: string | null
          follow_back_detected_at?: string | null
          follow_status?: string | null
          followed_at?: string | null
          followers_count?: number | null
          id?: string
          is_blue_verified?: boolean | null
          target_handle?: string
          target_x_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      content_drafts: {
        Row: {
          created_at: string | null
          id: string
          locked_at: string | null
          original_image_url: string | null
          original_text: string | null
          posted_platforms: Json | null
          repurposed_image_url: string | null
          repurposed_text: string | null
          schedule_post_at: string | null
          source_post_id: string | null
          status: string | null
          target_platforms: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          locked_at?: string | null
          original_image_url?: string | null
          original_text?: string | null
          posted_platforms?: Json | null
          repurposed_image_url?: string | null
          repurposed_text?: string | null
          schedule_post_at?: string | null
          source_post_id?: string | null
          status?: string | null
          target_platforms?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          locked_at?: string | null
          original_image_url?: string | null
          original_text?: string | null
          posted_platforms?: Json | null
          repurposed_image_url?: string | null
          repurposed_text?: string | null
          schedule_post_at?: string | null
          source_post_id?: string | null
          status?: string | null
          target_platforms?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "repurpose_scraped_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_trades: {
        Row: {
          amount_sol: number | null
          amount_usd: number
          copy_config_id: string
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          is_fantasy: boolean
          original_transaction_id: string | null
          original_wallet_address: string
          price_per_token: number | null
          profit_loss_usd: number | null
          sell_percentage: number | null
          status: string
          token_amount: number | null
          token_mint: string
          token_symbol: string | null
          trade_type: string
          transaction_signature: string | null
          user_id: string
        }
        Insert: {
          amount_sol?: number | null
          amount_usd: number
          copy_config_id: string
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          is_fantasy?: boolean
          original_transaction_id?: string | null
          original_wallet_address: string
          price_per_token?: number | null
          profit_loss_usd?: number | null
          sell_percentage?: number | null
          status?: string
          token_amount?: number | null
          token_mint: string
          token_symbol?: string | null
          trade_type: string
          transaction_signature?: string | null
          user_id: string
        }
        Update: {
          amount_sol?: number | null
          amount_usd?: number
          copy_config_id?: string
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          is_fantasy?: boolean
          original_transaction_id?: string | null
          original_wallet_address?: string
          price_per_token?: number | null
          profit_loss_usd?: number | null
          sell_percentage?: number | null
          status?: string
          token_amount?: number | null
          token_mint?: string
          token_symbol?: string | null
          trade_type?: string
          transaction_signature?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copy_trades_copy_config_id_fkey"
            columns: ["copy_config_id"]
            isOneToOne: false
            referencedRelation: "wallet_copy_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copy_trades_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_milestone_sms_log: {
        Row: {
          body: string | null
          count_at_send: number | null
          error: string | null
          id: string
          metric_key: string
          pct: number
          sent_at: string
          status: string
          to_phone: string | null
          total_at_send: number | null
        }
        Insert: {
          body?: string | null
          count_at_send?: number | null
          error?: string | null
          id?: string
          metric_key: string
          pct: number
          sent_at?: string
          status?: string
          to_phone?: string | null
          total_at_send?: number | null
        }
        Update: {
          body?: string | null
          count_at_send?: number | null
          error?: string | null
          id?: string
          metric_key?: string
          pct?: number
          sent_at?: string
          status?: string
          to_phone?: string | null
          total_at_send?: number | null
        }
        Relationships: []
      }
      coverage_milestone_state: {
        Row: {
          last_notified_at: string | null
          last_pct: number
          metric_key: string
          updated_at: string
        }
        Insert: {
          last_notified_at?: string | null
          last_pct?: number
          metric_key: string
          updated_at?: string
        }
        Update: {
          last_notified_at?: string | null
          last_pct?: number
          metric_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_audit_results: {
        Row: {
          batch_offset: number
          batch_size: number
          contamination_rate: number | null
          created_at: string
          errors: number
          id: string
          matches: number
          mismatches: number
          sample_mismatches: Json | null
          table_name: string
          total_checked: number
          unreachable: number
        }
        Insert: {
          batch_offset?: number
          batch_size?: number
          contamination_rate?: number | null
          created_at?: string
          errors?: number
          id?: string
          matches?: number
          mismatches?: number
          sample_mismatches?: Json | null
          table_name: string
          total_checked?: number
          unreachable?: number
        }
        Update: {
          batch_offset?: number
          batch_size?: number
          contamination_rate?: number | null
          created_at?: string
          errors?: number
          id?: string
          matches?: number
          mismatches?: number
          sample_mismatches?: Json | null
          table_name?: string
          total_checked?: number
          unreachable?: number
        }
        Relationships: []
      }
      creator_backfill_events: {
        Row: {
          column_name: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          from_cache: boolean | null
          function_name: string
          http_status: number | null
          id: string
          mint: string
          resolved_creator: string | null
          response_preview: Json | null
          solscan_url: string | null
          table_name: string | null
        }
        Insert: {
          column_name?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          from_cache?: boolean | null
          function_name?: string
          http_status?: number | null
          id?: string
          mint: string
          resolved_creator?: string | null
          response_preview?: Json | null
          solscan_url?: string | null
          table_name?: string | null
        }
        Update: {
          column_name?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          from_cache?: boolean | null
          function_name?: string
          http_status?: number | null
          id?: string
          mint?: string
          resolved_creator?: string | null
          response_preview?: Json | null
          solscan_url?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      creator_fusion_audit: {
        Row: {
          aliases_written: number | null
          creator_id: string | null
          error: string | null
          id: string
          is_new: boolean | null
          merged_absorbed_ids: string[] | null
          signals: Json
          source: string
          status: string
          ts: string
        }
        Insert: {
          aliases_written?: number | null
          creator_id?: string | null
          error?: string | null
          id?: string
          is_new?: boolean | null
          merged_absorbed_ids?: string[] | null
          signals: Json
          source: string
          status: string
          ts?: string
        }
        Update: {
          aliases_written?: number | null
          creator_id?: string | null
          error?: string | null
          id?: string
          is_new?: boolean | null
          merged_absorbed_ids?: string[] | null
          signals?: Json
          source?: string
          status?: string
          ts?: string
        }
        Relationships: []
      }
      creator_identity_aliases: {
        Row: {
          alias_kind: Database["public"]["Enums"]["creator_alias_kind"]
          alias_value: string
          confidence: number
          creator_id: string
          first_seen_at: string
          id: string
          last_seen_at: string
          source: string | null
        }
        Insert: {
          alias_kind: Database["public"]["Enums"]["creator_alias_kind"]
          alias_value: string
          confidence?: number
          creator_id: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          source?: string | null
        }
        Update: {
          alias_kind?: Database["public"]["Enums"]["creator_alias_kind"]
          alias_value?: string
          confidence?: number
          creator_id?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_identity_aliases_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "creator_identity_aliases_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_identity_aliases_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      creator_merge_log: {
        Row: {
          absorbed_id: string
          created_at: string
          id: string
          metadata: Json
          surviving_id: string
          trigger_kind: Database["public"]["Enums"]["creator_alias_kind"]
          trigger_value: string
          triggered_by: string | null
        }
        Insert: {
          absorbed_id: string
          created_at?: string
          id?: string
          metadata?: Json
          surviving_id: string
          trigger_kind: Database["public"]["Enums"]["creator_alias_kind"]
          trigger_value: string
          triggered_by?: string | null
        }
        Update: {
          absorbed_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          surviving_id?: string
          trigger_kind?: Database["public"]["Enums"]["creator_alias_kind"]
          trigger_value?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_merge_log_surviving_id_fkey"
            columns: ["surviving_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "creator_merge_log_surviving_id_fkey"
            columns: ["surviving_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_merge_log_surviving_id_fkey"
            columns: ["surviving_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      dailies_manual_comments: {
        Row: {
          comment_date: string
          community_comment: boolean | null
          created_at: string | null
          id: string
          notes: string | null
          raw_feed_comment: boolean | null
          reply_to_post: boolean | null
          token_mint: string
          updated_at: string | null
        }
        Insert: {
          comment_date: string
          community_comment?: boolean | null
          created_at?: string | null
          id?: string
          notes?: string | null
          raw_feed_comment?: boolean | null
          reply_to_post?: boolean | null
          token_mint: string
          updated_at?: string | null
        }
        Update: {
          comment_date?: string
          community_comment?: boolean | null
          created_at?: string | null
          id?: string
          notes?: string | null
          raw_feed_comment?: boolean | null
          reply_to_post?: boolean | null
          token_mint?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      dead_letter_queue: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          max_retries: number | null
          next_retry_at: string | null
          operation: string
          payload: Json
          resolved_at: string | null
          retry_count: number | null
          source_function: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          next_retry_at?: string | null
          operation: string
          payload?: Json
          resolved_at?: string | null
          retry_count?: number | null
          source_function: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          next_retry_at?: string | null
          operation?: string
          payload?: Json
          resolved_at?: string | null
          retry_count?: number | null
          source_function?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dev_behavior_scores: {
        Row: {
          avg_lifespan_hours: number | null
          created_at: string
          dump_velocity_score: number | null
          evidence: Json | null
          id: string
          mint_count: number | null
          risk_tier: string
          scored_at: string
          supply_retention_pct: number | null
          updated_at: string
          wallet_address: string
        }
        Insert: {
          avg_lifespan_hours?: number | null
          created_at?: string
          dump_velocity_score?: number | null
          evidence?: Json | null
          id?: string
          mint_count?: number | null
          risk_tier?: string
          scored_at?: string
          supply_retention_pct?: number | null
          updated_at?: string
          wallet_address: string
        }
        Update: {
          avg_lifespan_hours?: number | null
          created_at?: string
          dump_velocity_score?: number | null
          evidence?: Json | null
          id?: string
          mint_count?: number | null
          risk_tier?: string
          scored_at?: string
          supply_retention_pct?: number | null
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      dev_family_track_record_summary: {
        Row: {
          ai_interpretation: string | null
          best_token_ath_usd: number | null
          best_token_mint: string | null
          best_token_ticker: string | null
          bundle_rugs: number
          by_cause: Json
          by_outcome: Json
          community_collapses: number
          dev_abandoneds: number
          dev_wallet: string
          family_size: number
          family_wallets: Json
          flash_hits: number
          hard_rugs: number
          inexperience_fails: number
          intent_index: number | null
          kyc_root_label: string | null
          kyc_root_wallet: string | null
          last_recomputed_at: string
          luck_index: number | null
          marketed_memes: number
          skill_builds: number
          skill_index: number | null
          slow_bleeds: number
          sustained_hits: number
          total_tokens: number
          verdict_label: string | null
          verdict_one_liner: string | null
          viral_memes: number
        }
        Insert: {
          ai_interpretation?: string | null
          best_token_ath_usd?: number | null
          best_token_mint?: string | null
          best_token_ticker?: string | null
          bundle_rugs?: number
          by_cause?: Json
          by_outcome?: Json
          community_collapses?: number
          dev_abandoneds?: number
          dev_wallet: string
          family_size?: number
          family_wallets?: Json
          flash_hits?: number
          hard_rugs?: number
          inexperience_fails?: number
          intent_index?: number | null
          kyc_root_label?: string | null
          kyc_root_wallet?: string | null
          last_recomputed_at?: string
          luck_index?: number | null
          marketed_memes?: number
          skill_builds?: number
          skill_index?: number | null
          slow_bleeds?: number
          sustained_hits?: number
          total_tokens?: number
          verdict_label?: string | null
          verdict_one_liner?: string | null
          viral_memes?: number
        }
        Update: {
          ai_interpretation?: string | null
          best_token_ath_usd?: number | null
          best_token_mint?: string | null
          best_token_ticker?: string | null
          bundle_rugs?: number
          by_cause?: Json
          by_outcome?: Json
          community_collapses?: number
          dev_abandoneds?: number
          dev_wallet?: string
          family_size?: number
          family_wallets?: Json
          flash_hits?: number
          hard_rugs?: number
          inexperience_fails?: number
          intent_index?: number | null
          kyc_root_label?: string | null
          kyc_root_wallet?: string | null
          last_recomputed_at?: string
          luck_index?: number | null
          marketed_memes?: number
          skill_builds?: number
          skill_index?: number | null
          slow_bleeds?: number
          sustained_hits?: number
          total_tokens?: number
          verdict_label?: string | null
          verdict_one_liner?: string | null
          viral_memes?: number
        }
        Relationships: []
      }
      dev_handle_links: {
        Row: {
          community_id: string | null
          confidence: number
          discovered_at: string
          discovered_via: string | null
          evidence: Json
          handle_at_link: string | null
          id: string
          link_key: string | null
          relationship: string
          token_mint: string | null
          updated_at: string
          wallet_address: string
          x_user_id: string
        }
        Insert: {
          community_id?: string | null
          confidence?: number
          discovered_at?: string
          discovered_via?: string | null
          evidence?: Json
          handle_at_link?: string | null
          id?: string
          link_key?: string | null
          relationship: string
          token_mint?: string | null
          updated_at?: string
          wallet_address: string
          x_user_id: string
        }
        Update: {
          community_id?: string | null
          confidence?: number
          discovered_at?: string
          discovered_via?: string | null
          evidence?: Json
          handle_at_link?: string | null
          id?: string
          link_key?: string | null
          relationship?: string
          token_mint?: string | null
          updated_at?: string
          wallet_address?: string
          x_user_id?: string
        }
        Relationships: []
      }
      dev_reputation_v2: {
        Row: {
          archetype: string | null
          best_token_mint: string | null
          career_arc: Json | null
          composite: number | null
          distribution: Json | null
          last_rolled_up_at: string
          peak_mcap_lifetime: number | null
          rollup_version: string
          tokens_of_worth: number
          tokens_scored: number
          total_boosts_usd: number | null
          total_buybacks_usd: number | null
          wallet_address: string
          weighted_effort: number | null
          weighted_integrity: number | null
          weighted_skill: number | null
          weighted_social: number | null
          weighted_sustain: number | null
          worst_token_mint: string | null
        }
        Insert: {
          archetype?: string | null
          best_token_mint?: string | null
          career_arc?: Json | null
          composite?: number | null
          distribution?: Json | null
          last_rolled_up_at?: string
          peak_mcap_lifetime?: number | null
          rollup_version?: string
          tokens_of_worth?: number
          tokens_scored?: number
          total_boosts_usd?: number | null
          total_buybacks_usd?: number | null
          wallet_address: string
          weighted_effort?: number | null
          weighted_integrity?: number | null
          weighted_skill?: number | null
          weighted_social?: number | null
          weighted_sustain?: number | null
          worst_token_mint?: string | null
        }
        Update: {
          archetype?: string | null
          best_token_mint?: string | null
          career_arc?: Json | null
          composite?: number | null
          distribution?: Json | null
          last_rolled_up_at?: string
          peak_mcap_lifetime?: number | null
          rollup_version?: string
          tokens_of_worth?: number
          tokens_scored?: number
          total_boosts_usd?: number | null
          total_buybacks_usd?: number | null
          wallet_address?: string
          weighted_effort?: number | null
          weighted_integrity?: number | null
          weighted_skill?: number | null
          weighted_social?: number | null
          weighted_sustain?: number | null
          worst_token_mint?: string | null
        }
        Relationships: []
      }
      dev_teams: {
        Row: {
          admin_usernames: string[] | null
          created_at: string | null
          estimated_stolen_sol: number | null
          evidence: Json | null
          id: string
          is_active: boolean | null
          linked_token_mints: string[] | null
          linked_x_communities: string[] | null
          member_telegram_accounts: string[] | null
          member_twitter_accounts: string[] | null
          member_wallets: string[] | null
          moderator_usernames: string[] | null
          notes: string | null
          risk_level: string | null
          source: string | null
          tags: string[] | null
          team_hash: string | null
          team_name: string | null
          tokens_created: number | null
          tokens_rugged: number | null
          updated_at: string | null
        }
        Insert: {
          admin_usernames?: string[] | null
          created_at?: string | null
          estimated_stolen_sol?: number | null
          evidence?: Json | null
          id?: string
          is_active?: boolean | null
          linked_token_mints?: string[] | null
          linked_x_communities?: string[] | null
          member_telegram_accounts?: string[] | null
          member_twitter_accounts?: string[] | null
          member_wallets?: string[] | null
          moderator_usernames?: string[] | null
          notes?: string | null
          risk_level?: string | null
          source?: string | null
          tags?: string[] | null
          team_hash?: string | null
          team_name?: string | null
          tokens_created?: number | null
          tokens_rugged?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_usernames?: string[] | null
          created_at?: string | null
          estimated_stolen_sol?: number | null
          evidence?: Json | null
          id?: string
          is_active?: boolean | null
          linked_token_mints?: string[] | null
          linked_x_communities?: string[] | null
          member_telegram_accounts?: string[] | null
          member_twitter_accounts?: string[] | null
          member_wallets?: string[] | null
          moderator_usernames?: string[] | null
          notes?: string | null
          risk_level?: string | null
          source?: string | null
          tags?: string[] | null
          team_hash?: string | null
          team_name?: string | null
          tokens_created?: number | null
          tokens_rugged?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dev_token_history: {
        Row: {
          ai_used: boolean | null
          cause_class: string | null
          cause_confidence: number | null
          cause_evidence: Json | null
          classified_at: string | null
          created_at: string
          created_at_chain: string | null
          dev_wallet: string
          id: string
          image_url: string | null
          last_trade_at: string | null
          launchpad: string | null
          name: string | null
          outcome_class: string | null
          pumpfun_complete: boolean | null
          pumpfun_market_cap_usd: number | null
          scraped_at: string
          ticker: string | null
          token_mint: string
          updated_at: string
        }
        Insert: {
          ai_used?: boolean | null
          cause_class?: string | null
          cause_confidence?: number | null
          cause_evidence?: Json | null
          classified_at?: string | null
          created_at?: string
          created_at_chain?: string | null
          dev_wallet: string
          id?: string
          image_url?: string | null
          last_trade_at?: string | null
          launchpad?: string | null
          name?: string | null
          outcome_class?: string | null
          pumpfun_complete?: boolean | null
          pumpfun_market_cap_usd?: number | null
          scraped_at?: string
          ticker?: string | null
          token_mint: string
          updated_at?: string
        }
        Update: {
          ai_used?: boolean | null
          cause_class?: string | null
          cause_confidence?: number | null
          cause_evidence?: Json | null
          classified_at?: string | null
          created_at?: string
          created_at_chain?: string | null
          dev_wallet?: string
          id?: string
          image_url?: string | null
          last_trade_at?: string | null
          launchpad?: string | null
          name?: string | null
          outcome_class?: string | null
          pumpfun_complete?: boolean | null
          pumpfun_market_cap_usd?: number | null
          scraped_at?: string
          ticker?: string | null
          token_mint?: string
          updated_at?: string
        }
        Relationships: []
      }
      dev_track_record_summary: {
        Row: {
          ai_interpretation: string | null
          best_token_ath_usd: number | null
          best_token_mint: string | null
          best_token_ticker: string | null
          bundle_rugs: number
          by_cause: Json
          by_outcome: Json
          classified_tokens: number
          community_collapses: number
          created_at: string
          dev_abandoneds: number
          dev_wallet: string
          flash_hits: number
          hard_rugs: number
          inexperience_fails: number
          intent_index: number | null
          last_classified_at: string | null
          last_full_scrape_at: string | null
          last_recomputed_at: string
          luck_index: number | null
          marketed_memes: number
          skill_builds: number
          skill_index: number | null
          slow_bleeds: number
          sustained_hits: number
          total_tokens: number
          verdict_label: string | null
          verdict_one_liner: string | null
          viral_memes: number
        }
        Insert: {
          ai_interpretation?: string | null
          best_token_ath_usd?: number | null
          best_token_mint?: string | null
          best_token_ticker?: string | null
          bundle_rugs?: number
          by_cause?: Json
          by_outcome?: Json
          classified_tokens?: number
          community_collapses?: number
          created_at?: string
          dev_abandoneds?: number
          dev_wallet: string
          flash_hits?: number
          hard_rugs?: number
          inexperience_fails?: number
          intent_index?: number | null
          last_classified_at?: string | null
          last_full_scrape_at?: string | null
          last_recomputed_at?: string
          luck_index?: number | null
          marketed_memes?: number
          skill_builds?: number
          skill_index?: number | null
          slow_bleeds?: number
          sustained_hits?: number
          total_tokens?: number
          verdict_label?: string | null
          verdict_one_liner?: string | null
          viral_memes?: number
        }
        Update: {
          ai_interpretation?: string | null
          best_token_ath_usd?: number | null
          best_token_mint?: string | null
          best_token_ticker?: string | null
          bundle_rugs?: number
          by_cause?: Json
          by_outcome?: Json
          classified_tokens?: number
          community_collapses?: number
          created_at?: string
          dev_abandoneds?: number
          dev_wallet?: string
          flash_hits?: number
          hard_rugs?: number
          inexperience_fails?: number
          intent_index?: number | null
          last_classified_at?: string | null
          last_full_scrape_at?: string | null
          last_recomputed_at?: string
          luck_index?: number | null
          marketed_memes?: number
          skill_builds?: number
          skill_index?: number | null
          slow_bleeds?: number
          sustained_hits?: number
          total_tokens?: number
          verdict_label?: string | null
          verdict_one_liner?: string | null
          viral_memes?: number
        }
        Relationships: []
      }
      dev_wallet_reputation: {
        Row: {
          auto_blacklisted: boolean | null
          auto_blacklisted_at: string | null
          avg_dump_then_pump_pct: number | null
          avg_insider_pct: number | null
          avg_peak_mcap_usd: number | null
          avg_time_before_dump_mins: number | null
          avg_token_lifespan_mins: number | null
          created_at: string
          dev_pattern: string | null
          discord_servers: string[] | null
          downstream_wallets: string[] | null
          fantasy_loss_count: number | null
          fantasy_win_count: number | null
          first_seen_at: string | null
          id: string
          is_legitimate_builder: boolean | null
          is_serial_spammer: boolean | null
          is_test_launcher: boolean | null
          known_aliases: string[] | null
          kolscan_checked_at: string | null
          kolscan_handle: string | null
          last_activity_at: string | null
          last_analyzed_at: string | null
          last_fantasy_loss_at: string | null
          last_fantasy_win_at: string | null
          launches_new_while_active: boolean | null
          linked_wallets: string[] | null
          metadata: Json | null
          notes: string | null
          pattern_buyback_dev: number | null
          pattern_diamond_dev: number | null
          pattern_hidden_whale: number | null
          pattern_spike_kill: number | null
          pattern_wallet_washer: number | null
          pattern_wash_bundler: number | null
          preferred_dump_window_mins: number | null
          reputation_score: number | null
          success_rate_pct: number | null
          telegram_groups: string[] | null
          tokens_abandoned: number | null
          tokens_graduated: number | null
          tokens_rugged: number | null
          tokens_stable_after_dump: number | null
          tokens_successful: number | null
          total_same_name_tokens: number | null
          total_tokens_launched: number | null
          trail_end_at: string | null
          trail_end_kyc_root: string | null
          trail_end_reason: string | null
          trust_level: string | null
          twitter_accounts: string[] | null
          typical_sell_percentage: number | null
          updated_at: string
          upstream_wallets: string[] | null
          wallet_address: string
        }
        Insert: {
          auto_blacklisted?: boolean | null
          auto_blacklisted_at?: string | null
          avg_dump_then_pump_pct?: number | null
          avg_insider_pct?: number | null
          avg_peak_mcap_usd?: number | null
          avg_time_before_dump_mins?: number | null
          avg_token_lifespan_mins?: number | null
          created_at?: string
          dev_pattern?: string | null
          discord_servers?: string[] | null
          downstream_wallets?: string[] | null
          fantasy_loss_count?: number | null
          fantasy_win_count?: number | null
          first_seen_at?: string | null
          id?: string
          is_legitimate_builder?: boolean | null
          is_serial_spammer?: boolean | null
          is_test_launcher?: boolean | null
          known_aliases?: string[] | null
          kolscan_checked_at?: string | null
          kolscan_handle?: string | null
          last_activity_at?: string | null
          last_analyzed_at?: string | null
          last_fantasy_loss_at?: string | null
          last_fantasy_win_at?: string | null
          launches_new_while_active?: boolean | null
          linked_wallets?: string[] | null
          metadata?: Json | null
          notes?: string | null
          pattern_buyback_dev?: number | null
          pattern_diamond_dev?: number | null
          pattern_hidden_whale?: number | null
          pattern_spike_kill?: number | null
          pattern_wallet_washer?: number | null
          pattern_wash_bundler?: number | null
          preferred_dump_window_mins?: number | null
          reputation_score?: number | null
          success_rate_pct?: number | null
          telegram_groups?: string[] | null
          tokens_abandoned?: number | null
          tokens_graduated?: number | null
          tokens_rugged?: number | null
          tokens_stable_after_dump?: number | null
          tokens_successful?: number | null
          total_same_name_tokens?: number | null
          total_tokens_launched?: number | null
          trail_end_at?: string | null
          trail_end_kyc_root?: string | null
          trail_end_reason?: string | null
          trust_level?: string | null
          twitter_accounts?: string[] | null
          typical_sell_percentage?: number | null
          updated_at?: string
          upstream_wallets?: string[] | null
          wallet_address: string
        }
        Update: {
          auto_blacklisted?: boolean | null
          auto_blacklisted_at?: string | null
          avg_dump_then_pump_pct?: number | null
          avg_insider_pct?: number | null
          avg_peak_mcap_usd?: number | null
          avg_time_before_dump_mins?: number | null
          avg_token_lifespan_mins?: number | null
          created_at?: string
          dev_pattern?: string | null
          discord_servers?: string[] | null
          downstream_wallets?: string[] | null
          fantasy_loss_count?: number | null
          fantasy_win_count?: number | null
          first_seen_at?: string | null
          id?: string
          is_legitimate_builder?: boolean | null
          is_serial_spammer?: boolean | null
          is_test_launcher?: boolean | null
          known_aliases?: string[] | null
          kolscan_checked_at?: string | null
          kolscan_handle?: string | null
          last_activity_at?: string | null
          last_analyzed_at?: string | null
          last_fantasy_loss_at?: string | null
          last_fantasy_win_at?: string | null
          launches_new_while_active?: boolean | null
          linked_wallets?: string[] | null
          metadata?: Json | null
          notes?: string | null
          pattern_buyback_dev?: number | null
          pattern_diamond_dev?: number | null
          pattern_hidden_whale?: number | null
          pattern_spike_kill?: number | null
          pattern_wallet_washer?: number | null
          pattern_wash_bundler?: number | null
          preferred_dump_window_mins?: number | null
          reputation_score?: number | null
          success_rate_pct?: number | null
          telegram_groups?: string[] | null
          tokens_abandoned?: number | null
          tokens_graduated?: number | null
          tokens_rugged?: number | null
          tokens_stable_after_dump?: number | null
          tokens_successful?: number | null
          total_same_name_tokens?: number | null
          total_tokens_launched?: number | null
          trail_end_at?: string | null
          trail_end_kyc_root?: string | null
          trail_end_reason?: string | null
          trust_level?: string | null
          twitter_accounts?: string[] | null
          typical_sell_percentage?: number | null
          updated_at?: string
          upstream_wallets?: string[] | null
          wallet_address?: string
        }
        Relationships: []
      }
      developer_alerts: {
        Row: {
          alert_type: string
          created_at: string
          creator_wallet: string
          developer_id: string | null
          id: string
          metadata: Json | null
          risk_level: string
          token_mint: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          creator_wallet: string
          developer_id?: string | null
          id?: string
          metadata?: Json | null
          risk_level: string
          token_mint: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          creator_wallet?: string
          developer_id?: string | null
          id?: string
          metadata?: Json | null
          risk_level?: string
          token_mint?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_alerts_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "developer_alerts_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_alerts_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      developer_analysis_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_depth: number | null
          developer_id: string | null
          error_message: string | null
          id: string
          job_type: string
          max_depth: number | null
          progress_percent: number | null
          results: Json | null
          started_at: string | null
          status: string | null
          tokens_discovered: number | null
          wallet_address: string | null
          wallets_discovered: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_depth?: number | null
          developer_id?: string | null
          error_message?: string | null
          id?: string
          job_type: string
          max_depth?: number | null
          progress_percent?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string | null
          tokens_discovered?: number | null
          wallet_address?: string | null
          wallets_discovered?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_depth?: number | null
          developer_id?: string | null
          error_message?: string | null
          id?: string
          job_type?: string
          max_depth?: number | null
          progress_percent?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string | null
          tokens_discovered?: number | null
          wallet_address?: string | null
          wallets_discovered?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "developer_analysis_jobs_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "developer_analysis_jobs_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_analysis_jobs_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      developer_mint_alerts: {
        Row: {
          alert_level: string
          alert_sent_at: string | null
          alert_type: string
          created_at: string
          creator_wallet: string
          developer_id: string | null
          email_sent: boolean | null
          id: string
          launchpad: string | null
          metadata: Json | null
          notified_users: string[] | null
          telegram_sent: boolean | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
        }
        Insert: {
          alert_level?: string
          alert_sent_at?: string | null
          alert_type: string
          created_at?: string
          creator_wallet: string
          developer_id?: string | null
          email_sent?: boolean | null
          id?: string
          launchpad?: string | null
          metadata?: Json | null
          notified_users?: string[] | null
          telegram_sent?: boolean | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
        }
        Update: {
          alert_level?: string
          alert_sent_at?: string | null
          alert_type?: string
          created_at?: string
          creator_wallet?: string
          developer_id?: string | null
          email_sent?: boolean | null
          id?: string
          launchpad?: string | null
          metadata?: Json | null
          notified_users?: string[] | null
          telegram_sent?: boolean | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "developer_mint_alerts_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "developer_mint_alerts_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_mint_alerts_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      developer_profiles: {
        Row: {
          average_token_lifespan_days: number | null
          avg_hold_time_hours: number | null
          avg_time_in_rankings_hours: number | null
          avg_token_rank_achieved: number | null
          blacklist_reason: string | null
          bundled_wallet_count: number | null
          created_at: string | null
          discord_handle: string | null
          display_name: string | null
          failed_tokens: number | null
          id: string
          integrity_score: number | null
          kyc_last_checked_at: string | null
          kyc_root_label: string | null
          kyc_root_wallet: string | null
          kyc_source: string | null
          kyc_source_type: string | null
          kyc_trail_status: string | null
          kyc_verification_date: string | null
          kyc_verified: boolean | null
          last_analysis_at: string | null
          master_wallet_address: string
          merged_at: string | null
          merged_into: string | null
          metadata: Json | null
          notes: string | null
          quick_dump_count: number | null
          reputation_score: number | null
          rug_pull_count: number | null
          slow_drain_count: number | null
          source: string | null
          successful_tokens: number | null
          tags: string[] | null
          telegram_handle: string | null
          tokens_in_top_10_count: number | null
          tokens_in_top_200_count: number | null
          tokens_in_top_50_count: number | null
          total_tokens_created: number | null
          total_volume_generated: number | null
          trust_level: string | null
          twitter_handle: string | null
          updated_at: string | null
          wash_trading_detected: boolean | null
          website_url: string | null
        }
        Insert: {
          average_token_lifespan_days?: number | null
          avg_hold_time_hours?: number | null
          avg_time_in_rankings_hours?: number | null
          avg_token_rank_achieved?: number | null
          blacklist_reason?: string | null
          bundled_wallet_count?: number | null
          created_at?: string | null
          discord_handle?: string | null
          display_name?: string | null
          failed_tokens?: number | null
          id?: string
          integrity_score?: number | null
          kyc_last_checked_at?: string | null
          kyc_root_label?: string | null
          kyc_root_wallet?: string | null
          kyc_source?: string | null
          kyc_source_type?: string | null
          kyc_trail_status?: string | null
          kyc_verification_date?: string | null
          kyc_verified?: boolean | null
          last_analysis_at?: string | null
          master_wallet_address: string
          merged_at?: string | null
          merged_into?: string | null
          metadata?: Json | null
          notes?: string | null
          quick_dump_count?: number | null
          reputation_score?: number | null
          rug_pull_count?: number | null
          slow_drain_count?: number | null
          source?: string | null
          successful_tokens?: number | null
          tags?: string[] | null
          telegram_handle?: string | null
          tokens_in_top_10_count?: number | null
          tokens_in_top_200_count?: number | null
          tokens_in_top_50_count?: number | null
          total_tokens_created?: number | null
          total_volume_generated?: number | null
          trust_level?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          wash_trading_detected?: boolean | null
          website_url?: string | null
        }
        Update: {
          average_token_lifespan_days?: number | null
          avg_hold_time_hours?: number | null
          avg_time_in_rankings_hours?: number | null
          avg_token_rank_achieved?: number | null
          blacklist_reason?: string | null
          bundled_wallet_count?: number | null
          created_at?: string | null
          discord_handle?: string | null
          display_name?: string | null
          failed_tokens?: number | null
          id?: string
          integrity_score?: number | null
          kyc_last_checked_at?: string | null
          kyc_root_label?: string | null
          kyc_root_wallet?: string | null
          kyc_source?: string | null
          kyc_source_type?: string | null
          kyc_trail_status?: string | null
          kyc_verification_date?: string | null
          kyc_verified?: boolean | null
          last_analysis_at?: string | null
          master_wallet_address?: string
          merged_at?: string | null
          merged_into?: string | null
          metadata?: Json | null
          notes?: string | null
          quick_dump_count?: number | null
          reputation_score?: number | null
          rug_pull_count?: number | null
          slow_drain_count?: number | null
          source?: string | null
          successful_tokens?: number | null
          tags?: string[] | null
          telegram_handle?: string | null
          tokens_in_top_10_count?: number | null
          tokens_in_top_200_count?: number | null
          tokens_in_top_50_count?: number | null
          total_tokens_created?: number | null
          total_volume_generated?: number | null
          trust_level?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
          wash_trading_detected?: boolean | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "developer_profiles_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "developer_profiles_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_profiles_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      developer_tokens: {
        Row: {
          created_at: string | null
          creator_wallet: string
          current_market_cap_usd: number | null
          death_date: string | null
          developer_id: string
          flipit_position_id: string | null
          freeze_authority_revoked: boolean | null
          funding_wallet: string | null
          holder_count: number | null
          id: string
          is_active: boolean | null
          launch_date: string | null
          launchpad: string | null
          lifespan_days: number | null
          liquidity_lock_duration_days: number | null
          liquidity_locked: boolean | null
          mint_authority_revoked: boolean | null
          notes: string | null
          outcome: string | null
          peak_market_cap_usd: number | null
          performance_score: number | null
          rug_pull_evidence: Json | null
          token_mint: string
          total_volume_usd: number | null
          transaction_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          creator_wallet: string
          current_market_cap_usd?: number | null
          death_date?: string | null
          developer_id: string
          flipit_position_id?: string | null
          freeze_authority_revoked?: boolean | null
          funding_wallet?: string | null
          holder_count?: number | null
          id?: string
          is_active?: boolean | null
          launch_date?: string | null
          launchpad?: string | null
          lifespan_days?: number | null
          liquidity_lock_duration_days?: number | null
          liquidity_locked?: boolean | null
          mint_authority_revoked?: boolean | null
          notes?: string | null
          outcome?: string | null
          peak_market_cap_usd?: number | null
          performance_score?: number | null
          rug_pull_evidence?: Json | null
          token_mint: string
          total_volume_usd?: number | null
          transaction_count?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          creator_wallet?: string
          current_market_cap_usd?: number | null
          death_date?: string | null
          developer_id?: string
          flipit_position_id?: string | null
          freeze_authority_revoked?: boolean | null
          funding_wallet?: string | null
          holder_count?: number | null
          id?: string
          is_active?: boolean | null
          launch_date?: string | null
          launchpad?: string | null
          lifespan_days?: number | null
          liquidity_lock_duration_days?: number | null
          liquidity_locked?: boolean | null
          mint_authority_revoked?: boolean | null
          notes?: string | null
          outcome?: string | null
          peak_market_cap_usd?: number | null
          performance_score?: number | null
          rug_pull_evidence?: Json | null
          token_mint?: string
          total_volume_usd?: number | null
          transaction_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "developer_tokens_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "developer_tokens_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_tokens_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      developer_wallets: {
        Row: {
          created_at: string | null
          depth_level: number | null
          developer_id: string
          first_seen_at: string | null
          id: string
          last_active_at: string | null
          last_scanned_at: string | null
          launchpad_detected: string | null
          parent_wallet_address: string | null
          total_sol_received: number | null
          total_sol_sent: number | null
          transaction_count: number | null
          wallet_address: string
          wallet_type: string
        }
        Insert: {
          created_at?: string | null
          depth_level?: number | null
          developer_id: string
          first_seen_at?: string | null
          id?: string
          last_active_at?: string | null
          last_scanned_at?: string | null
          launchpad_detected?: string | null
          parent_wallet_address?: string | null
          total_sol_received?: number | null
          total_sol_sent?: number | null
          transaction_count?: number | null
          wallet_address: string
          wallet_type: string
        }
        Update: {
          created_at?: string | null
          depth_level?: number | null
          developer_id?: string
          first_seen_at?: string | null
          id?: string
          last_active_at?: string | null
          last_scanned_at?: string | null
          launchpad_detected?: string | null
          parent_wallet_address?: string | null
          total_sol_received?: number | null
          total_sol_sent?: number | null
          transaction_count?: number | null
          wallet_address?: string
          wallet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_wallets_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "developer_wallets_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_wallets_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      development_ideas: {
        Row: {
          category: string
          completed_at: string | null
          created_at: string | null
          description: string
          estimated_effort: string | null
          id: string
          notes: string | null
          priority: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          completed_at?: string | null
          created_at?: string | null
          description: string
          estimated_effort?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string
          estimated_effort?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      dex_scrape_config: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      dex_scrape_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          pair_count: number
          provider: string | null
          source_id: string | null
          source_label: string | null
          source_url: string
          success: boolean
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          pair_count?: number
          provider?: string | null
          source_id?: string | null
          source_label?: string | null
          source_url: string
          success?: boolean
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          pair_count?: number
          provider?: string | null
          source_id?: string | null
          source_label?: string | null
          source_url?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dex_scrape_log_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "dex_scrape_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      dex_scrape_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_page2: boolean
          label: string
          last_pair_count: number | null
          last_scraped_at: string | null
          sort_order: number
          updated_at: string
          url: string
          wait_ms: number[]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_page2?: boolean
          label?: string
          last_pair_count?: number | null
          last_scraped_at?: string | null
          sort_order?: number
          updated_at?: string
          url: string
          wait_ms?: number[]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_page2?: boolean
          label?: string
          last_pair_count?: number | null
          last_scraped_at?: string | null
          sort_order?: number
          updated_at?: string
          url?: string
          wait_ms?: number[]
        }
        Relationships: []
      }
      edge_function_registry: {
        Row: {
          category: string | null
          created_at: string | null
          data_in: string | null
          data_out: string | null
          description: string | null
          function_name: string
          is_active: boolean | null
          priority_tier: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          data_in?: string | null
          data_out?: string | null
          description?: string | null
          function_name: string
          is_active?: boolean | null
          priority_tier?: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          data_in?: string | null
          data_out?: string | null
          description?: string | null
          function_name?: string
          is_active?: boolean | null
          priority_tier?: string
        }
        Relationships: []
      }
      edge_function_runs: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          function_name: string
          id: string
          invocation_source: string | null
          metadata: Json | null
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          function_name: string
          id?: string
          invocation_source?: string | null
          metadata?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          function_name?: string
          id?: string
          invocation_source?: string | null
          metadata?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          created_at: string
          id: string
          marketing: boolean
          product_updates: boolean
          updated_at: string
          user_id: string
          weekly_digest: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          marketing?: boolean
          product_updates?: boolean
          updated_at?: string
          user_id: string
          weekly_digest?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          marketing?: boolean
          product_updates?: boolean
          updated_at?: string
          user_id?: string
          weekly_digest?: boolean
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          display_name: string
          html_body: string
          id: string
          is_active: boolean
          subject: string
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          html_body?: string
          id?: string
          is_active?: boolean
          subject?: string
          template_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          html_body?: string
          id?: string
          is_active?: boolean
          subject?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_tracking_events: {
        Row: {
          click_count: number
          clicked_at: string | null
          created_at: string
          email_type: string
          id: string
          metadata: Json | null
          open_count: number
          opened_at: string | null
          recipient_email: string
          sent_at: string
          subject_line: string | null
          tracking_id: string
          user_id: string | null
        }
        Insert: {
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          email_type: string
          id?: string
          metadata?: Json | null
          open_count?: number
          opened_at?: string | null
          recipient_email: string
          sent_at?: string
          subject_line?: string | null
          tracking_id: string
          user_id?: string | null
        }
        Update: {
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          email_type?: string
          id?: string
          metadata?: Json | null
          open_count?: number
          opened_at?: string | null
          recipient_email?: string
          sent_at?: string
          subject_line?: string | null
          tracking_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_verifications: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          sent_at: string
          user_id: string
          verification_token: string
          verification_type: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          sent_at?: string
          user_id: string
          verification_token: string
          verification_type?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          sent_at?: string
          user_id?: string
          verification_token?: string
          verification_type?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      emergency_sells: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          limit_price: number
          session_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          limit_price: number
          session_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          limit_price?: number
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_sells_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trading_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      error_trend_snapshot: {
        Row: {
          avg_7d_error_count: number | null
          created_at: string | null
          endpoint: string | null
          error_count: number | null
          id: string
          is_anomaly: boolean | null
          service_name: string
          snapshot_date: string
          status_401_count: number | null
          status_403_count: number | null
          status_429_count: number | null
          status_500_count: number | null
        }
        Insert: {
          avg_7d_error_count?: number | null
          created_at?: string | null
          endpoint?: string | null
          error_count?: number | null
          id?: string
          is_anomaly?: boolean | null
          service_name: string
          snapshot_date?: string
          status_401_count?: number | null
          status_403_count?: number | null
          status_429_count?: number | null
          status_500_count?: number | null
        }
        Update: {
          avg_7d_error_count?: number | null
          created_at?: string | null
          endpoint?: string | null
          error_count?: number | null
          id?: string
          is_anomaly?: boolean | null
          service_name?: string
          snapshot_date?: string
          status_401_count?: number | null
          status_403_count?: number | null
          status_429_count?: number | null
          status_500_count?: number | null
        }
        Relationships: []
      }
      fantasy_positions: {
        Row: {
          average_buy_price: number | null
          balance: number
          created_at: string
          current_value_usd: number | null
          fantasy_wallet_id: string
          first_purchase_at: string | null
          id: string
          last_transaction_at: string
          profit_loss_percentage: number | null
          profit_loss_usd: number | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          total_invested_usd: number
          updated_at: string
        }
        Insert: {
          average_buy_price?: number | null
          balance?: number
          created_at?: string
          current_value_usd?: number | null
          fantasy_wallet_id: string
          first_purchase_at?: string | null
          id?: string
          last_transaction_at?: string
          profit_loss_percentage?: number | null
          profit_loss_usd?: number | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          total_invested_usd?: number
          updated_at?: string
        }
        Update: {
          average_buy_price?: number | null
          balance?: number
          created_at?: string
          current_value_usd?: number | null
          fantasy_wallet_id?: string
          first_purchase_at?: string | null
          id?: string
          last_transaction_at?: string
          profit_loss_percentage?: number | null
          profit_loss_usd?: number | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          total_invested_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_positions_fantasy_wallet_id_fkey"
            columns: ["fantasy_wallet_id"]
            isOneToOne: false
            referencedRelation: "fantasy_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_trades: {
        Row: {
          created_at: string
          current_price_sol: number | null
          entry_amount_sol: number
          entry_price_sol: number
          entry_timestamp: string
          exit_price_sol: number | null
          exit_timestamp: string | null
          frenzy_event_id: string | null
          id: string
          status: string
          token_mint: string
          token_symbol: string | null
          unrealized_pnl_percent: number | null
          unrealized_pnl_sol: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_price_sol?: number | null
          entry_amount_sol?: number
          entry_price_sol: number
          entry_timestamp?: string
          exit_price_sol?: number | null
          exit_timestamp?: string | null
          frenzy_event_id?: string | null
          id?: string
          status?: string
          token_mint: string
          token_symbol?: string | null
          unrealized_pnl_percent?: number | null
          unrealized_pnl_sol?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_price_sol?: number | null
          entry_amount_sol?: number
          entry_price_sol?: number
          entry_timestamp?: string
          exit_price_sol?: number | null
          exit_timestamp?: string | null
          frenzy_event_id?: string | null
          id?: string
          status?: string
          token_mint?: string
          token_symbol?: string | null
          unrealized_pnl_percent?: number | null
          unrealized_pnl_sol?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_trades_frenzy_event_id_fkey"
            columns: ["frenzy_event_id"]
            isOneToOne: false
            referencedRelation: "whale_frenzy_events"
            referencedColumns: ["id"]
          },
        ]
      }
      fantasy_tweet_templates: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          post_to_community: boolean
          post_to_main_feed: boolean
          template_text: string
          template_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          post_to_community?: boolean
          post_to_main_feed?: boolean
          template_text: string
          template_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          post_to_community?: boolean
          post_to_main_feed?: boolean
          template_text?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      fantasy_wallets: {
        Row: {
          balance_usd: number
          created_at: string
          id: string
          total_invested: number
          total_profit_loss: number
          total_trades: number
          updated_at: string
          user_id: string
          win_rate: number | null
        }
        Insert: {
          balance_usd?: number
          created_at?: string
          id?: string
          total_invested?: number
          total_profit_loss?: number
          total_trades?: number
          updated_at?: string
          user_id: string
          win_rate?: number | null
        }
        Update: {
          balance_usd?: number
          created_at?: string
          id?: string
          total_invested?: number
          total_profit_loss?: number
          total_trades?: number
          updated_at?: string
          user_id?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      feature_suspensions: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          lifted_at: string | null
          lifted_by: string | null
          notes: string | null
          reason: string
          related_toggle_key: string | null
          related_toggle_table: string | null
          scope: string
          suspended_at: string
          suspended_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          notes?: string | null
          reason: string
          related_toggle_key?: string | null
          related_toggle_table?: string | null
          scope?: string
          suspended_at?: string
          suspended_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          notes?: string | null
          reason?: string
          related_toggle_key?: string | null
          related_toggle_table?: string | null
          scope?: string
          suspended_at?: string
          suspended_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      feature_usage_analytics: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          feature_name: string
          id: string
          metadata: Json | null
          session_id: string | null
          token_mint: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          feature_name: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          token_mint?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          feature_name?: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          token_mint?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      flip_limit_orders: {
        Row: {
          alert_only: boolean
          buy_amount_sol: number
          buy_price_max_usd: number
          buy_price_min_usd: number
          cancelled_at: string | null
          created_at: string
          executed_at: string | null
          executed_position_id: string | null
          expires_at: string
          id: string
          monitoring_mode: string
          notification_email: string | null
          notify_telegram_group: boolean
          priority_fee_mode: string
          slippage_bps: number
          status: string
          target_multiplier: number
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          updated_at: string
          user_id: string | null
          volume_direction: string | null
          volume_trigger_delta: number | null
          wallet_id: string | null
        }
        Insert: {
          alert_only?: boolean
          buy_amount_sol: number
          buy_price_max_usd: number
          buy_price_min_usd: number
          cancelled_at?: string | null
          created_at?: string
          executed_at?: string | null
          executed_position_id?: string | null
          expires_at: string
          id?: string
          monitoring_mode?: string
          notification_email?: string | null
          notify_telegram_group?: boolean
          priority_fee_mode?: string
          slippage_bps?: number
          status?: string
          target_multiplier?: number
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
          user_id?: string | null
          volume_direction?: string | null
          volume_trigger_delta?: number | null
          wallet_id?: string | null
        }
        Update: {
          alert_only?: boolean
          buy_amount_sol?: number
          buy_price_max_usd?: number
          buy_price_min_usd?: number
          cancelled_at?: string | null
          created_at?: string
          executed_at?: string | null
          executed_position_id?: string | null
          expires_at?: string
          id?: string
          monitoring_mode?: string
          notification_email?: string | null
          notify_telegram_group?: boolean
          priority_fee_mode?: string
          slippage_bps?: number
          status?: string
          target_multiplier?: number
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
          user_id?: string | null
          volume_direction?: string | null
          volume_trigger_delta?: number | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flip_limit_orders_executed_position_id_fkey"
            columns: ["executed_position_id"]
            isOneToOne: false
            referencedRelation: "flip_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      flip_positions: {
        Row: {
          bonding_curve_progress: number | null
          buy_amount_sol: number | null
          buy_amount_usd: number | null
          buy_executed_at: string | null
          buy_fee_sol: number | null
          buy_price_usd: number | null
          buy_signature: string | null
          created_at: string | null
          creator_wallet: string | null
          dev_trust_rating: string | null
          dex_paid_status: Json | null
          diamond_max_hold_hours: number | null
          diamond_min_peak_x: number | null
          diamond_peak_multiplier: number | null
          diamond_trailing_active: boolean | null
          diamond_trailing_stop_pct: number | null
          emergency_sell_enabled: boolean | null
          emergency_sell_executed_at: string | null
          emergency_sell_price_usd: number | null
          emergency_sell_status: string | null
          entry_verified: boolean | null
          entry_verified_at: string | null
          error_code: string | null
          error_message: string | null
          flipit_moonbag_sell_pct: number | null
          ghost_position: boolean
          graduation_sell_armed_at: string | null
          graduation_sell_arming_price_usd: number | null
          graduation_sell_enabled: boolean
          graduation_sell_executed_at: string | null
          graduation_sell_jito_tip_lamports: number | null
          graduation_sell_last_eval_at: string | null
          graduation_sell_max_capture_pct: number
          graduation_sell_min_capture_pct: number
          graduation_sell_moonbag_pct: number
          graduation_sell_moonbag_qty_tokens: number | null
          graduation_sell_peak_price_usd: number | null
          graduation_sell_priority_fee_micro_lamports: number | null
          graduation_sell_priority_fee_mode: string | null
          graduation_sell_slippage_bps: number
          graduation_sell_sold_pct: number | null
          graduation_sell_status: string
          graduation_sell_trail_drop_pct: number
          graduation_sell_trigger_pct: number
          id: string
          is_diamond_hand: boolean | null
          is_on_curve: boolean | null
          is_scalp_position: boolean | null
          is_test_position: boolean | null
          last_chain_sync_at: string | null
          lp_pool_address: string | null
          lp_withdrawal_signature: string | null
          moon_bag_dump_threshold_pct: number | null
          moon_bag_enabled: boolean | null
          moon_bag_peak_change_pct: number | null
          moon_bag_peak_price_usd: number | null
          moon_bag_percent: number | null
          moon_bag_quantity_tokens: number | null
          needs_reconciliation: boolean
          original_quantity_tokens: number | null
          paired_position_id: string | null
          partial_sells: Json | null
          position_group_id: string | null
          position_source: string
          position_type: string | null
          price_fetched_at: string | null
          price_source: string | null
          profit_usd: number | null
          quantity_tokens: number | null
          quantity_tokens_raw: string | null
          rebuy_amount_usd: number | null
          rebuy_enabled: boolean | null
          rebuy_executed_at: string | null
          rebuy_loop_enabled: boolean | null
          rebuy_position_id: string | null
          rebuy_price_high_usd: number | null
          rebuy_price_low_usd: number | null
          rebuy_price_usd: number | null
          rebuy_status: string | null
          rebuy_target_multiplier: number | null
          scalp_moon_bag_pct: number | null
          scalp_stage: string | null
          scalp_stop_loss_pct: number | null
          scalp_take_profit_pct: number | null
          sell_executed_at: string | null
          sell_group_id: string | null
          sell_price_usd: number | null
          sell_priority_fee_sol: number | null
          sell_signature: string | null
          source: string | null
          source_channel_id: string | null
          status: string | null
          target_multiplier: number | null
          target_price_usd: number | null
          telegram_url: string | null
          token_decimals: number | null
          token_image: string | null
          token_mint: string
          token_name: string | null
          token_program: string | null
          token_symbol: string | null
          tracking_locked: boolean | null
          twitter_url: string | null
          updated_at: string | null
          user_id: string | null
          wallet_id: string | null
          website_url: string | null
        }
        Insert: {
          bonding_curve_progress?: number | null
          buy_amount_sol?: number | null
          buy_amount_usd?: number | null
          buy_executed_at?: string | null
          buy_fee_sol?: number | null
          buy_price_usd?: number | null
          buy_signature?: string | null
          created_at?: string | null
          creator_wallet?: string | null
          dev_trust_rating?: string | null
          dex_paid_status?: Json | null
          diamond_max_hold_hours?: number | null
          diamond_min_peak_x?: number | null
          diamond_peak_multiplier?: number | null
          diamond_trailing_active?: boolean | null
          diamond_trailing_stop_pct?: number | null
          emergency_sell_enabled?: boolean | null
          emergency_sell_executed_at?: string | null
          emergency_sell_price_usd?: number | null
          emergency_sell_status?: string | null
          entry_verified?: boolean | null
          entry_verified_at?: string | null
          error_code?: string | null
          error_message?: string | null
          flipit_moonbag_sell_pct?: number | null
          ghost_position?: boolean
          graduation_sell_armed_at?: string | null
          graduation_sell_arming_price_usd?: number | null
          graduation_sell_enabled?: boolean
          graduation_sell_executed_at?: string | null
          graduation_sell_jito_tip_lamports?: number | null
          graduation_sell_last_eval_at?: string | null
          graduation_sell_max_capture_pct?: number
          graduation_sell_min_capture_pct?: number
          graduation_sell_moonbag_pct?: number
          graduation_sell_moonbag_qty_tokens?: number | null
          graduation_sell_peak_price_usd?: number | null
          graduation_sell_priority_fee_micro_lamports?: number | null
          graduation_sell_priority_fee_mode?: string | null
          graduation_sell_slippage_bps?: number
          graduation_sell_sold_pct?: number | null
          graduation_sell_status?: string
          graduation_sell_trail_drop_pct?: number
          graduation_sell_trigger_pct?: number
          id?: string
          is_diamond_hand?: boolean | null
          is_on_curve?: boolean | null
          is_scalp_position?: boolean | null
          is_test_position?: boolean | null
          last_chain_sync_at?: string | null
          lp_pool_address?: string | null
          lp_withdrawal_signature?: string | null
          moon_bag_dump_threshold_pct?: number | null
          moon_bag_enabled?: boolean | null
          moon_bag_peak_change_pct?: number | null
          moon_bag_peak_price_usd?: number | null
          moon_bag_percent?: number | null
          moon_bag_quantity_tokens?: number | null
          needs_reconciliation?: boolean
          original_quantity_tokens?: number | null
          paired_position_id?: string | null
          partial_sells?: Json | null
          position_group_id?: string | null
          position_source?: string
          position_type?: string | null
          price_fetched_at?: string | null
          price_source?: string | null
          profit_usd?: number | null
          quantity_tokens?: number | null
          quantity_tokens_raw?: string | null
          rebuy_amount_usd?: number | null
          rebuy_enabled?: boolean | null
          rebuy_executed_at?: string | null
          rebuy_loop_enabled?: boolean | null
          rebuy_position_id?: string | null
          rebuy_price_high_usd?: number | null
          rebuy_price_low_usd?: number | null
          rebuy_price_usd?: number | null
          rebuy_status?: string | null
          rebuy_target_multiplier?: number | null
          scalp_moon_bag_pct?: number | null
          scalp_stage?: string | null
          scalp_stop_loss_pct?: number | null
          scalp_take_profit_pct?: number | null
          sell_executed_at?: string | null
          sell_group_id?: string | null
          sell_price_usd?: number | null
          sell_priority_fee_sol?: number | null
          sell_signature?: string | null
          source?: string | null
          source_channel_id?: string | null
          status?: string | null
          target_multiplier?: number | null
          target_price_usd?: number | null
          telegram_url?: string | null
          token_decimals?: number | null
          token_image?: string | null
          token_mint: string
          token_name?: string | null
          token_program?: string | null
          token_symbol?: string | null
          tracking_locked?: boolean | null
          twitter_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          wallet_id?: string | null
          website_url?: string | null
        }
        Update: {
          bonding_curve_progress?: number | null
          buy_amount_sol?: number | null
          buy_amount_usd?: number | null
          buy_executed_at?: string | null
          buy_fee_sol?: number | null
          buy_price_usd?: number | null
          buy_signature?: string | null
          created_at?: string | null
          creator_wallet?: string | null
          dev_trust_rating?: string | null
          dex_paid_status?: Json | null
          diamond_max_hold_hours?: number | null
          diamond_min_peak_x?: number | null
          diamond_peak_multiplier?: number | null
          diamond_trailing_active?: boolean | null
          diamond_trailing_stop_pct?: number | null
          emergency_sell_enabled?: boolean | null
          emergency_sell_executed_at?: string | null
          emergency_sell_price_usd?: number | null
          emergency_sell_status?: string | null
          entry_verified?: boolean | null
          entry_verified_at?: string | null
          error_code?: string | null
          error_message?: string | null
          flipit_moonbag_sell_pct?: number | null
          ghost_position?: boolean
          graduation_sell_armed_at?: string | null
          graduation_sell_arming_price_usd?: number | null
          graduation_sell_enabled?: boolean
          graduation_sell_executed_at?: string | null
          graduation_sell_jito_tip_lamports?: number | null
          graduation_sell_last_eval_at?: string | null
          graduation_sell_max_capture_pct?: number
          graduation_sell_min_capture_pct?: number
          graduation_sell_moonbag_pct?: number
          graduation_sell_moonbag_qty_tokens?: number | null
          graduation_sell_peak_price_usd?: number | null
          graduation_sell_priority_fee_micro_lamports?: number | null
          graduation_sell_priority_fee_mode?: string | null
          graduation_sell_slippage_bps?: number
          graduation_sell_sold_pct?: number | null
          graduation_sell_status?: string
          graduation_sell_trail_drop_pct?: number
          graduation_sell_trigger_pct?: number
          id?: string
          is_diamond_hand?: boolean | null
          is_on_curve?: boolean | null
          is_scalp_position?: boolean | null
          is_test_position?: boolean | null
          last_chain_sync_at?: string | null
          lp_pool_address?: string | null
          lp_withdrawal_signature?: string | null
          moon_bag_dump_threshold_pct?: number | null
          moon_bag_enabled?: boolean | null
          moon_bag_peak_change_pct?: number | null
          moon_bag_peak_price_usd?: number | null
          moon_bag_percent?: number | null
          moon_bag_quantity_tokens?: number | null
          needs_reconciliation?: boolean
          original_quantity_tokens?: number | null
          paired_position_id?: string | null
          partial_sells?: Json | null
          position_group_id?: string | null
          position_source?: string
          position_type?: string | null
          price_fetched_at?: string | null
          price_source?: string | null
          profit_usd?: number | null
          quantity_tokens?: number | null
          quantity_tokens_raw?: string | null
          rebuy_amount_usd?: number | null
          rebuy_enabled?: boolean | null
          rebuy_executed_at?: string | null
          rebuy_loop_enabled?: boolean | null
          rebuy_position_id?: string | null
          rebuy_price_high_usd?: number | null
          rebuy_price_low_usd?: number | null
          rebuy_price_usd?: number | null
          rebuy_status?: string | null
          rebuy_target_multiplier?: number | null
          scalp_moon_bag_pct?: number | null
          scalp_stage?: string | null
          scalp_stop_loss_pct?: number | null
          scalp_take_profit_pct?: number | null
          sell_executed_at?: string | null
          sell_group_id?: string | null
          sell_price_usd?: number | null
          sell_priority_fee_sol?: number | null
          sell_signature?: string | null
          source?: string | null
          source_channel_id?: string | null
          status?: string | null
          target_multiplier?: number | null
          target_price_usd?: number | null
          telegram_url?: string | null
          token_decimals?: number | null
          token_image?: string | null
          token_mint?: string
          token_name?: string | null
          token_program?: string | null
          token_symbol?: string | null
          tracking_locked?: boolean | null
          twitter_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          wallet_id?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flip_positions_paired_position_id_fkey"
            columns: ["paired_position_id"]
            isOneToOne: false
            referencedRelation: "flip_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flip_positions_rebuy_position_id_fkey"
            columns: ["rebuy_position_id"]
            isOneToOne: false
            referencedRelation: "flip_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flip_positions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "super_admin_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      flipit_global_config: {
        Row: {
          created_at: string | null
          default_buy_amount_usd: number | null
          default_max_daily_positions: number | null
          default_sell_multiplier: number | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_buy_amount_usd?: number | null
          default_max_daily_positions?: number | null
          default_sell_multiplier?: number | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_buy_amount_usd?: number | null
          default_max_daily_positions?: number | null
          default_sell_multiplier?: number | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      flipit_notification_settings: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          notify_on_buy: boolean
          notify_on_sell: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          notify_on_buy?: boolean
          notify_on_sell?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          notify_on_buy?: boolean
          notify_on_sell?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      flipit_notification_targets: {
        Row: {
          created_at: string
          id: string
          settings_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          settings_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          settings_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flipit_notification_targets_settings_id_fkey"
            columns: ["settings_id"]
            isOneToOne: false
            referencedRelation: "flipit_notification_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flipit_notification_targets_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "telegram_message_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      flipit_settings: {
        Row: {
          block_on_high_price_impact: boolean
          block_tokens_with_tax: boolean | null
          created_at: string
          graduation_sell_jito_tip_lamports_default: number
          graduation_sell_moonbag_pct_default: number
          graduation_sell_priority_fee_micro_lamports_default: number | null
          graduation_sell_priority_fee_mode_default: string
          id: string
          jito_tip_lamports: number
          max_price_impact_pct: number
          max_price_premium_pct: number
          require_quote_check: boolean
          updated_at: string
          use_helius_verification: boolean
          use_jito_bundles: boolean
          verification_retry_count: number
          verification_retry_delay_ms: number
        }
        Insert: {
          block_on_high_price_impact?: boolean
          block_tokens_with_tax?: boolean | null
          created_at?: string
          graduation_sell_jito_tip_lamports_default?: number
          graduation_sell_moonbag_pct_default?: number
          graduation_sell_priority_fee_micro_lamports_default?: number | null
          graduation_sell_priority_fee_mode_default?: string
          id?: string
          jito_tip_lamports?: number
          max_price_impact_pct?: number
          max_price_premium_pct?: number
          require_quote_check?: boolean
          updated_at?: string
          use_helius_verification?: boolean
          use_jito_bundles?: boolean
          verification_retry_count?: number
          verification_retry_delay_ms?: number
        }
        Update: {
          block_on_high_price_impact?: boolean
          block_tokens_with_tax?: boolean | null
          created_at?: string
          graduation_sell_jito_tip_lamports_default?: number
          graduation_sell_moonbag_pct_default?: number
          graduation_sell_priority_fee_micro_lamports_default?: number | null
          graduation_sell_priority_fee_mode_default?: string
          id?: string
          jito_tip_lamports?: number
          max_price_impact_pct?: number
          max_price_premium_pct?: number
          require_quote_check?: boolean
          updated_at?: string
          use_helius_verification?: boolean
          use_jito_bundles?: boolean
          verification_retry_count?: number
          verification_retry_delay_ms?: number
        }
        Relationships: []
      }
      flipit_tweet_quota: {
        Row: {
          created_at: string | null
          date: string
          id: string
          last_tweet_at: string | null
          tweet_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          last_tweet_at?: string | null
          tweet_count?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          last_tweet_at?: string | null
          tweet_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      flipit_tweet_settings: {
        Row: {
          created_at: string | null
          daily_tweet_limit: number | null
          id: string
          min_profit_to_tweet: number | null
          skip_rebuy_tweets: boolean | null
          tweet_cooldown_minutes: number | null
          tweets_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          daily_tweet_limit?: number | null
          id?: string
          min_profit_to_tweet?: number | null
          skip_rebuy_tweets?: boolean | null
          tweet_cooldown_minutes?: number | null
          tweets_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          daily_tweet_limit?: number | null
          id?: string
          min_profit_to_tweet?: number | null
          skip_rebuy_tweets?: boolean | null
          tweet_cooldown_minutes?: number | null
          tweets_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      flipit_tweet_templates: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          template_text: string
          template_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          template_text: string
          template_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          template_text?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      follower_audits: {
        Row: {
          bot_pct: number | null
          cost_credits: number | null
          created_at: string
          follower_count: number | null
          geo_breakdown: Json | null
          handle: string
          id: string
          raw_sample: Json | null
          real_pct: number | null
          sample_size: number
          signals_summary: Json | null
          suspicious_pct: number | null
          verdict: string | null
        }
        Insert: {
          bot_pct?: number | null
          cost_credits?: number | null
          created_at?: string
          follower_count?: number | null
          geo_breakdown?: Json | null
          handle: string
          id?: string
          raw_sample?: Json | null
          real_pct?: number | null
          sample_size?: number
          signals_summary?: Json | null
          suspicious_pct?: number | null
          verdict?: string | null
        }
        Update: {
          bot_pct?: number | null
          cost_credits?: number | null
          created_at?: string
          follower_count?: number | null
          geo_breakdown?: Json | null
          handle?: string
          id?: string
          raw_sample?: Json | null
          real_pct?: number | null
          sample_size?: number
          signals_summary?: Json | null
          suspicious_pct?: number | null
          verdict?: string | null
        }
        Relationships: []
      }
      fotobomb_images: {
        Row: {
          album_name: string | null
          caption: string | null
          created_at: string | null
          facebook_photo_id: string | null
          id: string
          image_url: string
          metadata: Json | null
          posted_at: string | null
          review_status: string
          reviewed_at: string | null
          target_id: string
          thumbnail_url: string | null
        }
        Insert: {
          album_name?: string | null
          caption?: string | null
          created_at?: string | null
          facebook_photo_id?: string | null
          id?: string
          image_url: string
          metadata?: Json | null
          posted_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          target_id: string
          thumbnail_url?: string | null
        }
        Update: {
          album_name?: string | null
          caption?: string | null
          created_at?: string | null
          facebook_photo_id?: string | null
          id?: string
          image_url?: string
          metadata?: Json | null
          posted_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          target_id?: string
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fotobomb_images_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "fotobomb_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      fotobomb_targets: {
        Row: {
          apify_run_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          last_scraped_at: string | null
          page_name: string | null
          page_url: string
          status: string
          total_photos_found: number | null
          updated_at: string | null
        }
        Insert: {
          apify_run_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_scraped_at?: string | null
          page_name?: string | null
          page_url: string
          status?: string
          total_photos_found?: number | null
          updated_at?: string | null
        }
        Update: {
          apify_run_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_scraped_at?: string | null
          page_name?: string | null
          page_url?: string
          status?: string
          total_photos_found?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      fuct_gift_claims: {
        Row: {
          claim_date: string
          claimed_at: string
          created_at: string
          device_fingerprint: string
          id: string
          ip_address: string
          recipient_wallet: string
          status: string
          tx_signature: string | null
        }
        Insert: {
          claim_date?: string
          claimed_at?: string
          created_at?: string
          device_fingerprint: string
          id?: string
          ip_address: string
          recipient_wallet: string
          status?: string
          tx_signature?: string | null
        }
        Update: {
          claim_date?: string
          claimed_at?: string
          created_at?: string
          device_fingerprint?: string
          id?: string
          ip_address?: string
          recipient_wallet?: string
          status?: string
          tx_signature?: string | null
        }
        Relationships: []
      }
      function_toggles: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          disabled_at: string | null
          disabled_by: string | null
          disabled_reason: string | null
          enabled: boolean
          function_name: string
          last_skipped_at: string | null
          skip_count_24h: number
          skip_count_reset_at: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          enabled?: boolean
          function_name: string
          last_skipped_at?: string | null
          skip_count_24h?: number
          skip_count_reset_at?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          enabled?: boolean
          function_name?: string
          last_skipped_at?: string | null
          skip_count_24h?: number
          skip_count_reset_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      funnel_feed_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      funnel_feed_discoveries: {
        Row: {
          created_at: string
          creator_fetched_at: string | null
          creator_wallet: string | null
          description: string | null
          dex_data: Json | null
          discovered_at: string
          id: string
          image_url: string | null
          launchpad: string | null
          mesh_processed_at: string | null
          mesh_status: string
          metadata_fetched_at: string | null
          notes: string | null
          source_id: string | null
          source_message_id: number | null
          telegram_url: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          twitter_url: string | null
          watchlist_processed_at: string | null
          watchlist_status: string
          website_url: string | null
          xpost_processed_at: string | null
          xpost_status: string
        }
        Insert: {
          created_at?: string
          creator_fetched_at?: string | null
          creator_wallet?: string | null
          description?: string | null
          dex_data?: Json | null
          discovered_at?: string
          id?: string
          image_url?: string | null
          launchpad?: string | null
          mesh_processed_at?: string | null
          mesh_status?: string
          metadata_fetched_at?: string | null
          notes?: string | null
          source_id?: string | null
          source_message_id?: number | null
          telegram_url?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          twitter_url?: string | null
          watchlist_processed_at?: string | null
          watchlist_status?: string
          website_url?: string | null
          xpost_processed_at?: string | null
          xpost_status?: string
        }
        Update: {
          created_at?: string
          creator_fetched_at?: string | null
          creator_wallet?: string | null
          description?: string | null
          dex_data?: Json | null
          discovered_at?: string
          id?: string
          image_url?: string | null
          launchpad?: string | null
          mesh_processed_at?: string | null
          mesh_status?: string
          metadata_fetched_at?: string | null
          notes?: string | null
          source_id?: string | null
          source_message_id?: number | null
          telegram_url?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          twitter_url?: string | null
          watchlist_processed_at?: string | null
          watchlist_status?: string
          website_url?: string | null
          xpost_processed_at?: string | null
          xpost_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_feed_discoveries_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "funnel_feed_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_feed_raw_messages: {
        Row: {
          captured_at: string
          chat_id: string
          id: number
          message_date: string | null
          message_id: number
          message_text: string | null
          processed: boolean
          update_id: number
        }
        Insert: {
          captured_at?: string
          chat_id: string
          id?: number
          message_date?: string | null
          message_id: number
          message_text?: string | null
          processed?: boolean
          update_id: number
        }
        Update: {
          captured_at?: string
          chat_id?: string
          id?: number
          message_date?: string | null
          message_id?: number
          message_text?: string | null
          processed?: boolean
          update_id?: number
        }
        Relationships: []
      }
      funnel_feed_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_message_id: number | null
          last_scraped_at: string | null
          notes: string | null
          scrape_interval_minutes: number
          source_id: string
          source_name: string
          source_type: string
          tokens_discovered: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_message_id?: number | null
          last_scraped_at?: string | null
          notes?: string | null
          scrape_interval_minutes?: number
          source_id: string
          source_name: string
          source_type?: string
          tokens_discovered?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_message_id?: number | null
          last_scraped_at?: string | null
          notes?: string | null
          scrape_interval_minutes?: number
          source_id?: string
          source_name?: string
          source_type?: string
          tokens_discovered?: number
          updated_at?: string
        }
        Relationships: []
      }
      fx_rates_daily: {
        Row: {
          base: string
          date: string
          fetched_at: string
          quote: string
          rate: number
        }
        Insert: {
          base: string
          date: string
          fetched_at?: string
          quote: string
          rate: number
        }
        Update: {
          base?: string
          date?: string
          fetched_at?: string
          quote?: string
          rate?: number
        }
        Relationships: []
      }
      gallery_style_categories: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      helius_api_usage: {
        Row: {
          created_at: string
          credits_used: number | null
          endpoint: string
          error_message: string | null
          function_name: string
          id: string
          ip_address: string | null
          method: string | null
          request_params: Json | null
          response_status: number | null
          response_time_ms: number | null
          success: boolean
          timestamp: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          credits_used?: number | null
          endpoint: string
          error_message?: string | null
          function_name: string
          id?: string
          ip_address?: string | null
          method?: string | null
          request_params?: Json | null
          response_status?: number | null
          response_time_ms?: number | null
          success: boolean
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          credits_used?: number | null
          endpoint?: string
          error_message?: string | null
          function_name?: string
          id?: string
          ip_address?: string | null
          method?: string | null
          request_params?: Json | null
          response_status?: number | null
          response_time_ms?: number | null
          success?: boolean
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      helius_rate_limit_state: {
        Row: {
          call_count: number
          circuit_breaker_active: boolean
          circuit_breaker_until: string | null
          id: string
          updated_at: string
          window_start: string
        }
        Insert: {
          call_count?: number
          circuit_breaker_active?: boolean
          circuit_breaker_until?: string | null
          id?: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          call_count?: number
          circuit_breaker_active?: boolean
          circuit_breaker_until?: string | null
          id?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      helius_usage_snapshots: {
        Row: {
          avg_response_time_ms: number | null
          created_at: string
          failed_calls: number
          function_name: string
          id: string
          snapshot_date: string
          successful_calls: number
          total_calls: number
          total_credits: number
        }
        Insert: {
          avg_response_time_ms?: number | null
          created_at?: string
          failed_calls?: number
          function_name: string
          id?: string
          snapshot_date: string
          successful_calls?: number
          total_calls?: number
          total_credits?: number
        }
        Update: {
          avg_response_time_ms?: number | null
          created_at?: string
          failed_calls?: number
          function_name?: string
          id?: string
          snapshot_date?: string
          successful_calls?: number
          total_calls?: number
          total_credits?: number
        }
        Relationships: []
      }
      holder_daily_summary: {
        Row: {
          accumulations: number | null
          avg_balance: number | null
          buys: number | null
          created_at: string | null
          distributions: number | null
          dolphin_count: number | null
          fish_count: number | null
          id: string
          median_balance: number | null
          net_flow_usd: number | null
          price_at_snapshot: number | null
          sells: number | null
          shark_count: number | null
          shrimp_count: number | null
          summary_date: string
          token_mint: string
          top10_holder_pct: number | null
          top25_holder_pct: number | null
          total_holders: number
          total_usd_value: number | null
          whale_count: number | null
          whale_movements: number | null
        }
        Insert: {
          accumulations?: number | null
          avg_balance?: number | null
          buys?: number | null
          created_at?: string | null
          distributions?: number | null
          dolphin_count?: number | null
          fish_count?: number | null
          id?: string
          median_balance?: number | null
          net_flow_usd?: number | null
          price_at_snapshot?: number | null
          sells?: number | null
          shark_count?: number | null
          shrimp_count?: number | null
          summary_date: string
          token_mint: string
          top10_holder_pct?: number | null
          top25_holder_pct?: number | null
          total_holders?: number
          total_usd_value?: number | null
          whale_count?: number | null
          whale_movements?: number | null
        }
        Update: {
          accumulations?: number | null
          avg_balance?: number | null
          buys?: number | null
          created_at?: string | null
          distributions?: number | null
          dolphin_count?: number | null
          fish_count?: number | null
          id?: string
          median_balance?: number | null
          net_flow_usd?: number | null
          price_at_snapshot?: number | null
          sells?: number | null
          shark_count?: number | null
          shrimp_count?: number | null
          summary_date?: string
          token_mint?: string
          top10_holder_pct?: number | null
          top25_holder_pct?: number | null
          total_holders?: number
          total_usd_value?: number | null
          whale_count?: number | null
          whale_movements?: number | null
        }
        Relationships: []
      }
      holder_movements: {
        Row: {
          action: string
          amount_tokens: number
          created_at: string | null
          detected_at: string | null
          id: string
          percentage_of_supply: number | null
          tier: string | null
          token_mint: string
          usd_value: number | null
          wallet_address: string
        }
        Insert: {
          action: string
          amount_tokens: number
          created_at?: string | null
          detected_at?: string | null
          id?: string
          percentage_of_supply?: number | null
          tier?: string | null
          token_mint: string
          usd_value?: number | null
          wallet_address: string
        }
        Update: {
          action?: string
          amount_tokens?: number
          created_at?: string | null
          detected_at?: string | null
          id?: string
          percentage_of_supply?: number | null
          tier?: string | null
          token_mint?: string
          usd_value?: number | null
          wallet_address?: string
        }
        Relationships: []
      }
      holder_snapshots: {
        Row: {
          balance: number
          created_at: string | null
          id: string
          price_at_snapshot: number | null
          snapshot_date: string
          tier: string | null
          token_mint: string
          usd_value: number | null
          wallet_address: string
        }
        Insert: {
          balance: number
          created_at?: string | null
          id?: string
          price_at_snapshot?: number | null
          snapshot_date: string
          tier?: string | null
          token_mint: string
          usd_value?: number | null
          wallet_address: string
        }
        Update: {
          balance?: number
          created_at?: string | null
          id?: string
          price_at_snapshot?: number | null
          snapshot_date?: string
          tier?: string | null
          token_mint?: string
          usd_value?: number | null
          wallet_address?: string
        }
        Relationships: []
      }
      holders_intel_backfill_proposals: {
        Row: {
          after_json: Json
          applied_at: string | null
          archive_id: string
          before_json: Json
          created_at: string
          id: string
          match_diff_hours: number | null
          patch_json: Json
          reverted_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_feedback: string | null
          status: string
          tg_message_date: string
          tg_message_id: number
          tg_raw_text: string | null
          token_mint: string
          updated_at: string
        }
        Insert: {
          after_json: Json
          applied_at?: string | null
          archive_id: string
          before_json: Json
          created_at?: string
          id?: string
          match_diff_hours?: number | null
          patch_json: Json
          reverted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_feedback?: string | null
          status?: string
          tg_message_date: string
          tg_message_id: number
          tg_raw_text?: string | null
          token_mint: string
          updated_at?: string
        }
        Update: {
          after_json?: Json
          applied_at?: string | null
          archive_id?: string
          before_json?: Json
          created_at?: string
          id?: string
          match_diff_hours?: number | null
          patch_json?: Json
          reverted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_feedback?: string | null
          status?: string
          tg_message_date?: string
          tg_message_id?: number
          tg_raw_text?: string | null
          token_mint?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holders_intel_backfill_proposals_archive_id_fkey"
            columns: ["archive_id"]
            isOneToOne: false
            referencedRelation: "holders_intel_post_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      holders_intel_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      holders_intel_dex_triggers: {
        Row: {
          boost_count: number | null
          created_at: string | null
          detected_at: string | null
          id: string
          name: string | null
          posted_at: string | null
          queue_id: string | null
          symbol: string | null
          token_mint: string
          trigger_type: string
        }
        Insert: {
          boost_count?: number | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          name?: string | null
          posted_at?: string | null
          queue_id?: string | null
          symbol?: string | null
          token_mint: string
          trigger_type: string
        }
        Update: {
          boost_count?: number | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          name?: string | null
          posted_at?: string | null
          queue_id?: string | null
          symbol?: string | null
          token_mint?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "holders_intel_dex_triggers_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "holders_intel_post_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      holders_intel_post_queue: {
        Row: {
          ai_snippet: string | null
          autopsy_hero_image: string | null
          autopsy_slug: string | null
          autopsy_triggered_at: string | null
          autopsy_triggered_by: string | null
          autopsy_url: string | null
          banner_used_url: string | null
          created_at: string
          decorated_banner_url: string | null
          decoration_theme: string | null
          dex_banner_url: string | null
          dust_count: number | null
          dust_pct: number | null
          error_message: string | null
          hashtags_line: string | null
          health_grade: string | null
          health_label: string | null
          health_score: number | null
          id: string
          manual_posted_at: string | null
          manual_posted_by: string | null
          manual_skip_reason: string | null
          manual_status: string
          manual_tweet_url: string | null
          market_cap: number | null
          name: string | null
          posted_at: string | null
          posted_handle: string | null
          real_holders: number | null
          retail_count: number | null
          retry_count: number
          scheduled_at: string
          serious_count: number | null
          snapshot_label: string | null
          snapshot_slot: string | null
          status: string
          symbol: string | null
          token_mint: string
          total_wallets: number | null
          trigger_comment: string | null
          trigger_source: string | null
          tweet_composed_at: string | null
          tweet_id: string | null
          tweet_text: string | null
          whales_count: number | null
        }
        Insert: {
          ai_snippet?: string | null
          autopsy_hero_image?: string | null
          autopsy_slug?: string | null
          autopsy_triggered_at?: string | null
          autopsy_triggered_by?: string | null
          autopsy_url?: string | null
          banner_used_url?: string | null
          created_at?: string
          decorated_banner_url?: string | null
          decoration_theme?: string | null
          dex_banner_url?: string | null
          dust_count?: number | null
          dust_pct?: number | null
          error_message?: string | null
          hashtags_line?: string | null
          health_grade?: string | null
          health_label?: string | null
          health_score?: number | null
          id?: string
          manual_posted_at?: string | null
          manual_posted_by?: string | null
          manual_skip_reason?: string | null
          manual_status?: string
          manual_tweet_url?: string | null
          market_cap?: number | null
          name?: string | null
          posted_at?: string | null
          posted_handle?: string | null
          real_holders?: number | null
          retail_count?: number | null
          retry_count?: number
          scheduled_at: string
          serious_count?: number | null
          snapshot_label?: string | null
          snapshot_slot?: string | null
          status?: string
          symbol?: string | null
          token_mint: string
          total_wallets?: number | null
          trigger_comment?: string | null
          trigger_source?: string | null
          tweet_composed_at?: string | null
          tweet_id?: string | null
          tweet_text?: string | null
          whales_count?: number | null
        }
        Update: {
          ai_snippet?: string | null
          autopsy_hero_image?: string | null
          autopsy_slug?: string | null
          autopsy_triggered_at?: string | null
          autopsy_triggered_by?: string | null
          autopsy_url?: string | null
          banner_used_url?: string | null
          created_at?: string
          decorated_banner_url?: string | null
          decoration_theme?: string | null
          dex_banner_url?: string | null
          dust_count?: number | null
          dust_pct?: number | null
          error_message?: string | null
          hashtags_line?: string | null
          health_grade?: string | null
          health_label?: string | null
          health_score?: number | null
          id?: string
          manual_posted_at?: string | null
          manual_posted_by?: string | null
          manual_skip_reason?: string | null
          manual_status?: string
          manual_tweet_url?: string | null
          market_cap?: number | null
          name?: string | null
          posted_at?: string | null
          posted_handle?: string | null
          real_holders?: number | null
          retail_count?: number | null
          retry_count?: number
          scheduled_at?: string
          serious_count?: number | null
          snapshot_label?: string | null
          snapshot_slot?: string | null
          status?: string
          symbol?: string | null
          token_mint?: string
          total_wallets?: number | null
          trigger_comment?: string | null
          trigger_source?: string | null
          tweet_composed_at?: string | null
          tweet_id?: string | null
          tweet_text?: string | null
          whales_count?: number | null
        }
        Relationships: []
      }
      holders_intel_seen_tokens: {
        Row: {
          banner_url: string | null
          bonded_at: string | null
          community_checked_at: string | null
          creator_fetched_at: string | null
          creator_wallet: string | null
          description: string | null
          entry_mcap_usd: number | null
          first_seen_at: string
          health_grade: string | null
          image_uri: string | null
          last_seen_at: string
          last_trigger_source: string | null
          launchpad: string | null
          market_cap_at_discovery: number | null
          metadata_fetched_at: string | null
          minted_at: string | null
          name: string | null
          paid_composite_url: string | null
          snapshot_slot: string | null
          symbol: string | null
          telegram_url: string | null
          times_posted: number | null
          times_seen: number
          token_mint: string
          twitter_url: string | null
          was_posted: boolean
          website_url: string | null
        }
        Insert: {
          banner_url?: string | null
          bonded_at?: string | null
          community_checked_at?: string | null
          creator_fetched_at?: string | null
          creator_wallet?: string | null
          description?: string | null
          entry_mcap_usd?: number | null
          first_seen_at?: string
          health_grade?: string | null
          image_uri?: string | null
          last_seen_at?: string
          last_trigger_source?: string | null
          launchpad?: string | null
          market_cap_at_discovery?: number | null
          metadata_fetched_at?: string | null
          minted_at?: string | null
          name?: string | null
          paid_composite_url?: string | null
          snapshot_slot?: string | null
          symbol?: string | null
          telegram_url?: string | null
          times_posted?: number | null
          times_seen?: number
          token_mint: string
          twitter_url?: string | null
          was_posted?: boolean
          website_url?: string | null
        }
        Update: {
          banner_url?: string | null
          bonded_at?: string | null
          community_checked_at?: string | null
          creator_fetched_at?: string | null
          creator_wallet?: string | null
          description?: string | null
          entry_mcap_usd?: number | null
          first_seen_at?: string
          health_grade?: string | null
          image_uri?: string | null
          last_seen_at?: string
          last_trigger_source?: string | null
          launchpad?: string | null
          market_cap_at_discovery?: number | null
          metadata_fetched_at?: string | null
          minted_at?: string | null
          name?: string | null
          paid_composite_url?: string | null
          snapshot_slot?: string | null
          symbol?: string | null
          telegram_url?: string | null
          times_posted?: number | null
          times_seen?: number
          token_mint?: string
          twitter_url?: string | null
          was_posted?: boolean
          website_url?: string | null
        }
        Relationships: []
      }
      holders_intel_surge_alerts: {
        Row: {
          alert_date: string | null
          alert_type: string
          created_at: string | null
          detected_at: string | null
          id: string
          name: string | null
          posted: boolean | null
          queue_id: string | null
          search_count: number
          symbol: string | null
          time_window_minutes: number
          token_mint: string
          unique_ips: number | null
        }
        Insert: {
          alert_date?: string | null
          alert_type: string
          created_at?: string | null
          detected_at?: string | null
          id?: string
          name?: string | null
          posted?: boolean | null
          queue_id?: string | null
          search_count: number
          symbol?: string | null
          time_window_minutes: number
          token_mint: string
          unique_ips?: number | null
        }
        Update: {
          alert_date?: string | null
          alert_type?: string
          created_at?: string | null
          detected_at?: string | null
          id?: string
          name?: string | null
          posted?: boolean | null
          queue_id?: string | null
          search_count?: number
          symbol?: string | null
          time_window_minutes?: number
          token_mint?: string
          unique_ips?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holders_intel_surge_alerts_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "holders_intel_post_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      holders_intel_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          template_name: string
          template_text: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          template_name: string
          template_text: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          template_name?: string
          template_text?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      holders_page_visits: {
        Row: {
          auth_method: string | null
          browser: string | null
          country_code: string | null
          created_at: string
          device_type: string | null
          exit_type: string | null
          exited_at: string | null
          full_url: string | null
          has_og_image: boolean | null
          id: string
          ip_address: string | null
          is_authenticated: boolean | null
          os: string | null
          page_load_time_ms: number | null
          page_name: string | null
          referrer: string | null
          referrer_domain: string | null
          reports_generated: number | null
          screen_height: number | null
          screen_width: number | null
          session_id: string
          time_on_page_seconds: number | null
          token_preloaded: string | null
          tokens_analyzed: string[] | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          version_param: string | null
          visitor_fingerprint: string | null
        }
        Insert: {
          auth_method?: string | null
          browser?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          exit_type?: string | null
          exited_at?: string | null
          full_url?: string | null
          has_og_image?: boolean | null
          id?: string
          ip_address?: string | null
          is_authenticated?: boolean | null
          os?: string | null
          page_load_time_ms?: number | null
          page_name?: string | null
          referrer?: string | null
          referrer_domain?: string | null
          reports_generated?: number | null
          screen_height?: number | null
          screen_width?: number | null
          session_id: string
          time_on_page_seconds?: number | null
          token_preloaded?: string | null
          tokens_analyzed?: string[] | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          version_param?: string | null
          visitor_fingerprint?: string | null
        }
        Update: {
          auth_method?: string | null
          browser?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          exit_type?: string | null
          exited_at?: string | null
          full_url?: string | null
          has_og_image?: boolean | null
          id?: string
          ip_address?: string | null
          is_authenticated?: boolean | null
          os?: string | null
          page_load_time_ms?: number | null
          page_name?: string | null
          referrer?: string | null
          referrer_domain?: string | null
          reports_generated?: number | null
          screen_height?: number | null
          screen_width?: number | null
          session_id?: string
          time_on_page_seconds?: number | null
          token_preloaded?: string | null
          tokens_analyzed?: string[] | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          version_param?: string | null
          visitor_fingerprint?: string | null
        }
        Relationships: []
      }
      hunter_tweet_findings: {
        Row: {
          created_at: string | null
          detected_tickers: Json | null
          detected_tokens: Json | null
          engagement_score: number | null
          handle: string
          id: string
          notes: string | null
          reply_drafted: boolean | null
          reply_posted: boolean | null
          target_id: string
          tweet_date: string | null
          tweet_id: string
          tweet_text: string
          tweet_url: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          detected_tickers?: Json | null
          detected_tokens?: Json | null
          engagement_score?: number | null
          handle: string
          id?: string
          notes?: string | null
          reply_drafted?: boolean | null
          reply_posted?: boolean | null
          target_id: string
          tweet_date?: string | null
          tweet_id: string
          tweet_text: string
          tweet_url?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          detected_tickers?: Json | null
          detected_tokens?: Json | null
          engagement_score?: number | null
          handle?: string
          id?: string
          notes?: string | null
          reply_drafted?: boolean | null
          reply_posted?: boolean | null
          target_id?: string
          tweet_date?: string | null
          tweet_id?: string
          tweet_text?: string
          tweet_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunter_tweet_findings_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "twitter_tg_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      image_style_presets: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          reference_image_urls: string[] | null
          style_prompt: string
          style_type: string
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          reference_image_urls?: string[] | null
          style_prompt: string
          style_type?: string
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          reference_image_urls?: string[] | null
          style_prompt?: string
          style_type?: string
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      insiders_parse_failures: {
        Row: {
          created_at: string
          id: string
          message_id: number | null
          parsed_fields: Json | null
          raw_text: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id?: number | null
          parsed_fields?: Json | null
          raw_text?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: number | null
          parsed_fields?: Json | null
          raw_text?: string | null
          reason?: string
        }
        Relationships: []
      }
      installer_x_profiles: {
        Row: {
          created_at: string
          id: string
          scraped_at: string
          telegram_username: string | null
          user_id: string
          x_bio: string | null
          x_display_name: string | null
          x_followers: number | null
          x_url: string | null
          x_username: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          scraped_at?: string
          telegram_username?: string | null
          user_id: string
          x_bio?: string | null
          x_display_name?: string | null
          x_followers?: number | null
          x_url?: string | null
          x_username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          scraped_at?: string
          telegram_username?: string | null
          user_id?: string
          x_bio?: string | null
          x_display_name?: string | null
          x_followers?: number | null
          x_url?: string | null
          x_username?: string | null
        }
        Relationships: []
      }
      intel_briefing_revisions: {
        Row: {
          briefing_id: string
          content_md: string
          created_at: string
          edited_by: string | null
          id: string
          revision_note: string | null
          title: string
        }
        Insert: {
          briefing_id: string
          content_md: string
          created_at?: string
          edited_by?: string | null
          id?: string
          revision_note?: string | null
          title: string
        }
        Update: {
          briefing_id?: string
          content_md?: string
          created_at?: string
          edited_by?: string | null
          id?: string
          revision_note?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_briefing_revisions_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "intel_briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_briefing_variants: {
        Row: {
          briefing_id: string
          content_md: string
          depth: number
          id: string
          updated_at: string
        }
        Insert: {
          briefing_id: string
          content_md?: string
          depth: number
          id?: string
          updated_at?: string
        }
        Update: {
          briefing_id?: string
          content_md?: string
          depth?: number
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_briefing_variants_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "intel_briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_briefing_views: {
        Row: {
          bot_name: string | null
          briefing_id: string
          created_at: string
          id: string
          ip_address: string | null
          referer: string | null
          referrer_source: string | null
          session_id: string | null
          slug: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_type: string
        }
        Insert: {
          bot_name?: string | null
          briefing_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          referer?: string | null
          referrer_source?: string | null
          session_id?: string | null
          slug: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_type?: string
        }
        Update: {
          bot_name?: string | null
          briefing_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          referer?: string | null
          referrer_source?: string | null
          session_id?: string | null
          slug?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_briefing_views_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "intel_briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_briefings: {
        Row: {
          author: string
          category: string
          content_md: string
          created_at: string
          exif_branded_at: string | null
          featured_image_url: string | null
          id: string
          is_published: boolean
          published_at: string | null
          related_slugs: string[] | null
          reviewed_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          social_image_generated_at: string | null
          social_image_url: string | null
          subtitle: string | null
          tags: string[] | null
          target_persona_slug: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string
          category?: string
          content_md: string
          created_at?: string
          exif_branded_at?: string | null
          featured_image_url?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          related_slugs?: string[] | null
          reviewed_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          social_image_generated_at?: string | null
          social_image_url?: string | null
          subtitle?: string | null
          tags?: string[] | null
          target_persona_slug?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          category?: string
          content_md?: string
          created_at?: string
          exif_branded_at?: string | null
          featured_image_url?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          related_slugs?: string[] | null
          reviewed_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          social_image_generated_at?: string | null
          social_image_url?: string | null
          subtitle?: string | null
          tags?: string[] | null
          target_persona_slug?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      intel_publications: {
        Row: {
          briefing_id: string
          content_depth: number
          created_at: string
          id: string
          is_breadcrumb: boolean
          notes: string | null
          platform: string
          published_at: string
          published_url: string | null
        }
        Insert: {
          briefing_id: string
          content_depth?: number
          created_at?: string
          id?: string
          is_breadcrumb?: boolean
          notes?: string | null
          platform: string
          published_at?: string
          published_url?: string | null
        }
        Update: {
          briefing_id?: string
          content_depth?: number
          created_at?: string
          id?: string
          is_breadcrumb?: boolean
          notes?: string | null
          platform?: string
          published_at?: string
          published_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_publications_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "intel_briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          feature_name: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          feature_name: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          feature_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      invalid_scraped_tokens: {
        Row: {
          discovery_source: string
          id: string
          last_validation_attempt: string | null
          moved_at: string | null
          name: string | null
          rank_snapshot: number | null
          scraped_at: string | null
          symbol: string | null
          token_mint: string
          validation_attempts: number | null
          validation_error: string | null
          validation_status: string
        }
        Insert: {
          discovery_source: string
          id?: string
          last_validation_attempt?: string | null
          moved_at?: string | null
          name?: string | null
          rank_snapshot?: number | null
          scraped_at?: string | null
          symbol?: string | null
          token_mint: string
          validation_attempts?: number | null
          validation_error?: string | null
          validation_status: string
        }
        Update: {
          discovery_source?: string
          id?: string
          last_validation_attempt?: string | null
          moved_at?: string | null
          name?: string | null
          rank_snapshot?: number | null
          scraped_at?: string | null
          symbol?: string | null
          token_mint?: string
          validation_attempts?: number | null
          validation_error?: string | null
          validation_status?: string
        }
        Relationships: []
      }
      known_cex_wallets: {
        Row: {
          added_by: string | null
          cex_label: string | null
          cex_name: string
          chain: string
          created_at: string
          entity_type: string
          id: string
          is_verified: boolean
          updated_at: string
          wallet_address: string
        }
        Insert: {
          added_by?: string | null
          cex_label?: string | null
          cex_name: string
          chain?: string
          created_at?: string
          entity_type?: string
          id?: string
          is_verified?: boolean
          updated_at?: string
          wallet_address: string
        }
        Update: {
          added_by?: string | null
          cex_label?: string | null
          cex_name?: string
          chain?: string
          created_at?: string
          entity_type?: string
          id?: string
          is_verified?: boolean
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      kol_registry: {
        Row: {
          avatar_url: string | null
          avg_multiplier: number | null
          categories: string[] | null
          created_at: string | null
          display_name: string | null
          followers_count: number | null
          id: string
          last_synced_at: string | null
          rank: number | null
          score: number | null
          updated_at: string | null
          wallet_addresses: string[] | null
          win_rate: number | null
          x_handle: string
          x_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          avg_multiplier?: number | null
          categories?: string[] | null
          created_at?: string | null
          display_name?: string | null
          followers_count?: number | null
          id?: string
          last_synced_at?: string | null
          rank?: number | null
          score?: number | null
          updated_at?: string | null
          wallet_addresses?: string[] | null
          win_rate?: number | null
          x_handle: string
          x_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          avg_multiplier?: number | null
          categories?: string[] | null
          created_at?: string | null
          display_name?: string | null
          followers_count?: number | null
          id?: string
          last_synced_at?: string | null
          rank?: number | null
          score?: number | null
          updated_at?: string | null
          wallet_addresses?: string[] | null
          win_rate?: number | null
          x_handle?: string
          x_url?: string | null
        }
        Relationships: []
      }
      kol_wallets: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          is_active: boolean
          last_verified_at: string
          sns_name: string | null
          twitter_handle: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_verified_at?: string
          sns_name?: string | null
          twitter_handle: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_verified_at?: string
          sns_name?: string | null
          twitter_handle?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      kyc_discovery_log: {
        Row: {
          chain: Json
          chain_depth: number
          dev_wallet: string
          discovered_at: string
          discovered_via: string | null
          id: string
          kyc_label: string | null
          kyc_source: string | null
          kyc_wallet: string
          token_count: number
          tokens: string[]
        }
        Insert: {
          chain?: Json
          chain_depth?: number
          dev_wallet: string
          discovered_at?: string
          discovered_via?: string | null
          id?: string
          kyc_label?: string | null
          kyc_source?: string | null
          kyc_wallet: string
          token_count?: number
          tokens?: string[]
        }
        Update: {
          chain?: Json
          chain_depth?: number
          dev_wallet?: string
          discovered_at?: string
          discovered_via?: string | null
          id?: string
          kyc_label?: string | null
          kyc_source?: string | null
          kyc_wallet?: string
          token_count?: number
          tokens?: string[]
        }
        Relationships: []
      }
      launcher_enrichment: {
        Row: {
          found_at: string
          id: string
          launcher_profile_id: string | null
          links_found: Json
          mint_address: string
        }
        Insert: {
          found_at?: string
          id?: string
          launcher_profile_id?: string | null
          links_found?: Json
          mint_address: string
        }
        Update: {
          found_at?: string
          id?: string
          launcher_profile_id?: string | null
          links_found?: Json
          mint_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "launcher_enrichment_launcher_profile_id_fkey"
            columns: ["launcher_profile_id"]
            isOneToOne: false
            referencedRelation: "launcher_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      launcher_global_kill_switch: {
        Row: {
          id: boolean
          killed: boolean
          reason: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          killed?: boolean
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          killed?: boolean
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      launcher_mint_events: {
        Row: {
          buy_amount_sol: number | null
          buy_filled_at: string | null
          buy_tx_sig: string | null
          created_at: string
          detected_at: string
          dev_initial_buy_sol: number | null
          dev_wallet_used: string | null
          entry_mcap_usd: number | null
          entry_price_usd: number | null
          exit_mcap_usd: number | null
          exit_price_usd: number | null
          highest_mcap_usd: number | null
          id: string
          initial_mcap_usd: number | null
          launcher_profile_id: string
          metadata: Json
          mint_address: string
          multiple_realized: number | null
          name: string | null
          realized_pnl_sol: number | null
          realized_pnl_usd: number | null
          sell_filled_at: string | null
          sell_tx_sig: string | null
          skip_reason: string | null
          status: string
          symbol: string | null
          updated_at: string
        }
        Insert: {
          buy_amount_sol?: number | null
          buy_filled_at?: string | null
          buy_tx_sig?: string | null
          created_at?: string
          detected_at?: string
          dev_initial_buy_sol?: number | null
          dev_wallet_used?: string | null
          entry_mcap_usd?: number | null
          entry_price_usd?: number | null
          exit_mcap_usd?: number | null
          exit_price_usd?: number | null
          highest_mcap_usd?: number | null
          id?: string
          initial_mcap_usd?: number | null
          launcher_profile_id: string
          metadata?: Json
          mint_address: string
          multiple_realized?: number | null
          name?: string | null
          realized_pnl_sol?: number | null
          realized_pnl_usd?: number | null
          sell_filled_at?: string | null
          sell_tx_sig?: string | null
          skip_reason?: string | null
          status?: string
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          buy_amount_sol?: number | null
          buy_filled_at?: string | null
          buy_tx_sig?: string | null
          created_at?: string
          detected_at?: string
          dev_initial_buy_sol?: number | null
          dev_wallet_used?: string | null
          entry_mcap_usd?: number | null
          entry_price_usd?: number | null
          exit_mcap_usd?: number | null
          exit_price_usd?: number | null
          highest_mcap_usd?: number | null
          id?: string
          initial_mcap_usd?: number | null
          launcher_profile_id?: string
          metadata?: Json
          mint_address?: string
          multiple_realized?: number | null
          name?: string | null
          realized_pnl_sol?: number | null
          realized_pnl_usd?: number | null
          sell_filled_at?: string | null
          sell_tx_sig?: string | null
          skip_reason?: string | null
          status?: string
          symbol?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "launcher_mint_events_launcher_profile_id_fkey"
            columns: ["launcher_profile_id"]
            isOneToOne: false
            referencedRelation: "launcher_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      launcher_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          excluded_wallets: string[]
          id: string
          is_active: boolean
          kyc_root_wallet: string | null
          last_spidered_at: string | null
          linked_wallets: string[]
          name: string
          notes: string | null
          primary_dev_wallet: string | null
          spider_depth: number
          updated_at: string
          x_handle: string | null
          x_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          excluded_wallets?: string[]
          id?: string
          is_active?: boolean
          kyc_root_wallet?: string | null
          last_spidered_at?: string | null
          linked_wallets?: string[]
          name: string
          notes?: string | null
          primary_dev_wallet?: string | null
          spider_depth?: number
          updated_at?: string
          x_handle?: string | null
          x_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          excluded_wallets?: string[]
          id?: string
          is_active?: boolean
          kyc_root_wallet?: string | null
          last_spidered_at?: string | null
          linked_wallets?: string[]
          name?: string
          notes?: string | null
          primary_dev_wallet?: string | null
          spider_depth?: number
          updated_at?: string
          x_handle?: string | null
          x_user_id?: string | null
        }
        Relationships: []
      }
      launcher_trade_rules: {
        Row: {
          buy_amount_sol: number
          created_at: string
          enabled: boolean
          funding_wallet_id: string | null
          id: string
          jito_tip_lamports: number
          launcher_profile_id: string
          max_daily_spend_sol: number
          max_hold_seconds: number
          min_seconds_after_mint: number
          mode: string
          priority_fee_lamports: number
          require_dev_buy_min_sol: number
          slippage_bps: number
          target_factor: number
          updated_at: string
        }
        Insert: {
          buy_amount_sol?: number
          created_at?: string
          enabled?: boolean
          funding_wallet_id?: string | null
          id?: string
          jito_tip_lamports?: number
          launcher_profile_id: string
          max_daily_spend_sol?: number
          max_hold_seconds?: number
          min_seconds_after_mint?: number
          mode?: string
          priority_fee_lamports?: number
          require_dev_buy_min_sol?: number
          slippage_bps?: number
          target_factor?: number
          updated_at?: string
        }
        Update: {
          buy_amount_sol?: number
          created_at?: string
          enabled?: boolean
          funding_wallet_id?: string | null
          id?: string
          jito_tip_lamports?: number
          launcher_profile_id?: string
          max_daily_spend_sol?: number
          max_hold_seconds?: number
          min_seconds_after_mint?: number
          mode?: string
          priority_fee_lamports?: number
          require_dev_buy_min_sol?: number
          slippage_bps?: number
          target_factor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "launcher_trade_rules_funding_wallet_id_fkey"
            columns: ["funding_wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "launcher_trade_rules_launcher_profile_id_fkey"
            columns: ["launcher_profile_id"]
            isOneToOne: true
            referencedRelation: "launcher_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      launchpad_creator_profiles: {
        Row: {
          created_at: string | null
          creator_wallet: string | null
          id: string
          is_blacklisted: boolean | null
          is_whitelisted: boolean | null
          last_scraped_at: string | null
          linked_dev_team_id: string | null
          linked_token_mints: string[] | null
          linked_wallets: string[] | null
          linked_x_account: string | null
          platform: string
          platform_user_id: string | null
          platform_username: string | null
          profile_url: string | null
          risk_level: string | null
          risk_notes: string | null
          tokens_created: number | null
          tokens_graduated: number | null
          tokens_rugged: number | null
          total_volume_sol: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          creator_wallet?: string | null
          id?: string
          is_blacklisted?: boolean | null
          is_whitelisted?: boolean | null
          last_scraped_at?: string | null
          linked_dev_team_id?: string | null
          linked_token_mints?: string[] | null
          linked_wallets?: string[] | null
          linked_x_account?: string | null
          platform: string
          platform_user_id?: string | null
          platform_username?: string | null
          profile_url?: string | null
          risk_level?: string | null
          risk_notes?: string | null
          tokens_created?: number | null
          tokens_graduated?: number | null
          tokens_rugged?: number | null
          total_volume_sol?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          creator_wallet?: string | null
          id?: string
          is_blacklisted?: boolean | null
          is_whitelisted?: boolean | null
          last_scraped_at?: string | null
          linked_dev_team_id?: string | null
          linked_token_mints?: string[] | null
          linked_wallets?: string[] | null
          linked_x_account?: string | null
          platform?: string
          platform_user_id?: string | null
          platform_username?: string | null
          profile_url?: string | null
          risk_level?: string | null
          risk_notes?: string | null
          tokens_created?: number | null
          tokens_graduated?: number | null
          tokens_rugged?: number | null
          total_volume_sol?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "launchpad_creator_profiles_linked_dev_team_id_fkey"
            columns: ["linked_dev_team_id"]
            isOneToOne: false
            referencedRelation: "dev_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_daily_runs: {
        Row: {
          caption_text: string | null
          created_at: string
          entries: Json
          entry_count: number
          error: string | null
          id: string
          image_private_url: string | null
          image_public_url: string | null
          local_date: string
          pinned_at: string | null
          pinned_message_id_private: number | null
          pinned_message_id_public: number | null
          posted_at: string | null
          profile_id: string
          qualifying_4x_count: number | null
          rendered_at: string | null
          size_chosen: string | null
          status: string
          tg_private_message_id: number | null
          tg_public_message_id: number | null
          updated_at: string
          window_end_utc: string
          window_start_utc: string
        }
        Insert: {
          caption_text?: string | null
          created_at?: string
          entries?: Json
          entry_count?: number
          error?: string | null
          id?: string
          image_private_url?: string | null
          image_public_url?: string | null
          local_date: string
          pinned_at?: string | null
          pinned_message_id_private?: number | null
          pinned_message_id_public?: number | null
          posted_at?: string | null
          profile_id: string
          qualifying_4x_count?: number | null
          rendered_at?: string | null
          size_chosen?: string | null
          status?: string
          tg_private_message_id?: number | null
          tg_public_message_id?: number | null
          updated_at?: string
          window_end_utc: string
          window_start_utc: string
        }
        Update: {
          caption_text?: string | null
          created_at?: string
          entries?: Json
          entry_count?: number
          error?: string | null
          id?: string
          image_private_url?: string | null
          image_public_url?: string | null
          local_date?: string
          pinned_at?: string | null
          pinned_message_id_private?: number | null
          pinned_message_id_public?: number | null
          posted_at?: string | null
          profile_id?: string
          qualifying_4x_count?: number | null
          rendered_at?: string | null
          size_chosen?: string | null
          status?: string
          tg_private_message_id?: number | null
          tg_public_message_id?: number | null
          updated_at?: string
          window_end_utc?: string
          window_start_utc?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_daily_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_monthly_runs: {
        Row: {
          caption_text: string | null
          created_at: string
          entries: Json
          entry_count: number
          error: string | null
          id: string
          image_private_url: string | null
          image_public_url: string | null
          month_label: string
          month_start_date: string
          pinned_at: string | null
          pinned_message_id_private: number | null
          pinned_message_id_public: number | null
          posted_at: string | null
          profile_id: string
          rendered_at: string | null
          status: string
          tg_private_message_id: number | null
          tg_public_message_id: number | null
          updated_at: string
          window_end_utc: string
          window_start_utc: string
        }
        Insert: {
          caption_text?: string | null
          created_at?: string
          entries?: Json
          entry_count?: number
          error?: string | null
          id?: string
          image_private_url?: string | null
          image_public_url?: string | null
          month_label: string
          month_start_date: string
          pinned_at?: string | null
          pinned_message_id_private?: number | null
          pinned_message_id_public?: number | null
          posted_at?: string | null
          profile_id: string
          rendered_at?: string | null
          status?: string
          tg_private_message_id?: number | null
          tg_public_message_id?: number | null
          updated_at?: string
          window_end_utc: string
          window_start_utc: string
        }
        Update: {
          caption_text?: string | null
          created_at?: string
          entries?: Json
          entry_count?: number
          error?: string | null
          id?: string
          image_private_url?: string | null
          image_public_url?: string | null
          month_label?: string
          month_start_date?: string
          pinned_at?: string | null
          pinned_message_id_private?: number | null
          pinned_message_id_public?: number | null
          posted_at?: string | null
          profile_id?: string
          rendered_at?: string | null
          status?: string
          tg_private_message_id?: number | null
          tg_public_message_id?: number | null
          updated_at?: string
          window_end_utc?: string
          window_start_utc?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_monthly_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_profiles: {
        Row: {
          accent_hex: string
          auto_pin_daily: boolean
          auto_pin_monthly: boolean
          auto_pin_weekly: boolean
          auto_unpin_previous: boolean
          bg_private_prompt: string | null
          bg_private_url: string | null
          bg_public_prompt: string | null
          bg_public_url: string | null
          brand_tagline: string | null
          channel_name_filter: string | null
          created_at: string
          day_start_hour: number
          display_name: string
          enabled: boolean
          id: string
          post_hour: number
          post_to_tg_private: boolean
          post_to_tg_public: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          accent_hex?: string
          auto_pin_daily?: boolean
          auto_pin_monthly?: boolean
          auto_pin_weekly?: boolean
          auto_unpin_previous?: boolean
          bg_private_prompt?: string | null
          bg_private_url?: string | null
          bg_public_prompt?: string | null
          bg_public_url?: string | null
          brand_tagline?: string | null
          channel_name_filter?: string | null
          created_at?: string
          day_start_hour?: number
          display_name: string
          enabled?: boolean
          id: string
          post_hour?: number
          post_to_tg_private?: boolean
          post_to_tg_public?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          accent_hex?: string
          auto_pin_daily?: boolean
          auto_pin_monthly?: boolean
          auto_pin_weekly?: boolean
          auto_unpin_previous?: boolean
          bg_private_prompt?: string | null
          bg_private_url?: string | null
          bg_public_prompt?: string | null
          bg_public_url?: string | null
          brand_tagline?: string | null
          channel_name_filter?: string | null
          created_at?: string
          day_start_hour?: number
          display_name?: string
          enabled?: boolean
          id?: string
          post_hour?: number
          post_to_tg_private?: boolean
          post_to_tg_public?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      leaderboard_weekly_runs: {
        Row: {
          caption_text: string | null
          created_at: string
          entries: Json
          entry_count: number
          error: string | null
          id: string
          image_private_url: string | null
          image_public_url: string | null
          pinned_at: string | null
          pinned_message_id_private: number | null
          pinned_message_id_public: number | null
          posted_at: string | null
          profile_id: string
          rendered_at: string | null
          status: string
          tg_private_message_id: number | null
          tg_public_message_id: number | null
          updated_at: string
          week_end_date: string
          week_start_date: string
          window_end_utc: string
          window_start_utc: string
        }
        Insert: {
          caption_text?: string | null
          created_at?: string
          entries?: Json
          entry_count?: number
          error?: string | null
          id?: string
          image_private_url?: string | null
          image_public_url?: string | null
          pinned_at?: string | null
          pinned_message_id_private?: number | null
          pinned_message_id_public?: number | null
          posted_at?: string | null
          profile_id: string
          rendered_at?: string | null
          status?: string
          tg_private_message_id?: number | null
          tg_public_message_id?: number | null
          updated_at?: string
          week_end_date: string
          week_start_date: string
          window_end_utc: string
          window_start_utc: string
        }
        Update: {
          caption_text?: string | null
          created_at?: string
          entries?: Json
          entry_count?: number
          error?: string | null
          id?: string
          image_private_url?: string | null
          image_public_url?: string | null
          pinned_at?: string | null
          pinned_message_id_private?: number | null
          pinned_message_id_public?: number | null
          posted_at?: string | null
          profile_id?: string
          rendered_at?: string | null
          status?: string
          tg_private_message_id?: number | null
          tg_public_message_id?: number | null
          updated_at?: string
          week_end_date?: string
          week_start_date?: string
          window_end_utc?: string
          window_start_utc?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_weekly_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          alert_id: string | null
          city: string | null
          country: string | null
          created_at: string
          device_fingerprint: string | null
          id: string
          ip_address: string | null
          is_suspicious: boolean
          login_method: string | null
          suspicion_reasons: string[] | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          ip_address?: string | null
          is_suspicious?: boolean
          login_method?: string | null
          suspicion_reasons?: string[] | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          alert_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          ip_address?: string | null
          is_suspicious?: boolean
          login_method?: string | null
          suspicion_reasons?: string[] | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_history_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "security_sms_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_email_campaigns: {
        Row: {
          campaign_type: string
          created_at: string
          funnel_tag: string | null
          html_content: string
          id: string
          is_active: boolean
          name: string
          send_delay_hours: number | null
          subject: string
          target_intent_level: string | null
          updated_at: string
        }
        Insert: {
          campaign_type?: string
          created_at?: string
          funnel_tag?: string | null
          html_content: string
          id?: string
          is_active?: boolean
          name: string
          send_delay_hours?: number | null
          subject: string
          target_intent_level?: string | null
          updated_at?: string
        }
        Update: {
          campaign_type?: string
          created_at?: string
          funnel_tag?: string | null
          html_content?: string
          id?: string
          is_active?: boolean
          name?: string
          send_delay_hours?: number | null
          subject?: string
          target_intent_level?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      marketing_email_queue: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          created_at: string
          error_message: string | null
          id: string
          opened_at: string | null
          recipient_email: string
          scheduled_at: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_email_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_profiles: {
        Row: {
          created_at: string
          data: Json
          id: string
          is_active: boolean
          section: string
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          is_active?: boolean
          section: string
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          is_active?: boolean
          section?: string
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mega_whale_alert_config: {
        Row: {
          additional_telegram_ids: string[] | null
          auto_buy_amount_sol: number | null
          auto_buy_max_dump_ratio: number | null
          auto_buy_max_market_cap: number | null
          auto_buy_max_wait_minutes: number | null
          auto_buy_min_age_minutes: number | null
          auto_buy_min_holders: number | null
          auto_buy_min_market_cap: number | null
          auto_buy_on_mint: boolean | null
          auto_buy_require_dev_buy: boolean | null
          auto_buy_wait_for_buys: number | null
          coordinated_buy_count: number | null
          coordinated_buy_window_minutes: number | null
          created_at: string | null
          distribution_enabled: boolean | null
          distribution_percent_per_wallet: number | null
          distribution_percent_wallet_1: number | null
          distribution_percent_wallet_2: number | null
          distribution_percent_wallet_3: number | null
          distribution_wallet_1: string | null
          distribution_wallet_2: string | null
          distribution_wallet_3: string | null
          email_address: string | null
          funding_burst_count: number | null
          funding_burst_window_minutes: number | null
          id: string
          notify_browser: boolean | null
          notify_email: boolean | null
          notify_telegram: boolean | null
          pending_telegram_ids: Json | null
          profit_taking_threshold_percent: number | null
          telegram_chat_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          additional_telegram_ids?: string[] | null
          auto_buy_amount_sol?: number | null
          auto_buy_max_dump_ratio?: number | null
          auto_buy_max_market_cap?: number | null
          auto_buy_max_wait_minutes?: number | null
          auto_buy_min_age_minutes?: number | null
          auto_buy_min_holders?: number | null
          auto_buy_min_market_cap?: number | null
          auto_buy_on_mint?: boolean | null
          auto_buy_require_dev_buy?: boolean | null
          auto_buy_wait_for_buys?: number | null
          coordinated_buy_count?: number | null
          coordinated_buy_window_minutes?: number | null
          created_at?: string | null
          distribution_enabled?: boolean | null
          distribution_percent_per_wallet?: number | null
          distribution_percent_wallet_1?: number | null
          distribution_percent_wallet_2?: number | null
          distribution_percent_wallet_3?: number | null
          distribution_wallet_1?: string | null
          distribution_wallet_2?: string | null
          distribution_wallet_3?: string | null
          email_address?: string | null
          funding_burst_count?: number | null
          funding_burst_window_minutes?: number | null
          id?: string
          notify_browser?: boolean | null
          notify_email?: boolean | null
          notify_telegram?: boolean | null
          pending_telegram_ids?: Json | null
          profit_taking_threshold_percent?: number | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          additional_telegram_ids?: string[] | null
          auto_buy_amount_sol?: number | null
          auto_buy_max_dump_ratio?: number | null
          auto_buy_max_market_cap?: number | null
          auto_buy_max_wait_minutes?: number | null
          auto_buy_min_age_minutes?: number | null
          auto_buy_min_holders?: number | null
          auto_buy_min_market_cap?: number | null
          auto_buy_on_mint?: boolean | null
          auto_buy_require_dev_buy?: boolean | null
          auto_buy_wait_for_buys?: number | null
          coordinated_buy_count?: number | null
          coordinated_buy_window_minutes?: number | null
          created_at?: string | null
          distribution_enabled?: boolean | null
          distribution_percent_per_wallet?: number | null
          distribution_percent_wallet_1?: number | null
          distribution_percent_wallet_2?: number | null
          distribution_percent_wallet_3?: number | null
          distribution_wallet_1?: string | null
          distribution_wallet_2?: string | null
          distribution_wallet_3?: string | null
          email_address?: string | null
          funding_burst_count?: number | null
          funding_burst_window_minutes?: number | null
          id?: string
          notify_browser?: boolean | null
          notify_email?: boolean | null
          notify_telegram?: boolean | null
          pending_telegram_ids?: Json | null
          profit_taking_threshold_percent?: number | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mega_whale_auto_buy_config: {
        Row: {
          auto_sell_enabled: boolean | null
          buy_amount_sol: number | null
          buys_today: number | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          last_buy_reset: string | null
          max_daily_buys: number | null
          max_position_age_hours: number | null
          min_launcher_score: number | null
          price_check_interval_seconds: number | null
          remaining_position_stop_loss_pct: number | null
          remaining_position_take_profit_pct: number | null
          sell_percent_initial: number | null
          sell_percent_remaining: number | null
          slippage_bps: number | null
          stop_loss_pct: number | null
          take_profit_pct: number | null
          trailing_stop_enabled: boolean | null
          trailing_stop_pct: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_sell_enabled?: boolean | null
          buy_amount_sol?: number | null
          buys_today?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          last_buy_reset?: string | null
          max_daily_buys?: number | null
          max_position_age_hours?: number | null
          min_launcher_score?: number | null
          price_check_interval_seconds?: number | null
          remaining_position_stop_loss_pct?: number | null
          remaining_position_take_profit_pct?: number | null
          sell_percent_initial?: number | null
          sell_percent_remaining?: number | null
          slippage_bps?: number | null
          stop_loss_pct?: number | null
          take_profit_pct?: number | null
          trailing_stop_enabled?: boolean | null
          trailing_stop_pct?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_sell_enabled?: boolean | null
          buy_amount_sol?: number | null
          buys_today?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          last_buy_reset?: string | null
          max_daily_buys?: number | null
          max_position_age_hours?: number | null
          min_launcher_score?: number | null
          price_check_interval_seconds?: number | null
          remaining_position_stop_loss_pct?: number | null
          remaining_position_take_profit_pct?: number | null
          sell_percent_initial?: number | null
          sell_percent_remaining?: number | null
          slippage_bps?: number | null
          stop_loss_pct?: number | null
          take_profit_pct?: number | null
          trailing_stop_enabled?: boolean | null
          trailing_stop_pct?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mega_whale_auto_buy_wallets: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          pubkey: string
          secret_key_encrypted: string
          sol_balance: number | null
          total_buys: number | null
          total_sol_spent: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          pubkey: string
          secret_key_encrypted: string
          sol_balance?: number | null
          total_buys?: number | null
          total_sol_spent?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          pubkey?: string
          secret_key_encrypted?: string
          sol_balance?: number | null
          total_buys?: number | null
          total_sol_spent?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mega_whale_auto_trades: {
        Row: {
          amount_sol: number
          buyability_score: number | null
          buys_detected: number | null
          buys_required: number | null
          created_at: string | null
          dev_has_bought: boolean | null
          error_message: string | null
          executed_at: string | null
          execution_price: number | null
          id: string
          market_cap_at_check: number | null
          mega_whale_id: string | null
          monitoring_expires_at: string | null
          monitoring_started_at: string | null
          pattern_alert_id: string | null
          rejection_reason: string | null
          status: string
          token_age_minutes: number | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          tokens_received: number | null
          trade_type: string
          transaction_signature: string | null
          unique_holders: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_sol: number
          buyability_score?: number | null
          buys_detected?: number | null
          buys_required?: number | null
          created_at?: string | null
          dev_has_bought?: boolean | null
          error_message?: string | null
          executed_at?: string | null
          execution_price?: number | null
          id?: string
          market_cap_at_check?: number | null
          mega_whale_id?: string | null
          monitoring_expires_at?: string | null
          monitoring_started_at?: string | null
          pattern_alert_id?: string | null
          rejection_reason?: string | null
          status?: string
          token_age_minutes?: number | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          tokens_received?: number | null
          trade_type?: string
          transaction_signature?: string | null
          unique_holders?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_sol?: number
          buyability_score?: number | null
          buys_detected?: number | null
          buys_required?: number | null
          created_at?: string | null
          dev_has_bought?: boolean | null
          error_message?: string | null
          executed_at?: string | null
          execution_price?: number | null
          id?: string
          market_cap_at_check?: number | null
          mega_whale_id?: string | null
          monitoring_expires_at?: string | null
          monitoring_started_at?: string | null
          pattern_alert_id?: string | null
          rejection_reason?: string | null
          status?: string
          token_age_minutes?: number | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          tokens_received?: number | null
          trade_type?: string
          transaction_signature?: string | null
          unique_holders?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mega_whale_auto_trades_mega_whale_id_fkey"
            columns: ["mega_whale_id"]
            isOneToOne: false
            referencedRelation: "mega_whales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mega_whale_auto_trades_pattern_alert_id_fkey"
            columns: ["pattern_alert_id"]
            isOneToOne: false
            referencedRelation: "mega_whale_pattern_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      mega_whale_distributions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          distribution_amount_sol: number
          error_message: string | null
          id: string
          source_signature: string | null
          status: string | null
          total_profit_sol: number
          trade_id: string | null
          user_id: string
          wallet_1_address: string | null
          wallet_1_signature: string | null
          wallet_2_address: string | null
          wallet_2_signature: string | null
          wallet_3_address: string | null
          wallet_3_signature: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          distribution_amount_sol: number
          error_message?: string | null
          id?: string
          source_signature?: string | null
          status?: string | null
          total_profit_sol: number
          trade_id?: string | null
          user_id: string
          wallet_1_address?: string | null
          wallet_1_signature?: string | null
          wallet_2_address?: string | null
          wallet_2_signature?: string | null
          wallet_3_address?: string | null
          wallet_3_signature?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          distribution_amount_sol?: number
          error_message?: string | null
          id?: string
          source_signature?: string | null
          status?: string | null
          total_profit_sol?: number
          trade_id?: string | null
          user_id?: string
          wallet_1_address?: string | null
          wallet_1_signature?: string | null
          wallet_2_address?: string | null
          wallet_2_signature?: string | null
          wallet_3_address?: string | null
          wallet_3_signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mega_whale_distributions_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "mega_whale_auto_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      mega_whale_mint_alerts: {
        Row: {
          auto_buy_amount_sol: number | null
          auto_buy_status: string | null
          auto_buy_triggered: boolean | null
          auto_buy_tx: string | null
          created_at: string | null
          detected_at: string | null
          funding_chain: Json | null
          id: string
          launcher_score: number | null
          mega_whale_id: string | null
          minter_wallet: string
          offspring_id: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
        }
        Insert: {
          auto_buy_amount_sol?: number | null
          auto_buy_status?: string | null
          auto_buy_triggered?: boolean | null
          auto_buy_tx?: string | null
          created_at?: string | null
          detected_at?: string | null
          funding_chain?: Json | null
          id?: string
          launcher_score?: number | null
          mega_whale_id?: string | null
          minter_wallet: string
          offspring_id?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
        }
        Update: {
          auto_buy_amount_sol?: number | null
          auto_buy_status?: string | null
          auto_buy_triggered?: boolean | null
          auto_buy_tx?: string | null
          created_at?: string | null
          detected_at?: string | null
          funding_chain?: Json | null
          id?: string
          launcher_score?: number | null
          mega_whale_id?: string | null
          minter_wallet?: string
          offspring_id?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mega_whale_mint_alerts_mega_whale_id_fkey"
            columns: ["mega_whale_id"]
            isOneToOne: false
            referencedRelation: "mega_whales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mega_whale_mint_alerts_offspring_id_fkey"
            columns: ["offspring_id"]
            isOneToOne: false
            referencedRelation: "mega_whale_offspring"
            referencedColumns: ["id"]
          },
        ]
      }
      mega_whale_offspring: {
        Row: {
          balance_checked_at: string | null
          bundle_id: string | null
          created_at: string | null
          current_sol_balance: number | null
          depth_level: number
          dust_marked_at: string | null
          dust_recheck_at: string | null
          dust_token_value_usd: number | null
          first_funded_at: string | null
          first_seen_at: string | null
          has_minted: boolean | null
          id: string
          is_active_trader: boolean | null
          is_bundled: boolean | null
          is_dust: boolean | null
          is_mintable: boolean | null
          is_monitored: boolean | null
          is_pump_fun_dev: boolean | null
          last_activity_at: string | null
          last_scored_at: string | null
          launcher_score: number | null
          mega_whale_id: string
          minted_token: string | null
          parent_offspring_id: string | null
          parent_wallet_address: string | null
          score_factors: Json | null
          tokens_bought: Json | null
          tokens_minted: Json | null
          tokens_sold: Json | null
          total_sol_received: number | null
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          balance_checked_at?: string | null
          bundle_id?: string | null
          created_at?: string | null
          current_sol_balance?: number | null
          depth_level?: number
          dust_marked_at?: string | null
          dust_recheck_at?: string | null
          dust_token_value_usd?: number | null
          first_funded_at?: string | null
          first_seen_at?: string | null
          has_minted?: boolean | null
          id?: string
          is_active_trader?: boolean | null
          is_bundled?: boolean | null
          is_dust?: boolean | null
          is_mintable?: boolean | null
          is_monitored?: boolean | null
          is_pump_fun_dev?: boolean | null
          last_activity_at?: string | null
          last_scored_at?: string | null
          launcher_score?: number | null
          mega_whale_id: string
          minted_token?: string | null
          parent_offspring_id?: string | null
          parent_wallet_address?: string | null
          score_factors?: Json | null
          tokens_bought?: Json | null
          tokens_minted?: Json | null
          tokens_sold?: Json | null
          total_sol_received?: number | null
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          balance_checked_at?: string | null
          bundle_id?: string | null
          created_at?: string | null
          current_sol_balance?: number | null
          depth_level?: number
          dust_marked_at?: string | null
          dust_recheck_at?: string | null
          dust_token_value_usd?: number | null
          first_funded_at?: string | null
          first_seen_at?: string | null
          has_minted?: boolean | null
          id?: string
          is_active_trader?: boolean | null
          is_bundled?: boolean | null
          is_dust?: boolean | null
          is_mintable?: boolean | null
          is_monitored?: boolean | null
          is_pump_fun_dev?: boolean | null
          last_activity_at?: string | null
          last_scored_at?: string | null
          launcher_score?: number | null
          mega_whale_id?: string
          minted_token?: string | null
          parent_offspring_id?: string | null
          parent_wallet_address?: string | null
          score_factors?: Json | null
          tokens_bought?: Json | null
          tokens_minted?: Json | null
          tokens_sold?: Json | null
          total_sol_received?: number | null
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "mega_whale_offspring_mega_whale_id_fkey"
            columns: ["mega_whale_id"]
            isOneToOne: false
            referencedRelation: "mega_whales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mega_whale_offspring_parent_offspring_id_fkey"
            columns: ["parent_offspring_id"]
            isOneToOne: false
            referencedRelation: "mega_whale_offspring"
            referencedColumns: ["id"]
          },
        ]
      }
      mega_whale_pattern_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_notified_browser: boolean | null
          is_notified_email: boolean | null
          is_notified_telegram: boolean | null
          is_read: boolean | null
          mega_whale_id: string | null
          metadata: Json | null
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_notified_browser?: boolean | null
          is_notified_email?: boolean | null
          is_notified_telegram?: boolean | null
          is_read?: boolean | null
          mega_whale_id?: string | null
          metadata?: Json | null
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_notified_browser?: boolean | null
          is_notified_email?: boolean | null
          is_notified_telegram?: boolean | null
          is_read?: boolean | null
          mega_whale_id?: string | null
          metadata?: Json | null
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mega_whale_pattern_alerts_mega_whale_id_fkey"
            columns: ["mega_whale_id"]
            isOneToOne: false
            referencedRelation: "mega_whales"
            referencedColumns: ["id"]
          },
        ]
      }
      mega_whale_positions: {
        Row: {
          amount_tokens: number
          average_sell_price_sol: number | null
          closed_at: string | null
          created_at: string | null
          current_price_sol: number | null
          entry_price_sol: number
          high_price_sol: number | null
          id: string
          last_price_check: string | null
          opened_at: string | null
          original_amount_tokens: number | null
          partial_sells_count: number | null
          pnl_percent: number | null
          sell_price_sol: number | null
          sell_reason: string | null
          sell_signature: string | null
          status: string | null
          token_mint: string
          token_symbol: string | null
          total_sold_tokens: number | null
          trade_id: string | null
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount_tokens: number
          average_sell_price_sol?: number | null
          closed_at?: string | null
          created_at?: string | null
          current_price_sol?: number | null
          entry_price_sol: number
          high_price_sol?: number | null
          id?: string
          last_price_check?: string | null
          opened_at?: string | null
          original_amount_tokens?: number | null
          partial_sells_count?: number | null
          pnl_percent?: number | null
          sell_price_sol?: number | null
          sell_reason?: string | null
          sell_signature?: string | null
          status?: string | null
          token_mint: string
          token_symbol?: string | null
          total_sold_tokens?: number | null
          trade_id?: string | null
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount_tokens?: number
          average_sell_price_sol?: number | null
          closed_at?: string | null
          created_at?: string | null
          current_price_sol?: number | null
          entry_price_sol?: number
          high_price_sol?: number | null
          id?: string
          last_price_check?: string | null
          opened_at?: string | null
          original_amount_tokens?: number | null
          partial_sells_count?: number | null
          pnl_percent?: number | null
          sell_price_sol?: number | null
          sell_reason?: string | null
          sell_signature?: string | null
          status?: string | null
          token_mint?: string
          token_symbol?: string | null
          total_sold_tokens?: number | null
          trade_id?: string | null
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: []
      }
      mega_whale_token_alerts: {
        Row: {
          alert_type: string
          amount_sol: number | null
          bonding_curve_progress: number | null
          created_at: string | null
          detected_at: string | null
          funding_chain: Json | null
          id: string
          is_read: boolean | null
          market_cap_at_detection: number | null
          mega_whale_id: string
          metadata: Json | null
          offspring_id: string | null
          token_created_at: string | null
          token_image: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          user_id: string
        }
        Insert: {
          alert_type: string
          amount_sol?: number | null
          bonding_curve_progress?: number | null
          created_at?: string | null
          detected_at?: string | null
          funding_chain?: Json | null
          id?: string
          is_read?: boolean | null
          market_cap_at_detection?: number | null
          mega_whale_id: string
          metadata?: Json | null
          offspring_id?: string | null
          token_created_at?: string | null
          token_image?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          amount_sol?: number | null
          bonding_curve_progress?: number | null
          created_at?: string | null
          detected_at?: string | null
          funding_chain?: Json | null
          id?: string
          is_read?: boolean | null
          market_cap_at_detection?: number | null
          mega_whale_id?: string
          metadata?: Json | null
          offspring_id?: string | null
          token_created_at?: string | null
          token_image?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mega_whale_token_alerts_mega_whale_id_fkey"
            columns: ["mega_whale_id"]
            isOneToOne: false
            referencedRelation: "mega_whales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mega_whale_token_alerts_offspring_id_fkey"
            columns: ["offspring_id"]
            isOneToOne: false
            referencedRelation: "mega_whale_offspring"
            referencedColumns: ["id"]
          },
        ]
      }
      mega_whales: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          first_tracked_at: string | null
          helius_webhook_id: string | null
          id: string
          is_active: boolean | null
          last_activity_at: string | null
          last_sync_at: string | null
          nickname: string | null
          notes: string | null
          source_cex: string | null
          total_offspring_wallets: number | null
          total_tokens_bought: number | null
          total_tokens_minted: number | null
          updated_at: string | null
          user_id: string
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          first_tracked_at?: string | null
          helius_webhook_id?: string | null
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          last_sync_at?: string | null
          nickname?: string | null
          notes?: string | null
          source_cex?: string | null
          total_offspring_wallets?: number | null
          total_tokens_bought?: number | null
          total_tokens_minted?: number | null
          updated_at?: string | null
          user_id: string
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          first_tracked_at?: string | null
          helius_webhook_id?: string | null
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          last_sync_at?: string | null
          nickname?: string | null
          notes?: string | null
          source_cex?: string | null
          total_offspring_wallets?: number | null
          total_tokens_bought?: number | null
          total_tokens_minted?: number | null
          updated_at?: string | null
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      mesh_growth_daily: {
        Row: {
          coverage_pct: number | null
          created_at: string | null
          id: string
          metadata: Json | null
          new_identities_24h: number | null
          new_links_24h: number | null
          new_profiles_24h: number | null
          snapshot_date: string
          total_developer_profiles: number | null
          total_social_identities: number | null
          total_wallet_links: number | null
        }
        Insert: {
          coverage_pct?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_identities_24h?: number | null
          new_links_24h?: number | null
          new_profiles_24h?: number | null
          snapshot_date?: string
          total_developer_profiles?: number | null
          total_social_identities?: number | null
          total_wallet_links?: number | null
        }
        Update: {
          coverage_pct?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_identities_24h?: number | null
          new_links_24h?: number | null
          new_profiles_24h?: number | null
          snapshot_date?: string
          total_developer_profiles?: number | null
          total_social_identities?: number | null
          total_wallet_links?: number | null
        }
        Relationships: []
      }
      mesh_spider_queue: {
        Row: {
          completed_at: string | null
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          links_discovered: number | null
          priority: number
          queued_at: string
          result_summary: Json | null
          source: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          links_discovered?: number | null
          priority?: number
          queued_at?: string
          result_summary?: Json | null
          source: string
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          links_discovered?: number | null
          priority?: number
          queued_at?: string
          result_summary?: Json | null
          source?: string
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      meta_tags_config: {
        Row: {
          article_slug: string | null
          canonical_url: string | null
          created_at: string
          extra_meta: Json | null
          id: string
          is_active: boolean
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          og_type: string | null
          og_url: string | null
          route_path: string | null
          scope: string
          twitter_card: string | null
          twitter_description: string | null
          twitter_image: string | null
          twitter_title: string | null
          updated_at: string
        }
        Insert: {
          article_slug?: string | null
          canonical_url?: string | null
          created_at?: string
          extra_meta?: Json | null
          id?: string
          is_active?: boolean
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          og_type?: string | null
          og_url?: string | null
          route_path?: string | null
          scope?: string
          twitter_card?: string | null
          twitter_description?: string | null
          twitter_image?: string | null
          twitter_title?: string | null
          updated_at?: string
        }
        Update: {
          article_slug?: string | null
          canonical_url?: string | null
          created_at?: string
          extra_meta?: Json | null
          id?: string
          is_active?: boolean
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          og_type?: string | null
          og_url?: string | null
          route_path?: string | null
          scope?: string
          twitter_card?: string | null
          twitter_description?: string | null
          twitter_image?: string | null
          twitter_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mint_monitor_detections: {
        Row: {
          created_at: string
          detected_at: string
          id: string
          notified_at: string | null
          token_image: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          wallet_id: string
        }
        Insert: {
          created_at?: string
          detected_at?: string
          id?: string
          notified_at?: string | null
          token_image?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          wallet_id: string
        }
        Update: {
          created_at?: string
          detected_at?: string
          id?: string
          notified_at?: string | null
          token_image?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mint_monitor_detections_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "mint_monitor_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      mint_monitor_scan_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          mints_found: number
          new_mints_detected: number
          scan_duration_ms: number | null
          scanned_at: string
          status: string
          wallet_address: string
          wallet_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          mints_found?: number
          new_mints_detected?: number
          scan_duration_ms?: number | null
          scanned_at?: string
          status?: string
          wallet_address: string
          wallet_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          mints_found?: number
          new_mints_detected?: number
          scan_duration_ms?: number | null
          scanned_at?: string
          status?: string
          wallet_address?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mint_monitor_scan_logs_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "mint_monitor_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      mint_monitor_wallets: {
        Row: {
          created_at: string
          id: string
          is_cron_enabled: boolean
          label: string | null
          last_scanned_at: string | null
          notification_emails: string[] | null
          source_token: string | null
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_cron_enabled?: boolean
          label?: string | null
          last_scanned_at?: string | null
          notification_emails?: string[] | null
          source_token?: string | null
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          is_cron_enabled?: boolean
          label?: string | null
          last_scanned_at?: string | null
          notification_emails?: string[] | null
          source_token?: string | null
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      monitored_wallets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      monthly_usage_archive: {
        Row: {
          archived_at: string | null
          estimated_cost_usd: number | null
          id: string
          month_year: string
          quota_limit: number | null
          service_name: string
          total_calls: number | null
          total_credits_used: number | null
          total_errors: number | null
          usage_percentage: number | null
        }
        Insert: {
          archived_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          month_year: string
          quota_limit?: number | null
          service_name: string
          total_calls?: number | null
          total_credits_used?: number | null
          total_errors?: number | null
          usage_percentage?: number | null
        }
        Update: {
          archived_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          month_year?: string
          quota_limit?: number | null
          service_name?: string
          total_calls?: number | null
          total_credits_used?: number | null
          total_errors?: number | null
          usage_percentage?: number | null
        }
        Relationships: []
      }
      morning_reports: {
        Row: {
          alerts: Json
          allstar_stats: Json | null
          api_usage_summary: Json
          auth_failure_events: Json
          created_at: string
          db_size_info: Json | null
          dlq_stats: Json | null
          email_verification_stats: Json | null
          error_patterns: Json
          execution_time_ms: number | null
          external_services_status: Json
          function_health: Json | null
          funnel_feed_throughput: Json | null
          funnel_metrics: Json | null
          fusion_stats: Json | null
          holders_intel_metrics: Json | null
          id: string
          intelligence_stats: Json | null
          mesh_growth: Json | null
          new_signups: number
          new_signups_details: Json
          new_subscribers: number
          new_subscribers_details: Json
          overall_status: string
          quota_status: Json
          rate_limit_events: Json
          report_date: string
          report_period_end: string
          report_period_start: string
          sol_subscription_stats: Json | null
          spider_metrics: Json | null
          table_health: Json
          telegram_bot_stats: Json | null
          telegram_sent: boolean
          telegram_sent_at: string | null
          unread_notifications: number
          user_auth_stats: Json | null
          vigil_stats: Json | null
          web_chat_stats: Json | null
        }
        Insert: {
          alerts?: Json
          allstar_stats?: Json | null
          api_usage_summary?: Json
          auth_failure_events?: Json
          created_at?: string
          db_size_info?: Json | null
          dlq_stats?: Json | null
          email_verification_stats?: Json | null
          error_patterns?: Json
          execution_time_ms?: number | null
          external_services_status?: Json
          function_health?: Json | null
          funnel_feed_throughput?: Json | null
          funnel_metrics?: Json | null
          fusion_stats?: Json | null
          holders_intel_metrics?: Json | null
          id?: string
          intelligence_stats?: Json | null
          mesh_growth?: Json | null
          new_signups?: number
          new_signups_details?: Json
          new_subscribers?: number
          new_subscribers_details?: Json
          overall_status?: string
          quota_status?: Json
          rate_limit_events?: Json
          report_date: string
          report_period_end: string
          report_period_start: string
          sol_subscription_stats?: Json | null
          spider_metrics?: Json | null
          table_health?: Json
          telegram_bot_stats?: Json | null
          telegram_sent?: boolean
          telegram_sent_at?: string | null
          unread_notifications?: number
          user_auth_stats?: Json | null
          vigil_stats?: Json | null
          web_chat_stats?: Json | null
        }
        Update: {
          alerts?: Json
          allstar_stats?: Json | null
          api_usage_summary?: Json
          auth_failure_events?: Json
          created_at?: string
          db_size_info?: Json | null
          dlq_stats?: Json | null
          email_verification_stats?: Json | null
          error_patterns?: Json
          execution_time_ms?: number | null
          external_services_status?: Json
          function_health?: Json | null
          funnel_feed_throughput?: Json | null
          funnel_metrics?: Json | null
          fusion_stats?: Json | null
          holders_intel_metrics?: Json | null
          id?: string
          intelligence_stats?: Json | null
          mesh_growth?: Json | null
          new_signups?: number
          new_signups_details?: Json
          new_subscribers?: number
          new_subscribers_details?: Json
          overall_status?: string
          quota_status?: Json
          rate_limit_events?: Json
          report_date?: string
          report_period_end?: string
          report_period_start?: string
          sol_subscription_stats?: Json | null
          spider_metrics?: Json | null
          table_health?: Json
          telegram_bot_stats?: Json | null
          telegram_sent?: boolean
          telegram_sent_at?: string | null
          unread_notifications?: number
          user_auth_stats?: Json | null
          vigil_stats?: Json | null
          web_chat_stats?: Json | null
        }
        Relationships: []
      }
      morning_reports_archive: {
        Row: {
          alerts: Json | null
          api_usage_summary: Json | null
          archived_at: string
          auth_failure_events: Json | null
          created_at: string | null
          dlq_stats: Json | null
          error_patterns: Json | null
          execution_time_ms: number | null
          external_services_status: Json | null
          function_health: Json | null
          funnel_metrics: Json | null
          holders_intel_metrics: Json | null
          id: string
          mesh_growth: Json | null
          new_signups: number | null
          new_signups_details: Json | null
          new_subscribers: number | null
          new_subscribers_details: Json | null
          overall_status: string | null
          quota_status: Json | null
          rate_limit_events: Json | null
          report_date: string
          report_period_end: string | null
          report_period_start: string | null
          sol_subscription_stats: Json | null
          spider_metrics: Json | null
          table_health: Json | null
          telegram_sent: boolean | null
          telegram_sent_at: string | null
          unread_notifications: number | null
          web_chat_stats: Json | null
        }
        Insert: {
          alerts?: Json | null
          api_usage_summary?: Json | null
          archived_at?: string
          auth_failure_events?: Json | null
          created_at?: string | null
          dlq_stats?: Json | null
          error_patterns?: Json | null
          execution_time_ms?: number | null
          external_services_status?: Json | null
          function_health?: Json | null
          funnel_metrics?: Json | null
          holders_intel_metrics?: Json | null
          id: string
          mesh_growth?: Json | null
          new_signups?: number | null
          new_signups_details?: Json | null
          new_subscribers?: number | null
          new_subscribers_details?: Json | null
          overall_status?: string | null
          quota_status?: Json | null
          rate_limit_events?: Json | null
          report_date: string
          report_period_end?: string | null
          report_period_start?: string | null
          sol_subscription_stats?: Json | null
          spider_metrics?: Json | null
          table_health?: Json | null
          telegram_sent?: boolean | null
          telegram_sent_at?: string | null
          unread_notifications?: number | null
          web_chat_stats?: Json | null
        }
        Update: {
          alerts?: Json | null
          api_usage_summary?: Json | null
          archived_at?: string
          auth_failure_events?: Json | null
          created_at?: string | null
          dlq_stats?: Json | null
          error_patterns?: Json | null
          execution_time_ms?: number | null
          external_services_status?: Json | null
          function_health?: Json | null
          funnel_metrics?: Json | null
          holders_intel_metrics?: Json | null
          id?: string
          mesh_growth?: Json | null
          new_signups?: number | null
          new_signups_details?: Json | null
          new_subscribers?: number | null
          new_subscribers_details?: Json | null
          overall_status?: string | null
          quota_status?: Json | null
          rate_limit_events?: Json | null
          report_date?: string
          report_period_end?: string | null
          report_period_start?: string | null
          sol_subscription_stats?: Json | null
          spider_metrics?: Json | null
          table_health?: Json | null
          telegram_sent?: boolean | null
          telegram_sent_at?: string | null
          unread_notifications?: number | null
          web_chat_stats?: Json | null
        }
        Relationships: []
      }
      no_lube_assets: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          language: string | null
          last_used_at: string | null
          name: string
          notes: string | null
          public_url: string
          storage_path: string
          tags: string[]
          times_used: number
          updated_at: string
          usage_count: number
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          language?: string | null
          last_used_at?: string | null
          name: string
          notes?: string | null
          public_url: string
          storage_path: string
          tags?: string[]
          times_used?: number
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          language?: string | null
          last_used_at?: string | null
          name?: string
          notes?: string | null
          public_url?: string
          storage_path?: string
          tags?: string[]
          times_used?: number
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      no_lube_card_renders: {
        Row: {
          ai_used: boolean
          asset_ids: string[]
          created_at: string
          current_mcap: number | null
          entry_mcap: number | null
          fallback_reason: string | null
          id: string
          language: string | null
          multiplier: number | null
          output_url: string
          profile_kind: string
          prompt: string | null
          rotation_mode: string | null
          selection_reason: string | null
          template_id: string | null
          ticker: string | null
          token_mint: string
        }
        Insert: {
          ai_used?: boolean
          asset_ids?: string[]
          created_at?: string
          current_mcap?: number | null
          entry_mcap?: number | null
          fallback_reason?: string | null
          id?: string
          language?: string | null
          multiplier?: number | null
          output_url: string
          profile_kind: string
          prompt?: string | null
          rotation_mode?: string | null
          selection_reason?: string | null
          template_id?: string | null
          ticker?: string | null
          token_mint: string
        }
        Update: {
          ai_used?: boolean
          asset_ids?: string[]
          created_at?: string
          current_mcap?: number | null
          entry_mcap?: number | null
          fallback_reason?: string | null
          id?: string
          language?: string | null
          multiplier?: number | null
          output_url?: string
          profile_kind?: string
          prompt?: string | null
          rotation_mode?: string | null
          selection_reason?: string | null
          template_id?: string | null
          ticker?: string | null
          token_mint?: string
        }
        Relationships: [
          {
            foreignKeyName: "no_lube_card_renders_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "no_lube_card_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      no_lube_card_templates: {
        Row: {
          aspect: string
          created_at: string
          enabled: boolean
          exif_copyright: string | null
          exif_description: string | null
          exif_owner: string | null
          font_family: string | null
          font_url: string | null
          id: string
          is_default: boolean
          language: string
          profile_kind: string
          safe_zones: Json
          show_ca: boolean
          show_url: boolean
          template_name: string
          template_url: string
          updated_at: string
          url_to_show: string | null
        }
        Insert: {
          aspect?: string
          created_at?: string
          enabled?: boolean
          exif_copyright?: string | null
          exif_description?: string | null
          exif_owner?: string | null
          font_family?: string | null
          font_url?: string | null
          id?: string
          is_default?: boolean
          language?: string
          profile_kind: string
          safe_zones?: Json
          show_ca?: boolean
          show_url?: boolean
          template_name: string
          template_url: string
          updated_at?: string
          url_to_show?: string | null
        }
        Update: {
          aspect?: string
          created_at?: string
          enabled?: boolean
          exif_copyright?: string | null
          exif_description?: string | null
          exif_owner?: string | null
          font_family?: string | null
          font_url?: string | null
          id?: string
          is_default?: boolean
          language?: string
          profile_kind?: string
          safe_zones?: Json
          show_ca?: boolean
          show_url?: boolean
          template_name?: string
          template_url?: string
          updated_at?: string
          url_to_show?: string | null
        }
        Relationships: []
      }
      no_lube_channel_profiles: {
        Row: {
          access_purchase_url: string | null
          cta_button_text: string | null
          instagram_handle: string | null
          kind: string
          language: string
          tab_nickname: string | null
          telegram_chat_id: string | null
          telegram_chat_title: string | null
          telegram_chat_username: string | null
          telegram_link: string | null
          tiktok_handle: string | null
          trade_bot_token_secret_name: string | null
          trade_bot_username: string | null
          updated_at: string
          x_handle: string | null
        }
        Insert: {
          access_purchase_url?: string | null
          cta_button_text?: string | null
          instagram_handle?: string | null
          kind: string
          language?: string
          tab_nickname?: string | null
          telegram_chat_id?: string | null
          telegram_chat_title?: string | null
          telegram_chat_username?: string | null
          telegram_link?: string | null
          tiktok_handle?: string | null
          trade_bot_token_secret_name?: string | null
          trade_bot_username?: string | null
          updated_at?: string
          x_handle?: string | null
        }
        Update: {
          access_purchase_url?: string | null
          cta_button_text?: string | null
          instagram_handle?: string | null
          kind?: string
          language?: string
          tab_nickname?: string | null
          telegram_chat_id?: string | null
          telegram_chat_title?: string | null
          telegram_chat_username?: string | null
          telegram_link?: string | null
          tiktok_handle?: string | null
          trade_bot_token_secret_name?: string | null
          trade_bot_username?: string | null
          updated_at?: string
          x_handle?: string | null
        }
        Relationships: []
      }
      no_lube_channel_settings: {
        Row: {
          active_template_id: string | null
          last_used_template_id: string | null
          profile_kind: string
          rotation_mode: string
          updated_at: string
        }
        Insert: {
          active_template_id?: string | null
          last_used_template_id?: string | null
          profile_kind: string
          rotation_mode?: string
          updated_at?: string
        }
        Update: {
          active_template_id?: string | null
          last_used_template_id?: string | null
          profile_kind?: string
          rotation_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "no_lube_channel_settings_active_template_id_fkey"
            columns: ["active_template_id"]
            isOneToOne: false
            referencedRelation: "no_lube_card_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "no_lube_channel_settings_last_used_template_id_fkey"
            columns: ["last_used_template_id"]
            isOneToOne: false
            referencedRelation: "no_lube_card_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      no_lube_global_profile: {
        Row: {
          backlog_max_age_min: number
          id: string
          language: string
          leaks_min_mcap: number
          legacy_max_age_days: number
          legacy_min_gap_hours: number
          legacy_min_mcap: number
          legacy_progress_step: number
          multiplier_threshold: number
          progress_step: number
          snapshot_use_mint_image: boolean
          style: string
          updated_at: string
        }
        Insert: {
          backlog_max_age_min?: number
          id?: string
          language?: string
          leaks_min_mcap?: number
          legacy_max_age_days?: number
          legacy_min_gap_hours?: number
          legacy_min_mcap?: number
          legacy_progress_step?: number
          multiplier_threshold?: number
          progress_step?: number
          snapshot_use_mint_image?: boolean
          style?: string
          updated_at?: string
        }
        Update: {
          backlog_max_age_min?: number
          id?: string
          language?: string
          leaks_min_mcap?: number
          legacy_max_age_days?: number
          legacy_min_gap_hours?: number
          legacy_min_mcap?: number
          legacy_progress_step?: number
          multiplier_threshold?: number
          progress_step?: number
          snapshot_use_mint_image?: boolean
          style?: string
          updated_at?: string
        }
        Relationships: []
      }
      no_lube_post_log: {
        Row: {
          age_minutes: number | null
          block_reason: string | null
          channel: string | null
          composed_at: string
          composed_by: string | null
          had_image: boolean
          id: string
          image_prompt: string | null
          image_url: string | null
          last_mcap_at_post: number | null
          last_multiplier: number | null
          last_posted_at: string | null
          liq_usd: number | null
          mcap: number | null
          mint_time: string | null
          post_kind: string
          posted: boolean
          posted_at: string | null
          price_change_24h: number | null
          source_message_id: number | null
          tg_message_id: number | null
          ticker: string | null
          times_posted: number
          token_mint: string
          top10_pct: number | null
          verdict_class: string
          vol_24h: number | null
        }
        Insert: {
          age_minutes?: number | null
          block_reason?: string | null
          channel?: string | null
          composed_at?: string
          composed_by?: string | null
          had_image?: boolean
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          last_mcap_at_post?: number | null
          last_multiplier?: number | null
          last_posted_at?: string | null
          liq_usd?: number | null
          mcap?: number | null
          mint_time?: string | null
          post_kind?: string
          posted?: boolean
          posted_at?: string | null
          price_change_24h?: number | null
          source_message_id?: number | null
          tg_message_id?: number | null
          ticker?: string | null
          times_posted?: number
          token_mint: string
          top10_pct?: number | null
          verdict_class: string
          vol_24h?: number | null
        }
        Update: {
          age_minutes?: number | null
          block_reason?: string | null
          channel?: string | null
          composed_at?: string
          composed_by?: string | null
          had_image?: boolean
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          last_mcap_at_post?: number | null
          last_multiplier?: number | null
          last_posted_at?: string | null
          liq_usd?: number | null
          mcap?: number | null
          mint_time?: string | null
          post_kind?: string
          posted?: boolean
          posted_at?: string | null
          price_change_24h?: number | null
          source_message_id?: number | null
          tg_message_id?: number | null
          ticker?: string | null
          times_posted?: number
          token_mint?: string
          top10_pct?: number | null
          verdict_class?: string
          vol_24h?: number | null
        }
        Relationships: []
      }
      no_lube_socials: {
        Row: {
          created_at: string
          display_order: number
          handle: string
          id: string
          password_ciphertext: string | null
          platform: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          handle?: string
          id?: string
          password_ciphertext?: string | null
          platform: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          handle?: string
          id?: string
          password_ciphertext?: string | null
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      nolube_channel_members: {
        Row: {
          channel_kind: string
          chat_id: string
          classification_locked: boolean
          created_at: string
          first_name: string | null
          id: string
          is_seed: boolean
          joined_at: string
          last_name: string | null
          last_seen_at: string
          left_at: string | null
          profile_key: string
          seed_batch_id: string | null
          source: string
          telegram_user_id: number
          updated_at: string
          username: string | null
          welcomed_at: string | null
        }
        Insert: {
          channel_kind: string
          chat_id: string
          classification_locked?: boolean
          created_at?: string
          first_name?: string | null
          id?: string
          is_seed?: boolean
          joined_at?: string
          last_name?: string | null
          last_seen_at?: string
          left_at?: string | null
          profile_key: string
          seed_batch_id?: string | null
          source?: string
          telegram_user_id: number
          updated_at?: string
          username?: string | null
          welcomed_at?: string | null
        }
        Update: {
          channel_kind?: string
          chat_id?: string
          classification_locked?: boolean
          created_at?: string
          first_name?: string | null
          id?: string
          is_seed?: boolean
          joined_at?: string
          last_name?: string | null
          last_seen_at?: string
          left_at?: string | null
          profile_key?: string
          seed_batch_id?: string | null
          source?: string
          telegram_user_id?: number
          updated_at?: string
          username?: string | null
          welcomed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nolube_channel_members_seed_batch_id_fkey"
            columns: ["seed_batch_id"]
            isOneToOne: false
            referencedRelation: "nolube_seed_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      nolube_channel_snapshots: {
        Row: {
          channel_kind: string
          chat_id: string
          id: string
          notes: string | null
          organic_active: number
          organic_joins_window: number
          organic_leaves_window: number
          profile_key: string
          seed_active: number
          seed_active_batch_id: string | null
          seed_leaves_window: number
          total_members: number
          ts: string
        }
        Insert: {
          channel_kind: string
          chat_id: string
          id?: string
          notes?: string | null
          organic_active?: number
          organic_joins_window?: number
          organic_leaves_window?: number
          profile_key: string
          seed_active?: number
          seed_active_batch_id?: string | null
          seed_leaves_window?: number
          total_members?: number
          ts?: string
        }
        Update: {
          channel_kind?: string
          chat_id?: string
          id?: string
          notes?: string | null
          organic_active?: number
          organic_joins_window?: number
          organic_leaves_window?: number
          profile_key?: string
          seed_active?: number
          seed_active_batch_id?: string | null
          seed_leaves_window?: number
          total_members?: number
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "nolube_channel_snapshots_seed_active_batch_id_fkey"
            columns: ["seed_active_batch_id"]
            isOneToOne: false
            referencedRelation: "nolube_seed_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      nolube_seed_batches: {
        Row: {
          actual_count: number
          channel_kind: string
          chat_id: string
          created_at: string
          detected_via: string
          ended_at: string | null
          expected_count: number | null
          id: string
          notes: string | null
          profile_key: string
          started_at: string
          trigger_rolling_median: number | null
          trigger_window_joins: number | null
        }
        Insert: {
          actual_count?: number
          channel_kind: string
          chat_id: string
          created_at?: string
          detected_via: string
          ended_at?: string | null
          expected_count?: number | null
          id?: string
          notes?: string | null
          profile_key: string
          started_at?: string
          trigger_rolling_median?: number | null
          trigger_window_joins?: number | null
        }
        Update: {
          actual_count?: number
          channel_kind?: string
          chat_id?: string
          created_at?: string
          detected_via?: string
          ended_at?: string | null
          expected_count?: number | null
          id?: string
          notes?: string | null
          profile_key?: string
          started_at?: string
          trigger_rolling_median?: number | null
          trigger_window_joins?: number | null
        }
        Relationships: []
      }
      notification_delivery_log: {
        Row: {
          channel: string
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          notification_id: string | null
          recipient: string | null
          response_body: string | null
          response_code: number | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          notification_id?: string | null
          recipient?: string | null
          response_body?: string | null
          response_code?: number | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          notification_id?: string | null
          recipient?: string | null
          response_body?: string | null
          response_code?: number | null
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      one_time_action_tokens: {
        Row: {
          action_type: string
          created_at: string
          expires_at: string
          id: string
          payload: Json | null
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json | null
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json | null
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      oracle_backfill_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          new_devs_discovered: number | null
          started_at: string | null
          status: string | null
          target_date: string
          tokens_found: number | null
          tokens_scanned: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          new_devs_discovered?: number | null
          started_at?: string | null
          status?: string | null
          target_date: string
          tokens_found?: number | null
          tokens_scanned?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          new_devs_discovered?: number | null
          started_at?: string | null
          status?: string | null
          target_date?: string
          tokens_found?: number | null
          tokens_scanned?: number | null
        }
        Relationships: []
      }
      pending_reactivation_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          processed: boolean
          reactivation_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          processed?: boolean
          reactivation_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          processed?: boolean
          reactivation_token?: string
          user_id?: string
        }
        Relationships: []
      }
      phone_verifications: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          phone_number: string
          verification_code: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          phone_number: string
          verification_code: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          phone_number?: string
          verification_code?: string
          verified?: boolean
        }
        Relationships: []
      }
      pipeline_reset_markers: {
        Row: {
          created_at: string
          note: string | null
          pipeline_name: string
          reset_after: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          pipeline_name: string
          reset_after: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          note?: string | null
          pipeline_name?: string
          reset_after?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
        }
        Insert: {
          config_key: string
          config_value: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      platform_health_mode: {
        Row: {
          id: string
          medium: string
          updated_at: string
          updated_by: string | null
          use_ai: boolean
        }
        Insert: {
          id?: string
          medium: string
          updated_at?: string
          updated_by?: string | null
          use_ai?: boolean
        }
        Update: {
          id?: string
          medium?: string
          updated_at?: string
          updated_by?: string | null
          use_ai?: boolean
        }
        Relationships: []
      }
      premium_feature_views: {
        Row: {
          converted_to_signup: boolean | null
          created_at: string | null
          feature_name: string
          id: string
          token_mint: string | null
          user_id: string | null
          viewed_as_teaser: boolean | null
        }
        Insert: {
          converted_to_signup?: boolean | null
          created_at?: string | null
          feature_name: string
          id?: string
          token_mint?: string | null
          user_id?: string | null
          viewed_as_teaser?: boolean | null
        }
        Update: {
          converted_to_signup?: boolean | null
          created_at?: string | null
          feature_name?: string
          id?: string
          token_mint?: string | null
          user_id?: string | null
          viewed_as_teaser?: boolean | null
        }
        Relationships: []
      }
      pricing_tiers: {
        Row: {
          base_fee_sol: number
          created_at: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_trades_per_hour: number | null
          max_wallets_per_campaign: number | null
          per_trade_fee_sol: number
          service_markup_percent: number
          tier_name: string
        }
        Insert: {
          base_fee_sol: number
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_trades_per_hour?: number | null
          max_wallets_per_campaign?: number | null
          per_trade_fee_sol: number
          service_markup_percent?: number
          tier_name: string
        }
        Update: {
          base_fee_sol?: number
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_trades_per_hour?: number | null
          max_wallets_per_campaign?: number | null
          per_trade_fee_sol?: number
          service_markup_percent?: number
          tier_name?: string
        }
        Relationships: []
      }
      profile_bot_contact_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          payload: Json
          profile_key: string
          telegram_user_id: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          payload?: Json
          profile_key: string
          telegram_user_id: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          payload?: Json
          profile_key?: string
          telegram_user_id?: number
        }
        Relationships: []
      }
      profile_bot_contacts: {
        Row: {
          acquisition_source: string
          created_at: string
          current_expires_at: string | null
          ever_paid: boolean
          first_name: string | null
          first_paid_at: string | null
          first_referrer_code: string | null
          first_referrer_tg_id: number | null
          first_seen_at: string
          has_referral_code: boolean
          id: string
          is_currently_paid: boolean
          language_code: string | null
          last_broadcast_at: string | null
          last_name: string | null
          last_paid_at: string | null
          last_referrer_code: string | null
          last_seen_at: string
          opted_out_at: string | null
          opted_out_broadcasts: boolean
          profile_key: string
          referral_code: string | null
          referral_code_status: string | null
          referral_months_earned: number
          referrals_attributed: number
          referrals_converted: number
          referrals_pending: number
          telegram_user_id: number
          telegram_username: string | null
          total_dms: number
          total_months_paid: number
          total_sol_paid: number
          total_subscriptions: number
          updated_at: string
          utm_payload: string | null
        }
        Insert: {
          acquisition_source?: string
          created_at?: string
          current_expires_at?: string | null
          ever_paid?: boolean
          first_name?: string | null
          first_paid_at?: string | null
          first_referrer_code?: string | null
          first_referrer_tg_id?: number | null
          first_seen_at?: string
          has_referral_code?: boolean
          id?: string
          is_currently_paid?: boolean
          language_code?: string | null
          last_broadcast_at?: string | null
          last_name?: string | null
          last_paid_at?: string | null
          last_referrer_code?: string | null
          last_seen_at?: string
          opted_out_at?: string | null
          opted_out_broadcasts?: boolean
          profile_key: string
          referral_code?: string | null
          referral_code_status?: string | null
          referral_months_earned?: number
          referrals_attributed?: number
          referrals_converted?: number
          referrals_pending?: number
          telegram_user_id: number
          telegram_username?: string | null
          total_dms?: number
          total_months_paid?: number
          total_sol_paid?: number
          total_subscriptions?: number
          updated_at?: string
          utm_payload?: string | null
        }
        Update: {
          acquisition_source?: string
          created_at?: string
          current_expires_at?: string | null
          ever_paid?: boolean
          first_name?: string | null
          first_paid_at?: string | null
          first_referrer_code?: string | null
          first_referrer_tg_id?: number | null
          first_seen_at?: string
          has_referral_code?: boolean
          id?: string
          is_currently_paid?: boolean
          language_code?: string | null
          last_broadcast_at?: string | null
          last_name?: string | null
          last_paid_at?: string | null
          last_referrer_code?: string | null
          last_seen_at?: string
          opted_out_at?: string | null
          opted_out_broadcasts?: boolean
          profile_key?: string
          referral_code?: string | null
          referral_code_status?: string | null
          referral_months_earned?: number
          referrals_attributed?: number
          referrals_converted?: number
          referrals_pending?: number
          telegram_user_id?: number
          telegram_username?: string | null
          total_dms?: number
          total_months_paid?: number
          total_sol_paid?: number
          total_subscriptions?: number
          updated_at?: string
          utm_payload?: string | null
        }
        Relationships: []
      }
      profile_central_wallet_withdrawals: {
        Row: {
          confirmed_at: string | null
          created_at: string
          error: string | null
          from_pubkey: string
          id: string
          lamports: number
          profile_key: string
          requested_by: string | null
          signature: string | null
          status: string
          to_pubkey: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          error?: string | null
          from_pubkey: string
          id?: string
          lamports: number
          profile_key: string
          requested_by?: string | null
          signature?: string | null
          status?: string
          to_pubkey: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          error?: string | null
          from_pubkey?: string
          id?: string
          lamports?: number
          profile_key?: string
          requested_by?: string | null
          signature?: string | null
          status?: string
          to_pubkey?: string
        }
        Relationships: []
      }
      profile_subscription_configs: {
        Row: {
          admin_telegram_id: number | null
          affiliate_enabled: boolean
          affiliate_footer_copy: string | null
          affiliate_marketing_copy: string | null
          affiliate_months_per_referral: number
          affiliate_pending_window_days: number
          affiliate_preamble_interval_hours: number
          affiliate_preamble_last_posted_at: string | null
          affiliate_preamble_variants: string[] | null
          base_currency: string
          bot_secret_name: string
          bot_username: string | null
          central_wallet_generated_at: string | null
          central_wallet_label: string | null
          central_wallet_pubkey: string | null
          central_wallet_secret_encrypted: string | null
          created_at: string
          display_currencies: string[]
          display_name: string
          expiry_copy: string | null
          is_active: boolean
          paid_welcome_copy: string | null
          paid_welcome_image_url: string | null
          private_chat_id: string | null
          profile_key: string
          public_chat_id: string | null
          public_welcome_copy: string | null
          public_welcome_enabled: boolean
          public_welcome_image_url: string | null
          public_welcome_persona: string
          updated_at: string
          welcome_copy: string | null
          welcome_image_url: string | null
        }
        Insert: {
          admin_telegram_id?: number | null
          affiliate_enabled?: boolean
          affiliate_footer_copy?: string | null
          affiliate_marketing_copy?: string | null
          affiliate_months_per_referral?: number
          affiliate_pending_window_days?: number
          affiliate_preamble_interval_hours?: number
          affiliate_preamble_last_posted_at?: string | null
          affiliate_preamble_variants?: string[] | null
          base_currency?: string
          bot_secret_name: string
          bot_username?: string | null
          central_wallet_generated_at?: string | null
          central_wallet_label?: string | null
          central_wallet_pubkey?: string | null
          central_wallet_secret_encrypted?: string | null
          created_at?: string
          display_currencies?: string[]
          display_name: string
          expiry_copy?: string | null
          is_active?: boolean
          paid_welcome_copy?: string | null
          paid_welcome_image_url?: string | null
          private_chat_id?: string | null
          profile_key: string
          public_chat_id?: string | null
          public_welcome_copy?: string | null
          public_welcome_enabled?: boolean
          public_welcome_image_url?: string | null
          public_welcome_persona?: string
          updated_at?: string
          welcome_copy?: string | null
          welcome_image_url?: string | null
        }
        Update: {
          admin_telegram_id?: number | null
          affiliate_enabled?: boolean
          affiliate_footer_copy?: string | null
          affiliate_marketing_copy?: string | null
          affiliate_months_per_referral?: number
          affiliate_pending_window_days?: number
          affiliate_preamble_interval_hours?: number
          affiliate_preamble_last_posted_at?: string | null
          affiliate_preamble_variants?: string[] | null
          base_currency?: string
          bot_secret_name?: string
          bot_username?: string | null
          central_wallet_generated_at?: string | null
          central_wallet_label?: string | null
          central_wallet_pubkey?: string | null
          central_wallet_secret_encrypted?: string | null
          created_at?: string
          display_currencies?: string[]
          display_name?: string
          expiry_copy?: string | null
          is_active?: boolean
          paid_welcome_copy?: string | null
          paid_welcome_image_url?: string | null
          private_chat_id?: string | null
          profile_key?: string
          public_chat_id?: string | null
          public_welcome_copy?: string | null
          public_welcome_enabled?: boolean
          public_welcome_image_url?: string | null
          public_welcome_persona?: string
          updated_at?: string
          welcome_copy?: string | null
          welcome_image_url?: string | null
        }
        Relationships: []
      }
      profile_subscription_tiers: {
        Row: {
          created_at: string
          discount_pct: number
          is_active: boolean
          price_fiat: number
          profile_key: string
          sort_order: number
          tier_months: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_pct?: number
          is_active?: boolean
          price_fiat: number
          profile_key: string
          sort_order?: number
          tier_months: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_pct?: number
          is_active?: boolean
          price_fiat?: number
          profile_key?: string
          sort_order?: number
          tier_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_subscription_tiers_profile_key_fkey"
            columns: ["profile_key"]
            isOneToOne: false
            referencedRelation: "profile_subscription_configs"
            referencedColumns: ["profile_key"]
          },
        ]
      }
      profile_subscriptions: {
        Row: {
          base_currency: string
          country: string | null
          created_at: string
          expires_at: string | null
          id: string
          invite_link: string | null
          language: string | null
          paid_at: string | null
          payment_wallet_pubkey: string
          payment_wallet_secret_encrypted: string
          price_fiat: number
          profile_key: string
          quote_window_expires_at: string
          quoted_sol: number
          sol_price_at_order: number | null
          status: string
          sweep_tx_signature: string | null
          swept_at: string | null
          telegram_user_id: number
          telegram_username: string | null
          tier_months: number
          tx_signature: string | null
          updated_at: string
        }
        Insert: {
          base_currency: string
          country?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_link?: string | null
          language?: string | null
          paid_at?: string | null
          payment_wallet_pubkey: string
          payment_wallet_secret_encrypted: string
          price_fiat: number
          profile_key: string
          quote_window_expires_at?: string
          quoted_sol: number
          sol_price_at_order?: number | null
          status?: string
          sweep_tx_signature?: string | null
          swept_at?: string | null
          telegram_user_id: number
          telegram_username?: string | null
          tier_months: number
          tx_signature?: string | null
          updated_at?: string
        }
        Update: {
          base_currency?: string
          country?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_link?: string | null
          language?: string | null
          paid_at?: string | null
          payment_wallet_pubkey?: string
          payment_wallet_secret_encrypted?: string
          price_fiat?: number
          profile_key?: string
          quote_window_expires_at?: string
          quoted_sol?: number
          sol_price_at_order?: number | null
          status?: string
          sweep_tx_signature?: string | null
          swept_at?: string | null
          telegram_user_id?: number
          telegram_username?: string | null
          tier_months?: number
          tx_signature?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_subscriptions_profile_key_fkey"
            columns: ["profile_key"]
            isOneToOne: false
            referencedRelation: "profile_subscription_configs"
            referencedColumns: ["profile_key"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_scan_reason: string | null
          avatar_scan_status: string | null
          avatar_url: string | null
          cached_subscription_active: boolean | null
          cached_subscription_expires_at: string | null
          cached_tier_key: string | null
          comment_karma: number
          created_at: string
          display_name: string | null
          email_verified: boolean | null
          feature_usage: Json | null
          forum_avatar_url_cached: string | null
          forum_display_name_cached: string | null
          forum_identity_source: string | null
          id: string
          last_active_at: string | null
          last_login_at: string | null
          login_count: number | null
          member_since: string | null
          nickname: string | null
          oauth_full_name: string | null
          oauth_provider: string | null
          oauth_provider_id: string | null
          oauth_raw_data: Json | null
          oauth_username: string | null
          onboarding_completed: boolean | null
          phone_number: string | null
          phone_verified: boolean | null
          preferred_currency: string | null
          rank_slug: string
          referral_source: string | null
          secondary_email: string | null
          secondary_email_verified: boolean
          total_session_minutes: number | null
          two_factor_enabled: boolean | null
          two_factor_secret: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_scan_reason?: string | null
          avatar_scan_status?: string | null
          avatar_url?: string | null
          cached_subscription_active?: boolean | null
          cached_subscription_expires_at?: string | null
          cached_tier_key?: string | null
          comment_karma?: number
          created_at?: string
          display_name?: string | null
          email_verified?: boolean | null
          feature_usage?: Json | null
          forum_avatar_url_cached?: string | null
          forum_display_name_cached?: string | null
          forum_identity_source?: string | null
          id?: string
          last_active_at?: string | null
          last_login_at?: string | null
          login_count?: number | null
          member_since?: string | null
          nickname?: string | null
          oauth_full_name?: string | null
          oauth_provider?: string | null
          oauth_provider_id?: string | null
          oauth_raw_data?: Json | null
          oauth_username?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          phone_verified?: boolean | null
          preferred_currency?: string | null
          rank_slug?: string
          referral_source?: string | null
          secondary_email?: string | null
          secondary_email_verified?: boolean
          total_session_minutes?: number | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_scan_reason?: string | null
          avatar_scan_status?: string | null
          avatar_url?: string | null
          cached_subscription_active?: boolean | null
          cached_subscription_expires_at?: string | null
          cached_tier_key?: string | null
          comment_karma?: number
          created_at?: string
          display_name?: string | null
          email_verified?: boolean | null
          feature_usage?: Json | null
          forum_avatar_url_cached?: string | null
          forum_display_name_cached?: string | null
          forum_identity_source?: string | null
          id?: string
          last_active_at?: string | null
          last_login_at?: string | null
          login_count?: number | null
          member_since?: string | null
          nickname?: string | null
          oauth_full_name?: string | null
          oauth_provider?: string | null
          oauth_provider_id?: string | null
          oauth_raw_data?: Json | null
          oauth_username?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          phone_verified?: boolean | null
          preferred_currency?: string | null
          rank_slug?: string
          referral_source?: string | null
          secondary_email?: string | null
          secondary_email_verified?: boolean
          total_session_minutes?: number | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          id: string
          is_active: boolean
          max_uses: number
          source_label: string | null
          tier_granted: string
          trial_duration_days: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number
          source_label?: string | null
          tier_granted?: string
          trial_duration_days?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number
          source_label?: string | null
          tier_granted?: string
          trial_duration_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          expires_at: string
          id: string
          is_active: boolean
          promo_code_id: string
          redeemed_at: string
          source_label: string | null
          telegram_user_id: string | null
          user_id: string | null
        }
        Insert: {
          expires_at: string
          id?: string
          is_active?: boolean
          promo_code_id: string
          redeemed_at?: string
          source_label?: string | null
          telegram_user_id?: string | null
          user_id?: string | null
        }
        Update: {
          expires_at?: string
          id?: string
          is_active?: boolean
          promo_code_id?: string
          redeemed_at?: string
          source_label?: string | null
          telegram_user_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_tweet_config: {
        Row: {
          created_at: string
          id: string
          interval_hours: number
          is_running: boolean
          last_posted_at: string | null
          last_posted_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_hours?: number
          is_running?: boolean
          last_posted_at?: string | null
          last_posted_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_hours?: number
          is_running?: boolean
          last_posted_at?: string | null
          last_posted_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_tweet_templates: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          template_text: string
          template_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          template_text?: string
          template_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          template_text?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      proven_dev_tokens: {
        Row: {
          ath_timestamp: string | null
          bonding_timestamp: string | null
          created_at: string | null
          dev_wallet: string | null
          first_dex_boost_at: string | null
          id: string
          market_cap_at_discovery: number | null
          market_cap_ath: number | null
          mint_timestamp: string | null
          name: string | null
          snapshot_slot: string | null
          symbol: string | null
          tier: number
          tier_1_at: string | null
          tier_2_at: string | null
          tier_200k_at: string | null
          tier_3_at: string | null
          tier_300k_at: string | null
          tier_4_at: string | null
          tier_5_at: string | null
          tier_6_at: string | null
          token_mint: string
          trigger_source: string | null
          updated_at: string | null
        }
        Insert: {
          ath_timestamp?: string | null
          bonding_timestamp?: string | null
          created_at?: string | null
          dev_wallet?: string | null
          first_dex_boost_at?: string | null
          id?: string
          market_cap_at_discovery?: number | null
          market_cap_ath?: number | null
          mint_timestamp?: string | null
          name?: string | null
          snapshot_slot?: string | null
          symbol?: string | null
          tier?: number
          tier_1_at?: string | null
          tier_2_at?: string | null
          tier_200k_at?: string | null
          tier_3_at?: string | null
          tier_300k_at?: string | null
          tier_4_at?: string | null
          tier_5_at?: string | null
          tier_6_at?: string | null
          token_mint: string
          trigger_source?: string | null
          updated_at?: string | null
        }
        Update: {
          ath_timestamp?: string | null
          bonding_timestamp?: string | null
          created_at?: string | null
          dev_wallet?: string | null
          first_dex_boost_at?: string | null
          id?: string
          market_cap_at_discovery?: number | null
          market_cap_ath?: number | null
          mint_timestamp?: string | null
          name?: string | null
          snapshot_slot?: string | null
          symbol?: string | null
          tier?: number
          tier_1_at?: string | null
          tier_2_at?: string | null
          tier_200k_at?: string | null
          tier_3_at?: string | null
          tier_300k_at?: string | null
          tier_4_at?: string | null
          tier_5_at?: string | null
          tier_6_at?: string | null
          token_mint?: string
          trigger_source?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pumpfun_blacklist: {
        Row: {
          added_by: string | null
          auto_classified: boolean | null
          auto_discovered_links: Json | null
          blacklist_reason: string | null
          classification_score: number | null
          created_at: string
          enriched_at: string | null
          enrichment_error: string | null
          enrichment_status: string | null
          entry_type: string
          evidence_notes: string | null
          first_seen_at: string | null
          funding_trace: Json | null
          id: string
          identifier: string
          is_active: boolean | null
          linked_pumpfun_accounts: string[] | null
          linked_telegram: string[] | null
          linked_token_mints: string[] | null
          linked_twitter: string[] | null
          linked_wallets: string[] | null
          recommendation_text: string | null
          risk_level: string
          source: string | null
          tags: string[] | null
          tokens_rugged: number | null
          total_stolen_sol: number | null
          total_victims: number | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          auto_classified?: boolean | null
          auto_discovered_links?: Json | null
          blacklist_reason?: string | null
          classification_score?: number | null
          created_at?: string
          enriched_at?: string | null
          enrichment_error?: string | null
          enrichment_status?: string | null
          entry_type: string
          evidence_notes?: string | null
          first_seen_at?: string | null
          funding_trace?: Json | null
          id?: string
          identifier: string
          is_active?: boolean | null
          linked_pumpfun_accounts?: string[] | null
          linked_telegram?: string[] | null
          linked_token_mints?: string[] | null
          linked_twitter?: string[] | null
          linked_wallets?: string[] | null
          recommendation_text?: string | null
          risk_level?: string
          source?: string | null
          tags?: string[] | null
          tokens_rugged?: number | null
          total_stolen_sol?: number | null
          total_victims?: number | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          auto_classified?: boolean | null
          auto_discovered_links?: Json | null
          blacklist_reason?: string | null
          classification_score?: number | null
          created_at?: string
          enriched_at?: string | null
          enrichment_error?: string | null
          enrichment_status?: string | null
          entry_type?: string
          evidence_notes?: string | null
          first_seen_at?: string | null
          funding_trace?: Json | null
          id?: string
          identifier?: string
          is_active?: boolean | null
          linked_pumpfun_accounts?: string[] | null
          linked_telegram?: string[] | null
          linked_token_mints?: string[] | null
          linked_twitter?: string[] | null
          linked_wallets?: string[] | null
          recommendation_text?: string | null
          risk_level?: string
          source?: string | null
          tags?: string[] | null
          tokens_rugged?: number | null
          total_stolen_sol?: number | null
          total_victims?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      pumpfun_buy_candidates: {
        Row: {
          auto_buy_enabled: boolean | null
          bonding_curve_pct: number | null
          bundle_score: number | null
          created_at: string
          creator_wallet: string | null
          detected_at: string
          holder_count: number | null
          id: string
          is_bundled: boolean | null
          market_cap_usd: number | null
          metadata: Json | null
          position_id: string | null
          rejection_reason: string | null
          scalp_approved: boolean | null
          scalp_validation_result: Json | null
          status: string
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          transaction_count: number | null
          updated_at: string
          volume_sol_5m: number | null
          volume_usd_5m: number | null
        }
        Insert: {
          auto_buy_enabled?: boolean | null
          bonding_curve_pct?: number | null
          bundle_score?: number | null
          created_at?: string
          creator_wallet?: string | null
          detected_at?: string
          holder_count?: number | null
          id?: string
          is_bundled?: boolean | null
          market_cap_usd?: number | null
          metadata?: Json | null
          position_id?: string | null
          rejection_reason?: string | null
          scalp_approved?: boolean | null
          scalp_validation_result?: Json | null
          status?: string
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          transaction_count?: number | null
          updated_at?: string
          volume_sol_5m?: number | null
          volume_usd_5m?: number | null
        }
        Update: {
          auto_buy_enabled?: boolean | null
          bonding_curve_pct?: number | null
          bundle_score?: number | null
          created_at?: string
          creator_wallet?: string | null
          detected_at?: string
          holder_count?: number | null
          id?: string
          is_bundled?: boolean | null
          market_cap_usd?: number | null
          metadata?: Json | null
          position_id?: string | null
          rejection_reason?: string | null
          scalp_approved?: boolean | null
          scalp_validation_result?: Json | null
          status?: string
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          transaction_count?: number | null
          updated_at?: string
          volume_sol_5m?: number | null
          volume_usd_5m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pumpfun_buy_candidates_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "flip_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      pumpfun_comment_accounts: {
        Row: {
          bot_confidence_score: number | null
          created_at: string
          duplicate_message_count: number
          first_seen_at: string
          flagged_reasons: string[] | null
          id: string
          is_flagged_bot: boolean
          last_seen_at: string
          linked_creator_wallets: string[] | null
          tokens_commented_on: number
          total_comments: number
          updated_at: string
          username: string
          username_entropy_score: number | null
        }
        Insert: {
          bot_confidence_score?: number | null
          created_at?: string
          duplicate_message_count?: number
          first_seen_at?: string
          flagged_reasons?: string[] | null
          id?: string
          is_flagged_bot?: boolean
          last_seen_at?: string
          linked_creator_wallets?: string[] | null
          tokens_commented_on?: number
          total_comments?: number
          updated_at?: string
          username: string
          username_entropy_score?: number | null
        }
        Update: {
          bot_confidence_score?: number | null
          created_at?: string
          duplicate_message_count?: number
          first_seen_at?: string
          flagged_reasons?: string[] | null
          id?: string
          is_flagged_bot?: boolean
          last_seen_at?: string
          linked_creator_wallets?: string[] | null
          tokens_commented_on?: number
          total_comments?: number
          updated_at?: string
          username?: string
          username_entropy_score?: number | null
        }
        Relationships: []
      }
      pumpfun_daily_stats: {
        Row: {
          created_at: string | null
          failed_sells: number | null
          id: string
          kill_switch_triggers: number | null
          net_pnl_sol: number | null
          prune_events: number | null
          stat_date: string
          successful_sells: number | null
          tokens_bought: number | null
          tokens_discovered: number | null
          tokens_rejected: number | null
          tokens_sold: number | null
          total_buys: number | null
          total_loss_sol: number | null
          total_profit_sol: number | null
          updated_at: string | null
          win_rate: number | null
        }
        Insert: {
          created_at?: string | null
          failed_sells?: number | null
          id?: string
          kill_switch_triggers?: number | null
          net_pnl_sol?: number | null
          prune_events?: number | null
          stat_date?: string
          successful_sells?: number | null
          tokens_bought?: number | null
          tokens_discovered?: number | null
          tokens_rejected?: number | null
          tokens_sold?: number | null
          total_buys?: number | null
          total_loss_sol?: number | null
          total_profit_sol?: number | null
          updated_at?: string | null
          win_rate?: number | null
        }
        Update: {
          created_at?: string | null
          failed_sells?: number | null
          id?: string
          kill_switch_triggers?: number | null
          net_pnl_sol?: number | null
          prune_events?: number | null
          stat_date?: string
          successful_sells?: number | null
          tokens_bought?: number | null
          tokens_discovered?: number | null
          tokens_rejected?: number | null
          tokens_sold?: number | null
          total_buys?: number | null
          total_loss_sol?: number | null
          total_profit_sol?: number | null
          updated_at?: string | null
          win_rate?: number | null
        }
        Relationships: []
      }
      pumpfun_discovery_logs: {
        Row: {
          acceptance_reasoning: Json | null
          actual_outcome: string | null
          actual_roi_pct: number | null
          age_minutes: number | null
          bonding_curve_pct: number | null
          bundle_score: number | null
          buy_sell_ratio: number | null
          buys_count: number | null
          classification_reasoning: string[] | null
          config_snapshot: Json | null
          created_at: string
          creator_integrity_score: number | null
          creator_wallet: string | null
          current_multiplier: number | null
          decision: string
          dex_paid_details: Json | null
          dex_paid_early: boolean | null
          entry_window: string | null
          failed_filters: string[] | null
          first_buyers_analysis: Json | null
          holder_count: number | null
          id: string
          is_mayhem_mode: boolean | null
          liquidity_usd: number | null
          manual_review_at: string | null
          manual_review_notes: string | null
          market_cap_usd: number | null
          metadata: Json | null
          passed_filters: string[] | null
          poll_run_id: string | null
          price_tier: string | null
          price_usd: number | null
          recommended_action: string | null
          rejection_reason: string | null
          reviewed_by: string | null
          score_breakdown: Json | null
          sells_count: number | null
          should_have_bought: boolean | null
          similar_holdings_count: number | null
          social_details: Json | null
          social_score: number | null
          strategy_details: Json | null
          telegram_score: number | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          token_type: string | null
          top10_holder_pct: number | null
          top5_holder_pct: number | null
          twitter_score: number | null
          tx_count: number | null
          volume_sol: number | null
          volume_usd: number | null
          wallet_quality_score: number | null
          website_score: number | null
        }
        Insert: {
          acceptance_reasoning?: Json | null
          actual_outcome?: string | null
          actual_roi_pct?: number | null
          age_minutes?: number | null
          bonding_curve_pct?: number | null
          bundle_score?: number | null
          buy_sell_ratio?: number | null
          buys_count?: number | null
          classification_reasoning?: string[] | null
          config_snapshot?: Json | null
          created_at?: string
          creator_integrity_score?: number | null
          creator_wallet?: string | null
          current_multiplier?: number | null
          decision: string
          dex_paid_details?: Json | null
          dex_paid_early?: boolean | null
          entry_window?: string | null
          failed_filters?: string[] | null
          first_buyers_analysis?: Json | null
          holder_count?: number | null
          id?: string
          is_mayhem_mode?: boolean | null
          liquidity_usd?: number | null
          manual_review_at?: string | null
          manual_review_notes?: string | null
          market_cap_usd?: number | null
          metadata?: Json | null
          passed_filters?: string[] | null
          poll_run_id?: string | null
          price_tier?: string | null
          price_usd?: number | null
          recommended_action?: string | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          score_breakdown?: Json | null
          sells_count?: number | null
          should_have_bought?: boolean | null
          similar_holdings_count?: number | null
          social_details?: Json | null
          social_score?: number | null
          strategy_details?: Json | null
          telegram_score?: number | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          token_type?: string | null
          top10_holder_pct?: number | null
          top5_holder_pct?: number | null
          twitter_score?: number | null
          tx_count?: number | null
          volume_sol?: number | null
          volume_usd?: number | null
          wallet_quality_score?: number | null
          website_score?: number | null
        }
        Update: {
          acceptance_reasoning?: Json | null
          actual_outcome?: string | null
          actual_roi_pct?: number | null
          age_minutes?: number | null
          bonding_curve_pct?: number | null
          bundle_score?: number | null
          buy_sell_ratio?: number | null
          buys_count?: number | null
          classification_reasoning?: string[] | null
          config_snapshot?: Json | null
          created_at?: string
          creator_integrity_score?: number | null
          creator_wallet?: string | null
          current_multiplier?: number | null
          decision?: string
          dex_paid_details?: Json | null
          dex_paid_early?: boolean | null
          entry_window?: string | null
          failed_filters?: string[] | null
          first_buyers_analysis?: Json | null
          holder_count?: number | null
          id?: string
          is_mayhem_mode?: boolean | null
          liquidity_usd?: number | null
          manual_review_at?: string | null
          manual_review_notes?: string | null
          market_cap_usd?: number | null
          metadata?: Json | null
          passed_filters?: string[] | null
          poll_run_id?: string | null
          price_tier?: string | null
          price_usd?: number | null
          recommended_action?: string | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          score_breakdown?: Json | null
          sells_count?: number | null
          should_have_bought?: boolean | null
          similar_holdings_count?: number | null
          social_details?: Json | null
          social_score?: number | null
          strategy_details?: Json | null
          telegram_score?: number | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          token_type?: string | null
          top10_holder_pct?: number | null
          top5_holder_pct?: number | null
          twitter_score?: number | null
          tx_count?: number | null
          volume_sol?: number | null
          volume_usd?: number | null
          wallet_quality_score?: number | null
          website_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pumpfun_discovery_logs_poll_run_id_fkey"
            columns: ["poll_run_id"]
            isOneToOne: false
            referencedRelation: "pumpfun_poll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pumpfun_fantasy_positions: {
        Row: {
          created_at: string | null
          creator_wallet: string | null
          current_price_sol: number | null
          current_price_usd: number | null
          entry_amount_sol: number
          entry_at: string | null
          entry_bonding_curve_pct: number | null
          entry_flags: Json | null
          entry_holder_count: number | null
          entry_market_cap_usd: number | null
          entry_price_sol: number | null
          entry_price_usd: number | null
          entry_rugcheck_score: number | null
          entry_signal_strength_raw: string | null
          entry_socials_count: number | null
          entry_token_age_mins: number | null
          entry_volume_24h_sol: number | null
          exit_at: string | null
          exit_price_usd: number | null
          exit_reason: string | null
          id: string
          loss_tags: string[] | null
          lp_checked_at: string | null
          lp_liquidity_usd: number | null
          main_realized_pnl_sol: number | null
          main_sold_amount_sol: number | null
          main_sold_at: string | null
          main_sold_price_usd: number | null
          manual_loss_reason: string | null
          moonbag_active: boolean | null
          moonbag_current_value_sol: number | null
          moonbag_drawdown_pct: number | null
          moonbag_entry_value_sol: number | null
          moonbag_peak_price_usd: number | null
          moonbag_percentage: number | null
          moonbag_token_amount: number | null
          optimal_entry_market_cap: number | null
          optimal_exit_multiplier: number | null
          outcome: string | null
          outcome_classified_at: string | null
          outcome_notes: string | null
          peak_at: string | null
          peak_multiplier: number | null
          peak_price_usd: number | null
          post_exit_checked_at: string | null
          post_exit_graduated: boolean | null
          post_exit_mcap: number | null
          post_exit_multiplier_vs_entry: number | null
          post_exit_outcome: string | null
          post_exit_price_usd: number | null
          post_exit_recovered: boolean | null
          rehabilitated_at: string | null
          rehabilitated_by: string | null
          rehabilitation_status: string | null
          sell_percentage: number | null
          signal_strength: number | null
          status: string
          target_multiplier: number | null
          time_to_peak_mins: number | null
          time_to_rug_mins: number | null
          token_amount: number | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          total_pnl_percent: number | null
          total_realized_pnl_sol: number | null
          unrealized_pnl_percent: number | null
          unrealized_pnl_sol: number | null
          updated_at: string | null
          watchlist_id: string | null
        }
        Insert: {
          created_at?: string | null
          creator_wallet?: string | null
          current_price_sol?: number | null
          current_price_usd?: number | null
          entry_amount_sol: number
          entry_at?: string | null
          entry_bonding_curve_pct?: number | null
          entry_flags?: Json | null
          entry_holder_count?: number | null
          entry_market_cap_usd?: number | null
          entry_price_sol?: number | null
          entry_price_usd?: number | null
          entry_rugcheck_score?: number | null
          entry_signal_strength_raw?: string | null
          entry_socials_count?: number | null
          entry_token_age_mins?: number | null
          entry_volume_24h_sol?: number | null
          exit_at?: string | null
          exit_price_usd?: number | null
          exit_reason?: string | null
          id?: string
          loss_tags?: string[] | null
          lp_checked_at?: string | null
          lp_liquidity_usd?: number | null
          main_realized_pnl_sol?: number | null
          main_sold_amount_sol?: number | null
          main_sold_at?: string | null
          main_sold_price_usd?: number | null
          manual_loss_reason?: string | null
          moonbag_active?: boolean | null
          moonbag_current_value_sol?: number | null
          moonbag_drawdown_pct?: number | null
          moonbag_entry_value_sol?: number | null
          moonbag_peak_price_usd?: number | null
          moonbag_percentage?: number | null
          moonbag_token_amount?: number | null
          optimal_entry_market_cap?: number | null
          optimal_exit_multiplier?: number | null
          outcome?: string | null
          outcome_classified_at?: string | null
          outcome_notes?: string | null
          peak_at?: string | null
          peak_multiplier?: number | null
          peak_price_usd?: number | null
          post_exit_checked_at?: string | null
          post_exit_graduated?: boolean | null
          post_exit_mcap?: number | null
          post_exit_multiplier_vs_entry?: number | null
          post_exit_outcome?: string | null
          post_exit_price_usd?: number | null
          post_exit_recovered?: boolean | null
          rehabilitated_at?: string | null
          rehabilitated_by?: string | null
          rehabilitation_status?: string | null
          sell_percentage?: number | null
          signal_strength?: number | null
          status?: string
          target_multiplier?: number | null
          time_to_peak_mins?: number | null
          time_to_rug_mins?: number | null
          token_amount?: number | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          total_pnl_percent?: number | null
          total_realized_pnl_sol?: number | null
          unrealized_pnl_percent?: number | null
          unrealized_pnl_sol?: number | null
          updated_at?: string | null
          watchlist_id?: string | null
        }
        Update: {
          created_at?: string | null
          creator_wallet?: string | null
          current_price_sol?: number | null
          current_price_usd?: number | null
          entry_amount_sol?: number
          entry_at?: string | null
          entry_bonding_curve_pct?: number | null
          entry_flags?: Json | null
          entry_holder_count?: number | null
          entry_market_cap_usd?: number | null
          entry_price_sol?: number | null
          entry_price_usd?: number | null
          entry_rugcheck_score?: number | null
          entry_signal_strength_raw?: string | null
          entry_socials_count?: number | null
          entry_token_age_mins?: number | null
          entry_volume_24h_sol?: number | null
          exit_at?: string | null
          exit_price_usd?: number | null
          exit_reason?: string | null
          id?: string
          loss_tags?: string[] | null
          lp_checked_at?: string | null
          lp_liquidity_usd?: number | null
          main_realized_pnl_sol?: number | null
          main_sold_amount_sol?: number | null
          main_sold_at?: string | null
          main_sold_price_usd?: number | null
          manual_loss_reason?: string | null
          moonbag_active?: boolean | null
          moonbag_current_value_sol?: number | null
          moonbag_drawdown_pct?: number | null
          moonbag_entry_value_sol?: number | null
          moonbag_peak_price_usd?: number | null
          moonbag_percentage?: number | null
          moonbag_token_amount?: number | null
          optimal_entry_market_cap?: number | null
          optimal_exit_multiplier?: number | null
          outcome?: string | null
          outcome_classified_at?: string | null
          outcome_notes?: string | null
          peak_at?: string | null
          peak_multiplier?: number | null
          peak_price_usd?: number | null
          post_exit_checked_at?: string | null
          post_exit_graduated?: boolean | null
          post_exit_mcap?: number | null
          post_exit_multiplier_vs_entry?: number | null
          post_exit_outcome?: string | null
          post_exit_price_usd?: number | null
          post_exit_recovered?: boolean | null
          rehabilitated_at?: string | null
          rehabilitated_by?: string | null
          rehabilitation_status?: string | null
          sell_percentage?: number | null
          signal_strength?: number | null
          status?: string
          target_multiplier?: number | null
          time_to_peak_mins?: number | null
          time_to_rug_mins?: number | null
          token_amount?: number | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          total_pnl_percent?: number | null
          total_realized_pnl_sol?: number | null
          unrealized_pnl_percent?: number | null
          unrealized_pnl_sol?: number | null
          updated_at?: string | null
          watchlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pumpfun_fantasy_positions_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "pumpfun_watchlist"
            referencedColumns: ["id"]
          },
        ]
      }
      pumpfun_fantasy_stats: {
        Row: {
          avg_exit_multiplier: number | null
          avg_hold_time_minutes: number | null
          avg_pnl_per_trade_sol: number | null
          avg_time_to_target_minutes: number | null
          best_trade_pnl_sol: number | null
          best_trade_token: string | null
          created_at: string | null
          id: string
          max_multiplier_achieved: number | null
          moonbag_win_rate: number | null
          period_end: string
          period_start: string
          period_type: string | null
          positions_hit_target: number | null
          positions_lp_removed: number | null
          positions_moonbag_sold: number | null
          positions_stopped_out: number | null
          total_positions: number | null
          total_realized_pnl_sol: number | null
          total_virtual_invested_sol: number | null
          updated_at: string | null
          win_rate: number | null
          worst_trade_pnl_sol: number | null
          worst_trade_token: string | null
        }
        Insert: {
          avg_exit_multiplier?: number | null
          avg_hold_time_minutes?: number | null
          avg_pnl_per_trade_sol?: number | null
          avg_time_to_target_minutes?: number | null
          best_trade_pnl_sol?: number | null
          best_trade_token?: string | null
          created_at?: string | null
          id?: string
          max_multiplier_achieved?: number | null
          moonbag_win_rate?: number | null
          period_end: string
          period_start: string
          period_type?: string | null
          positions_hit_target?: number | null
          positions_lp_removed?: number | null
          positions_moonbag_sold?: number | null
          positions_stopped_out?: number | null
          total_positions?: number | null
          total_realized_pnl_sol?: number | null
          total_virtual_invested_sol?: number | null
          updated_at?: string | null
          win_rate?: number | null
          worst_trade_pnl_sol?: number | null
          worst_trade_token?: string | null
        }
        Update: {
          avg_exit_multiplier?: number | null
          avg_hold_time_minutes?: number | null
          avg_pnl_per_trade_sol?: number | null
          avg_time_to_target_minutes?: number | null
          best_trade_pnl_sol?: number | null
          best_trade_token?: string | null
          created_at?: string | null
          id?: string
          max_multiplier_achieved?: number | null
          moonbag_win_rate?: number | null
          period_end?: string
          period_start?: string
          period_type?: string | null
          positions_hit_target?: number | null
          positions_lp_removed?: number | null
          positions_moonbag_sold?: number | null
          positions_stopped_out?: number | null
          total_positions?: number | null
          total_realized_pnl_sol?: number | null
          total_virtual_invested_sol?: number | null
          updated_at?: string | null
          win_rate?: number | null
          worst_trade_pnl_sol?: number | null
          worst_trade_token?: string | null
        }
        Relationships: []
      }
      pumpfun_kol_activity: {
        Row: {
          action: string
          amount_sol: number | null
          amount_tokens: number | null
          bonding_curve_pct: number | null
          buy_zone: string | null
          chart_killed: boolean | null
          detected_at: string | null
          hold_time_mins: number | null
          id: string
          kol_id: string | null
          kol_wallet: string
          market_cap_at_trade: number | null
          price_at_trade: number | null
          profit_pct: number | null
          profit_sol: number | null
          sold_at_ath: boolean | null
          sold_before_ath: boolean | null
          time_since_mint_mins: number | null
          token_mint: string
          token_symbol: string | null
          tx_signature: string | null
        }
        Insert: {
          action: string
          amount_sol?: number | null
          amount_tokens?: number | null
          bonding_curve_pct?: number | null
          buy_zone?: string | null
          chart_killed?: boolean | null
          detected_at?: string | null
          hold_time_mins?: number | null
          id?: string
          kol_id?: string | null
          kol_wallet: string
          market_cap_at_trade?: number | null
          price_at_trade?: number | null
          profit_pct?: number | null
          profit_sol?: number | null
          sold_at_ath?: boolean | null
          sold_before_ath?: boolean | null
          time_since_mint_mins?: number | null
          token_mint: string
          token_symbol?: string | null
          tx_signature?: string | null
        }
        Update: {
          action?: string
          amount_sol?: number | null
          amount_tokens?: number | null
          bonding_curve_pct?: number | null
          buy_zone?: string | null
          chart_killed?: boolean | null
          detected_at?: string | null
          hold_time_mins?: number | null
          id?: string
          kol_id?: string | null
          kol_wallet?: string
          market_cap_at_trade?: number | null
          price_at_trade?: number | null
          profit_pct?: number | null
          profit_sol?: number | null
          sold_at_ath?: boolean | null
          sold_before_ath?: boolean | null
          time_since_mint_mins?: number | null
          token_mint?: string
          token_symbol?: string | null
          tx_signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pumpfun_kol_activity_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "pumpfun_kol_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      pumpfun_kol_cabals: {
        Row: {
          avg_entry_delta_secs: number | null
          avg_exit_delta_secs: number | null
          cabal_description: string | null
          cabal_name: string | null
          cabal_trust_score: number | null
          coordination_score: number | null
          created_at: string | null
          detected_at: string | null
          evidence_notes: string | null
          id: string
          is_active: boolean | null
          is_predatory: boolean | null
          last_activity_at: string | null
          linked_mint_wallets: string[] | null
          linked_telegram_groups: string[] | null
          linked_twitter_accounts: string[] | null
          member_kol_ids: string[] | null
          member_wallets: string[] | null
          predatory_evidence: string | null
          sample_token_mints: string[] | null
          suspected_hustle_wallets: string[] | null
          tokens_coordinated: number | null
          total_extracted_sol: number | null
          total_victim_wallets: number | null
          updated_at: string | null
        }
        Insert: {
          avg_entry_delta_secs?: number | null
          avg_exit_delta_secs?: number | null
          cabal_description?: string | null
          cabal_name?: string | null
          cabal_trust_score?: number | null
          coordination_score?: number | null
          created_at?: string | null
          detected_at?: string | null
          evidence_notes?: string | null
          id?: string
          is_active?: boolean | null
          is_predatory?: boolean | null
          last_activity_at?: string | null
          linked_mint_wallets?: string[] | null
          linked_telegram_groups?: string[] | null
          linked_twitter_accounts?: string[] | null
          member_kol_ids?: string[] | null
          member_wallets?: string[] | null
          predatory_evidence?: string | null
          sample_token_mints?: string[] | null
          suspected_hustle_wallets?: string[] | null
          tokens_coordinated?: number | null
          total_extracted_sol?: number | null
          total_victim_wallets?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_entry_delta_secs?: number | null
          avg_exit_delta_secs?: number | null
          cabal_description?: string | null
          cabal_name?: string | null
          cabal_trust_score?: number | null
          coordination_score?: number | null
          created_at?: string | null
          detected_at?: string | null
          evidence_notes?: string | null
          id?: string
          is_active?: boolean | null
          is_predatory?: boolean | null
          last_activity_at?: string | null
          linked_mint_wallets?: string[] | null
          linked_telegram_groups?: string[] | null
          linked_twitter_accounts?: string[] | null
          member_kol_ids?: string[] | null
          member_wallets?: string[] | null
          predatory_evidence?: string | null
          sample_token_mints?: string[] | null
          suspected_hustle_wallets?: string[] | null
          tokens_coordinated?: number | null
          total_extracted_sol?: number | null
          total_victim_wallets?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pumpfun_kol_registry: {
        Row: {
          avg_hold_time_mins: number | null
          avg_profit_pct: number | null
          chart_kills: number | null
          created_at: string | null
          display_name: string | null
          first_seen_at: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          kol_tier: string | null
          kolscan_last_rank: number | null
          kolscan_rank: number | null
          kolscan_weekly_score: number | null
          last_activity_at: string | null
          last_refreshed_at: string | null
          manual_override_at: string | null
          manual_override_by: string | null
          manual_override_reason: string | null
          manual_trust_level: string | null
          source: string | null
          successful_pumps: number | null
          total_token_mentions: number | null
          total_trades: number | null
          total_tweets_scanned: number | null
          total_volume_sol: number | null
          trust_score: number | null
          twitter_followers: number | null
          twitter_handle: string | null
          twitter_last_scanned_at: string | null
          twitter_scan_enabled: boolean | null
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          avg_hold_time_mins?: number | null
          avg_profit_pct?: number | null
          chart_kills?: number | null
          created_at?: string | null
          display_name?: string | null
          first_seen_at?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          kol_tier?: string | null
          kolscan_last_rank?: number | null
          kolscan_rank?: number | null
          kolscan_weekly_score?: number | null
          last_activity_at?: string | null
          last_refreshed_at?: string | null
          manual_override_at?: string | null
          manual_override_by?: string | null
          manual_override_reason?: string | null
          manual_trust_level?: string | null
          source?: string | null
          successful_pumps?: number | null
          total_token_mentions?: number | null
          total_trades?: number | null
          total_tweets_scanned?: number | null
          total_volume_sol?: number | null
          trust_score?: number | null
          twitter_followers?: number | null
          twitter_handle?: string | null
          twitter_last_scanned_at?: string | null
          twitter_scan_enabled?: boolean | null
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          avg_hold_time_mins?: number | null
          avg_profit_pct?: number | null
          chart_kills?: number | null
          created_at?: string | null
          display_name?: string | null
          first_seen_at?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          kol_tier?: string | null
          kolscan_last_rank?: number | null
          kolscan_rank?: number | null
          kolscan_weekly_score?: number | null
          last_activity_at?: string | null
          last_refreshed_at?: string | null
          manual_override_at?: string | null
          manual_override_by?: string | null
          manual_override_reason?: string | null
          manual_trust_level?: string | null
          source?: string | null
          successful_pumps?: number | null
          total_token_mentions?: number | null
          total_trades?: number | null
          total_tweets_scanned?: number | null
          total_volume_sol?: number | null
          trust_score?: number | null
          twitter_followers?: number | null
          twitter_handle?: string | null
          twitter_last_scanned_at?: string | null
          twitter_scan_enabled?: boolean | null
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      pumpfun_kol_tweets: {
        Row: {
          correlated_activity_id: string | null
          correlation_delta_mins: number | null
          correlation_type: string | null
          created_at: string | null
          detected_contracts: string[] | null
          detected_tickers: string[] | null
          detected_token_names: string[] | null
          id: string
          is_token_promotion: boolean | null
          kol_id: string | null
          kol_wallet: string
          likes_count: number | null
          posted_at: string
          replies_count: number | null
          retweets_count: number | null
          scanned_at: string | null
          sentiment_score: number | null
          tweet_id: string
          tweet_text: string
          tweet_type: string | null
          tweet_url: string | null
          twitter_handle: string
          views_count: number | null
        }
        Insert: {
          correlated_activity_id?: string | null
          correlation_delta_mins?: number | null
          correlation_type?: string | null
          created_at?: string | null
          detected_contracts?: string[] | null
          detected_tickers?: string[] | null
          detected_token_names?: string[] | null
          id?: string
          is_token_promotion?: boolean | null
          kol_id?: string | null
          kol_wallet: string
          likes_count?: number | null
          posted_at: string
          replies_count?: number | null
          retweets_count?: number | null
          scanned_at?: string | null
          sentiment_score?: number | null
          tweet_id: string
          tweet_text: string
          tweet_type?: string | null
          tweet_url?: string | null
          twitter_handle: string
          views_count?: number | null
        }
        Update: {
          correlated_activity_id?: string | null
          correlation_delta_mins?: number | null
          correlation_type?: string | null
          created_at?: string | null
          detected_contracts?: string[] | null
          detected_tickers?: string[] | null
          detected_token_names?: string[] | null
          id?: string
          is_token_promotion?: boolean | null
          kol_id?: string | null
          kol_wallet?: string
          likes_count?: number | null
          posted_at?: string
          replies_count?: number | null
          retweets_count?: number | null
          scanned_at?: string | null
          sentiment_score?: number | null
          tweet_id?: string
          tweet_text?: string
          tweet_type?: string | null
          tweet_url?: string | null
          twitter_handle?: string
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pumpfun_kol_tweets_correlated_activity_id_fkey"
            columns: ["correlated_activity_id"]
            isOneToOne: false
            referencedRelation: "pumpfun_kol_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pumpfun_kol_tweets_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "pumpfun_kol_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      pumpfun_metric_snapshots: {
        Row: {
          bonding_curve_pct: number | null
          buys: number | null
          captured_at: string
          holder_count: number | null
          id: string
          liquidity_usd: number | null
          market_cap_usd: number | null
          price_usd: number | null
          sells: number | null
          token_mint: string
          tx_count: number | null
          volume_sol: number | null
        }
        Insert: {
          bonding_curve_pct?: number | null
          buys?: number | null
          captured_at?: string
          holder_count?: number | null
          id?: string
          liquidity_usd?: number | null
          market_cap_usd?: number | null
          price_usd?: number | null
          sells?: number | null
          token_mint: string
          tx_count?: number | null
          volume_sol?: number | null
        }
        Update: {
          bonding_curve_pct?: number | null
          buys?: number | null
          captured_at?: string
          holder_count?: number | null
          id?: string
          liquidity_usd?: number | null
          market_cap_usd?: number | null
          price_usd?: number | null
          sells?: number | null
          token_mint?: string
          tx_count?: number | null
          volume_sol?: number | null
        }
        Relationships: []
      }
      pumpfun_monitor_config: {
        Row: {
          active_watchdog_count: number | null
          auto_buy_enabled: boolean | null
          auto_scalp_enabled: boolean
          block_below_ath_enabled: boolean | null
          block_below_ath_pct: number | null
          block_below_discovery_enabled: boolean | null
          block_below_discovery_pct: number | null
          block_downtrend_enabled: boolean | null
          block_downtrend_pct: number | null
          buy_amount_sol: number | null
          buy_priority_fee_sol: number | null
          buy_slippage_bps: number | null
          buy_wallet_id: string | null
          candidates_found_count: number | null
          community_enricher_is_enabled: boolean
          created_at: string
          daily_buy_cap: number | null
          daily_buys_today: number | null
          dead_holder_threshold: number | null
          dead_retention_hours: number | null
          dead_volume_threshold_sol: number | null
          enricher_is_enabled: boolean
          fantasy_buy_amount_sol: number | null
          fantasy_buy_amount_usd: number | null
          fantasy_mode_enabled: boolean | null
          fantasy_moonbag_drawdown_limit: number | null
          fantasy_moonbag_percentage: number | null
          fantasy_moonbag_volume_check: boolean | null
          fantasy_sell_percentage: number | null
          fantasy_stop_loss_pct: number | null
          fantasy_target_multiplier: number | null
          id: string
          is_enabled: boolean
          kill_switch_activated_at: string | null
          kill_switch_active: boolean | null
          kill_switch_reason: string | null
          kol_scanner_is_enabled: boolean
          last_daily_reset: string | null
          last_poll_at: string | null
          last_prune_at: string | null
          log_retention_hours: number | null
          max_bundle_score: number
          max_bundled_buy_count: number | null
          max_buy_price_usd: number | null
          max_dust_holder_pct: number | null
          max_fresh_wallet_pct: number | null
          max_gini_coefficient: number | null
          max_linked_wallet_count: number | null
          max_market_cap_usd: number | null
          max_reevaluate_minutes: number | null
          max_rugcheck_score_fantasy: number | null
          max_single_wallet_pct: number | null
          max_suspicious_wallet_pct: number | null
          max_ticker_length: number | null
          max_token_age_minutes: number
          max_watch_time_minutes: number | null
          max_watchdog_count: number | null
          min_holder_count_fantasy: number | null
          min_market_cap_usd: number | null
          min_qualification_score: number | null
          min_rolling_win_rate: number | null
          min_rugcheck_score: number | null
          min_socials_count: number | null
          min_transactions: number
          min_volume_sol_5m: number
          min_volume_sol_fantasy: number | null
          min_watch_time_minutes: number | null
          monitor_is_enabled: boolean
          polling_interval_seconds: number | null
          qualification_holder_count: number | null
          qualification_volume_sol: number | null
          require_image: boolean | null
          resurrection_holder_threshold: number | null
          resurrection_volume_threshold_sol: number | null
          rugcheck_critical_risks: string[] | null
          rugcheck_rate_limit_ms: number | null
          rugcheck_recheck_minutes: number | null
          scalp_test_mode: boolean
          signal_strong_holder_threshold: number | null
          signal_strong_rugcheck_threshold: number | null
          signal_strong_volume_threshold_sol: number | null
          social_mesh_linker_is_enabled: boolean
          soft_reject_resurrection_minutes: number | null
          tokens_processed_count: number | null
          updated_at: string
          win_rate_lookback_hours: number | null
        }
        Insert: {
          active_watchdog_count?: number | null
          auto_buy_enabled?: boolean | null
          auto_scalp_enabled?: boolean
          block_below_ath_enabled?: boolean | null
          block_below_ath_pct?: number | null
          block_below_discovery_enabled?: boolean | null
          block_below_discovery_pct?: number | null
          block_downtrend_enabled?: boolean | null
          block_downtrend_pct?: number | null
          buy_amount_sol?: number | null
          buy_priority_fee_sol?: number | null
          buy_slippage_bps?: number | null
          buy_wallet_id?: string | null
          candidates_found_count?: number | null
          community_enricher_is_enabled?: boolean
          created_at?: string
          daily_buy_cap?: number | null
          daily_buys_today?: number | null
          dead_holder_threshold?: number | null
          dead_retention_hours?: number | null
          dead_volume_threshold_sol?: number | null
          enricher_is_enabled?: boolean
          fantasy_buy_amount_sol?: number | null
          fantasy_buy_amount_usd?: number | null
          fantasy_mode_enabled?: boolean | null
          fantasy_moonbag_drawdown_limit?: number | null
          fantasy_moonbag_percentage?: number | null
          fantasy_moonbag_volume_check?: boolean | null
          fantasy_sell_percentage?: number | null
          fantasy_stop_loss_pct?: number | null
          fantasy_target_multiplier?: number | null
          id?: string
          is_enabled?: boolean
          kill_switch_activated_at?: string | null
          kill_switch_active?: boolean | null
          kill_switch_reason?: string | null
          kol_scanner_is_enabled?: boolean
          last_daily_reset?: string | null
          last_poll_at?: string | null
          last_prune_at?: string | null
          log_retention_hours?: number | null
          max_bundle_score?: number
          max_bundled_buy_count?: number | null
          max_buy_price_usd?: number | null
          max_dust_holder_pct?: number | null
          max_fresh_wallet_pct?: number | null
          max_gini_coefficient?: number | null
          max_linked_wallet_count?: number | null
          max_market_cap_usd?: number | null
          max_reevaluate_minutes?: number | null
          max_rugcheck_score_fantasy?: number | null
          max_single_wallet_pct?: number | null
          max_suspicious_wallet_pct?: number | null
          max_ticker_length?: number | null
          max_token_age_minutes?: number
          max_watch_time_minutes?: number | null
          max_watchdog_count?: number | null
          min_holder_count_fantasy?: number | null
          min_market_cap_usd?: number | null
          min_qualification_score?: number | null
          min_rolling_win_rate?: number | null
          min_rugcheck_score?: number | null
          min_socials_count?: number | null
          min_transactions?: number
          min_volume_sol_5m?: number
          min_volume_sol_fantasy?: number | null
          min_watch_time_minutes?: number | null
          monitor_is_enabled?: boolean
          polling_interval_seconds?: number | null
          qualification_holder_count?: number | null
          qualification_volume_sol?: number | null
          require_image?: boolean | null
          resurrection_holder_threshold?: number | null
          resurrection_volume_threshold_sol?: number | null
          rugcheck_critical_risks?: string[] | null
          rugcheck_rate_limit_ms?: number | null
          rugcheck_recheck_minutes?: number | null
          scalp_test_mode?: boolean
          signal_strong_holder_threshold?: number | null
          signal_strong_rugcheck_threshold?: number | null
          signal_strong_volume_threshold_sol?: number | null
          social_mesh_linker_is_enabled?: boolean
          soft_reject_resurrection_minutes?: number | null
          tokens_processed_count?: number | null
          updated_at?: string
          win_rate_lookback_hours?: number | null
        }
        Update: {
          active_watchdog_count?: number | null
          auto_buy_enabled?: boolean | null
          auto_scalp_enabled?: boolean
          block_below_ath_enabled?: boolean | null
          block_below_ath_pct?: number | null
          block_below_discovery_enabled?: boolean | null
          block_below_discovery_pct?: number | null
          block_downtrend_enabled?: boolean | null
          block_downtrend_pct?: number | null
          buy_amount_sol?: number | null
          buy_priority_fee_sol?: number | null
          buy_slippage_bps?: number | null
          buy_wallet_id?: string | null
          candidates_found_count?: number | null
          community_enricher_is_enabled?: boolean
          created_at?: string
          daily_buy_cap?: number | null
          daily_buys_today?: number | null
          dead_holder_threshold?: number | null
          dead_retention_hours?: number | null
          dead_volume_threshold_sol?: number | null
          enricher_is_enabled?: boolean
          fantasy_buy_amount_sol?: number | null
          fantasy_buy_amount_usd?: number | null
          fantasy_mode_enabled?: boolean | null
          fantasy_moonbag_drawdown_limit?: number | null
          fantasy_moonbag_percentage?: number | null
          fantasy_moonbag_volume_check?: boolean | null
          fantasy_sell_percentage?: number | null
          fantasy_stop_loss_pct?: number | null
          fantasy_target_multiplier?: number | null
          id?: string
          is_enabled?: boolean
          kill_switch_activated_at?: string | null
          kill_switch_active?: boolean | null
          kill_switch_reason?: string | null
          kol_scanner_is_enabled?: boolean
          last_daily_reset?: string | null
          last_poll_at?: string | null
          last_prune_at?: string | null
          log_retention_hours?: number | null
          max_bundle_score?: number
          max_bundled_buy_count?: number | null
          max_buy_price_usd?: number | null
          max_dust_holder_pct?: number | null
          max_fresh_wallet_pct?: number | null
          max_gini_coefficient?: number | null
          max_linked_wallet_count?: number | null
          max_market_cap_usd?: number | null
          max_reevaluate_minutes?: number | null
          max_rugcheck_score_fantasy?: number | null
          max_single_wallet_pct?: number | null
          max_suspicious_wallet_pct?: number | null
          max_ticker_length?: number | null
          max_token_age_minutes?: number
          max_watch_time_minutes?: number | null
          max_watchdog_count?: number | null
          min_holder_count_fantasy?: number | null
          min_market_cap_usd?: number | null
          min_qualification_score?: number | null
          min_rolling_win_rate?: number | null
          min_rugcheck_score?: number | null
          min_socials_count?: number | null
          min_transactions?: number
          min_volume_sol_5m?: number
          min_volume_sol_fantasy?: number | null
          min_watch_time_minutes?: number | null
          monitor_is_enabled?: boolean
          polling_interval_seconds?: number | null
          qualification_holder_count?: number | null
          qualification_volume_sol?: number | null
          require_image?: boolean | null
          resurrection_holder_threshold?: number | null
          resurrection_volume_threshold_sol?: number | null
          rugcheck_critical_risks?: string[] | null
          rugcheck_rate_limit_ms?: number | null
          rugcheck_recheck_minutes?: number | null
          scalp_test_mode?: boolean
          signal_strong_holder_threshold?: number | null
          signal_strong_rugcheck_threshold?: number | null
          signal_strong_volume_threshold_sol?: number | null
          social_mesh_linker_is_enabled?: boolean
          soft_reject_resurrection_minutes?: number | null
          tokens_processed_count?: number | null
          updated_at?: string
          win_rate_lookback_hours?: number | null
        }
        Relationships: []
      }
      pumpfun_neutrallist: {
        Row: {
          added_by: string | null
          created_at: string | null
          entry_type: string
          id: string
          identifier: string
          is_active: boolean | null
          linked_bags_accounts: string[] | null
          linked_pumpfun_accounts: string[] | null
          linked_telegram: string[] | null
          linked_token_mints: string[] | null
          linked_twitter: string[] | null
          linked_wallets: string[] | null
          linked_websites: string[] | null
          notes: string | null
          reason: string | null
          source: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          entry_type: string
          id?: string
          identifier: string
          is_active?: boolean | null
          linked_bags_accounts?: string[] | null
          linked_pumpfun_accounts?: string[] | null
          linked_telegram?: string[] | null
          linked_token_mints?: string[] | null
          linked_twitter?: string[] | null
          linked_wallets?: string[] | null
          linked_websites?: string[] | null
          notes?: string | null
          reason?: string | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          entry_type?: string
          id?: string
          identifier?: string
          is_active?: boolean | null
          linked_bags_accounts?: string[] | null
          linked_pumpfun_accounts?: string[] | null
          linked_telegram?: string[] | null
          linked_token_mints?: string[] | null
          linked_twitter?: string[] | null
          linked_wallets?: string[] | null
          linked_websites?: string[] | null
          notes?: string | null
          reason?: string | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pumpfun_poll_runs: {
        Row: {
          candidates_added: number | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          results: Json | null
          started_at: string
          status: string
          tokens_scanned: number | null
        }
        Insert: {
          candidates_added?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          results?: Json | null
          started_at?: string
          status?: string
          tokens_scanned?: number | null
        }
        Update: {
          candidates_added?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          results?: Json | null
          started_at?: string
          status?: string
          tokens_scanned?: number | null
        }
        Relationships: []
      }
      pumpfun_profile_scrape_log: {
        Row: {
          coins_found: number
          last_error: string | null
          last_scraped_at: string
          source: string
          success: boolean
          updated_at: string
          wallet_address: string
        }
        Insert: {
          coins_found?: number
          last_error?: string | null
          last_scraped_at?: string
          source: string
          success?: boolean
          updated_at?: string
          wallet_address: string
        }
        Update: {
          coins_found?: number
          last_error?: string | null
          last_scraped_at?: string
          source?: string
          success?: boolean
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      pumpfun_rejected_backcheck: {
        Row: {
          ath_bonding_curve_pct: number | null
          ath_price_usd: number | null
          check_count: number | null
          checked_at: string | null
          created_at: string
          creator_wallet: string | null
          current_holders: number | null
          current_market_cap_usd: number | null
          current_price_usd: number | null
          current_volume_24h_usd: number | null
          false_positive_score: number | null
          graduated_at: string | null
          id: string
          image_url: string | null
          is_graduated: boolean | null
          peak_market_cap_usd: number | null
          rehabilitated_at: string | null
          rehabilitated_by: string | null
          rehabilitation_status: string | null
          rejected_at: string | null
          rejection_reason: string | null
          rejection_type: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          updated_at: string
          was_false_positive: boolean | null
        }
        Insert: {
          ath_bonding_curve_pct?: number | null
          ath_price_usd?: number | null
          check_count?: number | null
          checked_at?: string | null
          created_at?: string
          creator_wallet?: string | null
          current_holders?: number | null
          current_market_cap_usd?: number | null
          current_price_usd?: number | null
          current_volume_24h_usd?: number | null
          false_positive_score?: number | null
          graduated_at?: string | null
          id?: string
          image_url?: string | null
          is_graduated?: boolean | null
          peak_market_cap_usd?: number | null
          rehabilitated_at?: string | null
          rehabilitated_by?: string | null
          rehabilitation_status?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          rejection_type?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
          was_false_positive?: boolean | null
        }
        Update: {
          ath_bonding_curve_pct?: number | null
          ath_price_usd?: number | null
          check_count?: number | null
          checked_at?: string | null
          created_at?: string
          creator_wallet?: string | null
          current_holders?: number | null
          current_market_cap_usd?: number | null
          current_price_usd?: number | null
          current_volume_24h_usd?: number | null
          false_positive_score?: number | null
          graduated_at?: string | null
          id?: string
          image_url?: string | null
          is_graduated?: boolean | null
          peak_market_cap_usd?: number | null
          rehabilitated_at?: string | null
          rehabilitated_by?: string | null
          rehabilitation_status?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          rejection_type?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
          was_false_positive?: boolean | null
        }
        Relationships: []
      }
      pumpfun_rejection_events: {
        Row: {
          batch_id: string | null
          creator_wallet: string | null
          detail: string | null
          detected_at: string
          id: string
          reason: string
          source: string | null
          symbol_lower: string | null
          symbol_original: string | null
          token_mint: string
          token_name: string | null
        }
        Insert: {
          batch_id?: string | null
          creator_wallet?: string | null
          detail?: string | null
          detected_at?: string
          id?: string
          reason: string
          source?: string | null
          symbol_lower?: string | null
          symbol_original?: string | null
          token_mint: string
          token_name?: string | null
        }
        Update: {
          batch_id?: string | null
          creator_wallet?: string | null
          detail?: string | null
          detected_at?: string
          id?: string
          reason?: string
          source?: string | null
          symbol_lower?: string | null
          symbol_original?: string | null
          token_mint?: string
          token_name?: string | null
        }
        Relationships: []
      }
      pumpfun_seen_symbols: {
        Row: {
          block_reason: string | null
          created_at: string
          creator_wallet: string | null
          first_seen_at: string
          first_token_mint: string | null
          id: string
          is_test_launch: boolean | null
          last_seen_at: string
          lifespan_mins: number | null
          peak_mcap_usd: number | null
          seen_count: number
          status: string
          symbol_lower: string
          symbol_original: string
          token_outcome: string | null
        }
        Insert: {
          block_reason?: string | null
          created_at?: string
          creator_wallet?: string | null
          first_seen_at?: string
          first_token_mint?: string | null
          id?: string
          is_test_launch?: boolean | null
          last_seen_at?: string
          lifespan_mins?: number | null
          peak_mcap_usd?: number | null
          seen_count?: number
          status?: string
          symbol_lower: string
          symbol_original: string
          token_outcome?: string | null
        }
        Update: {
          block_reason?: string | null
          created_at?: string
          creator_wallet?: string | null
          first_seen_at?: string
          first_token_mint?: string | null
          id?: string
          is_test_launch?: boolean | null
          last_seen_at?: string
          lifespan_mins?: number | null
          peak_mcap_usd?: number | null
          seen_count?: number
          status?: string
          symbol_lower?: string
          symbol_original?: string
          token_outcome?: string | null
        }
        Relationships: []
      }
      pumpfun_token_comments: {
        Row: {
          account_id: string | null
          bot_signals: string[] | null
          comment_age: string | null
          duplicate_of_id: string | null
          hearts: number | null
          id: string
          is_duplicate: boolean
          message: string
          message_hash: string
          scraped_at: string
          token_mint: string
          token_symbol: string | null
          username: string
        }
        Insert: {
          account_id?: string | null
          bot_signals?: string[] | null
          comment_age?: string | null
          duplicate_of_id?: string | null
          hearts?: number | null
          id?: string
          is_duplicate?: boolean
          message: string
          message_hash: string
          scraped_at?: string
          token_mint: string
          token_symbol?: string | null
          username: string
        }
        Update: {
          account_id?: string | null
          bot_signals?: string[] | null
          comment_age?: string | null
          duplicate_of_id?: string | null
          hearts?: number | null
          id?: string
          is_duplicate?: boolean
          message?: string
          message_hash?: string
          scraped_at?: string
          token_mint?: string
          token_symbol?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "pumpfun_token_comments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "pumpfun_comment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pumpfun_token_comments_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "pumpfun_token_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      pumpfun_token_retraces: {
        Row: {
          analysis_completed_at: string | null
          analysis_notes: string | null
          analysis_started_at: string | null
          analysis_status: string | null
          community_sentiment: string | null
          created_at: string | null
          current_market_cap_usd: number | null
          developer_id: string | null
          developer_success_rate: number | null
          developer_total_tokens: number | null
          developer_trust_level: string | null
          dexscreener_telegram: string | null
          dexscreener_twitter: string | null
          dexscreener_website: string | null
          error_message: string | null
          funding_cex_name: string | null
          funding_source_type: string | null
          graduated_at: string | null
          grandparent_wallet: string | null
          id: string
          is_cto_detected: boolean | null
          is_graduated: boolean | null
          kol_buy_count: number | null
          kol_sell_count: number | null
          kol_timeline: Json | null
          kols_involved: string[] | null
          launched_at: string | null
          livestream_detected: boolean | null
          mint_wallet: string
          original_team_socials: Json | null
          parent_wallet: string | null
          peak_market_cap_usd: number | null
          pumpfun_description: string | null
          pumpfun_telegram: string | null
          pumpfun_twitter: string | null
          pumpfun_website: string | null
          socials_changed: boolean | null
          token_image: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          total_replies: number | null
          twitter_account_id: string | null
          twitter_bio: string | null
          twitter_created_at: string | null
          twitter_followers: number | null
          twitter_verified: boolean | null
          updated_at: string | null
          wallet_genealogy_depth: number | null
          wallet_genealogy_json: Json | null
        }
        Insert: {
          analysis_completed_at?: string | null
          analysis_notes?: string | null
          analysis_started_at?: string | null
          analysis_status?: string | null
          community_sentiment?: string | null
          created_at?: string | null
          current_market_cap_usd?: number | null
          developer_id?: string | null
          developer_success_rate?: number | null
          developer_total_tokens?: number | null
          developer_trust_level?: string | null
          dexscreener_telegram?: string | null
          dexscreener_twitter?: string | null
          dexscreener_website?: string | null
          error_message?: string | null
          funding_cex_name?: string | null
          funding_source_type?: string | null
          graduated_at?: string | null
          grandparent_wallet?: string | null
          id?: string
          is_cto_detected?: boolean | null
          is_graduated?: boolean | null
          kol_buy_count?: number | null
          kol_sell_count?: number | null
          kol_timeline?: Json | null
          kols_involved?: string[] | null
          launched_at?: string | null
          livestream_detected?: boolean | null
          mint_wallet: string
          original_team_socials?: Json | null
          parent_wallet?: string | null
          peak_market_cap_usd?: number | null
          pumpfun_description?: string | null
          pumpfun_telegram?: string | null
          pumpfun_twitter?: string | null
          pumpfun_website?: string | null
          socials_changed?: boolean | null
          token_image?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          total_replies?: number | null
          twitter_account_id?: string | null
          twitter_bio?: string | null
          twitter_created_at?: string | null
          twitter_followers?: number | null
          twitter_verified?: boolean | null
          updated_at?: string | null
          wallet_genealogy_depth?: number | null
          wallet_genealogy_json?: Json | null
        }
        Update: {
          analysis_completed_at?: string | null
          analysis_notes?: string | null
          analysis_started_at?: string | null
          analysis_status?: string | null
          community_sentiment?: string | null
          created_at?: string | null
          current_market_cap_usd?: number | null
          developer_id?: string | null
          developer_success_rate?: number | null
          developer_total_tokens?: number | null
          developer_trust_level?: string | null
          dexscreener_telegram?: string | null
          dexscreener_twitter?: string | null
          dexscreener_website?: string | null
          error_message?: string | null
          funding_cex_name?: string | null
          funding_source_type?: string | null
          graduated_at?: string | null
          grandparent_wallet?: string | null
          id?: string
          is_cto_detected?: boolean | null
          is_graduated?: boolean | null
          kol_buy_count?: number | null
          kol_sell_count?: number | null
          kol_timeline?: Json | null
          kols_involved?: string[] | null
          launched_at?: string | null
          livestream_detected?: boolean | null
          mint_wallet?: string
          original_team_socials?: Json | null
          parent_wallet?: string | null
          peak_market_cap_usd?: number | null
          pumpfun_description?: string | null
          pumpfun_telegram?: string | null
          pumpfun_twitter?: string | null
          pumpfun_website?: string | null
          socials_changed?: boolean | null
          token_image?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          total_replies?: number | null
          twitter_account_id?: string | null
          twitter_bio?: string | null
          twitter_created_at?: string | null
          twitter_followers?: number | null
          twitter_verified?: boolean | null
          updated_at?: string | null
          wallet_genealogy_depth?: number | null
          wallet_genealogy_json?: Json | null
        }
        Relationships: []
      }
      pumpfun_trade_learnings: {
        Row: {
          ai_insights: string | null
          analysis_notes: string | null
          correct_signals: string[] | null
          created_at: string | null
          entry_bonding_curve_pct: number | null
          entry_holder_count: number | null
          entry_market_cap_usd: number | null
          entry_rugcheck_score: number | null
          entry_signal_strength: string | null
          entry_token_age_mins: number | null
          entry_volume_sol: number | null
          fantasy_position_id: string | null
          final_pnl_percent: number | null
          id: string
          optimal_holder_count_max: number | null
          optimal_holder_count_min: number | null
          optimal_market_cap_max: number | null
          optimal_market_cap_min: number | null
          outcome: string
          peak_multiplier: number | null
          should_have_avoided: boolean | null
          time_to_exit_mins: number | null
          time_to_peak_mins: number | null
          token_mint: string
          token_symbol: string | null
          updated_at: string | null
          wrong_signals: string[] | null
        }
        Insert: {
          ai_insights?: string | null
          analysis_notes?: string | null
          correct_signals?: string[] | null
          created_at?: string | null
          entry_bonding_curve_pct?: number | null
          entry_holder_count?: number | null
          entry_market_cap_usd?: number | null
          entry_rugcheck_score?: number | null
          entry_signal_strength?: string | null
          entry_token_age_mins?: number | null
          entry_volume_sol?: number | null
          fantasy_position_id?: string | null
          final_pnl_percent?: number | null
          id?: string
          optimal_holder_count_max?: number | null
          optimal_holder_count_min?: number | null
          optimal_market_cap_max?: number | null
          optimal_market_cap_min?: number | null
          outcome: string
          peak_multiplier?: number | null
          should_have_avoided?: boolean | null
          time_to_exit_mins?: number | null
          time_to_peak_mins?: number | null
          token_mint: string
          token_symbol?: string | null
          updated_at?: string | null
          wrong_signals?: string[] | null
        }
        Update: {
          ai_insights?: string | null
          analysis_notes?: string | null
          correct_signals?: string[] | null
          created_at?: string | null
          entry_bonding_curve_pct?: number | null
          entry_holder_count?: number | null
          entry_market_cap_usd?: number | null
          entry_rugcheck_score?: number | null
          entry_signal_strength?: string | null
          entry_token_age_mins?: number | null
          entry_volume_sol?: number | null
          fantasy_position_id?: string | null
          final_pnl_percent?: number | null
          id?: string
          optimal_holder_count_max?: number | null
          optimal_holder_count_min?: number | null
          optimal_market_cap_max?: number | null
          optimal_market_cap_min?: number | null
          outcome?: string
          peak_multiplier?: number | null
          should_have_avoided?: boolean | null
          time_to_exit_mins?: number | null
          time_to_peak_mins?: number | null
          token_mint?: string
          token_symbol?: string | null
          updated_at?: string | null
          wrong_signals?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pumpfun_trade_learnings_fantasy_position_id_fkey"
            columns: ["fantasy_position_id"]
            isOneToOne: false
            referencedRelation: "pumpfun_fantasy_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      pumpfun_watchlist: {
        Row: {
          ath_bonding_curve_pct: number | null
          ath_market_cap_at: string | null
          ath_market_cap_usd: number | null
          authority_checked_at: string | null
          bonding_curve_pct: number | null
          bump_bot_detected: boolean | null
          bundle_checked: boolean | null
          bundle_checked_at: string | null
          bundle_score: number | null
          bundled_buy_count: number | null
          buy_amount_sol: number | null
          buy_attempted_at: string | null
          buy_error: string | null
          buy_executed_at: string | null
          buy_pressure_3m: number | null
          buy_tx_signature: string | null
          check_count: number
          comment_bot_score: number | null
          comment_scan_at: string | null
          consecutive_stale_checks: number | null
          crash_detected_at: string | null
          created_at: string
          created_at_blockchain: string | null
          creator_wallet: string | null
          demoted_at: string | null
          demotion_reason: string | null
          detected_dev_pattern: string | null
          dev_bought_back: boolean | null
          dev_holding_pct: number | null
          dev_launched_new: boolean | null
          dev_secondary_wallets: string[] | null
          dev_sold: boolean | null
          dump_from_ath_pct: number | null
          dust_checked_at: string | null
          dust_holder_pct: number | null
          fantasy_position_id: string | null
          first_10_buys_analyzed: boolean | null
          first_seen_at: string
          freeze_authority_revoked: boolean | null
          fresh_wallet_pct: number | null
          gini_coefficient: number | null
          graduated_at: string | null
          has_image: boolean | null
          holder_count: number | null
          holder_count_peak: number | null
          holder_count_prev: number | null
          holders_delta_15m: number | null
          holders_delta_3m: number | null
          id: string
          image_url: string | null
          insider_activity_detected: boolean | null
          insider_pct: number | null
          is_graduated: boolean | null
          is_stagnant: boolean | null
          last_activity_at: string | null
          last_checked_at: string
          last_dev_check_at: string | null
          last_processor: string | null
          last_snapshot_at: string | null
          linked_wallet_count: number | null
          liquidity_usd: number | null
          market_cap_sol: number | null
          market_cap_usd: number | null
          max_single_wallet_pct: number | null
          mayhem_checked: boolean | null
          metadata: Json | null
          metrics_hash: string | null
          micro_tx_count: number | null
          micro_tx_ratio: number | null
          mint_authority_revoked: boolean | null
          permanent_reject: boolean | null
          price_at_buy_now_usd: number | null
          price_at_discovery_usd: number | null
          price_at_mint: number | null
          price_at_qualified_usd: number | null
          price_ath_usd: number | null
          price_change_pct_15m: number | null
          price_change_pct_3m: number | null
          price_current: number | null
          price_peak: number | null
          price_start_usd: number | null
          price_usd: number | null
          price_usd_prev: number | null
          priority_score: number | null
          promoted_to_buy_now_at: string | null
          prune_reason: string | null
          pruned_at: string | null
          qualification_reason: string | null
          qualified_at: string | null
          raydium_pool_address: string | null
          rejection_reason: string | null
          rejection_reasons: string[] | null
          rejection_type: string | null
          removal_reason: string | null
          removed_at: string | null
          rugcheck_checked_at: string | null
          rugcheck_normalised: number | null
          rugcheck_passed: boolean | null
          rugcheck_risks: Json | null
          rugcheck_score: number | null
          rugcheck_version: number | null
          signal_strength: string | null
          social_score: number | null
          socials_checked_at: string | null
          socials_count: number | null
          socials_mesh_linked: boolean
          source: string | null
          spike_detected_at: string | null
          stagnant_reason: string | null
          status: string
          suspicious_wallet_pct: number | null
          telegram_url: string | null
          time_to_peak_mins: number | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          trend_status: string | null
          twitter_url: string | null
          tx_count: number | null
          updated_at: string
          volume_5m: number | null
          volume_delta_15m: number | null
          volume_delta_3m: number | null
          volume_sol: number | null
          volume_sol_prev: number | null
          was_spiked_and_killed: boolean | null
          website_url: string | null
        }
        Insert: {
          ath_bonding_curve_pct?: number | null
          ath_market_cap_at?: string | null
          ath_market_cap_usd?: number | null
          authority_checked_at?: string | null
          bonding_curve_pct?: number | null
          bump_bot_detected?: boolean | null
          bundle_checked?: boolean | null
          bundle_checked_at?: string | null
          bundle_score?: number | null
          bundled_buy_count?: number | null
          buy_amount_sol?: number | null
          buy_attempted_at?: string | null
          buy_error?: string | null
          buy_executed_at?: string | null
          buy_pressure_3m?: number | null
          buy_tx_signature?: string | null
          check_count?: number
          comment_bot_score?: number | null
          comment_scan_at?: string | null
          consecutive_stale_checks?: number | null
          crash_detected_at?: string | null
          created_at?: string
          created_at_blockchain?: string | null
          creator_wallet?: string | null
          demoted_at?: string | null
          demotion_reason?: string | null
          detected_dev_pattern?: string | null
          dev_bought_back?: boolean | null
          dev_holding_pct?: number | null
          dev_launched_new?: boolean | null
          dev_secondary_wallets?: string[] | null
          dev_sold?: boolean | null
          dump_from_ath_pct?: number | null
          dust_checked_at?: string | null
          dust_holder_pct?: number | null
          fantasy_position_id?: string | null
          first_10_buys_analyzed?: boolean | null
          first_seen_at?: string
          freeze_authority_revoked?: boolean | null
          fresh_wallet_pct?: number | null
          gini_coefficient?: number | null
          graduated_at?: string | null
          has_image?: boolean | null
          holder_count?: number | null
          holder_count_peak?: number | null
          holder_count_prev?: number | null
          holders_delta_15m?: number | null
          holders_delta_3m?: number | null
          id?: string
          image_url?: string | null
          insider_activity_detected?: boolean | null
          insider_pct?: number | null
          is_graduated?: boolean | null
          is_stagnant?: boolean | null
          last_activity_at?: string | null
          last_checked_at?: string
          last_dev_check_at?: string | null
          last_processor?: string | null
          last_snapshot_at?: string | null
          linked_wallet_count?: number | null
          liquidity_usd?: number | null
          market_cap_sol?: number | null
          market_cap_usd?: number | null
          max_single_wallet_pct?: number | null
          mayhem_checked?: boolean | null
          metadata?: Json | null
          metrics_hash?: string | null
          micro_tx_count?: number | null
          micro_tx_ratio?: number | null
          mint_authority_revoked?: boolean | null
          permanent_reject?: boolean | null
          price_at_buy_now_usd?: number | null
          price_at_discovery_usd?: number | null
          price_at_mint?: number | null
          price_at_qualified_usd?: number | null
          price_ath_usd?: number | null
          price_change_pct_15m?: number | null
          price_change_pct_3m?: number | null
          price_current?: number | null
          price_peak?: number | null
          price_start_usd?: number | null
          price_usd?: number | null
          price_usd_prev?: number | null
          priority_score?: number | null
          promoted_to_buy_now_at?: string | null
          prune_reason?: string | null
          pruned_at?: string | null
          qualification_reason?: string | null
          qualified_at?: string | null
          raydium_pool_address?: string | null
          rejection_reason?: string | null
          rejection_reasons?: string[] | null
          rejection_type?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          rugcheck_checked_at?: string | null
          rugcheck_normalised?: number | null
          rugcheck_passed?: boolean | null
          rugcheck_risks?: Json | null
          rugcheck_score?: number | null
          rugcheck_version?: number | null
          signal_strength?: string | null
          social_score?: number | null
          socials_checked_at?: string | null
          socials_count?: number | null
          socials_mesh_linked?: boolean
          source?: string | null
          spike_detected_at?: string | null
          stagnant_reason?: string | null
          status?: string
          suspicious_wallet_pct?: number | null
          telegram_url?: string | null
          time_to_peak_mins?: number | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          trend_status?: string | null
          twitter_url?: string | null
          tx_count?: number | null
          updated_at?: string
          volume_5m?: number | null
          volume_delta_15m?: number | null
          volume_delta_3m?: number | null
          volume_sol?: number | null
          volume_sol_prev?: number | null
          was_spiked_and_killed?: boolean | null
          website_url?: string | null
        }
        Update: {
          ath_bonding_curve_pct?: number | null
          ath_market_cap_at?: string | null
          ath_market_cap_usd?: number | null
          authority_checked_at?: string | null
          bonding_curve_pct?: number | null
          bump_bot_detected?: boolean | null
          bundle_checked?: boolean | null
          bundle_checked_at?: string | null
          bundle_score?: number | null
          bundled_buy_count?: number | null
          buy_amount_sol?: number | null
          buy_attempted_at?: string | null
          buy_error?: string | null
          buy_executed_at?: string | null
          buy_pressure_3m?: number | null
          buy_tx_signature?: string | null
          check_count?: number
          comment_bot_score?: number | null
          comment_scan_at?: string | null
          consecutive_stale_checks?: number | null
          crash_detected_at?: string | null
          created_at?: string
          created_at_blockchain?: string | null
          creator_wallet?: string | null
          demoted_at?: string | null
          demotion_reason?: string | null
          detected_dev_pattern?: string | null
          dev_bought_back?: boolean | null
          dev_holding_pct?: number | null
          dev_launched_new?: boolean | null
          dev_secondary_wallets?: string[] | null
          dev_sold?: boolean | null
          dump_from_ath_pct?: number | null
          dust_checked_at?: string | null
          dust_holder_pct?: number | null
          fantasy_position_id?: string | null
          first_10_buys_analyzed?: boolean | null
          first_seen_at?: string
          freeze_authority_revoked?: boolean | null
          fresh_wallet_pct?: number | null
          gini_coefficient?: number | null
          graduated_at?: string | null
          has_image?: boolean | null
          holder_count?: number | null
          holder_count_peak?: number | null
          holder_count_prev?: number | null
          holders_delta_15m?: number | null
          holders_delta_3m?: number | null
          id?: string
          image_url?: string | null
          insider_activity_detected?: boolean | null
          insider_pct?: number | null
          is_graduated?: boolean | null
          is_stagnant?: boolean | null
          last_activity_at?: string | null
          last_checked_at?: string
          last_dev_check_at?: string | null
          last_processor?: string | null
          last_snapshot_at?: string | null
          linked_wallet_count?: number | null
          liquidity_usd?: number | null
          market_cap_sol?: number | null
          market_cap_usd?: number | null
          max_single_wallet_pct?: number | null
          mayhem_checked?: boolean | null
          metadata?: Json | null
          metrics_hash?: string | null
          micro_tx_count?: number | null
          micro_tx_ratio?: number | null
          mint_authority_revoked?: boolean | null
          permanent_reject?: boolean | null
          price_at_buy_now_usd?: number | null
          price_at_discovery_usd?: number | null
          price_at_mint?: number | null
          price_at_qualified_usd?: number | null
          price_ath_usd?: number | null
          price_change_pct_15m?: number | null
          price_change_pct_3m?: number | null
          price_current?: number | null
          price_peak?: number | null
          price_start_usd?: number | null
          price_usd?: number | null
          price_usd_prev?: number | null
          priority_score?: number | null
          promoted_to_buy_now_at?: string | null
          prune_reason?: string | null
          pruned_at?: string | null
          qualification_reason?: string | null
          qualified_at?: string | null
          raydium_pool_address?: string | null
          rejection_reason?: string | null
          rejection_reasons?: string[] | null
          rejection_type?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          rugcheck_checked_at?: string | null
          rugcheck_normalised?: number | null
          rugcheck_passed?: boolean | null
          rugcheck_risks?: Json | null
          rugcheck_score?: number | null
          rugcheck_version?: number | null
          signal_strength?: string | null
          social_score?: number | null
          socials_checked_at?: string | null
          socials_count?: number | null
          socials_mesh_linked?: boolean
          source?: string | null
          spike_detected_at?: string | null
          stagnant_reason?: string | null
          status?: string
          suspicious_wallet_pct?: number | null
          telegram_url?: string | null
          time_to_peak_mins?: number | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          trend_status?: string | null
          twitter_url?: string | null
          tx_count?: number | null
          updated_at?: string
          volume_5m?: number | null
          volume_delta_15m?: number | null
          volume_delta_3m?: number | null
          volume_sol?: number | null
          volume_sol_prev?: number | null
          was_spiked_and_killed?: boolean | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pumpfun_watchlist_fantasy_position_id_fkey"
            columns: ["fantasy_position_id"]
            isOneToOne: false
            referencedRelation: "pumpfun_fantasy_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      pumpfun_whitelist: {
        Row: {
          added_by: string | null
          auto_classified: boolean | null
          avg_token_lifespan_hours: number | null
          classification_score: number | null
          created_at: string | null
          entry_type: string
          evidence_notes: string | null
          first_seen_at: string | null
          id: string
          identifier: string
          is_active: boolean | null
          linked_pumpfun_accounts: string[] | null
          linked_telegram: string[] | null
          linked_token_mints: string[] | null
          linked_twitter: string[] | null
          linked_wallets: string[] | null
          recommendation_text: string | null
          source: string | null
          tags: string[] | null
          tokens_launched: number | null
          tokens_successful: number | null
          total_volume_sol: number | null
          trust_level: string
          updated_at: string | null
          whitelist_reason: string | null
        }
        Insert: {
          added_by?: string | null
          auto_classified?: boolean | null
          avg_token_lifespan_hours?: number | null
          classification_score?: number | null
          created_at?: string | null
          entry_type: string
          evidence_notes?: string | null
          first_seen_at?: string | null
          id?: string
          identifier: string
          is_active?: boolean | null
          linked_pumpfun_accounts?: string[] | null
          linked_telegram?: string[] | null
          linked_token_mints?: string[] | null
          linked_twitter?: string[] | null
          linked_wallets?: string[] | null
          recommendation_text?: string | null
          source?: string | null
          tags?: string[] | null
          tokens_launched?: number | null
          tokens_successful?: number | null
          total_volume_sol?: number | null
          trust_level?: string
          updated_at?: string | null
          whitelist_reason?: string | null
        }
        Update: {
          added_by?: string | null
          auto_classified?: boolean | null
          avg_token_lifespan_hours?: number | null
          classification_score?: number | null
          created_at?: string | null
          entry_type?: string
          evidence_notes?: string | null
          first_seen_at?: string | null
          id?: string
          identifier?: string
          is_active?: boolean | null
          linked_pumpfun_accounts?: string[] | null
          linked_telegram?: string[] | null
          linked_token_mints?: string[] | null
          linked_twitter?: string[] | null
          linked_wallets?: string[] | null
          recommendation_text?: string | null
          source?: string | null
          tags?: string[] | null
          tokens_launched?: number | null
          tokens_successful?: number | null
          total_volume_sol?: number | null
          trust_level?: string
          updated_at?: string | null
          whitelist_reason?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action_type: string
          attempt_count: number | null
          blocked_until: string | null
          created_at: string | null
          first_attempt: string | null
          id: string
          identifier: string
          is_blocked: boolean | null
          last_attempt: string | null
          updated_at: string | null
        }
        Insert: {
          action_type: string
          attempt_count?: number | null
          blocked_until?: string | null
          created_at?: string | null
          first_attempt?: string | null
          id?: string
          identifier: string
          is_blocked?: boolean | null
          last_attempt?: string | null
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          attempt_count?: number | null
          blocked_until?: string | null
          created_at?: string | null
          first_attempt?: string | null
          id?: string
          identifier?: string
          is_blocked?: boolean | null
          last_attempt?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recycle_events: {
        Row: {
          created_at: string
          dev_wallet: string | null
          entity_id: string
          entity_type: string
          id: string
          kyc_root: string | null
          new_community_id: string | null
          new_label_snapshot: Json | null
          new_token_mint: string | null
          prev_community_id: string | null
          prev_label_snapshot: Json | null
          prev_token_mint: string | null
          severity: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          dev_wallet?: string | null
          entity_id: string
          entity_type: string
          id?: string
          kyc_root?: string | null
          new_community_id?: string | null
          new_label_snapshot?: Json | null
          new_token_mint?: string | null
          prev_community_id?: string | null
          prev_label_snapshot?: Json | null
          prev_token_mint?: string | null
          severity?: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          dev_wallet?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          kyc_root?: string | null
          new_community_id?: string | null
          new_label_snapshot?: Json | null
          new_token_mint?: string | null
          prev_community_id?: string | null
          prev_label_snapshot?: Json | null
          prev_token_mint?: string | null
          severity?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      referral_attributions: {
        Row: {
          converted_at: string | null
          created_at: string
          id: string
          profile_key: string
          referred_telegram_user_id: number
          referrer_code: string
          referrer_telegram_user_id: number
          rejection_reason: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          id?: string
          profile_key: string
          referred_telegram_user_id: number
          referrer_code: string
          referrer_telegram_user_id: number
          rejection_reason?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          id?: string
          profile_key?: string
          referred_telegram_user_id?: number
          referrer_code?: string
          referrer_telegram_user_id?: number
          rejection_reason?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_attributions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "profile_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          last_activated_at: string | null
          last_deactivated_at: string | null
          profile_key: string
          status: string
          telegram_user_id: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          last_activated_at?: string | null
          last_deactivated_at?: string | null
          profile_key: string
          status?: string
          telegram_user_id: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          last_activated_at?: string | null
          last_deactivated_at?: string | null
          profile_key?: string
          status?: string
          telegram_user_id?: number
        }
        Relationships: []
      }
      referral_credits: {
        Row: {
          applied_to_subscription_id: string | null
          attribution_id: string | null
          created_at: string
          id: string
          months_granted: number
          new_expires_at: string | null
          profile_key: string
          referrer_telegram_user_id: number
        }
        Insert: {
          applied_to_subscription_id?: string | null
          attribution_id?: string | null
          created_at?: string
          id?: string
          months_granted?: number
          new_expires_at?: string | null
          profile_key: string
          referrer_telegram_user_id: number
        }
        Update: {
          applied_to_subscription_id?: string | null
          attribution_id?: string | null
          created_at?: string
          id?: string
          months_granted?: number
          new_expires_at?: string | null
          profile_key?: string
          referrer_telegram_user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_credits_applied_to_subscription_id_fkey"
            columns: ["applied_to_subscription_id"]
            isOneToOne: false
            referencedRelation: "profile_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_credits_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "referral_attributions"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_programs: {
        Row: {
          created_at: string
          discount_earned: boolean
          discount_used: boolean
          id: string
          referral_code: string
          referrals_count: number
          successful_referrals: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discount_earned?: boolean
          discount_used?: boolean
          id?: string
          referral_code: string
          referrals_count?: number
          successful_referrals?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          discount_earned?: boolean
          discount_used?: boolean
          id?: string
          referral_code?: string
          referrals_count?: number
          successful_referrals?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          campaign_created: boolean
          created_at: string
          id: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
          reward_granted: boolean
          updated_at: string
        }
        Insert: {
          campaign_created?: boolean
          created_at?: string
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
          reward_granted?: boolean
          updated_at?: string
        }
        Update: {
          campaign_created?: boolean
          created_at?: string
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_id?: string
          reward_granted?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      rent_reclaimer_wallets: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          nickname: string | null
          pubkey: string
          secret_key_encrypted: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          nickname?: string | null
          pubkey: string
          secret_key_encrypted: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          nickname?: string | null
          pubkey?: string
          secret_key_encrypted?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      repurpose_scraped_posts: {
        Row: {
          engagement: Json | null
          id: string
          image_urls: Json | null
          is_repurposed: boolean | null
          posted_at: string | null
          reviewed_at: string | null
          scraped_at: string | null
          source_account_id: string | null
          status: string
          tweet_id: string
          tweet_text: string | null
          tweet_url: string | null
          username: string
        }
        Insert: {
          engagement?: Json | null
          id?: string
          image_urls?: Json | null
          is_repurposed?: boolean | null
          posted_at?: string | null
          reviewed_at?: string | null
          scraped_at?: string | null
          source_account_id?: string | null
          status?: string
          tweet_id: string
          tweet_text?: string | null
          tweet_url?: string | null
          username: string
        }
        Update: {
          engagement?: Json | null
          id?: string
          image_urls?: Json | null
          is_repurposed?: boolean | null
          posted_at?: string | null
          reviewed_at?: string | null
          scraped_at?: string | null
          source_account_id?: string | null
          status?: string
          tweet_id?: string
          tweet_text?: string | null
          tweet_url?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "repurpose_scraped_posts_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "repurpose_source_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      repurpose_source_accounts: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          is_active: boolean | null
          last_scraped_at: string | null
          notes: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          last_scraped_at?: string | null
          notes?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          last_scraped_at?: string | null
          notes?: string | null
          username?: string
        }
        Relationships: []
      }
      reputation_mesh: {
        Row: {
          confidence: number | null
          discovered_at: string | null
          discovered_via: string | null
          evidence: Json | null
          id: string
          linked_id: string
          linked_type: string
          relationship: string
          source_id: string
          source_type: string
        }
        Insert: {
          confidence?: number | null
          discovered_at?: string | null
          discovered_via?: string | null
          evidence?: Json | null
          id?: string
          linked_id: string
          linked_type: string
          relationship: string
          source_id: string
          source_type: string
        }
        Update: {
          confidence?: number | null
          discovered_at?: string | null
          discovered_via?: string | null
          evidence?: Json | null
          id?: string
          linked_id?: string
          linked_type?: string
          relationship?: string
          source_id?: string
          source_type?: string
        }
        Relationships: []
      }
      revenue_transactions: {
        Row: {
          amount_sol: number
          amount_usd: number | null
          collected_at: string | null
          id: string
          platform_wallet: string | null
          revenue_type: string
          sol_price_at_time: number | null
          status: string | null
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_sol: number
          amount_usd?: number | null
          collected_at?: string | null
          id?: string
          platform_wallet?: string | null
          revenue_type: string
          sol_price_at_time?: number | null
          status?: string | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_sol?: number
          amount_usd?: number | null
          collected_at?: string | null
          id?: string
          platform_wallet?: string | null
          revenue_type?: string
          sol_price_at_time?: number | null
          status?: string | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_transactions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "blackbox_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      rug_investigations: {
        Row: {
          bundle_details: Json | null
          bundles_detected: number | null
          cex_trace_details: Json | null
          cex_traces_found: number | null
          created_at: string | null
          error_message: string | null
          full_report: Json | null
          id: string
          investigation_date: string | null
          liquidity_usd: number | null
          market_cap_usd: number | null
          price_at_investigation: number | null
          price_ath: number | null
          price_drop_percent: number | null
          risk_factors: Json | null
          rug_risk_score: number | null
          status: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          top_seller_wallets: Json | null
          total_sellers: number | null
          total_sold_usd: number | null
          updated_at: string | null
        }
        Insert: {
          bundle_details?: Json | null
          bundles_detected?: number | null
          cex_trace_details?: Json | null
          cex_traces_found?: number | null
          created_at?: string | null
          error_message?: string | null
          full_report?: Json | null
          id?: string
          investigation_date?: string | null
          liquidity_usd?: number | null
          market_cap_usd?: number | null
          price_at_investigation?: number | null
          price_ath?: number | null
          price_drop_percent?: number | null
          risk_factors?: Json | null
          rug_risk_score?: number | null
          status?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          top_seller_wallets?: Json | null
          total_sellers?: number | null
          total_sold_usd?: number | null
          updated_at?: string | null
        }
        Update: {
          bundle_details?: Json | null
          bundles_detected?: number | null
          cex_trace_details?: Json | null
          cex_traces_found?: number | null
          created_at?: string | null
          error_message?: string | null
          full_report?: Json | null
          id?: string
          investigation_date?: string | null
          liquidity_usd?: number | null
          market_cap_usd?: number | null
          price_at_investigation?: number | null
          price_ath?: number | null
          price_drop_percent?: number | null
          risk_factors?: Json | null
          rug_risk_score?: number | null
          status?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          top_seller_wallets?: Json | null
          total_sellers?: number | null
          total_sold_usd?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rugcheck_cache: {
        Row: {
          fetched_at: string
          risk_count: number | null
          rugged: boolean | null
          score_normalised: number | null
          summary_data: Json
          token_mint: string
        }
        Insert: {
          fetched_at?: string
          risk_count?: number | null
          rugged?: boolean | null
          score_normalised?: number | null
          summary_data: Json
          token_mint: string
        }
        Update: {
          fetched_at?: string
          risk_count?: number | null
          rugged?: boolean | null
          score_normalised?: number | null
          summary_data?: Json
          token_mint?: string
        }
        Relationships: []
      }
      scalp_signal_tracker: {
        Row: {
          bonding_curve_pct: number | null
          caller_username: string | null
          channel_id: string
          channel_name: string | null
          created_at: string | null
          detected_at: string | null
          id: string
          message_text: string | null
          price_usd: number | null
          token_mint: string
        }
        Insert: {
          bonding_curve_pct?: number | null
          caller_username?: string | null
          channel_id: string
          channel_name?: string | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          message_text?: string | null
          price_usd?: number | null
          token_mint: string
        }
        Update: {
          bonding_curve_pct?: number | null
          caller_username?: string | null
          channel_id?: string
          channel_name?: string | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          message_text?: string | null
          price_usd?: number | null
          token_mint?: string
        }
        Relationships: []
      }
      scraped_tokens: {
        Row: {
          community_checked_at: string | null
          created_at: string
          creator_fetched_at: string | null
          creator_wallet: string | null
          description: string | null
          discovery_source: string
          first_seen_at: string
          id: string
          image_url: string | null
          last_validation_attempt: string | null
          launchpad: string | null
          metadata_fetched_at: string | null
          name: string | null
          raydium_date: string | null
          symbol: string | null
          telegram_url: string | null
          token_mint: string
          twitter_url: string | null
          updated_at: string
          validation_attempts: number | null
          validation_error: string | null
          validation_status: string | null
          website_url: string | null
        }
        Insert: {
          community_checked_at?: string | null
          created_at?: string
          creator_fetched_at?: string | null
          creator_wallet?: string | null
          description?: string | null
          discovery_source?: string
          first_seen_at?: string
          id?: string
          image_url?: string | null
          last_validation_attempt?: string | null
          launchpad?: string | null
          metadata_fetched_at?: string | null
          name?: string | null
          raydium_date?: string | null
          symbol?: string | null
          telegram_url?: string | null
          token_mint: string
          twitter_url?: string | null
          updated_at?: string
          validation_attempts?: number | null
          validation_error?: string | null
          validation_status?: string | null
          website_url?: string | null
        }
        Update: {
          community_checked_at?: string | null
          created_at?: string
          creator_fetched_at?: string | null
          creator_wallet?: string | null
          description?: string | null
          discovery_source?: string
          first_seen_at?: string
          id?: string
          image_url?: string | null
          last_validation_attempt?: string | null
          launchpad?: string | null
          metadata_fetched_at?: string | null
          name?: string | null
          raydium_date?: string | null
          symbol?: string | null
          telegram_url?: string | null
          token_mint?: string
          twitter_url?: string | null
          updated_at?: string
          validation_attempts?: number | null
          validation_error?: string | null
          validation_status?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      scraper_audit_log: {
        Row: {
          content_usable: boolean | null
          created_at: string
          error_message: string | null
          fallback_provider: string | null
          fell_back: boolean
          function_name: string
          http_status: number | null
          id: string
          metadata: Json | null
          provider_used: string
          provider_was_primary: boolean
          response_size_bytes: number | null
          response_time_ms: number | null
          success: boolean
          target_url: string
        }
        Insert: {
          content_usable?: boolean | null
          created_at?: string
          error_message?: string | null
          fallback_provider?: string | null
          fell_back?: boolean
          function_name: string
          http_status?: number | null
          id?: string
          metadata?: Json | null
          provider_used: string
          provider_was_primary?: boolean
          response_size_bytes?: number | null
          response_time_ms?: number | null
          success?: boolean
          target_url: string
        }
        Update: {
          content_usable?: boolean | null
          created_at?: string
          error_message?: string | null
          fallback_provider?: string | null
          fell_back?: boolean
          function_name?: string
          http_status?: number | null
          id?: string
          metadata?: Json | null
          provider_used?: string
          provider_was_primary?: boolean
          response_size_bytes?: number | null
          response_time_ms?: number | null
          success?: boolean
          target_url?: string
        }
        Relationships: []
      }
      scraper_provider_config: {
        Row: {
          auto_fallback_enabled: boolean
          browserless_enabled: boolean
          created_at: string
          firecrawl_enabled: boolean
          id: string
          provider_fallback: string
          provider_primary: string
          updated_at: string
        }
        Insert: {
          auto_fallback_enabled?: boolean
          browserless_enabled?: boolean
          created_at?: string
          firecrawl_enabled?: boolean
          id?: string
          provider_fallback?: string
          provider_primary?: string
          updated_at?: string
        }
        Update: {
          auto_fallback_enabled?: boolean
          browserless_enabled?: boolean
          created_at?: string
          firecrawl_enabled?: boolean
          id?: string
          provider_fallback?: string
          provider_primary?: string
          updated_at?: string
        }
        Relationships: []
      }
      secret_access_audit: {
        Row: {
          access_timestamp: string | null
          failure_reason: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          operation: string
          secret_type: string
          session_id: string | null
          success: boolean | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          access_timestamp?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          operation: string
          secret_type: string
          session_id?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          access_timestamp?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          operation?: string
          secret_type?: string
          session_id?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      secret_encryption_keys: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          key_fingerprint: string
          key_version: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          key_fingerprint: string
          key_version?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          key_fingerprint?: string
          key_version?: number
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          ip_address: unknown
          table_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          table_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      security_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          config_key: string
          config_value: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      security_sms_alerts: {
        Row: {
          action_executed_at: string | null
          alert_type: string
          created_at: string
          expected_responses: string[]
          expires_at: string
          id: string
          message_body: string
          metadata: Json | null
          phone_number: string
          responded_at: string | null
          response_action: string | null
          status: string
          twilio_message_sid: string | null
          user_id: string
          user_response: string | null
        }
        Insert: {
          action_executed_at?: string | null
          alert_type: string
          created_at?: string
          expected_responses?: string[]
          expires_at?: string
          id?: string
          message_body: string
          metadata?: Json | null
          phone_number: string
          responded_at?: string | null
          response_action?: string | null
          status?: string
          twilio_message_sid?: string | null
          user_id: string
          user_response?: string | null
        }
        Update: {
          action_executed_at?: string | null
          alert_type?: string
          created_at?: string
          expected_responses?: string[]
          expires_at?: string
          id?: string
          message_body?: string
          metadata?: Json | null
          phone_number?: string
          responded_at?: string | null
          response_action?: string | null
          status?: string
          twilio_message_sid?: string | null
          user_id?: string
          user_response?: string | null
        }
        Relationships: []
      }
      service_status: {
        Row: {
          id: string
          last_checked_at: string | null
          last_failure_at: string | null
          last_success_at: string | null
          message: string | null
          metadata: Json | null
          service_name: string
          status: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          last_checked_at?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          message?: string | null
          metadata?: Json | null
          service_name: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          last_checked_at?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          message?: string | null
          metadata?: Json | null
          service_name?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      social_media_gallery: {
        Row: {
          ai_model: string | null
          ai_prompt: string | null
          created_at: string | null
          display_name: string
          file_name: string
          file_size_bytes: number | null
          file_url: string
          height: number | null
          id: string
          image_usage_context: string | null
          is_active: boolean | null
          is_breadcrumb: boolean
          last_used_at: string | null
          mime_type: string | null
          related_article_id: string | null
          related_article_label: string | null
          related_article_slug: string | null
          related_article_title: string | null
          source_type: string
          style_category_ids: string[] | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          use_count: number | null
          used_in_posts: string[] | null
          width: number | null
        }
        Insert: {
          ai_model?: string | null
          ai_prompt?: string | null
          created_at?: string | null
          display_name: string
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          height?: number | null
          id?: string
          image_usage_context?: string | null
          is_active?: boolean | null
          is_breadcrumb?: boolean
          last_used_at?: string | null
          mime_type?: string | null
          related_article_id?: string | null
          related_article_label?: string | null
          related_article_slug?: string | null
          related_article_title?: string | null
          source_type?: string
          style_category_ids?: string[] | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          use_count?: number | null
          used_in_posts?: string[] | null
          width?: number | null
        }
        Update: {
          ai_model?: string | null
          ai_prompt?: string | null
          created_at?: string | null
          display_name?: string
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          height?: number | null
          id?: string
          image_usage_context?: string | null
          is_active?: boolean | null
          is_breadcrumb?: boolean
          last_used_at?: string | null
          mime_type?: string | null
          related_article_id?: string | null
          related_article_label?: string | null
          related_article_slug?: string | null
          related_article_title?: string | null
          source_type?: string
          style_category_ids?: string[] | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          use_count?: number | null
          used_in_posts?: string[] | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_media_gallery_related_article_id_fkey"
            columns: ["related_article_id"]
            isOneToOne: false
            referencedRelation: "intel_briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts_log: {
        Row: {
          alt_text: string | null
          category: string | null
          content: string | null
          created_at: string | null
          cta_text: string | null
          hashtags: string | null
          id: string
          image_url: string | null
          link_url: string | null
          master_template_id: string | null
          metadata: Json | null
          platform: string
          post_id: string | null
          post_type: string
          status: string | null
          tags_mentions: string | null
          title: string | null
          video_url: string | null
        }
        Insert: {
          alt_text?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          cta_text?: string | null
          hashtags?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          master_template_id?: string | null
          metadata?: Json | null
          platform: string
          post_id?: string | null
          post_type?: string
          status?: string | null
          tags_mentions?: string | null
          title?: string | null
          video_url?: string | null
        }
        Update: {
          alt_text?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          cta_text?: string | null
          hashtags?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          master_template_id?: string | null
          metadata?: Json | null
          platform?: string
          post_id?: string | null
          post_type?: string
          status?: string | null
          tags_mentions?: string | null
          title?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      sol_price_fetch_logs: {
        Row: {
          created_at: string
          error_message: string | null
          error_type: string | null
          http_status: number | null
          id: string
          price_fetched: number | null
          response_time_ms: number | null
          source_name: string
          success: boolean
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          http_status?: number | null
          id?: string
          price_fetched?: number | null
          response_time_ms?: number | null
          source_name: string
          success: boolean
        }
        Update: {
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          http_status?: number | null
          id?: string
          price_fetched?: number | null
          response_time_ms?: number | null
          source_name?: string
          success?: boolean
        }
        Relationships: []
      }
      solscan_api_calls: {
        Row: {
          duration_ms: number
          endpoint_path: string
          error_message: string | null
          from_cache: boolean
          function_name: string | null
          http_status: number
          id: number
          mint_or_address: string | null
          response_bytes: number | null
          ts: string
        }
        Insert: {
          duration_ms?: number
          endpoint_path: string
          error_message?: string | null
          from_cache?: boolean
          function_name?: string | null
          http_status?: number
          id?: number
          mint_or_address?: string | null
          response_bytes?: number | null
          ts?: string
        }
        Update: {
          duration_ms?: number
          endpoint_path?: string
          error_message?: string | null
          from_cache?: boolean
          function_name?: string | null
          http_status?: number
          id?: number
          mint_or_address?: string | null
          response_bytes?: number | null
          ts?: string
        }
        Relationships: []
      }
      spider_run_metrics: {
        Row: {
          avg_genealogy_depth: number | null
          avg_run_time_ms: number | null
          blacklist_hits: number | null
          created_at: string | null
          errors: number | null
          id: string
          mesh_links_added: number | null
          metadata: Json | null
          run_date: string
          social_identities_found: number | null
          tokens_spidered: number | null
          wallets_discovered: number | null
          whitelist_hits: number | null
        }
        Insert: {
          avg_genealogy_depth?: number | null
          avg_run_time_ms?: number | null
          blacklist_hits?: number | null
          created_at?: string | null
          errors?: number | null
          id?: string
          mesh_links_added?: number | null
          metadata?: Json | null
          run_date?: string
          social_identities_found?: number | null
          tokens_spidered?: number | null
          wallets_discovered?: number | null
          whitelist_hits?: number | null
        }
        Update: {
          avg_genealogy_depth?: number | null
          avg_run_time_ms?: number | null
          blacklist_hits?: number | null
          created_at?: string | null
          errors?: number | null
          id?: string
          mesh_links_added?: number | null
          metadata?: Json | null
          run_date?: string
          social_identities_found?: number | null
          tokens_spidered?: number | null
          wallets_discovered?: number | null
          whitelist_hits?: number | null
        }
        Relationships: []
      }
      stripe_customers: {
        Row: {
          amount_cents: number | null
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          email: string
          id: string
          interval: string | null
          is_active: boolean | null
          matched_user_id: string | null
          metadata: Json | null
          name: string | null
          stripe_customer_id: string
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          tier_key: string | null
          updated_at: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          email: string
          id?: string
          interval?: string | null
          is_active?: boolean | null
          matched_user_id?: string | null
          metadata?: Json | null
          name?: string | null
          stripe_customer_id: string
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          tier_key?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          email?: string
          id?: string
          interval?: string | null
          is_active?: boolean | null
          matched_user_id?: string | null
          metadata?: Json | null
          name?: string | null
          stripe_customer_id?: string
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          tier_key?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_reminder_log: {
        Row: {
          kind: string
          sent_at: string
          subscription_id: string
        }
        Insert: {
          kind: string
          sent_at?: string
          subscription_id: string
        }
        Update: {
          kind?: string
          sent_at?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_reminder_log_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "profile_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_docs: {
        Row: {
          category: string
          content_md: string
          created_at: string
          created_by: string | null
          id: string
          is_pinned: boolean
          slug: string
          sort_order: number
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content_md?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          slug: string
          sort_order?: number
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content_md?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          slug?: string
          sort_order?: number
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      super_admin_wallets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          pubkey: string
          secret_key_encrypted: string
          updated_at: string
          wallet_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          pubkey: string
          secret_key_encrypted: string
          updated_at?: string
          wallet_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          pubkey?: string
          secret_key_encrypted?: string
          updated_at?: string
          wallet_type?: string
        }
        Relationships: []
      }
      support_ticket_replies: {
        Row: {
          created_at: string
          id: string
          is_internal_note: boolean
          message: string
          reply_by: string | null
          reply_type: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_internal_note?: boolean
          message: string
          reply_by?: string | null
          reply_type?: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_internal_note?: boolean
          message?: string
          reply_by?: string | null
          reply_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          email: string
          id: string
          message: string
          metadata: Json | null
          name: string
          priority: string
          status: string
          subject: string
          ticket_number: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string
          email: string
          id?: string
          message: string
          metadata?: Json | null
          name: string
          priority?: string
          status?: string
          subject: string
          ticket_number?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          metadata?: Json | null
          name?: string
          priority?: string
          status?: string
          subject?: string
          ticket_number?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      survey_responses: {
        Row: {
          completion_time_seconds: number | null
          created_at: string | null
          id: string
          responses: Json
          survey_id: string
          user_id: string
        }
        Insert: {
          completion_time_seconds?: number | null
          created_at?: string | null
          id?: string
          responses: Json
          survey_id: string
          user_id: string
        }
        Update: {
          completion_time_seconds?: number | null
          created_at?: string | null
          id?: string
          responses?: Json
          survey_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_winners: {
        Row: {
          claimed_at: string | null
          created_at: string | null
          id: string
          notified_at: string | null
          prize_claimed: boolean | null
          response_id: string
          survey_id: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string | null
          id?: string
          notified_at?: string | null
          prize_claimed?: boolean | null
          response_id: string
          survey_id: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string | null
          id?: string
          notified_at?: string | null
          prize_claimed?: boolean | null
          response_id?: string
          survey_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_winners_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "survey_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_winners_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          prize_description: string | null
          prize_quantity: number | null
          prize_value: number | null
          questions: Json
          start_date: string | null
          target_audience: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          prize_description?: string | null
          prize_quantity?: number | null
          prize_value?: number | null
          questions: Json
          start_date?: string | null
          target_audience?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          prize_description?: string | null
          prize_quantity?: number | null
          prize_value?: number | null
          questions?: Json
          start_date?: string | null
          target_audience?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          alert_key: string
          context: Json | null
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          message: string
          occurrence_count: number
          resolved_at: string | null
          severity: string
          source: string
        }
        Insert: {
          alert_key: string
          context?: Json | null
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message: string
          occurrence_count?: number
          resolved_at?: string | null
          severity?: string
          source: string
        }
        Update: {
          alert_key?: string
          context?: Json | null
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message?: string
          occurrence_count?: number
          resolved_at?: string | null
          severity?: string
          source?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      telegram_announcement_log: {
        Row: {
          audiences: string[]
          created_at: string
          failed_count: number
          id: string
          image_url: string | null
          message_text: string
          resend_of_id: string | null
          sent_by: string | null
          sent_count: number
        }
        Insert: {
          audiences?: string[]
          created_at?: string
          failed_count?: number
          id?: string
          image_url?: string | null
          message_text: string
          resend_of_id?: string | null
          sent_by?: string | null
          sent_count?: number
        }
        Update: {
          audiences?: string[]
          created_at?: string
          failed_count?: number
          id?: string
          image_url?: string | null
          message_text?: string
          resend_of_id?: string | null
          sent_by?: string | null
          sent_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_announcement_log_resend_of_id_fkey"
            columns: ["resend_of_id"]
            isOneToOne: false
            referencedRelation: "telegram_announcement_log"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_announcement_recipients: {
        Row: {
          announcement_id: string
          created_at: string
          delivery_status: string
          id: string
          linked_user_id: string | null
          telegram_user_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          delivery_status?: string
          id?: string
          linked_user_id?: string | null
          telegram_user_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          delivery_status?: string
          id?: string
          linked_user_id?: string | null
          telegram_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_announcement_recipients_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "telegram_announcement_log"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_announcement_targets: {
        Row: {
          created_at: string | null
          custom_message: string | null
          id: string
          is_active: boolean | null
          sort_order: number | null
          source_channel_id: string
          target_channel_id: string
          target_channel_name: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          custom_message?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          source_channel_id: string
          target_channel_id: string
          target_channel_name?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          custom_message?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          source_channel_id?: string
          target_channel_id?: string
          target_channel_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_announcement_targets_source_channel_id_fkey"
            columns: ["source_channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channel_config"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_interactions: {
        Row: {
          args_preview: string | null
          chat_id: number
          chat_title: string | null
          chat_type: string
          command: string | null
          created_at: string
          first_name: string | null
          id: string
          is_new_user: boolean
          last_name: string | null
          linked_user_id: string | null
          response_status: string
          telegram_user_id: string
          telegram_username: string | null
          token_mint: string | null
        }
        Insert: {
          args_preview?: string | null
          chat_id: number
          chat_title?: string | null
          chat_type?: string
          command?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_new_user?: boolean
          last_name?: string | null
          linked_user_id?: string | null
          response_status?: string
          telegram_user_id: string
          telegram_username?: string | null
          token_mint?: string | null
        }
        Update: {
          args_preview?: string | null
          chat_id?: number
          chat_title?: string | null
          chat_type?: string
          command?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_new_user?: boolean
          last_name?: string | null
          linked_user_id?: string | null
          response_status?: string
          telegram_user_id?: string
          telegram_username?: string | null
          token_mint?: string | null
        }
        Relationships: []
      }
      telegram_bot_usage: {
        Row: {
          command: string
          created_at: string
          id: string
          telegram_user_id: string
          token_mint: string | null
        }
        Insert: {
          command: string
          created_at?: string
          id?: string
          telegram_user_id: string
          token_mint?: string | null
        }
        Update: {
          command?: string
          created_at?: string
          id?: string
          telegram_user_id?: string
          token_mint?: string | null
        }
        Relationships: []
      }
      telegram_callers: {
        Row: {
          average_gain_percent: number | null
          best_call_gain_percent: number | null
          best_call_token_mint: string | null
          best_call_token_symbol: string | null
          channel_usernames: string[] | null
          created_at: string | null
          display_name: string | null
          first_seen_at: string | null
          id: string
          last_call_at: string | null
          successful_calls: number | null
          total_calls: number | null
          total_pnl_usd: number | null
          updated_at: string | null
          username: string
          win_rate: number | null
          worst_call_loss_percent: number | null
        }
        Insert: {
          average_gain_percent?: number | null
          best_call_gain_percent?: number | null
          best_call_token_mint?: string | null
          best_call_token_symbol?: string | null
          channel_usernames?: string[] | null
          created_at?: string | null
          display_name?: string | null
          first_seen_at?: string | null
          id?: string
          last_call_at?: string | null
          successful_calls?: number | null
          total_calls?: number | null
          total_pnl_usd?: number | null
          updated_at?: string | null
          username: string
          win_rate?: number | null
          worst_call_loss_percent?: number | null
        }
        Update: {
          average_gain_percent?: number | null
          best_call_gain_percent?: number | null
          best_call_token_mint?: string | null
          best_call_token_symbol?: string | null
          channel_usernames?: string[] | null
          created_at?: string | null
          display_name?: string | null
          first_seen_at?: string | null
          id?: string
          last_call_at?: string | null
          successful_calls?: number | null
          total_calls?: number | null
          total_pnl_usd?: number | null
          updated_at?: string | null
          username?: string
          win_rate?: number | null
          worst_call_loss_percent?: number | null
        }
        Relationships: []
      }
      telegram_channel_audit_runs: {
        Row: {
          bot_count: number | null
          chat_id: number
          chat_title: string | null
          completed_at: string | null
          error_message: string | null
          id: string
          organic_count: number | null
          seeded_count: number | null
          seeded_threshold: number | null
          started_at: string | null
          status: string | null
          total_members: number | null
          unknown_count: number | null
        }
        Insert: {
          bot_count?: number | null
          chat_id: number
          chat_title?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          organic_count?: number | null
          seeded_count?: number | null
          seeded_threshold?: number | null
          started_at?: string | null
          status?: string | null
          total_members?: number | null
          unknown_count?: number | null
        }
        Update: {
          bot_count?: number | null
          chat_id?: number
          chat_title?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          organic_count?: number | null
          seeded_count?: number | null
          seeded_threshold?: number | null
          started_at?: string | null
          status?: string | null
          total_members?: number | null
          unknown_count?: number | null
        }
        Relationships: []
      }
      telegram_channel_calls: {
        Row: {
          buy_amount_usd: number | null
          buy_tier: string | null
          buy_tx_signature: string | null
          caller_display_name: string | null
          caller_username: string | null
          channel_config_id: string | null
          channel_id: string
          channel_name: string | null
          contains_ape: boolean | null
          created_at: string
          email_sent: boolean | null
          email_sent_at: string | null
          flipit_position_id: string | null
          id: string
          is_first_call: boolean | null
          market_cap_at_call: number | null
          message_id: number
          message_timestamp: string | null
          mint_age_minutes: number | null
          position_id: string | null
          price_at_call: number | null
          price_at_message_time: number | null
          price_drop_pct: number | null
          price_source_at_message: string | null
          raw_message: string | null
          sanity_check_passed: boolean | null
          scalp_approved: boolean | null
          scalp_validation_result: Json | null
          sell_multiplier: number | null
          skip_reason: string | null
          status: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          updated_at: string
        }
        Insert: {
          buy_amount_usd?: number | null
          buy_tier?: string | null
          buy_tx_signature?: string | null
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_id: string
          channel_name?: string | null
          contains_ape?: boolean | null
          created_at?: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          flipit_position_id?: string | null
          id?: string
          is_first_call?: boolean | null
          market_cap_at_call?: number | null
          message_id: number
          message_timestamp?: string | null
          mint_age_minutes?: number | null
          position_id?: string | null
          price_at_call?: number | null
          price_at_message_time?: number | null
          price_drop_pct?: number | null
          price_source_at_message?: string | null
          raw_message?: string | null
          sanity_check_passed?: boolean | null
          scalp_approved?: boolean | null
          scalp_validation_result?: Json | null
          sell_multiplier?: number | null
          skip_reason?: string | null
          status?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
        }
        Update: {
          buy_amount_usd?: number | null
          buy_tier?: string | null
          buy_tx_signature?: string | null
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_id?: string
          channel_name?: string | null
          contains_ape?: boolean | null
          created_at?: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          flipit_position_id?: string | null
          id?: string
          is_first_call?: boolean | null
          market_cap_at_call?: number | null
          message_id?: number
          message_timestamp?: string | null
          mint_age_minutes?: number | null
          position_id?: string | null
          price_at_call?: number | null
          price_at_message_time?: number | null
          price_drop_pct?: number | null
          price_source_at_message?: string | null
          raw_message?: string | null
          sanity_check_passed?: boolean | null
          scalp_approved?: boolean | null
          scalp_validation_result?: Json | null
          sell_multiplier?: number | null
          skip_reason?: string | null
          status?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_channel_calls_channel_config_id_fkey"
            columns: ["channel_config_id"]
            isOneToOne: false
            referencedRelation: "telegram_channel_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_channel_calls_flipit_position_id_fkey"
            columns: ["flipit_position_id"]
            isOneToOne: false
            referencedRelation: "flip_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_channel_config: {
        Row: {
          ape_keyword_enabled: boolean | null
          auto_monitor_enabled: boolean | null
          channel_id: string
          channel_name: string | null
          channel_type: string | null
          channel_username: string | null
          close_enough_threshold_pct: number | null
          created_at: string
          email_notifications: boolean | null
          emergency_buy_multiplier: number | null
          entity_access_hash: string | null
          fantasy_buy_amount_usd: number | null
          fantasy_mode: boolean | null
          first_enabled: boolean | null
          flipit_buy_amount_sol: number | null
          flipit_buy_amount_usd: number | null
          flipit_enabled: boolean | null
          flipit_first_time_only: boolean
          flipit_max_daily_positions: number | null
          flipit_moonbag_enabled: boolean | null
          flipit_moonbag_keep_pct: number | null
          flipit_moonbag_sell_pct: number | null
          flipit_sell_multiplier: number | null
          flipit_wallet_id: string | null
          fresh_discovery_buy_multiplier: number | null
          holder_check_action: string | null
          holder_check_enabled: boolean | null
          id: string
          is_active: boolean | null
          kingkong_diamond_amount_usd: number | null
          kingkong_diamond_max_hold_hours: number | null
          kingkong_diamond_min_peak_x: number | null
          kingkong_diamond_stop_urgency: string | null
          kingkong_diamond_trailing_stop_pct: number | null
          kingkong_mode_enabled: boolean | null
          kingkong_quick_amount_usd: number | null
          kingkong_quick_multiplier: number | null
          kingkong_trigger_source: string | null
          koth_enabled: boolean | null
          large_buy_amount_usd: number | null
          large_sell_multiplier: number | null
          last_check_at: string | null
          last_message_id: number | null
          max_mint_age_minutes: number | null
          max_price_threshold: number | null
          min_holder_count: number | null
          min_price_threshold: number | null
          momentum_buy_multiplier: number | null
          notification_email: string | null
          peak_trailing_stop_enabled: boolean | null
          peak_trailing_stop_pct: number | null
          peak_trailing_stop_threshold: number | null
          persistent_monitoring: boolean | null
          polling_interval_seconds: number | null
          price_monitor_interval_seconds: number | null
          recommendation_buy_multiplier: number | null
          scalp_buy_amount_sol: number | null
          scalp_buy_amount_usd: number | null
          scalp_buy_priority_fee: string | null
          scalp_buy_slippage_bps: number | null
          scalp_caller_timeout_seconds: number | null
          scalp_max_age_minutes: number | null
          scalp_max_bonding_pct: number | null
          scalp_min_bonding_pct: number | null
          scalp_min_callers: number | null
          scalp_mode_enabled: boolean | null
          scalp_moon_bag_pct: number | null
          scalp_sell_priority_fee: string | null
          scalp_sell_slippage_bps: number | null
          scalp_stop_loss_pct: number | null
          scalp_take_profit_pct: number | null
          scalp_test_mode: boolean | null
          scan_window_minutes: number | null
          signal_classification_enabled: boolean | null
          stale_alpha_check_enabled: boolean | null
          stale_alpha_drop_threshold: number | null
          stale_alpha_min_age_seconds: number | null
          standard_buy_amount_usd: number | null
          standard_sell_multiplier: number | null
          telegram_announcements_enabled: boolean | null
          total_buys_executed: number | null
          total_calls_detected: number | null
          trading_mode: string | null
          tweet_on_fantasy_buy: boolean | null
          updated_at: string
          user_id: string | null
          watch_mode_fantasy_only: boolean | null
        }
        Insert: {
          ape_keyword_enabled?: boolean | null
          auto_monitor_enabled?: boolean | null
          channel_id: string
          channel_name?: string | null
          channel_type?: string | null
          channel_username?: string | null
          close_enough_threshold_pct?: number | null
          created_at?: string
          email_notifications?: boolean | null
          emergency_buy_multiplier?: number | null
          entity_access_hash?: string | null
          fantasy_buy_amount_usd?: number | null
          fantasy_mode?: boolean | null
          first_enabled?: boolean | null
          flipit_buy_amount_sol?: number | null
          flipit_buy_amount_usd?: number | null
          flipit_enabled?: boolean | null
          flipit_first_time_only?: boolean
          flipit_max_daily_positions?: number | null
          flipit_moonbag_enabled?: boolean | null
          flipit_moonbag_keep_pct?: number | null
          flipit_moonbag_sell_pct?: number | null
          flipit_sell_multiplier?: number | null
          flipit_wallet_id?: string | null
          fresh_discovery_buy_multiplier?: number | null
          holder_check_action?: string | null
          holder_check_enabled?: boolean | null
          id?: string
          is_active?: boolean | null
          kingkong_diamond_amount_usd?: number | null
          kingkong_diamond_max_hold_hours?: number | null
          kingkong_diamond_min_peak_x?: number | null
          kingkong_diamond_stop_urgency?: string | null
          kingkong_diamond_trailing_stop_pct?: number | null
          kingkong_mode_enabled?: boolean | null
          kingkong_quick_amount_usd?: number | null
          kingkong_quick_multiplier?: number | null
          kingkong_trigger_source?: string | null
          koth_enabled?: boolean | null
          large_buy_amount_usd?: number | null
          large_sell_multiplier?: number | null
          last_check_at?: string | null
          last_message_id?: number | null
          max_mint_age_minutes?: number | null
          max_price_threshold?: number | null
          min_holder_count?: number | null
          min_price_threshold?: number | null
          momentum_buy_multiplier?: number | null
          notification_email?: string | null
          peak_trailing_stop_enabled?: boolean | null
          peak_trailing_stop_pct?: number | null
          peak_trailing_stop_threshold?: number | null
          persistent_monitoring?: boolean | null
          polling_interval_seconds?: number | null
          price_monitor_interval_seconds?: number | null
          recommendation_buy_multiplier?: number | null
          scalp_buy_amount_sol?: number | null
          scalp_buy_amount_usd?: number | null
          scalp_buy_priority_fee?: string | null
          scalp_buy_slippage_bps?: number | null
          scalp_caller_timeout_seconds?: number | null
          scalp_max_age_minutes?: number | null
          scalp_max_bonding_pct?: number | null
          scalp_min_bonding_pct?: number | null
          scalp_min_callers?: number | null
          scalp_mode_enabled?: boolean | null
          scalp_moon_bag_pct?: number | null
          scalp_sell_priority_fee?: string | null
          scalp_sell_slippage_bps?: number | null
          scalp_stop_loss_pct?: number | null
          scalp_take_profit_pct?: number | null
          scalp_test_mode?: boolean | null
          scan_window_minutes?: number | null
          signal_classification_enabled?: boolean | null
          stale_alpha_check_enabled?: boolean | null
          stale_alpha_drop_threshold?: number | null
          stale_alpha_min_age_seconds?: number | null
          standard_buy_amount_usd?: number | null
          standard_sell_multiplier?: number | null
          telegram_announcements_enabled?: boolean | null
          total_buys_executed?: number | null
          total_calls_detected?: number | null
          trading_mode?: string | null
          tweet_on_fantasy_buy?: boolean | null
          updated_at?: string
          user_id?: string | null
          watch_mode_fantasy_only?: boolean | null
        }
        Update: {
          ape_keyword_enabled?: boolean | null
          auto_monitor_enabled?: boolean | null
          channel_id?: string
          channel_name?: string | null
          channel_type?: string | null
          channel_username?: string | null
          close_enough_threshold_pct?: number | null
          created_at?: string
          email_notifications?: boolean | null
          emergency_buy_multiplier?: number | null
          entity_access_hash?: string | null
          fantasy_buy_amount_usd?: number | null
          fantasy_mode?: boolean | null
          first_enabled?: boolean | null
          flipit_buy_amount_sol?: number | null
          flipit_buy_amount_usd?: number | null
          flipit_enabled?: boolean | null
          flipit_first_time_only?: boolean
          flipit_max_daily_positions?: number | null
          flipit_moonbag_enabled?: boolean | null
          flipit_moonbag_keep_pct?: number | null
          flipit_moonbag_sell_pct?: number | null
          flipit_sell_multiplier?: number | null
          flipit_wallet_id?: string | null
          fresh_discovery_buy_multiplier?: number | null
          holder_check_action?: string | null
          holder_check_enabled?: boolean | null
          id?: string
          is_active?: boolean | null
          kingkong_diamond_amount_usd?: number | null
          kingkong_diamond_max_hold_hours?: number | null
          kingkong_diamond_min_peak_x?: number | null
          kingkong_diamond_stop_urgency?: string | null
          kingkong_diamond_trailing_stop_pct?: number | null
          kingkong_mode_enabled?: boolean | null
          kingkong_quick_amount_usd?: number | null
          kingkong_quick_multiplier?: number | null
          kingkong_trigger_source?: string | null
          koth_enabled?: boolean | null
          large_buy_amount_usd?: number | null
          large_sell_multiplier?: number | null
          last_check_at?: string | null
          last_message_id?: number | null
          max_mint_age_minutes?: number | null
          max_price_threshold?: number | null
          min_holder_count?: number | null
          min_price_threshold?: number | null
          momentum_buy_multiplier?: number | null
          notification_email?: string | null
          peak_trailing_stop_enabled?: boolean | null
          peak_trailing_stop_pct?: number | null
          peak_trailing_stop_threshold?: number | null
          persistent_monitoring?: boolean | null
          polling_interval_seconds?: number | null
          price_monitor_interval_seconds?: number | null
          recommendation_buy_multiplier?: number | null
          scalp_buy_amount_sol?: number | null
          scalp_buy_amount_usd?: number | null
          scalp_buy_priority_fee?: string | null
          scalp_buy_slippage_bps?: number | null
          scalp_caller_timeout_seconds?: number | null
          scalp_max_age_minutes?: number | null
          scalp_max_bonding_pct?: number | null
          scalp_min_bonding_pct?: number | null
          scalp_min_callers?: number | null
          scalp_mode_enabled?: boolean | null
          scalp_moon_bag_pct?: number | null
          scalp_sell_priority_fee?: string | null
          scalp_sell_slippage_bps?: number | null
          scalp_stop_loss_pct?: number | null
          scalp_take_profit_pct?: number | null
          scalp_test_mode?: boolean | null
          scan_window_minutes?: number | null
          signal_classification_enabled?: boolean | null
          stale_alpha_check_enabled?: boolean | null
          stale_alpha_drop_threshold?: number | null
          stale_alpha_min_age_seconds?: number | null
          standard_buy_amount_usd?: number | null
          standard_sell_multiplier?: number | null
          telegram_announcements_enabled?: boolean | null
          total_buys_executed?: number | null
          total_calls_detected?: number | null
          trading_mode?: string | null
          tweet_on_fantasy_buy?: boolean | null
          updated_at?: string
          user_id?: string | null
          watch_mode_fantasy_only?: boolean | null
        }
        Relationships: []
      }
      telegram_channel_member_audit: {
        Row: {
          audit_batch_id: string
          chat_id: number
          chat_title: string | null
          classification: string | null
          created_at: string | null
          first_name: string | null
          id: string
          is_bot: boolean | null
          join_date: string | null
          last_name: string | null
          participant_type: string | null
          telegram_user_id: number
          telegram_username: string | null
        }
        Insert: {
          audit_batch_id: string
          chat_id: number
          chat_title?: string | null
          classification?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string
          is_bot?: boolean | null
          join_date?: string | null
          last_name?: string | null
          participant_type?: string | null
          telegram_user_id: number
          telegram_username?: string | null
        }
        Update: {
          audit_batch_id?: string
          chat_id?: number
          chat_title?: string | null
          classification?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string
          is_bot?: boolean | null
          join_date?: string | null
          last_name?: string | null
          participant_type?: string | null
          telegram_user_id?: number
          telegram_username?: string | null
        }
        Relationships: []
      }
      telegram_channel_members: {
        Row: {
          chat_id: number
          chat_title: string | null
          created_at: string
          event_type: string
          first_name: string | null
          id: string
          invited_by_user_id: string | null
          is_bot_account: boolean
          last_name: string | null
          new_status: string | null
          old_status: string | null
          telegram_user_id: string
          telegram_username: string | null
        }
        Insert: {
          chat_id: number
          chat_title?: string | null
          created_at?: string
          event_type: string
          first_name?: string | null
          id?: string
          invited_by_user_id?: string | null
          is_bot_account?: boolean
          last_name?: string | null
          new_status?: string | null
          old_status?: string | null
          telegram_user_id: string
          telegram_username?: string | null
        }
        Update: {
          chat_id?: number
          chat_title?: string | null
          created_at?: string
          event_type?: string
          first_name?: string | null
          id?: string
          invited_by_user_id?: string | null
          is_bot_account?: boolean
          last_name?: string | null
          new_status?: string | null
          old_status?: string | null
          telegram_user_id?: string
          telegram_username?: string | null
        }
        Relationships: []
      }
      telegram_channel_registry: {
        Row: {
          channel_id: string
          current_title: string | null
          current_username: string | null
          first_seen_at: string | null
          last_seen_at: string | null
          linked_token_count: number | null
          title_history: Json | null
          username_history: Json | null
        }
        Insert: {
          channel_id: string
          current_title?: string | null
          current_username?: string | null
          first_seen_at?: string | null
          last_seen_at?: string | null
          linked_token_count?: number | null
          title_history?: Json | null
          username_history?: Json | null
        }
        Update: {
          channel_id?: string
          current_title?: string | null
          current_username?: string | null
          first_seen_at?: string | null
          last_seen_at?: string | null
          linked_token_count?: number | null
          title_history?: Json | null
          username_history?: Json | null
        }
        Relationships: []
      }
      telegram_channel_welcome_config: {
        Row: {
          chat_id: number
          chat_title: string | null
          created_at: string
          id: string
          is_enabled: boolean
          suspend_until: string | null
          updated_at: string
          welcome_message: string
        }
        Insert: {
          chat_id: number
          chat_title?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          suspend_until?: string | null
          updated_at?: string
          welcome_message?: string
        }
        Update: {
          chat_id?: number
          chat_title?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          suspend_until?: string | null
          updated_at?: string
          welcome_message?: string
        }
        Relationships: []
      }
      telegram_fantasy_positions: {
        Row: {
          adjusted_by_dev_risk: boolean | null
          ath_at: string | null
          ath_multiplier: number | null
          ath_price_usd: number | null
          ath_source: string | null
          auto_sell_triggered: boolean | null
          call_id: string | null
          caller_display_name: string | null
          caller_username: string | null
          channel_config_id: string | null
          channel_name: string | null
          close_enough_triggered: boolean | null
          created_at: string
          current_price_usd: number | null
          developer_id: string | null
          developer_reputation_score: number | null
          developer_risk_level: string | null
          developer_rug_count: number | null
          developer_total_tokens: number | null
          developer_twitter_handle: string | null
          developer_warning: string | null
          entry_amount_usd: number
          entry_price_usd: number
          exclude_from_stats: boolean | null
          exclusion_reason: string | null
          holder_count_at_entry: number | null
          id: string
          interpretation_id: string | null
          is_active: boolean | null
          message_received_at: string | null
          near_miss_at: string | null
          near_miss_logged: boolean | null
          near_miss_multiplier: number | null
          original_sell_multiplier: number | null
          peak_multiplier: number | null
          peak_price_at: string | null
          peak_price_usd: number | null
          peak_trailing_stop_enabled: boolean | null
          peak_trailing_stop_pct: number | null
          peak_trailing_stop_triggered: boolean | null
          realized_pnl_percent: number | null
          realized_pnl_usd: number | null
          rugcheck_checked_at: string | null
          rugcheck_normalised: number | null
          rugcheck_passed: boolean | null
          rugcheck_risks: Json | null
          rugcheck_score: number | null
          rule_id: string | null
          skip_reason: string | null
          sold_at: string | null
          sold_price_usd: number | null
          status: string
          stop_loss_enabled: boolean | null
          stop_loss_pct: number | null
          stop_loss_triggered: boolean | null
          target_sell_multiplier: number | null
          token_amount: number | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          trail_current_price_usd: number | null
          trail_last_updated_at: string | null
          trail_low_at: string | null
          trail_low_price_usd: number | null
          trail_peak_at: string | null
          trail_peak_multiplier: number | null
          trail_peak_price_usd: number | null
          trail_tracking_enabled: boolean | null
          unrealized_pnl_percent: number | null
          unrealized_pnl_usd: number | null
          updated_at: string
          user_id: string | null
          was_first_whale: boolean | null
          whale_call_sequence: number | null
          whale_name: string | null
        }
        Insert: {
          adjusted_by_dev_risk?: boolean | null
          ath_at?: string | null
          ath_multiplier?: number | null
          ath_price_usd?: number | null
          ath_source?: string | null
          auto_sell_triggered?: boolean | null
          call_id?: string | null
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_name?: string | null
          close_enough_triggered?: boolean | null
          created_at?: string
          current_price_usd?: number | null
          developer_id?: string | null
          developer_reputation_score?: number | null
          developer_risk_level?: string | null
          developer_rug_count?: number | null
          developer_total_tokens?: number | null
          developer_twitter_handle?: string | null
          developer_warning?: string | null
          entry_amount_usd?: number
          entry_price_usd: number
          exclude_from_stats?: boolean | null
          exclusion_reason?: string | null
          holder_count_at_entry?: number | null
          id?: string
          interpretation_id?: string | null
          is_active?: boolean | null
          message_received_at?: string | null
          near_miss_at?: string | null
          near_miss_logged?: boolean | null
          near_miss_multiplier?: number | null
          original_sell_multiplier?: number | null
          peak_multiplier?: number | null
          peak_price_at?: string | null
          peak_price_usd?: number | null
          peak_trailing_stop_enabled?: boolean | null
          peak_trailing_stop_pct?: number | null
          peak_trailing_stop_triggered?: boolean | null
          realized_pnl_percent?: number | null
          realized_pnl_usd?: number | null
          rugcheck_checked_at?: string | null
          rugcheck_normalised?: number | null
          rugcheck_passed?: boolean | null
          rugcheck_risks?: Json | null
          rugcheck_score?: number | null
          rule_id?: string | null
          skip_reason?: string | null
          sold_at?: string | null
          sold_price_usd?: number | null
          status?: string
          stop_loss_enabled?: boolean | null
          stop_loss_pct?: number | null
          stop_loss_triggered?: boolean | null
          target_sell_multiplier?: number | null
          token_amount?: number | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          trail_current_price_usd?: number | null
          trail_last_updated_at?: string | null
          trail_low_at?: string | null
          trail_low_price_usd?: number | null
          trail_peak_at?: string | null
          trail_peak_multiplier?: number | null
          trail_peak_price_usd?: number | null
          trail_tracking_enabled?: boolean | null
          unrealized_pnl_percent?: number | null
          unrealized_pnl_usd?: number | null
          updated_at?: string
          user_id?: string | null
          was_first_whale?: boolean | null
          whale_call_sequence?: number | null
          whale_name?: string | null
        }
        Update: {
          adjusted_by_dev_risk?: boolean | null
          ath_at?: string | null
          ath_multiplier?: number | null
          ath_price_usd?: number | null
          ath_source?: string | null
          auto_sell_triggered?: boolean | null
          call_id?: string | null
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_name?: string | null
          close_enough_triggered?: boolean | null
          created_at?: string
          current_price_usd?: number | null
          developer_id?: string | null
          developer_reputation_score?: number | null
          developer_risk_level?: string | null
          developer_rug_count?: number | null
          developer_total_tokens?: number | null
          developer_twitter_handle?: string | null
          developer_warning?: string | null
          entry_amount_usd?: number
          entry_price_usd?: number
          exclude_from_stats?: boolean | null
          exclusion_reason?: string | null
          holder_count_at_entry?: number | null
          id?: string
          interpretation_id?: string | null
          is_active?: boolean | null
          message_received_at?: string | null
          near_miss_at?: string | null
          near_miss_logged?: boolean | null
          near_miss_multiplier?: number | null
          original_sell_multiplier?: number | null
          peak_multiplier?: number | null
          peak_price_at?: string | null
          peak_price_usd?: number | null
          peak_trailing_stop_enabled?: boolean | null
          peak_trailing_stop_pct?: number | null
          peak_trailing_stop_triggered?: boolean | null
          realized_pnl_percent?: number | null
          realized_pnl_usd?: number | null
          rugcheck_checked_at?: string | null
          rugcheck_normalised?: number | null
          rugcheck_passed?: boolean | null
          rugcheck_risks?: Json | null
          rugcheck_score?: number | null
          rule_id?: string | null
          skip_reason?: string | null
          sold_at?: string | null
          sold_price_usd?: number | null
          status?: string
          stop_loss_enabled?: boolean | null
          stop_loss_pct?: number | null
          stop_loss_triggered?: boolean | null
          target_sell_multiplier?: number | null
          token_amount?: number | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          trail_current_price_usd?: number | null
          trail_last_updated_at?: string | null
          trail_low_at?: string | null
          trail_low_price_usd?: number | null
          trail_peak_at?: string | null
          trail_peak_multiplier?: number | null
          trail_peak_price_usd?: number | null
          trail_tracking_enabled?: boolean | null
          unrealized_pnl_percent?: number | null
          unrealized_pnl_usd?: number | null
          updated_at?: string
          user_id?: string | null
          was_first_whale?: boolean | null
          whale_call_sequence?: number | null
          whale_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_fantasy_positions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "telegram_channel_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_fantasy_positions_channel_config_id_fkey"
            columns: ["channel_config_id"]
            isOneToOne: false
            referencedRelation: "telegram_channel_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_fantasy_positions_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "telegram_fantasy_positions_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_fantasy_positions_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "telegram_fantasy_positions_interpretation_id_fkey"
            columns: ["interpretation_id"]
            isOneToOne: false
            referencedRelation: "telegram_message_interpretations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_fantasy_positions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "trading_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_feedback: {
        Row: {
          created_at: string
          feedback_text: string
          id: string
          is_tester: boolean
          linked_user_id: string | null
          platform: string
          telegram_user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          feedback_text: string
          id?: string
          is_tester?: boolean
          linked_user_id?: string | null
          platform?: string
          telegram_user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          feedback_text?: string
          id?: string
          is_tester?: boolean
          linked_user_id?: string | null
          platform?: string
          telegram_user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      telegram_group_messages: {
        Row: {
          chat_id: number
          chat_type: string
          created_at: string
          display_name: string | null
          id: string
          is_bot_reply: boolean
          message_id: number | null
          message_text: string | null
          telegram_user_id: string
          username: string | null
        }
        Insert: {
          chat_id: number
          chat_type?: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_bot_reply?: boolean
          message_id?: number | null
          message_text?: string | null
          telegram_user_id: string
          username?: string | null
        }
        Update: {
          chat_id?: number
          chat_type?: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_bot_reply?: boolean
          message_id?: number | null
          message_text?: string | null
          telegram_user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      telegram_insider_token_lifecycle: {
        Row: {
          blackbox_harvested_at: string | null
          built_at: string
          channel_name: string
          created_at: string
          creator_attempts: number
          creator_last_attempt_at: string | null
          creator_resolved_at: string | null
          creator_risk_tier: string | null
          creator_status: string
          creator_wallet: string | null
          dev_history_warning: boolean | null
          dev_wallet: string | null
          dev_wallet_resolved_at: string | null
          dev_wallet_source: string | null
          enrichment_last_run_at: string | null
          enrichment_status: string | null
          entry_market_cap: number | null
          entry_mc_text: string | null
          first_call_message_id: number | null
          first_called_at: string
          genealogy_chain: Json | null
          genealogy_depth: number | null
          genealogy_kyc_root: string | null
          holders_refreshed_at: string | null
          id: string
          ingest_completed_at: string | null
          ingest_last_error: string | null
          ingest_latency_ms: number | null
          ingest_started_at: string | null
          ingest_status: string
          is_rugged: boolean
          kyc_attempts: number
          kyc_label: string | null
          kyc_last_attempt_at: string | null
          kyc_status: string
          last_legacy_swept_at: string | null
          last_milestone_at: string | null
          last_resighting_swept_at: string | null
          launchpad: string | null
          lifespan_minutes: number | null
          mesh_decision_trace: Json | null
          mesh_hydrated_at: string | null
          mesh_promoted_at: string | null
          mesh_promotion_reason: string | null
          mesh_promotion_status: string
          metadata: Json | null
          milestone_count: number
          milestone_timeline: Json
          peak_market_cap: number | null
          peak_multiplier: number
          peak_reached_at: string | null
          raw_alert_message: string | null
          rug_evidence: Json | null
          socials_changed: boolean
          socials_last_checked_at: string | null
          socials_snapshot: Json | null
          token_mint: string
          token_symbol: string | null
          total_messages: number
          updated_at: string
        }
        Insert: {
          blackbox_harvested_at?: string | null
          built_at?: string
          channel_name?: string
          created_at?: string
          creator_attempts?: number
          creator_last_attempt_at?: string | null
          creator_resolved_at?: string | null
          creator_risk_tier?: string | null
          creator_status?: string
          creator_wallet?: string | null
          dev_history_warning?: boolean | null
          dev_wallet?: string | null
          dev_wallet_resolved_at?: string | null
          dev_wallet_source?: string | null
          enrichment_last_run_at?: string | null
          enrichment_status?: string | null
          entry_market_cap?: number | null
          entry_mc_text?: string | null
          first_call_message_id?: number | null
          first_called_at: string
          genealogy_chain?: Json | null
          genealogy_depth?: number | null
          genealogy_kyc_root?: string | null
          holders_refreshed_at?: string | null
          id?: string
          ingest_completed_at?: string | null
          ingest_last_error?: string | null
          ingest_latency_ms?: number | null
          ingest_started_at?: string | null
          ingest_status?: string
          is_rugged?: boolean
          kyc_attempts?: number
          kyc_label?: string | null
          kyc_last_attempt_at?: string | null
          kyc_status?: string
          last_legacy_swept_at?: string | null
          last_milestone_at?: string | null
          last_resighting_swept_at?: string | null
          launchpad?: string | null
          lifespan_minutes?: number | null
          mesh_decision_trace?: Json | null
          mesh_hydrated_at?: string | null
          mesh_promoted_at?: string | null
          mesh_promotion_reason?: string | null
          mesh_promotion_status?: string
          metadata?: Json | null
          milestone_count?: number
          milestone_timeline?: Json
          peak_market_cap?: number | null
          peak_multiplier?: number
          peak_reached_at?: string | null
          raw_alert_message?: string | null
          rug_evidence?: Json | null
          socials_changed?: boolean
          socials_last_checked_at?: string | null
          socials_snapshot?: Json | null
          token_mint: string
          token_symbol?: string | null
          total_messages?: number
          updated_at?: string
        }
        Update: {
          blackbox_harvested_at?: string | null
          built_at?: string
          channel_name?: string
          created_at?: string
          creator_attempts?: number
          creator_last_attempt_at?: string | null
          creator_resolved_at?: string | null
          creator_risk_tier?: string | null
          creator_status?: string
          creator_wallet?: string | null
          dev_history_warning?: boolean | null
          dev_wallet?: string | null
          dev_wallet_resolved_at?: string | null
          dev_wallet_source?: string | null
          enrichment_last_run_at?: string | null
          enrichment_status?: string | null
          entry_market_cap?: number | null
          entry_mc_text?: string | null
          first_call_message_id?: number | null
          first_called_at?: string
          genealogy_chain?: Json | null
          genealogy_depth?: number | null
          genealogy_kyc_root?: string | null
          holders_refreshed_at?: string | null
          id?: string
          ingest_completed_at?: string | null
          ingest_last_error?: string | null
          ingest_latency_ms?: number | null
          ingest_started_at?: string | null
          ingest_status?: string
          is_rugged?: boolean
          kyc_attempts?: number
          kyc_label?: string | null
          kyc_last_attempt_at?: string | null
          kyc_status?: string
          last_legacy_swept_at?: string | null
          last_milestone_at?: string | null
          last_resighting_swept_at?: string | null
          launchpad?: string | null
          lifespan_minutes?: number | null
          mesh_decision_trace?: Json | null
          mesh_hydrated_at?: string | null
          mesh_promoted_at?: string | null
          mesh_promotion_reason?: string | null
          mesh_promotion_status?: string
          metadata?: Json | null
          milestone_count?: number
          milestone_timeline?: Json
          peak_market_cap?: number | null
          peak_multiplier?: number
          peak_reached_at?: string | null
          raw_alert_message?: string | null
          rug_evidence?: Json | null
          socials_changed?: boolean
          socials_last_checked_at?: string | null
          socials_snapshot?: Json | null
          token_mint?: string
          token_symbol?: string | null
          total_messages?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_link_codes: {
        Row: {
          created_at: string
          id: string
          link_code: string
          linked_at: string | null
          selected_channel_id: number | null
          telegram_user_id: string | null
          telegram_username: string | null
          tier_at_link: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_code: string
          linked_at?: string | null
          selected_channel_id?: number | null
          telegram_user_id?: string | null
          telegram_username?: string | null
          tier_at_link?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link_code?: string
          linked_at?: string | null
          selected_channel_id?: number | null
          telegram_user_id?: string | null
          telegram_username?: string | null
          tier_at_link?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_message_interpretations: {
        Row: {
          ai_interpretation: string
          ai_summary: string
          bonding_graduated: boolean | null
          call_sequence: number | null
          caller_display_name: string | null
          caller_username: string | null
          channel_config_id: string | null
          channel_id: string
          confidence_score: number | null
          created_at: string
          curve_percent_at_call: number | null
          decision: string
          decision_reasoning: string
          extracted_tokens: string[] | null
          id: string
          message_id: number
          price_at_detection: number | null
          raw_message: string | null
          signal_type: string | null
          token_mint: string | null
          token_symbol: string | null
          urgency_score: number | null
          whale_consensus_count: number | null
          whale_name: string | null
        }
        Insert: {
          ai_interpretation: string
          ai_summary: string
          bonding_graduated?: boolean | null
          call_sequence?: number | null
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_id: string
          confidence_score?: number | null
          created_at?: string
          curve_percent_at_call?: number | null
          decision: string
          decision_reasoning: string
          extracted_tokens?: string[] | null
          id?: string
          message_id: number
          price_at_detection?: number | null
          raw_message?: string | null
          signal_type?: string | null
          token_mint?: string | null
          token_symbol?: string | null
          urgency_score?: number | null
          whale_consensus_count?: number | null
          whale_name?: string | null
        }
        Update: {
          ai_interpretation?: string
          ai_summary?: string
          bonding_graduated?: boolean | null
          call_sequence?: number | null
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_id?: string
          confidence_score?: number | null
          created_at?: string
          curve_percent_at_call?: number | null
          decision?: string
          decision_reasoning?: string
          extracted_tokens?: string[] | null
          id?: string
          message_id?: number
          price_at_detection?: number | null
          raw_message?: string | null
          signal_type?: string | null
          token_mint?: string | null
          token_symbol?: string | null
          urgency_score?: number | null
          whale_consensus_count?: number | null
          whale_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_message_interpretations_channel_config_id_fkey"
            columns: ["channel_config_id"]
            isOneToOne: false
            referencedRelation: "telegram_channel_config"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_message_targets: {
        Row: {
          chat_id: string | null
          chat_username: string | null
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          resolved_name: string | null
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          chat_username?: string | null
          created_at?: string
          id?: string
          label: string
          last_used_at?: string | null
          resolved_name?: string | null
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string | null
          chat_username?: string | null
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          resolved_name?: string | null
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_monitor_lock: {
        Row: {
          expires_at: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
        }
        Insert: {
          expires_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
        }
        Update: {
          expires_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
        }
        Relationships: []
      }
      telegram_monitor_run_logs: {
        Row: {
          calls_inserted_count: number
          channel_config_id: string | null
          channel_id: string | null
          channel_name: string | null
          channel_username: string | null
          created_at: string
          eligible_count: number
          error_message: string | null
          fantasy_positions_inserted_count: number
          fetched_count: number
          finished_at: string | null
          flipit_buys_count: number
          id: string
          interpretations_inserted_count: number
          lock_acquired: boolean | null
          mtproto_used: boolean | null
          new_max_message_id: number | null
          new_messages_count: number
          previous_message_id: number | null
          run_id: string
          skip_reasons: Json | null
          started_at: string
          status: string
          tokens_found_count: number
        }
        Insert: {
          calls_inserted_count?: number
          channel_config_id?: string | null
          channel_id?: string | null
          channel_name?: string | null
          channel_username?: string | null
          created_at?: string
          eligible_count?: number
          error_message?: string | null
          fantasy_positions_inserted_count?: number
          fetched_count?: number
          finished_at?: string | null
          flipit_buys_count?: number
          id?: string
          interpretations_inserted_count?: number
          lock_acquired?: boolean | null
          mtproto_used?: boolean | null
          new_max_message_id?: number | null
          new_messages_count?: number
          previous_message_id?: number | null
          run_id: string
          skip_reasons?: Json | null
          started_at?: string
          status?: string
          tokens_found_count?: number
        }
        Update: {
          calls_inserted_count?: number
          channel_config_id?: string | null
          channel_id?: string | null
          channel_name?: string | null
          channel_username?: string | null
          created_at?: string
          eligible_count?: number
          error_message?: string | null
          fantasy_positions_inserted_count?: number
          fetched_count?: number
          finished_at?: string | null
          flipit_buys_count?: number
          id?: string
          interpretations_inserted_count?: number
          lock_acquired?: boolean | null
          mtproto_used?: boolean | null
          new_max_message_id?: number | null
          new_messages_count?: number
          previous_message_id?: number | null
          run_id?: string
          skip_reasons?: Json | null
          started_at?: string
          status?: string
          tokens_found_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_monitor_run_logs_channel_config_id_fkey"
            columns: ["channel_config_id"]
            isOneToOne: false
            referencedRelation: "telegram_channel_config"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_mtproto_session: {
        Row: {
          created_at: string | null
          error_count: number | null
          id: string
          is_active: boolean | null
          last_error: string | null
          last_error_at: string | null
          last_used_at: string | null
          phone_number: string | null
          session_string: string
          session_valid: boolean | null
        }
        Insert: {
          created_at?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          last_used_at?: string | null
          phone_number?: string | null
          session_string: string
          session_valid?: boolean | null
        }
        Update: {
          created_at?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          last_used_at?: string | null
          phone_number?: string | null
          session_string?: string
          session_valid?: boolean | null
        }
        Relationships: []
      }
      telegram_session: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          last_used_at: string | null
          phone_number: string | null
          session_string: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          phone_number?: string | null
          session_string: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          phone_number?: string | null
          session_string?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      telegram_trading_tiers: {
        Row: {
          buy_amount_usd: number
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          max_market_cap_usd: number | null
          max_price_usd: number | null
          min_market_cap_usd: number | null
          min_price_usd: number | null
          name: string
          priority: number
          requires_ape_keyword: boolean
          sell_target_multiplier: number
          stop_loss_enabled: boolean
          stop_loss_pct: number | null
          telegram_target_id: string | null
          updated_at: string
        }
        Insert: {
          buy_amount_usd?: number
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          max_market_cap_usd?: number | null
          max_price_usd?: number | null
          min_market_cap_usd?: number | null
          min_price_usd?: number | null
          name: string
          priority?: number
          requires_ape_keyword?: boolean
          sell_target_multiplier?: number
          stop_loss_enabled?: boolean
          stop_loss_pct?: number | null
          telegram_target_id?: string | null
          updated_at?: string
        }
        Update: {
          buy_amount_usd?: number
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          max_market_cap_usd?: number | null
          max_price_usd?: number | null
          min_market_cap_usd?: number | null
          min_price_usd?: number | null
          name?: string
          priority?: number
          requires_ape_keyword?: boolean
          sell_target_multiplier?: number
          stop_loss_enabled?: boolean
          stop_loss_pct?: number | null
          telegram_target_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_trading_tiers_telegram_target_id_fkey"
            columns: ["telegram_target_id"]
            isOneToOne: false
            referencedRelation: "telegram_message_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_whale_profiles: {
        Row: {
          avg_roi: number | null
          best_call_roi: number | null
          created_at: string | null
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          priority_tier: string | null
          profitable_calls: number | null
          success_rate: number | null
          total_calls: number | null
          total_pnl_usd: number | null
          updated_at: string | null
          whale_name: string
          worst_call_roi: number | null
        }
        Insert: {
          avg_roi?: number | null
          best_call_roi?: number | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          priority_tier?: string | null
          profitable_calls?: number | null
          success_rate?: number | null
          total_calls?: number | null
          total_pnl_usd?: number | null
          updated_at?: string | null
          whale_name: string
          worst_call_roi?: number | null
        }
        Update: {
          avg_roi?: number | null
          best_call_roi?: number | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          priority_tier?: string | null
          profitable_calls?: number | null
          success_rate?: number | null
          total_calls?: number | null
          total_pnl_usd?: number | null
          updated_at?: string | null
          whale_name?: string
          worst_call_roi?: number | null
        }
        Relationships: []
      }
      telegram_whale_stats: {
        Row: {
          avg_entry_curve_percent: number | null
          avg_exit_multiplier: number | null
          avg_time_to_peak_minutes: number | null
          best_call_pnl_percent: number | null
          best_call_token: string | null
          channel_config_id: string | null
          created_at: string | null
          dead_tokens: number | null
          first_calls: number | null
          first_seen_at: string | null
          graduated_tokens: number | null
          id: string
          last_call_at: string | null
          losing_calls: number | null
          total_calls: number | null
          total_pnl_usd: number | null
          updated_at: string | null
          whale_name: string
          winning_calls: number | null
          worst_call_pnl_percent: number | null
          worst_call_token: string | null
        }
        Insert: {
          avg_entry_curve_percent?: number | null
          avg_exit_multiplier?: number | null
          avg_time_to_peak_minutes?: number | null
          best_call_pnl_percent?: number | null
          best_call_token?: string | null
          channel_config_id?: string | null
          created_at?: string | null
          dead_tokens?: number | null
          first_calls?: number | null
          first_seen_at?: string | null
          graduated_tokens?: number | null
          id?: string
          last_call_at?: string | null
          losing_calls?: number | null
          total_calls?: number | null
          total_pnl_usd?: number | null
          updated_at?: string | null
          whale_name: string
          winning_calls?: number | null
          worst_call_pnl_percent?: number | null
          worst_call_token?: string | null
        }
        Update: {
          avg_entry_curve_percent?: number | null
          avg_exit_multiplier?: number | null
          avg_time_to_peak_minutes?: number | null
          best_call_pnl_percent?: number | null
          best_call_token?: string | null
          channel_config_id?: string | null
          created_at?: string | null
          dead_tokens?: number | null
          first_calls?: number | null
          first_seen_at?: string | null
          graduated_tokens?: number | null
          id?: string
          last_call_at?: string | null
          losing_calls?: number | null
          total_calls?: number | null
          total_pnl_usd?: number | null
          updated_at?: string | null
          whale_name?: string
          winning_calls?: number | null
          worst_call_pnl_percent?: number | null
          worst_call_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_whale_stats_channel_config_id_fkey"
            columns: ["channel_config_id"]
            isOneToOne: false
            referencedRelation: "telegram_channel_config"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_xlookup_usage: {
        Row: {
          count: number
          id: string
          telegram_user_id: string
          updated_at: string
          used_on: string
        }
        Insert: {
          count?: number
          id?: string
          telegram_user_id: string
          updated_at?: string
          used_on?: string
        }
        Update: {
          count?: number
          id?: string
          telegram_user_id?: string
          updated_at?: string
          used_on?: string
        }
        Relationships: []
      }
      tester_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          message: string
          page_path: string | null
          screenshot_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_type?: string
          id?: string
          message: string
          page_path?: string | null
          screenshot_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          message?: string
          page_path?: string | null
          screenshot_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tester_questionnaire_responses: {
        Row: {
          answers: Json
          completed_at: string | null
          created_at: string
          id: string
          questionnaire_id: string
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          questionnaire_id: string
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          questionnaire_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tester_questionnaire_responses_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "tester_questionnaires"
            referencedColumns: ["id"]
          },
        ]
      }
      tester_questionnaires: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          questions: Json
          target_promo_code: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          questions?: Json
          target_promo_code?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          questions?: Json
          target_promo_code?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      testimonial_invites: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          label: string | null
          max_uses: number | null
          token: string
          use_count: number | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          max_uses?: number | null
          token?: string
          use_count?: number | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          max_uses?: number | null
          token?: string
          use_count?: number | null
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          approved_at: string | null
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string
          invite_token: string | null
          is_approved: boolean | null
          is_internal: boolean | null
          role_label: string | null
          sort_order: number | null
          submitted_at: string | null
          testimonial_text: string
          twitter_account_id: string | null
          twitter_handle: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          invite_token?: string | null
          is_approved?: boolean | null
          is_internal?: boolean | null
          role_label?: string | null
          sort_order?: number | null
          submitted_at?: string | null
          testimonial_text: string
          twitter_account_id?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          invite_token?: string | null
          is_approved?: boolean | null
          is_internal?: boolean | null
          role_label?: string | null
          sort_order?: number | null
          submitted_at?: string | null
          testimonial_text?: string
          twitter_account_id?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_twitter_account_id_fkey"
            columns: ["twitter_account_id"]
            isOneToOne: false
            referencedRelation: "twitter_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tg_sol_subscriptions: {
        Row: {
          amount_sol: number
          created_at: string
          expires_at: string | null
          id: string
          paid_at: string | null
          payment_wallet_pubkey: string
          payment_wallet_secret_encrypted: string
          renewal_reminder_sent: boolean | null
          sol_price_at_order: number | null
          status: string
          sweep_tx_signature: string | null
          swept_at: string | null
          telegram_user_id: string
          tier_granted: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_sol?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          payment_wallet_pubkey: string
          payment_wallet_secret_encrypted: string
          renewal_reminder_sent?: boolean | null
          sol_price_at_order?: number | null
          status?: string
          sweep_tx_signature?: string | null
          swept_at?: string | null
          telegram_user_id: string
          tier_granted?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_sol?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          payment_wallet_pubkey?: string
          payment_wallet_secret_encrypted?: string
          renewal_reminder_sent?: boolean | null
          sol_price_at_order?: number | null
          status?: string
          sweep_tx_signature?: string | null
          swept_at?: string | null
          telegram_user_id?: string
          tier_granted?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      token_account_cleanup_logs: {
        Row: {
          accounts_closed: number
          created_at: string
          id: string
          sol_recovered: number
          transaction_signatures: string[] | null
          wallet_pubkey: string
          wallet_source: string
        }
        Insert: {
          accounts_closed?: number
          created_at?: string
          id?: string
          sol_recovered?: number
          transaction_signatures?: string[] | null
          wallet_pubkey: string
          wallet_source: string
        }
        Update: {
          accounts_closed?: number
          created_at?: string
          id?: string
          sol_recovered?: number
          transaction_signatures?: string[] | null
          wallet_pubkey?: string
          wallet_source?: string
        }
        Relationships: []
      }
      token_ai_interpretations: {
        Row: {
          commentary_mode: string
          created_at: string | null
          expires_at: string
          id: string
          interpretation: Json
          metrics_snapshot: Json | null
          token_mint: string
        }
        Insert: {
          commentary_mode?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          interpretation: Json
          metrics_snapshot?: Json | null
          token_mint: string
        }
        Update: {
          commentary_mode?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          interpretation?: Json
          metrics_snapshot?: Json | null
          token_mint?: string
        }
        Relationships: []
      }
      token_analysis_costs: {
        Row: {
          analysis_date: string | null
          coingecko_calls: number | null
          created_at: string | null
          dexscreener_calls: number | null
          helius_credits: number | null
          holder_count: number | null
          id: string
          jupiter_calls: number | null
          pumpfun_calls: number | null
          rugcheck_calls: number | null
          session_id: string | null
          solscan_credits: number | null
          token_mint: string
          total_api_calls: number | null
          total_response_time_ms: number | null
          user_id: string | null
        }
        Insert: {
          analysis_date?: string | null
          coingecko_calls?: number | null
          created_at?: string | null
          dexscreener_calls?: number | null
          helius_credits?: number | null
          holder_count?: number | null
          id?: string
          jupiter_calls?: number | null
          pumpfun_calls?: number | null
          rugcheck_calls?: number | null
          session_id?: string | null
          solscan_credits?: number | null
          token_mint: string
          total_api_calls?: number | null
          total_response_time_ms?: number | null
          user_id?: string | null
        }
        Update: {
          analysis_date?: string | null
          coingecko_calls?: number | null
          created_at?: string | null
          dexscreener_calls?: number | null
          helius_credits?: number | null
          holder_count?: number | null
          id?: string
          jupiter_calls?: number | null
          pumpfun_calls?: number | null
          rugcheck_calls?: number | null
          session_id?: string | null
          solscan_credits?: number | null
          token_mint?: string
          total_api_calls?: number | null
          total_response_time_ms?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      token_assessments: {
        Row: {
          active_boosts: number | null
          active_warnings: Json | null
          ai_confidence: number | null
          ai_prediction: string | null
          ai_reasoning: string | null
          ai_similar_tokens: Json | null
          assessment_type: string
          ath_usd: number | null
          bundled_pct: number | null
          buy_sell_ratio: number | null
          buys_1h: number | null
          buys_5m: number | null
          cause_of_death: string | null
          created_at: string
          dev_holding_pct: number | null
          dev_is_serial_spammer: boolean | null
          dev_pattern: string | null
          dev_reputation_score: number | null
          dev_sold_all: boolean | null
          dev_tokens_rugged: number | null
          dev_total_launches: number | null
          dev_trust_level: string | null
          dev_wallet: string | null
          dex_paid: boolean | null
          dust_pct: number | null
          dust_wallets: number | null
          fresh_wallet_pct: number | null
          has_telegram: boolean | null
          has_twitter: boolean | null
          has_website: boolean | null
          health_grade: string | null
          health_score: number | null
          id: string
          insider_cluster_count: number | null
          liquidity_usd: number | null
          lp_pct_of_supply: number | null
          matched_pattern_rules: Json | null
          mcap_usd: number | null
          name: string | null
          outcome: string | null
          phase: string | null
          prediction_validated: boolean | null
          price_drop_from_ath_pct: number | null
          price_usd: number | null
          raw_report_data: Json | null
          real_holders: number | null
          retail_count: number | null
          retail_pct: number | null
          retail_supply_pct: number | null
          risk_flags: Json | null
          sells_1h: number | null
          sells_5m: number | null
          serious_count: number | null
          serious_pct: number | null
          serious_supply_pct: number | null
          snapshot_at: string
          stability_score: number | null
          symbol: string | null
          tier_divergence: number | null
          token_age_minutes: number | null
          token_mint: string
          top10_pct: number | null
          top20_pct: number | null
          top5_pct: number | null
          total_holders: number | null
          updated_at: string
          validated_at: string | null
          volume_1h: number | null
          volume_24h: number | null
          volume_mcap_ratio: number | null
          whale_count: number | null
          whale_pct: number | null
          whale_supply_pct: number | null
        }
        Insert: {
          active_boosts?: number | null
          active_warnings?: Json | null
          ai_confidence?: number | null
          ai_prediction?: string | null
          ai_reasoning?: string | null
          ai_similar_tokens?: Json | null
          assessment_type: string
          ath_usd?: number | null
          bundled_pct?: number | null
          buy_sell_ratio?: number | null
          buys_1h?: number | null
          buys_5m?: number | null
          cause_of_death?: string | null
          created_at?: string
          dev_holding_pct?: number | null
          dev_is_serial_spammer?: boolean | null
          dev_pattern?: string | null
          dev_reputation_score?: number | null
          dev_sold_all?: boolean | null
          dev_tokens_rugged?: number | null
          dev_total_launches?: number | null
          dev_trust_level?: string | null
          dev_wallet?: string | null
          dex_paid?: boolean | null
          dust_pct?: number | null
          dust_wallets?: number | null
          fresh_wallet_pct?: number | null
          has_telegram?: boolean | null
          has_twitter?: boolean | null
          has_website?: boolean | null
          health_grade?: string | null
          health_score?: number | null
          id?: string
          insider_cluster_count?: number | null
          liquidity_usd?: number | null
          lp_pct_of_supply?: number | null
          matched_pattern_rules?: Json | null
          mcap_usd?: number | null
          name?: string | null
          outcome?: string | null
          phase?: string | null
          prediction_validated?: boolean | null
          price_drop_from_ath_pct?: number | null
          price_usd?: number | null
          raw_report_data?: Json | null
          real_holders?: number | null
          retail_count?: number | null
          retail_pct?: number | null
          retail_supply_pct?: number | null
          risk_flags?: Json | null
          sells_1h?: number | null
          sells_5m?: number | null
          serious_count?: number | null
          serious_pct?: number | null
          serious_supply_pct?: number | null
          snapshot_at?: string
          stability_score?: number | null
          symbol?: string | null
          tier_divergence?: number | null
          token_age_minutes?: number | null
          token_mint: string
          top10_pct?: number | null
          top20_pct?: number | null
          top5_pct?: number | null
          total_holders?: number | null
          updated_at?: string
          validated_at?: string | null
          volume_1h?: number | null
          volume_24h?: number | null
          volume_mcap_ratio?: number | null
          whale_count?: number | null
          whale_pct?: number | null
          whale_supply_pct?: number | null
        }
        Update: {
          active_boosts?: number | null
          active_warnings?: Json | null
          ai_confidence?: number | null
          ai_prediction?: string | null
          ai_reasoning?: string | null
          ai_similar_tokens?: Json | null
          assessment_type?: string
          ath_usd?: number | null
          bundled_pct?: number | null
          buy_sell_ratio?: number | null
          buys_1h?: number | null
          buys_5m?: number | null
          cause_of_death?: string | null
          created_at?: string
          dev_holding_pct?: number | null
          dev_is_serial_spammer?: boolean | null
          dev_pattern?: string | null
          dev_reputation_score?: number | null
          dev_sold_all?: boolean | null
          dev_tokens_rugged?: number | null
          dev_total_launches?: number | null
          dev_trust_level?: string | null
          dev_wallet?: string | null
          dex_paid?: boolean | null
          dust_pct?: number | null
          dust_wallets?: number | null
          fresh_wallet_pct?: number | null
          has_telegram?: boolean | null
          has_twitter?: boolean | null
          has_website?: boolean | null
          health_grade?: string | null
          health_score?: number | null
          id?: string
          insider_cluster_count?: number | null
          liquidity_usd?: number | null
          lp_pct_of_supply?: number | null
          matched_pattern_rules?: Json | null
          mcap_usd?: number | null
          name?: string | null
          outcome?: string | null
          phase?: string | null
          prediction_validated?: boolean | null
          price_drop_from_ath_pct?: number | null
          price_usd?: number | null
          raw_report_data?: Json | null
          real_holders?: number | null
          retail_count?: number | null
          retail_pct?: number | null
          retail_supply_pct?: number | null
          risk_flags?: Json | null
          sells_1h?: number | null
          sells_5m?: number | null
          serious_count?: number | null
          serious_pct?: number | null
          serious_supply_pct?: number | null
          snapshot_at?: string
          stability_score?: number | null
          symbol?: string | null
          tier_divergence?: number | null
          token_age_minutes?: number | null
          token_mint?: string
          top10_pct?: number | null
          top20_pct?: number | null
          top5_pct?: number | null
          total_holders?: number | null
          updated_at?: string
          validated_at?: string | null
          volume_1h?: number | null
          volume_24h?: number | null
          volume_mcap_ratio?: number | null
          whale_count?: number | null
          whale_pct?: number | null
          whale_supply_pct?: number | null
        }
        Relationships: []
      }
      token_banners: {
        Row: {
          banner_url: string
          created_at: string
          id: string
          is_active: boolean
          link_url: string
          notes: string | null
          symbol: string | null
          token_address: string
          updated_at: string
          x_community_id: string | null
        }
        Insert: {
          banner_url: string
          created_at?: string
          id?: string
          is_active?: boolean
          link_url: string
          notes?: string | null
          symbol?: string | null
          token_address: string
          updated_at?: string
          x_community_id?: string | null
        }
        Update: {
          banner_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          link_url?: string
          notes?: string | null
          symbol?: string | null
          token_address?: string
          updated_at?: string
          x_community_id?: string | null
        }
        Relationships: []
      }
      token_boost_history: {
        Row: {
          boost_amount: number | null
          captured_at: string
          chain_id: string
          created_at: string
          delta_amount: number | null
          description: string | null
          header_url: string | null
          icon_url: string | null
          id: string
          links: Json | null
          raw: Json | null
          source: string
          token_mint: string
          total_amount: number | null
        }
        Insert: {
          boost_amount?: number | null
          captured_at?: string
          chain_id?: string
          created_at?: string
          delta_amount?: number | null
          description?: string | null
          header_url?: string | null
          icon_url?: string | null
          id?: string
          links?: Json | null
          raw?: Json | null
          source: string
          token_mint: string
          total_amount?: number | null
        }
        Update: {
          boost_amount?: number | null
          captured_at?: string
          chain_id?: string
          created_at?: string
          delta_amount?: number | null
          description?: string | null
          header_url?: string | null
          icon_url?: string | null
          id?: string
          links?: Json | null
          raw?: Json | null
          source?: string
          token_mint?: string
          total_amount?: number | null
        }
        Relationships: []
      }
      token_cto_status: {
        Row: {
          admin_override: boolean
          created_at: string
          detected_at: string
          id: string
          is_cto: boolean
          set_by: string | null
          signals: Json
          token_mint: string
          updated_at: string
        }
        Insert: {
          admin_override?: boolean
          created_at?: string
          detected_at?: string
          id?: string
          is_cto?: boolean
          set_by?: string | null
          signals?: Json
          token_mint: string
          updated_at?: string
        }
        Update: {
          admin_override?: boolean
          created_at?: string
          detected_at?: string
          id?: string
          is_cto?: boolean
          set_by?: string | null
          signals?: Json
          token_mint?: string
          updated_at?: string
        }
        Relationships: []
      }
      token_dex_status_history: {
        Row: {
          active_boosts: number | null
          boost_amount_total: number | null
          captured_at: string
          has_active_ads: boolean | null
          has_cto: boolean | null
          has_paid_profile: boolean | null
          id: string
          orders: Json | null
          token_mint: string
        }
        Insert: {
          active_boosts?: number | null
          boost_amount_total?: number | null
          captured_at?: string
          has_active_ads?: boolean | null
          has_cto?: boolean | null
          has_paid_profile?: boolean | null
          id?: string
          orders?: Json | null
          token_mint: string
        }
        Update: {
          active_boosts?: number | null
          boost_amount_total?: number | null
          captured_at?: string
          has_active_ads?: boolean | null
          has_cto?: boolean | null
          has_paid_profile?: boolean | null
          id?: string
          orders?: Json | null
          token_mint?: string
        }
        Relationships: []
      }
      token_early_trades: {
        Row: {
          created_at: string
          funding_source: string | null
          id: string
          is_creator: boolean | null
          is_linked_to_creator: boolean | null
          pct_supply_bought: number | null
          signature: string | null
          sol_amount: number | null
          timestamp: string
          token_amount: number | null
          token_mint: string
          trade_index: number
          trade_type: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          funding_source?: string | null
          id?: string
          is_creator?: boolean | null
          is_linked_to_creator?: boolean | null
          pct_supply_bought?: number | null
          signature?: string | null
          sol_amount?: number | null
          timestamp: string
          token_amount?: number | null
          token_mint: string
          trade_index: number
          trade_type: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          funding_source?: string | null
          id?: string
          is_creator?: boolean | null
          is_linked_to_creator?: boolean | null
          pct_supply_bought?: number | null
          signature?: string | null
          sol_amount?: number | null
          timestamp?: string
          token_amount?: number | null
          token_mint?: string
          trade_index?: number
          trade_type?: string
          wallet_address?: string
        }
        Relationships: []
      }
      token_early_warnings: {
        Row: {
          detected_at: string
          id: string
          last_seen_at: string
          metadata: Json | null
          metric_value: number | null
          plain_text: string
          scan_count: number
          severity: string
          source_function: string | null
          token_mint: string
          warning_type: string
        }
        Insert: {
          detected_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json | null
          metric_value?: number | null
          plain_text: string
          scan_count?: number
          severity?: string
          source_function?: string | null
          token_mint: string
          warning_type: string
        }
        Update: {
          detected_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json | null
          metric_value?: number | null
          plain_text?: string
          scan_count?: number
          severity?: string
          source_function?: string | null
          token_mint?: string
          warning_type?: string
        }
        Relationships: []
      }
      token_fingerprints: {
        Row: {
          cluster_id: string | null
          created_at: string
          description_hash: string | null
          id: string
          image_hash: string | null
          match_count: number | null
          metadata: Json | null
          name_hash: string | null
          token_mint: string
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string
          description_hash?: string | null
          id?: string
          image_hash?: string | null
          match_count?: number | null
          metadata?: Json | null
          name_hash?: string | null
          token_mint: string
        }
        Update: {
          cluster_id?: string | null
          created_at?: string
          description_hash?: string | null
          id?: string
          image_hash?: string | null
          match_count?: number | null
          metadata?: Json | null
          name_hash?: string | null
          token_mint?: string
        }
        Relationships: []
      }
      token_funnel_daily: {
        Row: {
          created_at: string | null
          funnel_date: string
          id: string
          metadata: Json | null
          stage: string
          token_count: number | null
        }
        Insert: {
          created_at?: string | null
          funnel_date?: string
          id?: string
          metadata?: Json | null
          stage: string
          token_count?: number | null
        }
        Update: {
          created_at?: string | null
          funnel_date?: string
          id?: string
          metadata?: Json | null
          stage?: string
          token_count?: number | null
        }
        Relationships: []
      }
      token_health_snapshots: {
        Row: {
          created_at: string | null
          dust_percentage: number | null
          health_grade: string | null
          health_score: number | null
          id: string
          real_holders: number | null
          risk_emoji: string | null
          risk_label: string | null
          risk_signal: string | null
          snapshot_hour: string
          source: string | null
          token_mint: string
          top10_pct: number | null
          total_holders: number | null
          whale_count: number | null
        }
        Insert: {
          created_at?: string | null
          dust_percentage?: number | null
          health_grade?: string | null
          health_score?: number | null
          id?: string
          real_holders?: number | null
          risk_emoji?: string | null
          risk_label?: string | null
          risk_signal?: string | null
          snapshot_hour: string
          source?: string | null
          token_mint: string
          top10_pct?: number | null
          total_holders?: number | null
          whale_count?: number | null
        }
        Update: {
          created_at?: string | null
          dust_percentage?: number | null
          health_grade?: string | null
          health_score?: number | null
          id?: string
          real_holders?: number | null
          risk_emoji?: string | null
          risk_label?: string | null
          risk_signal?: string | null
          snapshot_hour?: string
          source?: string | null
          token_mint?: string
          top10_pct?: number | null
          total_holders?: number | null
          whale_count?: number | null
        }
        Relationships: []
      }
      token_lifecycle: {
        Row: {
          active_boosts: number | null
          ath_24h_usd: number | null
          ath_alltime_captured_at: string | null
          ath_alltime_confidence: string | null
          ath_alltime_source: string | null
          ath_alltime_usd: number | null
          autopsy_at: string | null
          autopsy_notes: string | null
          community_checked_at: string | null
          community_discovery_result: string | null
          created_at: string | null
          creator_wallet: string | null
          current_status: string | null
          death_cause: string | null
          death_confidence: number | null
          description: string | null
          developer_id: string | null
          dex_id: string | null
          dex_socials_checked_at: string | null
          dex_socials_source: string | null
          discovery_source: string | null
          fdv: number | null
          first_24h_ath_captured_at: string | null
          first_24h_ath_source: string | null
          first_24h_ath_usd: number | null
          first_seen_at: string
          highest_rank: number | null
          image_url: string | null
          intent_classification: Database["public"]["Enums"]["token_intent_classification"]
          intent_classification_source: string | null
          intent_classified_at: string | null
          is_currently_top_200: boolean | null
          last_fetched_at: string | null
          last_seen_at: string
          last_top_200_rank: number | null
          launchpad: string | null
          liquidity_usd: number | null
          lowest_rank: number | null
          market_cap: number | null
          metadata: Json | null
          mint_socials_checked_at: string | null
          mint_socials_source: string | null
          name: string | null
          oracle_analyzed: boolean | null
          oracle_analyzed_at: string | null
          oracle_score: number | null
          pair_address: string | null
          pair_created_at: string | null
          price_usd: number | null
          socials_discovery_status: string
          symbol: string | null
          telegram_url: string | null
          times_entered_top_200: number | null
          token_mint: string
          total_hours_in_top_200: number | null
          twitter_url: string | null
          updated_at: string | null
          volume_24h: number | null
          website_url: string | null
        }
        Insert: {
          active_boosts?: number | null
          ath_24h_usd?: number | null
          ath_alltime_captured_at?: string | null
          ath_alltime_confidence?: string | null
          ath_alltime_source?: string | null
          ath_alltime_usd?: number | null
          autopsy_at?: string | null
          autopsy_notes?: string | null
          community_checked_at?: string | null
          community_discovery_result?: string | null
          created_at?: string | null
          creator_wallet?: string | null
          current_status?: string | null
          death_cause?: string | null
          death_confidence?: number | null
          description?: string | null
          developer_id?: string | null
          dex_id?: string | null
          dex_socials_checked_at?: string | null
          dex_socials_source?: string | null
          discovery_source?: string | null
          fdv?: number | null
          first_24h_ath_captured_at?: string | null
          first_24h_ath_source?: string | null
          first_24h_ath_usd?: number | null
          first_seen_at: string
          highest_rank?: number | null
          image_url?: string | null
          intent_classification?: Database["public"]["Enums"]["token_intent_classification"]
          intent_classification_source?: string | null
          intent_classified_at?: string | null
          is_currently_top_200?: boolean | null
          last_fetched_at?: string | null
          last_seen_at: string
          last_top_200_rank?: number | null
          launchpad?: string | null
          liquidity_usd?: number | null
          lowest_rank?: number | null
          market_cap?: number | null
          metadata?: Json | null
          mint_socials_checked_at?: string | null
          mint_socials_source?: string | null
          name?: string | null
          oracle_analyzed?: boolean | null
          oracle_analyzed_at?: string | null
          oracle_score?: number | null
          pair_address?: string | null
          pair_created_at?: string | null
          price_usd?: number | null
          socials_discovery_status?: string
          symbol?: string | null
          telegram_url?: string | null
          times_entered_top_200?: number | null
          token_mint: string
          total_hours_in_top_200?: number | null
          twitter_url?: string | null
          updated_at?: string | null
          volume_24h?: number | null
          website_url?: string | null
        }
        Update: {
          active_boosts?: number | null
          ath_24h_usd?: number | null
          ath_alltime_captured_at?: string | null
          ath_alltime_confidence?: string | null
          ath_alltime_source?: string | null
          ath_alltime_usd?: number | null
          autopsy_at?: string | null
          autopsy_notes?: string | null
          community_checked_at?: string | null
          community_discovery_result?: string | null
          created_at?: string | null
          creator_wallet?: string | null
          current_status?: string | null
          death_cause?: string | null
          death_confidence?: number | null
          description?: string | null
          developer_id?: string | null
          dex_id?: string | null
          dex_socials_checked_at?: string | null
          dex_socials_source?: string | null
          discovery_source?: string | null
          fdv?: number | null
          first_24h_ath_captured_at?: string | null
          first_24h_ath_source?: string | null
          first_24h_ath_usd?: number | null
          first_seen_at?: string
          highest_rank?: number | null
          image_url?: string | null
          intent_classification?: Database["public"]["Enums"]["token_intent_classification"]
          intent_classification_source?: string | null
          intent_classified_at?: string | null
          is_currently_top_200?: boolean | null
          last_fetched_at?: string | null
          last_seen_at?: string
          last_top_200_rank?: number | null
          launchpad?: string | null
          liquidity_usd?: number | null
          lowest_rank?: number | null
          market_cap?: number | null
          metadata?: Json | null
          mint_socials_checked_at?: string | null
          mint_socials_source?: string | null
          name?: string | null
          oracle_analyzed?: boolean | null
          oracle_analyzed_at?: string | null
          oracle_score?: number | null
          pair_address?: string | null
          pair_created_at?: string | null
          price_usd?: number | null
          socials_discovery_status?: string
          symbol?: string | null
          telegram_url?: string | null
          times_entered_top_200?: number | null
          token_mint?: string
          total_hours_in_top_200?: number | null
          twitter_url?: string | null
          updated_at?: string | null
          volume_24h?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "token_lifecycle_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "token_lifecycle_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_lifecycle_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      token_lifecycle_scorecard: {
        Row: {
          composite_score: number | null
          dev_wallet: string | null
          effort_score: number | null
          factor_scores: Json | null
          graduation_score: number | null
          integrity_score: number | null
          mint_bonding_score: number | null
          phase_scores: Json | null
          scored_at: string
          scoring_version: string
          skill_score: number | null
          social_score: number | null
          solscan_evidence_refs: Json | null
          sustain_score: number | null
          token_mint: string
          updated_at: string
          verdict: string | null
          verdict_confidence: number | null
          wallet_mesh_score: number | null
          worth_gate_passed: boolean
          worth_gate_reasons: Json | null
        }
        Insert: {
          composite_score?: number | null
          dev_wallet?: string | null
          effort_score?: number | null
          factor_scores?: Json | null
          graduation_score?: number | null
          integrity_score?: number | null
          mint_bonding_score?: number | null
          phase_scores?: Json | null
          scored_at?: string
          scoring_version?: string
          skill_score?: number | null
          social_score?: number | null
          solscan_evidence_refs?: Json | null
          sustain_score?: number | null
          token_mint: string
          updated_at?: string
          verdict?: string | null
          verdict_confidence?: number | null
          wallet_mesh_score?: number | null
          worth_gate_passed?: boolean
          worth_gate_reasons?: Json | null
        }
        Update: {
          composite_score?: number | null
          dev_wallet?: string | null
          effort_score?: number | null
          factor_scores?: Json | null
          graduation_score?: number | null
          integrity_score?: number | null
          mint_bonding_score?: number | null
          phase_scores?: Json | null
          scored_at?: string
          scoring_version?: string
          skill_score?: number | null
          social_score?: number | null
          solscan_evidence_refs?: Json | null
          sustain_score?: number | null
          token_mint?: string
          updated_at?: string
          verdict?: string | null
          verdict_confidence?: number | null
          wallet_mesh_score?: number | null
          worth_gate_passed?: boolean
          worth_gate_reasons?: Json | null
        }
        Relationships: []
      }
      token_lifecycle_tracking: {
        Row: {
          created_at: string
          decision_reason: string | null
          dev_action: string | null
          dev_action_detected_at: string | null
          dev_wallet: string | null
          final_price: number | null
          id: string
          lifespan_mins: number | null
          lowest_price_after_decision: number | null
          metadata: Json | null
          missed_gain_pct: number | null
          notes: string | null
          our_decision: string
          our_decision_at: string
          outcome_detected_at: string | null
          outcome_type: string | null
          peak_price_after_decision: number | null
          price_at_death: number | null
          price_at_decision: number | null
          price_at_peak: number | null
          social_accounts: Json | null
          time_to_death_mins: number | null
          time_to_outcome_mins: number | null
          time_to_spike_mins: number | null
          token_mint: string
          updated_at: string
          was_missed_opportunity: boolean | null
        }
        Insert: {
          created_at?: string
          decision_reason?: string | null
          dev_action?: string | null
          dev_action_detected_at?: string | null
          dev_wallet?: string | null
          final_price?: number | null
          id?: string
          lifespan_mins?: number | null
          lowest_price_after_decision?: number | null
          metadata?: Json | null
          missed_gain_pct?: number | null
          notes?: string | null
          our_decision: string
          our_decision_at?: string
          outcome_detected_at?: string | null
          outcome_type?: string | null
          peak_price_after_decision?: number | null
          price_at_death?: number | null
          price_at_decision?: number | null
          price_at_peak?: number | null
          social_accounts?: Json | null
          time_to_death_mins?: number | null
          time_to_outcome_mins?: number | null
          time_to_spike_mins?: number | null
          token_mint: string
          updated_at?: string
          was_missed_opportunity?: boolean | null
        }
        Update: {
          created_at?: string
          decision_reason?: string | null
          dev_action?: string | null
          dev_action_detected_at?: string | null
          dev_wallet?: string | null
          final_price?: number | null
          id?: string
          lifespan_mins?: number | null
          lowest_price_after_decision?: number | null
          metadata?: Json | null
          missed_gain_pct?: number | null
          notes?: string | null
          our_decision?: string
          our_decision_at?: string
          outcome_detected_at?: string | null
          outcome_type?: string | null
          peak_price_after_decision?: number | null
          price_at_death?: number | null
          price_at_decision?: number | null
          price_at_peak?: number | null
          social_accounts?: Json | null
          time_to_death_mins?: number | null
          time_to_outcome_mins?: number | null
          time_to_spike_mins?: number | null
          token_mint?: string
          updated_at?: string
          was_missed_opportunity?: boolean | null
        }
        Relationships: []
      }
      token_metadata: {
        Row: {
          created_at: string | null
          decimals: number | null
          description: string | null
          freeze_authority: string | null
          id: string
          logo_uri: string | null
          mint_address: string
          mint_authority: string | null
          name: string | null
          symbol: string | null
          total_supply: number | null
          updated_at: string | null
          verified: boolean | null
        }
        Insert: {
          created_at?: string | null
          decimals?: number | null
          description?: string | null
          freeze_authority?: string | null
          id?: string
          logo_uri?: string | null
          mint_address: string
          mint_authority?: string | null
          name?: string | null
          symbol?: string | null
          total_supply?: number | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Update: {
          created_at?: string | null
          decimals?: number | null
          description?: string | null
          freeze_authority?: string | null
          id?: string
          logo_uri?: string | null
          mint_address?: string
          mint_authority?: string | null
          name?: string | null
          symbol?: string | null
          total_supply?: number | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      token_mint_watchdog: {
        Row: {
          alert_level: string
          alert_sent: boolean | null
          alert_sent_at: string | null
          analyzed_at: string | null
          block_slot: number | null
          bundle_analysis: Json | null
          bundle_score: number | null
          created_at: string | null
          creator_wallet: string
          deep_analysis_at: string | null
          deep_analysis_completed: boolean | null
          detected_at: string | null
          developer_id: string | null
          discovery_triggered: boolean | null
          first_buyers: Json | null
          id: string
          is_bundled: boolean | null
          match_confidence: string | null
          metadata: Json | null
          quick_analysis: Json | null
          reasoning: string | null
          recommendation: string | null
          token_mint: string
        }
        Insert: {
          alert_level?: string
          alert_sent?: boolean | null
          alert_sent_at?: string | null
          analyzed_at?: string | null
          block_slot?: number | null
          bundle_analysis?: Json | null
          bundle_score?: number | null
          created_at?: string | null
          creator_wallet: string
          deep_analysis_at?: string | null
          deep_analysis_completed?: boolean | null
          detected_at?: string | null
          developer_id?: string | null
          discovery_triggered?: boolean | null
          first_buyers?: Json | null
          id?: string
          is_bundled?: boolean | null
          match_confidence?: string | null
          metadata?: Json | null
          quick_analysis?: Json | null
          reasoning?: string | null
          recommendation?: string | null
          token_mint: string
        }
        Update: {
          alert_level?: string
          alert_sent?: boolean | null
          alert_sent_at?: string | null
          analyzed_at?: string | null
          block_slot?: number | null
          bundle_analysis?: Json | null
          bundle_score?: number | null
          created_at?: string | null
          creator_wallet?: string
          deep_analysis_at?: string | null
          deep_analysis_completed?: boolean | null
          detected_at?: string | null
          developer_id?: string | null
          discovery_triggered?: boolean | null
          first_buyers?: Json | null
          id?: string
          is_bundled?: boolean | null
          match_confidence?: string | null
          metadata?: Json | null
          quick_analysis?: Json | null
          reasoning?: string | null
          recommendation?: string | null
          token_mint?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_mint_watchdog_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "token_mint_watchdog_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_mint_watchdog_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      token_narrative_links: {
        Row: {
          added_by: string | null
          created_at: string
          editor_note: string | null
          id: string
          is_active: boolean
          source_domain: string | null
          title: string | null
          token_mint: string
          updated_at: string
          url: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          editor_note?: string | null
          id?: string
          is_active?: boolean
          source_domain?: string | null
          title?: string | null
          token_mint: string
          updated_at?: string
          url: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          editor_note?: string | null
          id?: string
          is_active?: boolean
          source_domain?: string | null
          title?: string | null
          token_mint?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      token_optimistic_summary_cache: {
        Row: {
          expires_at: string
          generated_at: string
          id: string
          summary: Json
          token_mint: string
        }
        Insert: {
          expires_at?: string
          generated_at?: string
          id?: string
          summary: Json
          token_mint: string
        }
        Update: {
          expires_at?: string
          generated_at?: string
          id?: string
          summary?: Json
          token_mint?: string
        }
        Relationships: []
      }
      token_paid_orders: {
        Row: {
          amount: number | null
          captured_at: string
          chain_id: string
          id: string
          order_type: string
          payment_timestamp: string | null
          raw: Json | null
          status: string | null
          token_mint: string
        }
        Insert: {
          amount?: number | null
          captured_at?: string
          chain_id?: string
          id?: string
          order_type: string
          payment_timestamp?: string | null
          raw?: Json | null
          status?: string | null
          token_mint: string
        }
        Update: {
          amount?: number | null
          captured_at?: string
          chain_id?: string
          id?: string
          order_type?: string
          payment_timestamp?: string | null
          raw?: Json | null
          status?: string | null
          token_mint?: string
        }
        Relationships: []
      }
      token_pattern_rules: {
        Row: {
          conditions: Json
          confidence_pct: number
          created_at: string
          description: string
          example_tokens: Json | null
          extracted_by: string | null
          id: string
          is_active: boolean
          last_validated_at: string | null
          outcome_association: string
          pattern_type: string
          rule_id: string
          sample_size: number
          updated_at: string
        }
        Insert: {
          conditions?: Json
          confidence_pct?: number
          created_at?: string
          description: string
          example_tokens?: Json | null
          extracted_by?: string | null
          id?: string
          is_active?: boolean
          last_validated_at?: string | null
          outcome_association: string
          pattern_type: string
          rule_id: string
          sample_size?: number
          updated_at?: string
        }
        Update: {
          conditions?: Json
          confidence_pct?: number
          created_at?: string
          description?: string
          example_tokens?: Json | null
          extracted_by?: string | null
          id?: string
          is_active?: boolean
          last_validated_at?: string | null
          outcome_association?: string
          pattern_type?: string
          rule_id?: string
          sample_size?: number
          updated_at?: string
        }
        Relationships: []
      }
      token_price_history: {
        Row: {
          captured_at: string
          id: string
          market_cap_usd: number | null
          price_usd: number | null
          source: string | null
          token_mint: string
        }
        Insert: {
          captured_at?: string
          id?: string
          market_cap_usd?: number | null
          price_usd?: number | null
          source?: string | null
          token_mint: string
        }
        Update: {
          captured_at?: string
          id?: string
          market_cap_usd?: number | null
          price_usd?: number | null
          source?: string | null
          token_mint?: string
        }
        Relationships: []
      }
      token_projects: {
        Row: {
          community_admins: string[] | null
          community_mods: string[] | null
          created_at: string | null
          creator_wallet: string | null
          discord_url: string | null
          first_seen_at: string | null
          id: string
          launch_date: string | null
          launchpad_account_id: string | null
          launchpad_platform: string | null
          notes: string | null
          parent_kyc_wallet: string | null
          primary_twitter_url: string | null
          risk_level: string | null
          source: string | null
          tags: string[] | null
          telegram_url: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          trust_rating: string | null
          twitter_type: string | null
          updated_at: string | null
          upstream_wallets: string[] | null
          website_url: string | null
          x_community_id: string | null
        }
        Insert: {
          community_admins?: string[] | null
          community_mods?: string[] | null
          created_at?: string | null
          creator_wallet?: string | null
          discord_url?: string | null
          first_seen_at?: string | null
          id?: string
          launch_date?: string | null
          launchpad_account_id?: string | null
          launchpad_platform?: string | null
          notes?: string | null
          parent_kyc_wallet?: string | null
          primary_twitter_url?: string | null
          risk_level?: string | null
          source?: string | null
          tags?: string[] | null
          telegram_url?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          trust_rating?: string | null
          twitter_type?: string | null
          updated_at?: string | null
          upstream_wallets?: string[] | null
          website_url?: string | null
          x_community_id?: string | null
        }
        Update: {
          community_admins?: string[] | null
          community_mods?: string[] | null
          created_at?: string | null
          creator_wallet?: string | null
          discord_url?: string | null
          first_seen_at?: string | null
          id?: string
          launch_date?: string | null
          launchpad_account_id?: string | null
          launchpad_platform?: string | null
          notes?: string | null
          parent_kyc_wallet?: string | null
          primary_twitter_url?: string | null
          risk_level?: string | null
          source?: string | null
          tags?: string[] | null
          telegram_url?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          trust_rating?: string | null
          twitter_type?: string | null
          updated_at?: string | null
          upstream_wallets?: string[] | null
          website_url?: string | null
          x_community_id?: string | null
        }
        Relationships: []
      }
      token_rankings: {
        Row: {
          captured_at: string
          data_source: string | null
          holder_count: number | null
          id: string
          is_in_top_200: boolean | null
          liquidity_usd: number | null
          market_cap: number | null
          metadata: Json | null
          price_change_24h: number | null
          price_usd: number | null
          rank: number
          token_mint: string
          trending_score: number | null
          volume_24h: number | null
        }
        Insert: {
          captured_at?: string
          data_source?: string | null
          holder_count?: number | null
          id?: string
          is_in_top_200?: boolean | null
          liquidity_usd?: number | null
          market_cap?: number | null
          metadata?: Json | null
          price_change_24h?: number | null
          price_usd?: number | null
          rank: number
          token_mint: string
          trending_score?: number | null
          volume_24h?: number | null
        }
        Update: {
          captured_at?: string
          data_source?: string | null
          holder_count?: number | null
          id?: string
          is_in_top_200?: boolean | null
          liquidity_usd?: number | null
          market_cap?: number | null
          metadata?: Json | null
          price_change_24h?: number | null
          price_usd?: number | null
          rank?: number
          token_mint?: string
          trending_score?: number | null
          volume_24h?: number | null
        }
        Relationships: []
      }
      token_search_log: {
        Row: {
          created_at: string
          error_message: string | null
          holder_count: number | null
          id: string
          ip_address: string | null
          response_time_ms: number | null
          session_id: string | null
          success: boolean | null
          token_mint: string
          user_agent: string | null
          visitor_fingerprint: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          holder_count?: number | null
          id?: string
          ip_address?: string | null
          response_time_ms?: number | null
          session_id?: string | null
          success?: boolean | null
          token_mint: string
          user_agent?: string | null
          visitor_fingerprint?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          holder_count?: number | null
          id?: string
          ip_address?: string | null
          response_time_ms?: number | null
          session_id?: string | null
          success?: boolean | null
          token_mint?: string
          user_agent?: string | null
          visitor_fingerprint?: string | null
        }
        Relationships: []
      }
      token_search_results: {
        Row: {
          bundled_percentage: number | null
          circulating_supply: number | null
          created_at: string
          creator_wallet: string | null
          health_grade: string | null
          health_score: number | null
          id: string
          launchpad: string | null
          lp_count: number | null
          lp_percentage: number | null
          market_cap_usd: number | null
          name: string | null
          price_source: string | null
          price_usd: number | null
          risk_flags: Json | null
          search_id: string | null
          symbol: string | null
          tier_dust: number | null
          tier_retail: number | null
          tier_serious: number | null
          tier_whale: number | null
          token_mint: string
          top10_concentration: number | null
          top20_concentration: number | null
          top5_concentration: number | null
          total_supply: number | null
        }
        Insert: {
          bundled_percentage?: number | null
          circulating_supply?: number | null
          created_at?: string
          creator_wallet?: string | null
          health_grade?: string | null
          health_score?: number | null
          id?: string
          launchpad?: string | null
          lp_count?: number | null
          lp_percentage?: number | null
          market_cap_usd?: number | null
          name?: string | null
          price_source?: string | null
          price_usd?: number | null
          risk_flags?: Json | null
          search_id?: string | null
          symbol?: string | null
          tier_dust?: number | null
          tier_retail?: number | null
          tier_serious?: number | null
          tier_whale?: number | null
          token_mint: string
          top10_concentration?: number | null
          top20_concentration?: number | null
          top5_concentration?: number | null
          total_supply?: number | null
        }
        Update: {
          bundled_percentage?: number | null
          circulating_supply?: number | null
          created_at?: string
          creator_wallet?: string | null
          health_grade?: string | null
          health_score?: number | null
          id?: string
          launchpad?: string | null
          lp_count?: number | null
          lp_percentage?: number | null
          market_cap_usd?: number | null
          name?: string | null
          price_source?: string | null
          price_usd?: number | null
          risk_flags?: Json | null
          search_id?: string | null
          symbol?: string | null
          tier_dust?: number | null
          tier_retail?: number | null
          tier_serious?: number | null
          tier_whale?: number | null
          token_mint?: string
          top10_concentration?: number | null
          top20_concentration?: number | null
          top5_concentration?: number | null
          total_supply?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "token_search_results_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "token_search_log"
            referencedColumns: ["id"]
          },
        ]
      }
      token_social_links: {
        Row: {
          community_id: string | null
          community_spidered: boolean | null
          discovered_at: string | null
          extracted_handle: string | null
          id: string
          is_community: boolean | null
          is_current: boolean | null
          link_type: string
          phase: string | null
          platform: string | null
          source: string
          superseded_at: string | null
          token_mint: string
          url: string
        }
        Insert: {
          community_id?: string | null
          community_spidered?: boolean | null
          discovered_at?: string | null
          extracted_handle?: string | null
          id?: string
          is_community?: boolean | null
          is_current?: boolean | null
          link_type?: string
          phase?: string | null
          platform?: string | null
          source: string
          superseded_at?: string | null
          token_mint: string
          url: string
        }
        Update: {
          community_id?: string | null
          community_spidered?: boolean | null
          discovered_at?: string | null
          extracted_handle?: string | null
          id?: string
          is_community?: boolean | null
          is_current?: boolean | null
          link_type?: string
          phase?: string | null
          platform?: string | null
          source?: string
          superseded_at?: string | null
          token_mint?: string
          url?: string
        }
        Relationships: []
      }
      token_socials_history: {
        Row: {
          captured_at: string
          discord: string | null
          id: string
          phase: string | null
          source: string | null
          telegram: string | null
          token_mint: string
          twitter: string | null
          website: string | null
        }
        Insert: {
          captured_at?: string
          discord?: string | null
          id?: string
          phase?: string | null
          source?: string | null
          telegram?: string | null
          token_mint: string
          twitter?: string | null
          website?: string | null
        }
        Update: {
          captured_at?: string
          discord?: string | null
          id?: string
          phase?: string | null
          source?: string | null
          telegram?: string | null
          token_mint?: string
          twitter?: string | null
          website?: string | null
        }
        Relationships: []
      }
      token_vigil: {
        Row: {
          created_at: string
          current_dust_pct: number | null
          current_holders: number | null
          current_mcap_usd: number | null
          current_price_usd: number | null
          current_volume_1h: number | null
          death_detected_at: string | null
          first_seen_at: string
          holder_drop_from_peak_pct: number | null
          id: string
          last_scanned_at: string | null
          mid_growth_id: string | null
          name: string | null
          peak_holders: number | null
          peak_mcap_usd: number | null
          peak_price_usd: number | null
          peak_volume_1h: number | null
          post_mortem_id: string | null
          price_drop_from_peak_pct: number | null
          scan_count: number | null
          status: string
          symbol: string | null
          token_mint: string
          updated_at: string
          volume_drop_from_peak_pct: number | null
        }
        Insert: {
          created_at?: string
          current_dust_pct?: number | null
          current_holders?: number | null
          current_mcap_usd?: number | null
          current_price_usd?: number | null
          current_volume_1h?: number | null
          death_detected_at?: string | null
          first_seen_at?: string
          holder_drop_from_peak_pct?: number | null
          id?: string
          last_scanned_at?: string | null
          mid_growth_id?: string | null
          name?: string | null
          peak_holders?: number | null
          peak_mcap_usd?: number | null
          peak_price_usd?: number | null
          peak_volume_1h?: number | null
          post_mortem_id?: string | null
          price_drop_from_peak_pct?: number | null
          scan_count?: number | null
          status?: string
          symbol?: string | null
          token_mint: string
          updated_at?: string
          volume_drop_from_peak_pct?: number | null
        }
        Update: {
          created_at?: string
          current_dust_pct?: number | null
          current_holders?: number | null
          current_mcap_usd?: number | null
          current_price_usd?: number | null
          current_volume_1h?: number | null
          death_detected_at?: string | null
          first_seen_at?: string
          holder_drop_from_peak_pct?: number | null
          id?: string
          last_scanned_at?: string | null
          mid_growth_id?: string | null
          name?: string | null
          peak_holders?: number | null
          peak_mcap_usd?: number | null
          peak_price_usd?: number | null
          peak_volume_1h?: number | null
          post_mortem_id?: string | null
          price_drop_from_peak_pct?: number | null
          scan_count?: number | null
          status?: string
          symbol?: string | null
          token_mint?: string
          updated_at?: string
          volume_drop_from_peak_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "token_vigil_mid_growth_id_fkey"
            columns: ["mid_growth_id"]
            isOneToOne: false
            referencedRelation: "token_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_vigil_post_mortem_id_fkey"
            columns: ["post_mortem_id"]
            isOneToOne: false
            referencedRelation: "token_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      token_watchlist: {
        Row: {
          current_price: number | null
          id: string
          is_monitored: boolean | null
          last_price_check: string | null
          metadata: Json | null
          name: string | null
          session_id: string | null
          symbol: string | null
          token_mint: string
          volatility_score: number | null
        }
        Insert: {
          current_price?: number | null
          id?: string
          is_monitored?: boolean | null
          last_price_check?: string | null
          metadata?: Json | null
          name?: string | null
          session_id?: string | null
          symbol?: string | null
          token_mint: string
          volatility_score?: number | null
        }
        Update: {
          current_price?: number | null
          id?: string
          is_monitored?: boolean | null
          last_price_check?: string | null
          metadata?: Json | null
          name?: string | null
          session_id?: string | null
          symbol?: string | null
          token_mint?: string
          volatility_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "token_watchlist_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trading_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      token_website_sources: {
        Row: {
          first_seen_at: string
          host: string | null
          id: string
          source: string
          token_mint: string
          url: string
        }
        Insert: {
          first_seen_at?: string
          host?: string | null
          id?: string
          source: string
          token_mint: string
          url: string
        }
        Update: {
          first_seen_at?: string
          host?: string | null
          id?: string
          source?: string
          token_mint?: string
          url?: string
        }
        Relationships: []
      }
      trade_history: {
        Row: {
          error_message: string | null
          executed_at: string | null
          id: string
          owner_pubkey: string
          position_id: string | null
          price_usd: number
          quantity_ui: number
          session_id: string | null
          signatures: string[] | null
          status: string | null
          token_mint: string
          trade_type: string
          usd_amount: number
        }
        Insert: {
          error_message?: string | null
          executed_at?: string | null
          id?: string
          owner_pubkey: string
          position_id?: string | null
          price_usd: number
          quantity_ui: number
          session_id?: string | null
          signatures?: string[] | null
          status?: string | null
          token_mint: string
          trade_type: string
          usd_amount: number
        }
        Update: {
          error_message?: string | null
          executed_at?: string | null
          id?: string
          owner_pubkey?: string
          position_id?: string | null
          price_usd?: number
          quantity_ui?: number
          session_id?: string | null
          signatures?: string[] | null
          status?: string | null
          token_mint?: string
          trade_type?: string
          usd_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "trade_history_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "trading_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trading_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_keywords: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          keyword: string
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          keyword: string
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          keyword?: string
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      trading_positions: {
        Row: {
          created_at: string | null
          entry_price: number
          entry_timestamp: string
          high_price: number
          id: string
          lot_id: string
          owner_pubkey: string
          owner_secret_encrypted: string
          quantity_raw: number
          quantity_ui: number
          session_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entry_price: number
          entry_timestamp: string
          high_price: number
          id?: string
          lot_id: string
          owner_pubkey: string
          owner_secret_encrypted: string
          quantity_raw: number
          quantity_ui: number
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entry_price?: number
          entry_timestamp?: string
          high_price?: number
          id?: string
          lot_id?: string
          owner_pubkey?: string
          owner_secret_encrypted?: string
          quantity_raw?: number
          quantity_ui?: number
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trading_positions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trading_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_rules: {
        Row: {
          bonding_curve_position: string | null
          buy_amount_usd: number
          channel_id: string | null
          created_at: string | null
          description: string | null
          excluded_keywords: string[] | null
          fallback_to_fantasy: boolean | null
          id: string
          is_active: boolean | null
          max_age_minutes: number | null
          max_bonding_pct: number | null
          max_market_cap_usd: number | null
          max_price_usd: number | null
          min_age_minutes: number | null
          min_bonding_pct: number | null
          min_keyword_weight: number | null
          min_market_cap_usd: number | null
          min_price_usd: number | null
          name: string
          platforms: string[] | null
          price_change_5m_max: number | null
          price_change_5m_min: number | null
          priority: number | null
          require_graduated: boolean | null
          require_on_curve: boolean | null
          required_keywords: string[] | null
          sell_target_multiplier: number | null
          stop_loss_enabled: boolean | null
          stop_loss_pct: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          bonding_curve_position?: string | null
          buy_amount_usd?: number
          channel_id?: string | null
          created_at?: string | null
          description?: string | null
          excluded_keywords?: string[] | null
          fallback_to_fantasy?: boolean | null
          id?: string
          is_active?: boolean | null
          max_age_minutes?: number | null
          max_bonding_pct?: number | null
          max_market_cap_usd?: number | null
          max_price_usd?: number | null
          min_age_minutes?: number | null
          min_bonding_pct?: number | null
          min_keyword_weight?: number | null
          min_market_cap_usd?: number | null
          min_price_usd?: number | null
          name: string
          platforms?: string[] | null
          price_change_5m_max?: number | null
          price_change_5m_min?: number | null
          priority?: number | null
          require_graduated?: boolean | null
          require_on_curve?: boolean | null
          required_keywords?: string[] | null
          sell_target_multiplier?: number | null
          stop_loss_enabled?: boolean | null
          stop_loss_pct?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          bonding_curve_position?: string | null
          buy_amount_usd?: number
          channel_id?: string | null
          created_at?: string | null
          description?: string | null
          excluded_keywords?: string[] | null
          fallback_to_fantasy?: boolean | null
          id?: string
          is_active?: boolean | null
          max_age_minutes?: number | null
          max_bonding_pct?: number | null
          max_market_cap_usd?: number | null
          max_price_usd?: number | null
          min_age_minutes?: number | null
          min_bonding_pct?: number | null
          min_keyword_weight?: number | null
          min_market_cap_usd?: number | null
          min_price_usd?: number | null
          name?: string
          platforms?: string[] | null
          price_change_5m_max?: number | null
          price_change_5m_min?: number | null
          priority?: number | null
          require_graduated?: boolean | null
          require_on_curve?: boolean | null
          required_keywords?: string[] | null
          sell_target_multiplier?: number | null
          stop_loss_enabled?: boolean | null
          stop_loss_pct?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trading_rules_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channel_config"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_sessions: {
        Row: {
          config: Json
          created_at: string | null
          daily_buy_usd: number | null
          daily_key: string | null
          id: string
          is_active: boolean
          last_activity: string | null
          session_start_time: string | null
          start_mode: string | null
          token_mint: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          config: Json
          created_at?: string | null
          daily_buy_usd?: number | null
          daily_key?: string | null
          id?: string
          is_active?: boolean
          last_activity?: string | null
          session_start_time?: string | null
          start_mode?: string | null
          token_mint: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          daily_buy_usd?: number | null
          daily_key?: string | null
          id?: string
          is_active?: boolean
          last_activity?: string | null
          session_start_time?: string | null
          start_mode?: string | null
          token_mint?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      trusted_devices: {
        Row: {
          created_at: string
          device_fingerprint: string
          device_name: string | null
          id: string
          is_active: boolean
          last_used: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_used?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_used?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      twitter_accounts: {
        Row: {
          access_token_encrypted: string | null
          access_token_secret_encrypted: string | null
          account_status: string | null
          api_key_encrypted: string | null
          api_secret_encrypted: string | null
          bags_fm_url: string | null
          bags_fm_wallet: string | null
          banner_image_url: string | null
          bio: string | null
          bio_urls: Json | null
          can_dm: boolean | null
          can_media_tag: boolean | null
          created_at: string | null
          display_name: string | null
          email: string | null
          email_password_encrypted: string | null
          fast_followers_count: number | null
          follower_count: number | null
          following_count: number | null
          group_name: string | null
          has_custom_timelines: boolean | null
          id: string
          is_protected: boolean | null
          is_translator: boolean | null
          is_verified: boolean | null
          join_date: string | null
          last_enriched_at: string | null
          likes_count: number | null
          listed_count: number | null
          location: string | null
          media_count: number | null
          notes: string | null
          password_encrypted: string | null
          position: number | null
          professional_category: string[] | null
          professional_type: string | null
          profile_image_url: string | null
          profile_urls: Json | null
          pump_fun_url: string | null
          pump_fun_wallet: string | null
          tags: string[] | null
          tweet_count: number | null
          twitter_id: string | null
          updated_at: string | null
          user_id: string | null
          username: string
          verification_type: string | null
          verified_type: string | null
          website: string | null
          withheld_countries: string[] | null
        }
        Insert: {
          access_token_encrypted?: string | null
          access_token_secret_encrypted?: string | null
          account_status?: string | null
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          bags_fm_url?: string | null
          bags_fm_wallet?: string | null
          banner_image_url?: string | null
          bio?: string | null
          bio_urls?: Json | null
          can_dm?: boolean | null
          can_media_tag?: boolean | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          email_password_encrypted?: string | null
          fast_followers_count?: number | null
          follower_count?: number | null
          following_count?: number | null
          group_name?: string | null
          has_custom_timelines?: boolean | null
          id?: string
          is_protected?: boolean | null
          is_translator?: boolean | null
          is_verified?: boolean | null
          join_date?: string | null
          last_enriched_at?: string | null
          likes_count?: number | null
          listed_count?: number | null
          location?: string | null
          media_count?: number | null
          notes?: string | null
          password_encrypted?: string | null
          position?: number | null
          professional_category?: string[] | null
          professional_type?: string | null
          profile_image_url?: string | null
          profile_urls?: Json | null
          pump_fun_url?: string | null
          pump_fun_wallet?: string | null
          tags?: string[] | null
          tweet_count?: number | null
          twitter_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          username: string
          verification_type?: string | null
          verified_type?: string | null
          website?: string | null
          withheld_countries?: string[] | null
        }
        Update: {
          access_token_encrypted?: string | null
          access_token_secret_encrypted?: string | null
          account_status?: string | null
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          bags_fm_url?: string | null
          bags_fm_wallet?: string | null
          banner_image_url?: string | null
          bio?: string | null
          bio_urls?: Json | null
          can_dm?: boolean | null
          can_media_tag?: boolean | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          email_password_encrypted?: string | null
          fast_followers_count?: number | null
          follower_count?: number | null
          following_count?: number | null
          group_name?: string | null
          has_custom_timelines?: boolean | null
          id?: string
          is_protected?: boolean | null
          is_translator?: boolean | null
          is_verified?: boolean | null
          join_date?: string | null
          last_enriched_at?: string | null
          likes_count?: number | null
          listed_count?: number | null
          location?: string | null
          media_count?: number | null
          notes?: string | null
          password_encrypted?: string | null
          position?: number | null
          professional_category?: string[] | null
          professional_type?: string | null
          profile_image_url?: string | null
          profile_urls?: Json | null
          pump_fun_url?: string | null
          pump_fun_wallet?: string | null
          tags?: string[] | null
          tweet_count?: number | null
          twitter_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string
          verification_type?: string | null
          verified_type?: string | null
          website?: string | null
          withheld_countries?: string[] | null
        }
        Relationships: []
      }
      twitter_scanner_state: {
        Row: {
          created_at: string
          id: string
          last_scanned_at: string | null
          scan_count: number
          source: string
          symbol: string
          token_mint: string
          updated_at: string
          virality_score: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_scanned_at?: string | null
          scan_count?: number
          source?: string
          symbol: string
          token_mint: string
          updated_at?: string
          virality_score?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_scanned_at?: string | null
          scan_count?: number
          source?: string
          symbol?: string
          token_mint?: string
          updated_at?: string
          virality_score?: number
        }
        Relationships: []
      }
      twitter_tg_targets: {
        Row: {
          account_status: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          followers: number | null
          handle: string
          id: string
          is_active: boolean | null
          is_archived: boolean
          last_scanned_at: string | null
          last_tweet_scan_at: string | null
          notes: string | null
          priority_score: number | null
          scan_count: number | null
          tags: string[] | null
          telegram_links: Json | null
          tg_group_chat_id: string | null
          tg_group_joined: boolean | null
          token_mentions_found: number | null
          tweet_scan_count: number | null
          updated_at: string | null
        }
        Insert: {
          account_status?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          followers?: number | null
          handle: string
          id?: string
          is_active?: boolean | null
          is_archived?: boolean
          last_scanned_at?: string | null
          last_tweet_scan_at?: string | null
          notes?: string | null
          priority_score?: number | null
          scan_count?: number | null
          tags?: string[] | null
          telegram_links?: Json | null
          tg_group_chat_id?: string | null
          tg_group_joined?: boolean | null
          token_mentions_found?: number | null
          tweet_scan_count?: number | null
          updated_at?: string | null
        }
        Update: {
          account_status?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          followers?: number | null
          handle?: string
          id?: string
          is_active?: boolean | null
          is_archived?: boolean
          last_scanned_at?: string | null
          last_tweet_scan_at?: string | null
          notes?: string | null
          priority_score?: number | null
          scan_count?: number | null
          tags?: string[] | null
          telegram_links?: Json | null
          tg_group_chat_id?: string | null
          tg_group_joined?: boolean | null
          token_mentions_found?: number | null
          tweet_scan_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      twitter_token_mentions: {
        Row: {
          author_followers: number | null
          author_id: string | null
          author_username: string | null
          created_at: string | null
          detected_contracts: string[] | null
          detected_tickers: string[] | null
          duplicate_of: string | null
          engagement_score: number | null
          id: string
          impression_count: number | null
          is_best_source: boolean | null
          is_verified: boolean | null
          likes_count: number | null
          posted_at: string | null
          quality_score: number | null
          queue_id: string | null
          queued_for_analysis: boolean | null
          replies_count: number | null
          retweets_count: number | null
          scanned_at: string | null
          tweet_id: string
          tweet_text: string
          tweet_url: string | null
          verified_type: string | null
        }
        Insert: {
          author_followers?: number | null
          author_id?: string | null
          author_username?: string | null
          created_at?: string | null
          detected_contracts?: string[] | null
          detected_tickers?: string[] | null
          duplicate_of?: string | null
          engagement_score?: number | null
          id?: string
          impression_count?: number | null
          is_best_source?: boolean | null
          is_verified?: boolean | null
          likes_count?: number | null
          posted_at?: string | null
          quality_score?: number | null
          queue_id?: string | null
          queued_for_analysis?: boolean | null
          replies_count?: number | null
          retweets_count?: number | null
          scanned_at?: string | null
          tweet_id: string
          tweet_text: string
          tweet_url?: string | null
          verified_type?: string | null
        }
        Update: {
          author_followers?: number | null
          author_id?: string | null
          author_username?: string | null
          created_at?: string | null
          detected_contracts?: string[] | null
          detected_tickers?: string[] | null
          duplicate_of?: string | null
          engagement_score?: number | null
          id?: string
          impression_count?: number | null
          is_best_source?: boolean | null
          is_verified?: boolean | null
          likes_count?: number | null
          posted_at?: string | null
          quality_score?: number | null
          queue_id?: string | null
          queued_for_analysis?: boolean | null
          replies_count?: number | null
          retweets_count?: number | null
          scanned_at?: string | null
          tweet_id?: string
          tweet_text?: string
          tweet_url?: string | null
          verified_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "twitter_token_mentions_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "holders_intel_post_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_chat_history: {
        Row: {
          account_user_id: string | null
          content: string
          cost_estimate_usd: number | null
          created_at: string
          id: string
          metadata: Json | null
          model_used: string | null
          platform: string
          response_time_ms: number | null
          role: string
          source_message_id: string | null
          telegram_user_id: string | null
          token_count: number | null
          web_session_id: string | null
        }
        Insert: {
          account_user_id?: string | null
          content: string
          cost_estimate_usd?: number | null
          created_at?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          platform: string
          response_time_ms?: number | null
          role?: string
          source_message_id?: string | null
          telegram_user_id?: string | null
          token_count?: number | null
          web_session_id?: string | null
        }
        Update: {
          account_user_id?: string | null
          content?: string
          cost_estimate_usd?: number | null
          created_at?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          platform?: string
          response_time_ms?: number | null
          role?: string
          source_message_id?: string | null
          telegram_user_id?: string | null
          token_count?: number | null
          web_session_id?: string | null
        }
        Relationships: []
      }
      user_2fa_secrets: {
        Row: {
          created_at: string
          two_factor_secret: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          two_factor_secret?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          two_factor_secret?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_journey_events: {
        Row: {
          created_at: string
          duration_seconds: number | null
          event_name: string
          event_type: string
          id: string
          metadata: Json | null
          page_path: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          event_name: string
          event_type?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          event_name?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          alert_types: Json | null
          created_at: string | null
          email_alerts_enabled: boolean | null
          id: string
          last_survey_shown_at: string | null
          survey_frequency_days: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_types?: Json | null
          created_at?: string | null
          email_alerts_enabled?: boolean | null
          id?: string
          last_survey_shown_at?: string | null
          survey_frequency_days?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_types?: Json | null
          created_at?: string | null
          email_alerts_enabled?: boolean | null
          id?: string
          last_survey_shown_at?: string | null
          survey_frequency_days?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_ranks: {
        Row: {
          icon_emoji: string
          is_awardable_only: boolean
          label: string
          min_karma: number
          slug: string
          sort_order: number
        }
        Insert: {
          icon_emoji: string
          is_awardable_only?: boolean
          label: string
          min_karma?: number
          slug: string
          sort_order?: number
        }
        Update: {
          icon_emoji?: string
          is_awardable_only?: boolean
          label?: string
          min_karma?: number
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_secrets: {
        Row: {
          created_at: string
          function_token: string | null
          id: string
          rpc_url: string
          trading_private_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          function_token?: string | null
          id?: string
          rpc_url: string
          trading_private_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          function_token?: string | null
          id?: string
          rpc_url?: string
          trading_private_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          auto_renew: boolean | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          pricing_tier_id: string | null
          starts_at: string
          trades_used: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_renew?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          pricing_tier_id?: string | null
          starts_at?: string
          trades_used?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_renew?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          pricing_tier_id?: string | null
          starts_at?: string
          trades_used?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_pricing_tier_id_fkey"
            columns: ["pricing_tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      vulture_accounts: {
        Row: {
          confidence_avg: number
          created_at: string
          display_name: string | null
          distinct_tokens: number
          first_seen_at: string
          handle: string
          is_likely_bot: boolean
          last_seen_at: string
          notes: string | null
          total_sightings: number
          updated_at: string
          vulture_kinds: string[]
        }
        Insert: {
          confidence_avg?: number
          created_at?: string
          display_name?: string | null
          distinct_tokens?: number
          first_seen_at?: string
          handle: string
          is_likely_bot?: boolean
          last_seen_at?: string
          notes?: string | null
          total_sightings?: number
          updated_at?: string
          vulture_kinds?: string[]
        }
        Update: {
          confidence_avg?: number
          created_at?: string
          display_name?: string | null
          distinct_tokens?: number
          first_seen_at?: string
          handle?: string
          is_likely_bot?: boolean
          last_seen_at?: string
          notes?: string | null
          total_sightings?: number
          updated_at?: string
          vulture_kinds?: string[]
        }
        Relationships: []
      }
      vulture_lookalike_domains: {
        Row: {
          added_at: string
          added_by: string | null
          domain: string
          kind: string
          notes: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          domain: string
          kind?: string
          notes?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          domain?: string
          kind?: string
          notes?: string | null
        }
        Relationships: []
      }
      vulture_sightings: {
        Row: {
          ai_confidence: number
          ai_reason: string | null
          candidate_id: string | null
          captured_at: string
          community_id: string | null
          display_name: string | null
          handle: string
          id: string
          post_text: string | null
          post_url: string | null
          posted_at: string | null
          raw_post: Json | null
          scam_urls: string[]
          token_mint: string | null
          vulture_kind: string
        }
        Insert: {
          ai_confidence?: number
          ai_reason?: string | null
          candidate_id?: string | null
          captured_at?: string
          community_id?: string | null
          display_name?: string | null
          handle: string
          id?: string
          post_text?: string | null
          post_url?: string | null
          posted_at?: string | null
          raw_post?: Json | null
          scam_urls?: string[]
          token_mint?: string | null
          vulture_kind: string
        }
        Update: {
          ai_confidence?: number
          ai_reason?: string | null
          candidate_id?: string | null
          captured_at?: string
          community_id?: string | null
          display_name?: string | null
          handle?: string
          id?: string
          post_text?: string | null
          post_url?: string | null
          posted_at?: string | null
          raw_post?: Json | null
          scam_urls?: string[]
          token_mint?: string | null
          vulture_kind?: string
        }
        Relationships: []
      }
      wallet_backups: {
        Row: {
          backup_reason: string
          backup_timestamp: string
          created_by: string | null
          id: string
          metadata: Json | null
          pubkey: string
          secret_key_encrypted: string
          verification_hash: string
          wallet_id: string
          wallet_type: string
        }
        Insert: {
          backup_reason?: string
          backup_timestamp?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          pubkey: string
          secret_key_encrypted: string
          verification_hash: string
          wallet_id: string
          wallet_type: string
        }
        Update: {
          backup_reason?: string
          backup_timestamp?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          pubkey?: string
          secret_key_encrypted?: string
          verification_hash?: string
          wallet_id?: string
          wallet_type?: string
        }
        Relationships: []
      }
      wallet_chains: {
        Row: {
          child_1_wallet_id: string | null
          child_2_wallet_id: string | null
          child_3_wallet_id: string | null
          created_at: string
          id: string
          parent_wallet_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          child_1_wallet_id?: string | null
          child_2_wallet_id?: string | null
          child_3_wallet_id?: string | null
          created_at?: string
          id?: string
          parent_wallet_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          child_1_wallet_id?: string | null
          child_2_wallet_id?: string | null
          child_3_wallet_id?: string | null
          created_at?: string
          id?: string
          parent_wallet_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_chains_child_1_wallet_id_fkey"
            columns: ["child_1_wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_chains_child_2_wallet_id_fkey"
            columns: ["child_2_wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_chains_child_3_wallet_id_fkey"
            columns: ["child_3_wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_chains_parent_wallet_id_fkey"
            columns: ["parent_wallet_id"]
            isOneToOne: false
            referencedRelation: "blackbox_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_copy_configs: {
        Row: {
          copy_sell_percentage: boolean
          created_at: string
          id: string
          is_enabled: boolean
          is_fantasy_mode: boolean
          max_daily_trades: number | null
          max_position_size_usd: number | null
          monitored_wallet_id: string
          new_buy_amount_usd: number
          rebuy_amount_usd: number
          updated_at: string
          user_id: string
        }
        Insert: {
          copy_sell_percentage?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_fantasy_mode?: boolean
          max_daily_trades?: number | null
          max_position_size_usd?: number | null
          monitored_wallet_id: string
          new_buy_amount_usd?: number
          rebuy_amount_usd?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          copy_sell_percentage?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_fantasy_mode?: boolean
          max_daily_trades?: number | null
          max_position_size_usd?: number | null
          monitored_wallet_id?: string
          new_buy_amount_usd?: number
          rebuy_amount_usd?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_copy_configs_monitored_wallet_id_fkey"
            columns: ["monitored_wallet_id"]
            isOneToOne: false
            referencedRelation: "monitored_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_families: {
        Row: {
          allstar_id: string | null
          created_at: string
          family_name: string | null
          id: string
          last_rescored_at: string | null
          risk_score: number | null
          seed_wallet: string
          total_mints_detected: number
          total_wallets: number
          updated_at: string
        }
        Insert: {
          allstar_id?: string | null
          created_at?: string
          family_name?: string | null
          id?: string
          last_rescored_at?: string | null
          risk_score?: number | null
          seed_wallet: string
          total_mints_detected?: number
          total_wallets?: number
          updated_at?: string
        }
        Update: {
          allstar_id?: string | null
          created_at?: string
          family_name?: string | null
          id?: string
          last_rescored_at?: string | null
          risk_score?: number | null
          seed_wallet?: string
          total_mints_detected?: number
          total_wallets?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_families_allstar_id_fkey"
            columns: ["allstar_id"]
            isOneToOne: false
            referencedRelation: "allstar_dev_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_family_edges: {
        Row: {
          confidence: number
          edge_type: string
          evidence_count: number
          family_id: string
          first_seen_at: string
          from_wallet: string
          id: string
          last_seen_at: string
          to_wallet: string
          weight: number
        }
        Insert: {
          confidence?: number
          edge_type: string
          evidence_count?: number
          family_id: string
          first_seen_at?: string
          from_wallet: string
          id?: string
          last_seen_at?: string
          to_wallet: string
          weight?: number
        }
        Update: {
          confidence?: number
          edge_type?: string
          evidence_count?: number
          family_id?: string
          first_seen_at?: string
          from_wallet?: string
          id?: string
          last_seen_at?: string
          to_wallet?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "wallet_family_edges_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "wallet_families"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_family_evidence: {
        Row: {
          amount_sol: number | null
          created_at: string
          evidence_type: string
          family_id: string
          id: string
          mint: string | null
          program_id: string | null
          raw_json: Json | null
          related_wallet: string | null
          score_delta: number
          timestamp: string | null
          tx_signature: string | null
          wallet: string
        }
        Insert: {
          amount_sol?: number | null
          created_at?: string
          evidence_type: string
          family_id: string
          id?: string
          mint?: string | null
          program_id?: string | null
          raw_json?: Json | null
          related_wallet?: string | null
          score_delta?: number
          timestamp?: string | null
          tx_signature?: string | null
          wallet: string
        }
        Update: {
          amount_sol?: number | null
          created_at?: string
          evidence_type?: string
          family_id?: string
          id?: string
          mint?: string | null
          program_id?: string | null
          raw_json?: Json | null
          related_wallet?: string | null
          score_delta?: number
          timestamp?: string | null
          tx_signature?: string | null
          wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_family_evidence_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "wallet_families"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_family_members: {
        Row: {
          confidence_score: number
          created_at: string
          family_id: string
          first_seen_at: string
          id: string
          label: string
          last_activity_at: string | null
          last_polled_at: string | null
          last_signature: string | null
          status: string
          tier: string
          wallet_address: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          family_id: string
          first_seen_at?: string
          id?: string
          label?: string
          last_activity_at?: string | null
          last_polled_at?: string | null
          last_signature?: string | null
          status?: string
          tier?: string
          wallet_address: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          family_id?: string
          first_seen_at?: string
          id?: string
          label?: string
          last_activity_at?: string | null
          last_polled_at?: string | null
          last_signature?: string | null
          status?: string
          tier?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "wallet_families"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_family_mint_events: {
        Row: {
          acknowledged_at: string | null
          confidence: number
          created_at: string
          detected_by_wallet: string
          event_type: string
          family_id: string
          id: string
          is_acknowledged: boolean
          launchpad: string | null
          mint_address: string
          token_name: string | null
          token_symbol: string | null
          tx_signature: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          confidence?: number
          created_at?: string
          detected_by_wallet: string
          event_type?: string
          family_id: string
          id?: string
          is_acknowledged?: boolean
          launchpad?: string | null
          mint_address: string
          token_name?: string | null
          token_symbol?: string | null
          tx_signature?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          confidence?: number
          created_at?: string
          detected_by_wallet?: string
          event_type?: string
          family_id?: string
          id?: string
          is_acknowledged?: boolean
          launchpad?: string | null
          mint_address?: string
          token_name?: string | null
          token_symbol?: string | null
          tx_signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_family_mint_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "wallet_families"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_family_poll_queue: {
        Row: {
          burst_mode_until: string | null
          created_at: string
          fail_count: number
          family_id: string
          id: string
          last_polled_at: string | null
          last_result: string | null
          next_poll_at: string
          poll_interval_sec: number
          priority: string
          wallet_address: string
        }
        Insert: {
          burst_mode_until?: string | null
          created_at?: string
          fail_count?: number
          family_id: string
          id?: string
          last_polled_at?: string | null
          last_result?: string | null
          next_poll_at?: string
          poll_interval_sec?: number
          priority?: string
          wallet_address: string
        }
        Update: {
          burst_mode_until?: string | null
          created_at?: string
          fail_count?: number
          family_id?: string
          id?: string
          last_polled_at?: string | null
          last_result?: string | null
          next_poll_at?: string
          poll_interval_sec?: number
          priority?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_family_poll_queue_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "wallet_families"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_follows: {
        Row: {
          alert_on_movement: boolean | null
          created_at: string | null
          id: string
          minimum_movement_usd: number | null
          token_mint: string | null
          user_id: string
          wallet_address: string
        }
        Insert: {
          alert_on_movement?: boolean | null
          created_at?: string | null
          id?: string
          minimum_movement_usd?: number | null
          token_mint?: string | null
          user_id: string
          wallet_address: string
        }
        Update: {
          alert_on_movement?: boolean | null
          created_at?: string | null
          id?: string
          minimum_movement_usd?: number | null
          token_mint?: string | null
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      wallet_funding_traces: {
        Row: {
          amount_sol: number
          cex_name: string | null
          created_at: string | null
          developer_id: string | null
          from_wallet: string
          id: string
          source_type: string | null
          timestamp: string
          to_wallet: string
          trace_depth: number | null
          transaction_signature: string | null
        }
        Insert: {
          amount_sol: number
          cex_name?: string | null
          created_at?: string | null
          developer_id?: string | null
          from_wallet: string
          id?: string
          source_type?: string | null
          timestamp: string
          to_wallet: string
          trace_depth?: number | null
          transaction_signature?: string | null
        }
        Update: {
          amount_sol?: number
          cex_name?: string | null
          created_at?: string | null
          developer_id?: string | null
          from_wallet?: string
          id?: string
          source_type?: string | null
          timestamp?: string
          to_wallet?: string
          trace_depth?: number | null
          transaction_signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_funding_traces_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_genealogy"
            referencedColumns: ["developer_id"]
          },
          {
            foreignKeyName: "wallet_funding_traces_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_funding_traces_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "v_community_admin_dev_link"
            referencedColumns: ["developer_id"]
          },
        ]
      }
      wallet_metadata: {
        Row: {
          avatar_url: string | null
          created_at: string
          discord_handle: string | null
          display_name: string | null
          id: string
          last_lookup_at: string
          lookup_count: number
          lookup_source: string
          next_lookup_at: string
          sns_name: string | null
          telegram_handle: string | null
          twitter_handle: string | null
          updated_at: string
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          discord_handle?: string | null
          display_name?: string | null
          id?: string
          last_lookup_at?: string
          lookup_count?: number
          lookup_source: string
          next_lookup_at?: string
          sns_name?: string | null
          telegram_handle?: string | null
          twitter_handle?: string | null
          updated_at?: string
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          discord_handle?: string | null
          display_name?: string | null
          id?: string
          last_lookup_at?: string
          lookup_count?: number
          lookup_source?: string
          next_lookup_at?: string
          sns_name?: string | null
          telegram_handle?: string | null
          twitter_handle?: string | null
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      wallet_pools: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_balance_check: string | null
          nickname: string | null
          pubkey: string
          secret_key_encrypted: string
          session_id: string | null
          sol_balance: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_balance_check?: string | null
          nickname?: string | null
          pubkey: string
          secret_key_encrypted: string
          session_id?: string | null
          sol_balance?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_balance_check?: string | null
          nickname?: string | null
          pubkey?: string
          secret_key_encrypted?: string
          session_id?: string | null
          sol_balance?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_pools_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trading_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_positions: {
        Row: {
          average_buy_price: number | null
          balance: number
          created_at: string
          first_purchase_at: string | null
          id: string
          last_transaction_at: string
          token_mint: string
          total_invested_usd: number
          updated_at: string
          wallet_address: string
        }
        Insert: {
          average_buy_price?: number | null
          balance?: number
          created_at?: string
          first_purchase_at?: string | null
          id?: string
          last_transaction_at?: string
          token_mint: string
          total_invested_usd?: number
          updated_at?: string
          wallet_address: string
        }
        Update: {
          average_buy_price?: number | null
          balance?: number
          created_at?: string
          first_purchase_at?: string | null
          id?: string
          last_transaction_at?: string
          token_mint?: string
          total_invested_usd?: number
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      wallet_profiles: {
        Row: {
          created_at: string | null
          diamond_hands_count: number | null
          early_entry_count: number | null
          last_analyzed_at: string | null
          paper_hands_count: number | null
          smart_money_score: number | null
          total_realized_pnl: number | null
          total_tokens_traded: number | null
          total_volume_usd: number | null
          updated_at: string | null
          wallet_address: string
          win_rate: number | null
        }
        Insert: {
          created_at?: string | null
          diamond_hands_count?: number | null
          early_entry_count?: number | null
          last_analyzed_at?: string | null
          paper_hands_count?: number | null
          smart_money_score?: number | null
          total_realized_pnl?: number | null
          total_tokens_traded?: number | null
          total_volume_usd?: number | null
          updated_at?: string | null
          wallet_address: string
          win_rate?: number | null
        }
        Update: {
          created_at?: string | null
          diamond_hands_count?: number | null
          early_entry_count?: number | null
          last_analyzed_at?: string | null
          paper_hands_count?: number | null
          smart_money_score?: number | null
          total_realized_pnl?: number | null
          total_tokens_traded?: number | null
          total_volume_usd?: number | null
          updated_at?: string | null
          wallet_address?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      wallet_security_audit: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          ip_address: unknown
          operation: string
          security_flags: Json | null
          session_id: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
          wallet_id: string
          wallet_type: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          operation: string
          security_flags?: Json | null
          session_id?: string | null
          success: boolean
          user_agent?: string | null
          user_id?: string | null
          wallet_id: string
          wallet_type: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          operation?: string
          security_flags?: Json | null
          session_id?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
          wallet_id?: string
          wallet_type?: string
        }
        Relationships: []
      }
      wallet_token_history: {
        Row: {
          behavior_pattern: string | null
          created_at: string | null
          current_balance: number | null
          entry_date: string | null
          entry_price: number | null
          exit_date: string | null
          exit_price: number | null
          id: string
          max_balance: number | null
          realized_pnl: number | null
          token_mint: string
          transaction_count: number | null
          unrealized_pnl: number | null
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          behavior_pattern?: string | null
          created_at?: string | null
          current_balance?: number | null
          entry_date?: string | null
          entry_price?: number | null
          exit_date?: string | null
          exit_price?: number | null
          id?: string
          max_balance?: number | null
          realized_pnl?: number | null
          token_mint: string
          transaction_count?: number | null
          unrealized_pnl?: number | null
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          behavior_pattern?: string | null
          created_at?: string | null
          current_balance?: number | null
          entry_date?: string | null
          entry_price?: number | null
          exit_date?: string | null
          exit_price?: number | null
          id?: string
          max_balance?: number | null
          realized_pnl?: number | null
          token_mint?: string
          transaction_count?: number | null
          unrealized_pnl?: number | null
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_sol: number
          amount_usd: number | null
          created_at: string
          id: string
          is_first_purchase: boolean
          meets_criteria: boolean
          monitored_wallet_id: string
          platform: string | null
          signature: string
          timestamp: string
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          transaction_type: string
        }
        Insert: {
          amount_sol: number
          amount_usd?: number | null
          created_at?: string
          id?: string
          is_first_purchase?: boolean
          meets_criteria?: boolean
          monitored_wallet_id: string
          platform?: string | null
          signature: string
          timestamp: string
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          transaction_type: string
        }
        Update: {
          amount_sol?: number
          amount_usd?: number | null
          created_at?: string
          id?: string
          is_first_purchase?: boolean
          meets_criteria?: boolean
          monitored_wallet_id?: string
          platform?: string | null
          signature?: string
          timestamp?: string
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_monitored_wallet_id_fkey"
            columns: ["monitored_wallet_id"]
            isOneToOne: false
            referencedRelation: "monitored_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      web_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          page_path: string | null
          role: string
          session_id: string
          user_id: string | null
          user_tier: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          page_path?: string | null
          role: string
          session_id: string
          user_id?: string | null
          user_tier?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          page_path?: string | null
          role?: string
          session_id?: string
          user_id?: string | null
          user_tier?: string | null
        }
        Relationships: []
      }
      web_chat_sessions: {
        Row: {
          browser: string | null
          created_at: string
          device_type: string | null
          first_message_at: string
          id: string
          last_message_at: string
          message_count: number
          messages: Json
          page_path: string | null
          session_id: string | null
          tier: string | null
          updated_at: string
          user_agent: string | null
          user_id: string | null
          visitor_fingerprint: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_type?: string | null
          first_message_at?: string
          id?: string
          last_message_at?: string
          message_count?: number
          messages?: Json
          page_path?: string | null
          session_id?: string | null
          tier?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          visitor_fingerprint?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_type?: string | null
          first_message_at?: string
          id?: string
          last_message_at?: string
          message_count?: number
          messages?: Json
          page_path?: string | null
          session_id?: string | null
          tier?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          visitor_fingerprint?: string | null
        }
        Relationships: []
      }
      web_subscription_tiers: {
        Row: {
          ai_access_level: Database["public"]["Enums"]["ai_access_level"]
          created_at: string | null
          display_name: string
          features: Json | null
          id: string
          is_active: boolean | null
          max_reports_per_day: number | null
          price_usd: number | null
          tier_key: Database["public"]["Enums"]["web_tier_key"]
          updated_at: string | null
          x_subscriber_price_usd: number | null
        }
        Insert: {
          ai_access_level: Database["public"]["Enums"]["ai_access_level"]
          created_at?: string | null
          display_name: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_reports_per_day?: number | null
          price_usd?: number | null
          tier_key: Database["public"]["Enums"]["web_tier_key"]
          updated_at?: string | null
          x_subscriber_price_usd?: number | null
        }
        Update: {
          ai_access_level?: Database["public"]["Enums"]["ai_access_level"]
          created_at?: string | null
          display_name?: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_reports_per_day?: number | null
          price_usd?: number | null
          tier_key?: Database["public"]["Enums"]["web_tier_key"]
          updated_at?: string | null
          x_subscriber_price_usd?: number | null
        }
        Relationships: []
      }
      web_user_subscriptions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          starts_at: string | null
          stripe_subscription_id: string | null
          tier_key: Database["public"]["Enums"]["web_tier_key"]
          updated_at: string | null
          user_id: string
          x_handle_linked: string | null
          x_subscription_verified: boolean | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          starts_at?: string | null
          stripe_subscription_id?: string | null
          tier_key?: Database["public"]["Enums"]["web_tier_key"]
          updated_at?: string | null
          user_id: string
          x_handle_linked?: string | null
          x_subscription_verified?: boolean | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          starts_at?: string | null
          stripe_subscription_id?: string | null
          tier_key?: Database["public"]["Enums"]["web_tier_key"]
          updated_at?: string | null
          user_id?: string
          x_handle_linked?: string | null
          x_subscription_verified?: boolean | null
        }
        Relationships: []
      }
      whale_frenzy_config: {
        Row: {
          auto_buy_enabled: boolean
          buy_amount_sol: number
          cooldown_seconds: number
          created_at: string
          fantasy_buy_amount: number | null
          fantasy_mode: boolean | null
          helius_webhook_id: string | null
          id: string
          is_active: boolean
          max_slippage_bps: number
          min_whales_for_frenzy: number
          monitoring_active: boolean | null
          time_window_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_buy_enabled?: boolean
          buy_amount_sol?: number
          cooldown_seconds?: number
          created_at?: string
          fantasy_buy_amount?: number | null
          fantasy_mode?: boolean | null
          helius_webhook_id?: string | null
          id?: string
          is_active?: boolean
          max_slippage_bps?: number
          min_whales_for_frenzy?: number
          monitoring_active?: boolean | null
          time_window_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_buy_enabled?: boolean
          buy_amount_sol?: number
          cooldown_seconds?: number
          created_at?: string
          fantasy_buy_amount?: number | null
          fantasy_mode?: boolean | null
          helius_webhook_id?: string | null
          id?: string
          is_active?: boolean
          max_slippage_bps?: number
          min_whales_for_frenzy?: number
          monitoring_active?: boolean | null
          time_window_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whale_frenzy_events: {
        Row: {
          auto_buy_amount_sol: number | null
          auto_buy_error: string | null
          auto_buy_executed: boolean
          auto_buy_signature: string | null
          buy_timeline: Json | null
          created_at: string
          detected_at: string
          entry_token_price: number | null
          first_buy_at: string | null
          id: string
          last_buy_at: string | null
          participating_wallets: Json
          token_image: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          user_id: string
          whale_count: number
        }
        Insert: {
          auto_buy_amount_sol?: number | null
          auto_buy_error?: string | null
          auto_buy_executed?: boolean
          auto_buy_signature?: string | null
          buy_timeline?: Json | null
          created_at?: string
          detected_at?: string
          entry_token_price?: number | null
          first_buy_at?: string | null
          id?: string
          last_buy_at?: string | null
          participating_wallets?: Json
          token_image?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          user_id: string
          whale_count: number
        }
        Update: {
          auto_buy_amount_sol?: number | null
          auto_buy_error?: string | null
          auto_buy_executed?: boolean
          auto_buy_signature?: string | null
          buy_timeline?: Json | null
          created_at?: string
          detected_at?: string
          entry_token_price?: number | null
          first_buy_at?: string | null
          id?: string
          last_buy_at?: string | null
          participating_wallets?: Json
          token_image?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          user_id?: string
          whale_count?: number
        }
        Relationships: []
      }
      whale_wallets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          nickname: string | null
          twitter_handle: string | null
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          nickname?: string | null
          twitter_handle?: string | null
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          nickname?: string | null
          twitter_handle?: string | null
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      x_account_registry: {
        Row: {
          current_handle: string | null
          display_name: string | null
          first_seen_at: string | null
          followers_count: number | null
          followers_fetched_at: string | null
          handle_history: Json | null
          is_verified: boolean | null
          last_seen_at: string | null
          linked_token_count: number | null
          name_history: Json | null
          phanes_data: Json | null
          phanes_queried_at: string | null
          phanes_recycled_accounts: Json | null
          phanes_username_history: Json | null
          x_user_id: string
        }
        Insert: {
          current_handle?: string | null
          display_name?: string | null
          first_seen_at?: string | null
          followers_count?: number | null
          followers_fetched_at?: string | null
          handle_history?: Json | null
          is_verified?: boolean | null
          last_seen_at?: string | null
          linked_token_count?: number | null
          name_history?: Json | null
          phanes_data?: Json | null
          phanes_queried_at?: string | null
          phanes_recycled_accounts?: Json | null
          phanes_username_history?: Json | null
          x_user_id: string
        }
        Update: {
          current_handle?: string | null
          display_name?: string | null
          first_seen_at?: string | null
          followers_count?: number | null
          followers_fetched_at?: string | null
          handle_history?: Json | null
          is_verified?: boolean | null
          last_seen_at?: string | null
          linked_token_count?: number | null
          name_history?: Json | null
          phanes_data?: Json | null
          phanes_queried_at?: string | null
          phanes_recycled_accounts?: Json | null
          phanes_username_history?: Json | null
          x_user_id?: string
        }
        Relationships: []
      }
      x_communities: {
        Row: {
          admin_usernames: string[] | null
          community_id: string
          community_url: string
          created_at: string | null
          created_at_x: string | null
          deleted_detected_at: string | null
          deletion_alert_sent: boolean | null
          description: string | null
          failed_scrape_count: number | null
          flag_reason: string | null
          id: string
          is_deleted: boolean | null
          is_flagged: boolean | null
          is_renamed: boolean
          last_existence_check_at: string | null
          last_scraped_at: string | null
          linked_token_mints: string[] | null
          linked_wallets: string[] | null
          member_count: number | null
          member_sample: Json
          moderator_usernames: string[] | null
          name: string | null
          name_history: Json
          raw_data: Json | null
          recycled_band: string | null
          recycled_evaluated_at: string | null
          recycled_score: number | null
          recycled_signals: Json | null
          scrape_status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_usernames?: string[] | null
          community_id: string
          community_url: string
          created_at?: string | null
          created_at_x?: string | null
          deleted_detected_at?: string | null
          deletion_alert_sent?: boolean | null
          description?: string | null
          failed_scrape_count?: number | null
          flag_reason?: string | null
          id?: string
          is_deleted?: boolean | null
          is_flagged?: boolean | null
          is_renamed?: boolean
          last_existence_check_at?: string | null
          last_scraped_at?: string | null
          linked_token_mints?: string[] | null
          linked_wallets?: string[] | null
          member_count?: number | null
          member_sample?: Json
          moderator_usernames?: string[] | null
          name?: string | null
          name_history?: Json
          raw_data?: Json | null
          recycled_band?: string | null
          recycled_evaluated_at?: string | null
          recycled_score?: number | null
          recycled_signals?: Json | null
          scrape_status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_usernames?: string[] | null
          community_id?: string
          community_url?: string
          created_at?: string | null
          created_at_x?: string | null
          deleted_detected_at?: string | null
          deletion_alert_sent?: boolean | null
          description?: string | null
          failed_scrape_count?: number | null
          flag_reason?: string | null
          id?: string
          is_deleted?: boolean | null
          is_flagged?: boolean | null
          is_renamed?: boolean
          last_existence_check_at?: string | null
          last_scraped_at?: string | null
          linked_token_mints?: string[] | null
          linked_wallets?: string[] | null
          member_count?: number | null
          member_sample?: Json
          moderator_usernames?: string[] | null
          name?: string | null
          name_history?: Json
          raw_data?: Json | null
          recycled_band?: string | null
          recycled_evaluated_at?: string | null
          recycled_score?: number | null
          recycled_signals?: Json | null
          scrape_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      x_community_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          notes: string | null
          use_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          notes?: string | null
          use_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          notes?: string | null
          use_count?: number
        }
        Relationships: []
      }
      x_community_redemptions: {
        Row: {
          code_id: string
          id: string
          redeemed_at: string
          user_id: string
          x_handle: string
        }
        Insert: {
          code_id: string
          id?: string
          redeemed_at?: string
          user_id: string
          x_handle: string
        }
        Update: {
          code_id?: string
          id?: string
          redeemed_at?: string
          user_id?: string
          x_handle?: string
        }
        Relationships: [
          {
            foreignKeyName: "x_community_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "x_community_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      x_community_resolution_queue: {
        Row: {
          attempts: number
          community_id: string
          discovered_via: string | null
          enqueued_at: string
          id: string
          last_error: string | null
          priority: number
          resolved_at: string | null
        }
        Insert: {
          attempts?: number
          community_id: string
          discovered_via?: string | null
          enqueued_at?: string
          id?: string
          last_error?: string | null
          priority?: number
          resolved_at?: string | null
        }
        Update: {
          attempts?: number
          community_id?: string
          discovered_via?: string | null
          enqueued_at?: string
          id?: string
          last_error?: string | null
          priority?: number
          resolved_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      developer_genealogy: {
        Row: {
          avg_best_rank: number | null
          developer_first_tracked: string | null
          developer_id: string | null
          display_name: string | null
          first_token_discovered: string | null
          integrity_score: number | null
          kyc_verified: boolean | null
          master_wallet_address: string | null
          most_recent_token: string | null
          tags: string[] | null
          tokens_in_top_10: number | null
          tokens_in_top_100: number | null
          tokens_in_top_200: number | null
          total_tokens_tracked: number | null
          total_wallets_in_network: number | null
          trust_level: string | null
        }
        Relationships: []
      }
      holders_intel_demand_24h: {
        Row: {
          demand_score_24h: number | null
          last_seen_at: string | null
          last_trigger_source: string | null
          name: string | null
          symbol: string | null
          times_seen: number | null
          token_mint: string | null
        }
        Insert: {
          demand_score_24h?: never
          last_seen_at?: string | null
          last_trigger_source?: string | null
          name?: string | null
          symbol?: string | null
          times_seen?: number | null
          token_mint?: string | null
        }
        Update: {
          demand_score_24h?: never
          last_seen_at?: string | null
          last_trigger_source?: string | null
          name?: string | null
          symbol?: string | null
          times_seen?: number | null
          token_mint?: string | null
        }
        Relationships: []
      }
      intel_briefing_view_stats: {
        Row: {
          ai_bot_hits: number | null
          bot_breakdown: Json | null
          briefing_id: string | null
          crawler_hits: number | null
          human_views: number | null
          slug: string | null
          total_views: number | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_briefing_views_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "intel_briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      live_feed_curated: {
        Row: {
          banner_url: string | null
          freshness_tier: number | null
          health_grade: string | null
          image_uri: string | null
          last_activity: string | null
          last_top_200_rank: number | null
          name: string | null
          posted_at: string | null
          symbol: string | null
          token_mint: string | null
          trigger_source: string | null
          tweet_id: string | null
        }
        Relationships: []
      }
      master_token_directory: {
        Row: {
          ath_24h_usd: number | null
          ath_market_cap_at: string | null
          ath_market_cap_usd: number | null
          community_admin_handles: string[] | null
          community_mod_handles: string[] | null
          created_at: string | null
          creator_wallet: string | null
          description: string | null
          dev_auto_blacklisted: boolean | null
          dev_is_legitimate_builder: boolean | null
          dev_is_serial_spammer: boolean | null
          dev_pattern: string | null
          dev_reputation_score: number | null
          dev_tokens_rugged: number | null
          dev_tokens_successful: number | null
          dev_total_launches: number | null
          dev_trust_level: string | null
          dev_wallets: string[] | null
          discovery_source: string | null
          funnel_sources: string[] | null
          graduated_at: string | null
          image_url: string | null
          is_graduated: boolean | null
          kyc_source: string | null
          kyc_verified: boolean | null
          launchpad: string | null
          mesh_x_handles: string[] | null
          name: string | null
          symbol: string | null
          telegram_url: string | null
          token_mint: string | null
          twitter_url: string | null
          was_posted: boolean | null
          website_sources: Json | null
          website_url: string | null
          websites: string[] | null
          x_community_names: string[] | null
          x_community_urls: string[] | null
        }
        Relationships: []
      }
      mesh_summary: {
        Row: {
          admin_links: number | null
          co_mod_links: number | null
          last_refreshed: string | null
          mod_links: number | null
          token_links: number | null
          total_links: number | null
          unique_accounts: number | null
          unique_communities: number | null
        }
        Relationships: []
      }
      mv_live_death_watch: {
        Row: {
          ath_at: string | null
          ath_usd: number | null
          collapse_pct: number | null
          creator_wallet: string | null
          current_mcap_usd: number | null
          current_price_usd: number | null
          current_status: string | null
          death_at: string | null
          death_cause: string | null
          death_confidence: number | null
          dollar_wipeout: number | null
          dust_percentage: number | null
          first_seen_at: string | null
          health_grade: string | null
          health_score: number | null
          holder_count: number | null
          is_recent: boolean | null
          last_seen_at: string | null
          latest_at: string | null
          launchpad: string | null
          liquidity_usd: number | null
          name: string | null
          risk_label: string | null
          symbol: string | null
          token_mint: string | null
          volume_24h: number | null
        }
        Relationships: []
      }
      nolube_member_retention: {
        Row: {
          channel_kind: string | null
          chat_id: string | null
          cohort_size: number | null
          cohort_week: string | null
          is_seed: boolean | null
          profile_key: string | null
          still_active: number | null
          surviving_d1: number | null
          surviving_d14: number | null
          surviving_d3: number | null
          surviving_d30: number | null
          surviving_d60: number | null
          surviving_d7: number | null
          surviving_d90: number | null
        }
        Relationships: []
      }
      security_summary: {
        Row: {
          encrypted_keys: number | null
          encrypted_tokens: number | null
          table_name: string | null
          total_records: number | null
        }
        Relationships: []
      }
      sol_price_source_stats: {
        Row: {
          avg_success_time_ms: number | null
          failures: number | null
          last_attempt_at: string | null
          source_name: string | null
          success_rate_pct: number | null
          successes: number | null
          total_attempts: number | null
        }
        Relationships: []
      }
      user_security_audit: {
        Row: {
          access_timestamp: string | null
          id: string | null
          operation: string | null
          result: string | null
          secret_type: string | null
          success: boolean | null
          summary: Json | null
        }
        Insert: {
          access_timestamp?: string | null
          id?: string | null
          operation?: string | null
          result?: never
          secret_type?: string | null
          success?: boolean | null
          summary?: never
        }
        Update: {
          access_timestamp?: string | null
          id?: string | null
          operation?: string | null
          result?: never
          secret_type?: string | null
          success?: boolean | null
          summary?: never
        }
        Relationships: []
      }
      v_community_admin_dev_link: {
        Row: {
          admin_handle: string | null
          admin_wallet: string | null
          community_id: string | null
          developer_id: string | null
          prior_failures: number | null
          prior_tokens: number | null
        }
        Relationships: []
      }
      v_community_token_outcomes: {
        Row: {
          community_id: string | null
          dead_count: number | null
          dead_rate_pct: number | null
          linked_token_count: number | null
          success_count: number | null
        }
        Relationships: []
      }
      v_dev_social_graph: {
        Row: {
          communities: string[] | null
          current_handles: string[] | null
          historical_handles: string[] | null
          last_link_at: string | null
          link_count: number | null
          relationships: string[] | null
          tokens: string[] | null
          wallet_address: string | null
        }
        Relationships: []
      }
      v_live_death_watch: {
        Row: {
          ath_at: string | null
          ath_usd: number | null
          collapse_pct: number | null
          creator_wallet: string | null
          current_mcap_usd: number | null
          current_price_usd: number | null
          current_status: string | null
          death_at: string | null
          death_cause: string | null
          death_confidence: number | null
          dollar_wipeout: number | null
          dust_percentage: number | null
          first_seen_at: string | null
          health_grade: string | null
          health_score: number | null
          holder_count: number | null
          is_recent: boolean | null
          last_seen_at: string | null
          latest_at: string | null
          launchpad: string | null
          liquidity_usd: number | null
          name: string | null
          risk_label: string | null
          symbol: string | null
          token_mint: string | null
          volume_24h: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aggregate_holder_data: {
        Args: { p_older_than_days?: number }
        Returns: Json
      }
      aggregate_holder_data_batch: {
        Args: { p_batch_days?: number; p_older_than_days?: number }
        Returns: Json
      }
      apply_referral_discount: {
        Args: { user_id_param: string }
        Returns: Json
      }
      archive_old_morning_reports: { Args: never; Returns: number }
      auto_suspend_unverified_users: { Args: never; Returns: undefined }
      ban_user: {
        Args: { ban_until?: string; target_user_id: string }
        Returns: undefined
      }
      bulk_prune_table: {
        Args: { p_column: string; p_cutoff: string; p_table: string }
        Returns: number
      }
      bump_seen_token: {
        Args: {
          p_mint: string
          p_name?: string
          p_source: string
          p_symbol?: string
        }
        Returns: undefined
      }
      check_api_service_alerts: {
        Args: never
        Returns: {
          alert_type: string
          current_usage: number
          days_until_rotation: number
          display_name: string
          limit_value: number
          service_name: string
          usage_percentage: number
        }[]
      }
      check_notification_cooldown: {
        Args: {
          p_campaign_id: string
          p_campaign_type: string
          p_hours?: number
        }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          check_action_type: string
          check_identifier: string
          max_attempts?: number
          window_minutes?: number
        }
        Returns: Json
      }
      check_suspicious_activity: {
        Args: { check_ip: unknown; time_window_minutes?: number }
        Returns: Json
      }
      check_user_access_with_security: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      claim_insiders_creator_backfill_batch: {
        Args: {
          p_batch_size?: number
          p_retry_cooldown_hours?: number
          p_unresolvable_cooldown_days?: number
        }
        Returns: {
          creator_attempts: number
          id: string
          token_mint: string
          token_symbol: string
        }[]
      }
      cleanup_bubble_map_anon_usage: { Args: never; Returns: undefined }
      cleanup_dead_letter_queue: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_edge_function_runs: {
        Args: { retention_days?: number }
        Returns: number
      }
      count_distinct_tg_users: { Args: never; Returns: number }
      count_registered_tg_users: { Args: never; Returns: number }
      count_rotation_patterns: {
        Args: { min_communities?: number }
        Returns: number
      }
      count_telegram_announcement_recipients: {
        Args: { p_audiences: string[] }
        Returns: number
      }
      create_wallet_backup: {
        Args: {
          p_pubkey: string
          p_reason?: string
          p_secret_encrypted: string
          p_user_id?: string
          p_wallet_id: string
          p_wallet_type: string
        }
        Returns: string
      }
      decrypt_owner_secret: {
        Args: { encrypted_secret: string }
        Returns: string
      }
      decrypt_secret_secure: {
        Args: { encrypted_secret: string }
        Returns: string
      }
      decrypt_user_secret: {
        Args: { encrypted_secret: string }
        Returns: string
      }
      decrypt_wallet_secret: {
        Args: { encrypted_secret: string }
        Returns: string
      }
      delete_campaign_cascade: {
        Args: { campaign_id_param: string; campaign_type_param?: string }
        Returns: Json
      }
      encrypt_owner_secret: { Args: { input_secret: string }; Returns: string }
      encrypt_secret_secure: { Args: { input_secret: string }; Returns: string }
      encrypt_user_secret: { Args: { input_secret: string }; Returns: string }
      encrypt_wallet_secret: { Args: { input_secret: string }; Returns: string }
      exec_sql: { Args: { query: string }; Returns: undefined }
      find_common_developer_origins: {
        Args: never
        Returns: {
          developer_id: string
          display_name: string
          master_wallet: string
          related_developers: Json
          shared_wallets_count: number
        }[]
      }
      generate_referral_code: {
        Args: { user_id_param: string }
        Returns: string
      }
      generate_telegram_link_code: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_24h_unverified_users: {
        Args: never
        Returns: {
          email: string
          signup_token: string
          user_id: string
        }[]
      }
      get_accounts_directory: {
        Args: never
        Returns: {
          cached_subscription_active: boolean
          cached_tier_key: string
          created_at: string
          display_name: string
          email: string
          email_verified: boolean
          has_telegram: boolean
          last_active_at: string
          login_count: number
          oauth_provider: string
          telegram_username: string
          user_id: string
        }[]
      }
      get_active_positions_with_secrets: {
        Args: { session_id_param: string }
        Returns: {
          created_at: string
          entry_price: number
          entry_timestamp: string
          high_price: number
          id: string
          lot_id: string
          owner_pubkey: string
          owner_secret: string
          quantity_raw: number
          quantity_ui: number
          session_id: string
          status: string
          updated_at: string
        }[]
      }
      get_active_super_admin_wallet: {
        Args: { wallet_type_param: string }
        Returns: {
          id: string
          label: string
          pubkey: string
        }[]
      }
      get_api_usage_stats: {
        Args: {
          p_end_date?: string
          p_service_name?: string
          p_start_date?: string
        }
        Returns: {
          avg_response_time_ms: number
          calls_by_day: Json
          calls_by_service: Json
          credits_by_service: Json
          failed_calls: number
          successful_calls: number
          top_tokens: Json
          total_calls: number
          total_credits: number
        }[]
      }
      get_birdeye_master_impact: {
        Args: { window_hours?: number }
        Returns: {
          excluded_dead_or_rejected: number
          in_master_missing_creator: number
          in_master_with_creator: number
          not_in_master: number
          unique_creators: number
          unique_mints_resolved: number
        }[]
      }
      get_blackbox_user_decrypted: {
        Args: { user_id_param: string }
        Returns: {
          created_at: string
          id: string
          phone_number: string
          two_factor_enabled: boolean
          two_factor_secret: string
          updated_at: string
          user_id: string
        }[]
      }
      get_cron_job_names: {
        Args: never
        Returns: {
          jobname: string
        }[]
      }
      get_cron_job_status: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          schedule: string
        }[]
      }
      get_dust_wallet_stats: {
        Args: { whale_id?: string }
        Returns: {
          active_wallets: number
          avg_dust_sol: number
          dust_percentage: number
          dust_wallets: number
          recently_reactivated: number
          total_wallets: number
        }[]
      }
      get_helius_usage_stats: {
        Args: { p_end_date?: string; p_start_date?: string; p_user_id?: string }
        Returns: {
          avg_response_time_ms: number
          calls_by_day: Json
          calls_by_function: Json
          failed_calls: number
          hourly_distribution: Json
          successful_calls: number
          top_ips: Json
          total_calls: number
          total_credits: number
        }[]
      }
      get_profile_decrypted: {
        Args: { user_id_param: string }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          email_verified: boolean
          id: string
          phone_number: string
          phone_verified: boolean
          two_factor_enabled: boolean
          two_factor_secret: string
          updated_at: string
          user_id: string
        }[]
      }
      get_rotation_patterns: {
        Args: {
          min_communities?: number
          result_limit?: number
          result_offset?: number
        }
        Returns: {
          account: string
          admin_communities: string[]
          co_mod_count: number
          mod_communities: string[]
          risk_score: number
          total_communities: number
        }[]
      }
      get_security_config: { Args: { config_key_param: string }; Returns: Json }
      get_security_status: { Args: never; Returns: Json }
      get_service_usage_today: {
        Args: { p_service_name: string }
        Returns: {
          avg_response_time: number
          failed_calls: number
          successful_calls: number
          total_calls: number
          total_credits: number
        }[]
      }
      get_super_admin_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      get_telegram_announcement_recipients: {
        Args: { p_audiences: string[] }
        Returns: {
          linked_user_id: string
          telegram_user_id: string
        }[]
      }
      get_token_search_analytics: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          avg_response_time_ms: number
          searches_by_day: Json
          success_rate: number
          top_ips: Json
          top_tokens: Json
          total_searches: number
          unique_ips: number
          unique_sessions: number
          unique_tokens: number
        }[]
      }
      get_user_profile_safe: {
        Args: { requesting_user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          email_verified: boolean
          has_two_factor: boolean
          id: string
          phone_number_masked: string
          phone_verified: boolean
          two_factor_enabled: boolean
          updated_at: string
          user_id: string
        }[]
      }
      get_user_profile_secure: {
        Args: { requesting_user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          email_verified: boolean
          has_two_factor: boolean
          id: string
          phone_number_masked: string
          phone_verified: boolean
          two_factor_enabled: boolean
          updated_at: string
          user_id: string
        }[]
      }
      get_user_secrets_decrypted: {
        Args: { user_id_param: string }
        Returns: {
          created_at: string
          function_token: string
          id: string
          rpc_url: string
          trading_private_key: string
          updated_at: string
          user_id: string
        }[]
      }
      get_user_secrets_secure: {
        Args: { user_id_param: string }
        Returns: {
          created_at: string
          function_token: string
          id: string
          rpc_url: string
          trading_private_key: string
          updated_at: string
          user_id: string
        }[]
      }
      get_user_subscription: {
        Args: { user_id_param: string }
        Returns: {
          expires_at: string
          id: string
          is_active: boolean
          max_trades_per_hour: number
          tier_name: string
          trades_used: number
        }[]
      }
      get_user_tier: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["web_tier_key"]
      }
      get_wallet_pool_secrets_decrypted: {
        Args: { user_id_param: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          last_balance_check: string
          pubkey: string
          secret_key: string
          session_id: string
          sol_balance: number
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_funnel_stage: {
        Args: { p_count?: number; p_date: string; p_stage: string }
        Returns: undefined
      }
      increment_monthly_quota_used: {
        Args: { p_credits: number; p_service_name: string }
        Returns: undefined
      }
      increment_offspring_count: {
        Args: { amount?: number; whale_id: string }
        Returns: undefined
      }
      increment_spider_metrics: {
        Args: {
          p_blacklist_hits?: number
          p_date: string
          p_genealogy_depth?: number
          p_mesh_links?: number
          p_tokens?: number
          p_wallets?: number
          p_whitelist_hits?: number
        }
        Returns: undefined
      }
      increment_xcrq_attempt: {
        Args: { p_community_id: string; p_error: string }
        Returns: undefined
      }
      initialize_arb_balances_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_user_banned: { Args: { target_user_id: string }; Returns: boolean }
      lock_entry_mcap: {
        Args: {
          p_mint: string
          p_observed: number
          p_source?: string
          p_symbol?: string
        }
        Returns: number
      }
      log_auth_failure: {
        Args: { client_info?: Json; failure_reason: string; user_email: string }
        Returns: undefined
      }
      log_profile_security_event: {
        Args: {
          details_param?: Json
          event_type_param: string
          target_user_id_param: string
          user_id_param: string
        }
        Returns: undefined
      }
      log_wallet_operation: {
        Args: {
          p_error_message?: string
          p_operation: string
          p_security_flags?: Json
          p_success?: boolean
          p_user_id?: string
          p_wallet_id: string
          p_wallet_type: string
        }
        Returns: undefined
      }
      mark_dust_wallets: {
        Args: {
          max_token_value_usd?: number
          min_sol_threshold?: number
          recheck_interval_hours?: number
        }
        Returns: {
          marked_count: number
          total_active: number
          total_dust: number
          wallets_without_balance: number
        }[]
      }
      mask_sensitive_data: { Args: { input_text: string }; Returns: string }
      passes_worth_gate: {
        Args: { p_token_mint: string }
        Returns: {
          passes: boolean
          reasons: Json
        }[]
      }
      pause_apify: {
        Args: {
          p_body?: string
          p_minutes: number
          p_reason: string
          p_status?: number
          p_triggered_by?: string
        }
        Returns: string
      }
      process_active_blackbox_commands: { Args: never; Returns: undefined }
      prune_allstar_audit_check_log: { Args: never; Returns: undefined }
      prune_creator_fusion_audit: {
        Args: never
        Returns: {
          deleted_error: number
          deleted_success: number
        }[]
      }
      prune_log_tables: { Args: never; Returns: Json }
      prune_solscan_api_calls: { Args: never; Returns: undefined }
      record_function_skip: {
        Args: { p_function_name: string }
        Returns: undefined
      }
      refresh_buyer_intent_signals: { Args: never; Returns: undefined }
      refresh_live_death_watch: { Args: never; Returns: undefined }
      refresh_master_token_directory: { Args: never; Returns: undefined }
      refresh_mesh_summary: { Args: never; Returns: undefined }
      reset_daily_auto_buy_counts: { Args: never; Returns: undefined }
      resume_apify: { Args: { p_triggered_by?: string }; Returns: undefined }
      schedule_arb_scanner: { Args: never; Returns: undefined }
      schedule_cron_job: {
        Args: { job_command: string; job_name: string; job_schedule: string }
        Returns: undefined
      }
      sync_api_service_usage: { Args: never; Returns: undefined }
      track_referral_signup: {
        Args: { new_user_id: string; referral_code_param: string }
        Returns: Json
      }
      track_user_login: { Args: { p_user_id: string }; Returns: undefined }
      unban_user: { Args: { target_user_id: string }; Returns: undefined }
      update_dex_cron_interval: {
        Args: { minutes_interval: number }
        Returns: undefined
      }
      upsert_mesh_entry_mcap: {
        Args: {
          p_mint: string
          p_name?: string
          p_observed_at?: string
          p_observed_mcap?: number
          p_source?: string
          p_symbol?: string
        }
        Returns: {
          entry_mcap_usd: number
          first_seen_at: string
          within_window: boolean
        }[]
      }
      validate_profile_access: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      validate_secret_access: {
        Args: { requesting_user_id: string; target_user_id: string }
        Returns: boolean
      }
      validate_secret_access_enhanced: {
        Args: {
          operation?: string
          requesting_user_id: string
          secret_type?: string
          target_user_id: string
        }
        Returns: boolean
      }
      verify_access_password: {
        Args: { input_password: string }
        Returns: boolean
      }
      verify_wallet_integrity: {
        Args: { p_wallet_id: string; p_wallet_type: string }
        Returns: Json
      }
    }
    Enums: {
      aftercare_verdict:
        | "pending"
        | "reinforcing"
        | "cooling"
        | "exit"
        | "graduated"
        | "expired"
      ai_access_level: "summary" | "analysis" | "overview" | "full" | "api"
      app_role: "super_admin" | "admin" | "moderator" | "user"
      bot_guardrail_severity: "soft" | "hard" | "critical"
      bot_guardrail_type:
        | "never_say"
        | "always_say"
        | "redirect"
        | "tone_override"
        | "topic_block"
      bot_knowledge_category:
        | "faq"
        | "features"
        | "security"
        | "billing"
        | "onboarding"
        | "troubleshooting"
        | "marketing"
        | "compliance"
      creator_alias_kind:
        | "wallet"
        | "kyc_root"
        | "x_user_id"
        | "x_handle"
        | "telegram_user_id"
        | "telegram_handle"
        | "discord_id"
        | "discord_handle"
        | "website_domain"
      token_intent_classification:
        | "rug_pull"
        | "soft_rug"
        | "abandoned"
        | "accidental_failure"
        | "organic_success"
        | "engineered_success"
        | "unknown"
      web_tier_key:
        | "free"
        | "auth"
        | "x_subscriber"
        | "pro"
        | "dev"
        | "enterprise"
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
      aftercare_verdict: [
        "pending",
        "reinforcing",
        "cooling",
        "exit",
        "graduated",
        "expired",
      ],
      ai_access_level: ["summary", "analysis", "overview", "full", "api"],
      app_role: ["super_admin", "admin", "moderator", "user"],
      bot_guardrail_severity: ["soft", "hard", "critical"],
      bot_guardrail_type: [
        "never_say",
        "always_say",
        "redirect",
        "tone_override",
        "topic_block",
      ],
      bot_knowledge_category: [
        "faq",
        "features",
        "security",
        "billing",
        "onboarding",
        "troubleshooting",
        "marketing",
        "compliance",
      ],
      creator_alias_kind: [
        "wallet",
        "kyc_root",
        "x_user_id",
        "x_handle",
        "telegram_user_id",
        "telegram_handle",
        "discord_id",
        "discord_handle",
        "website_domain",
      ],
      token_intent_classification: [
        "rug_pull",
        "soft_rug",
        "abandoned",
        "accidental_failure",
        "organic_success",
        "engineered_success",
        "unknown",
      ],
      web_tier_key: [
        "free",
        "auth",
        "x_subscriber",
        "pro",
        "dev",
        "enterprise",
      ],
    },
  },
} as const
