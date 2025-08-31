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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
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
      blackbox_command_codes: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          wallet_id: string | null
        }
        Insert: {
          config: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          wallet_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
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
      blackbox_transactions: {
        Row: {
          amount_sol: number
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
          campaign_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          pubkey: string
          secret_key_encrypted: string
          sol_balance: number | null
          updated_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          pubkey: string
          secret_key_encrypted: string
          sol_balance?: number | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          pubkey?: string
          secret_key_encrypted?: string
          sol_balance?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blackbox_wallets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "blackbox_campaigns"
            referencedColumns: ["id"]
          },
        ]
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email_verified: boolean | null
          id: string
          phone_number: string | null
          phone_verified: boolean | null
          two_factor_enabled: boolean | null
          two_factor_secret: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email_verified?: boolean | null
          id?: string
          phone_number?: string | null
          phone_verified?: boolean | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email_verified?: boolean | null
          id?: string
          phone_number?: string | null
          phone_verified?: boolean | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          updated_at?: string
          user_id?: string
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
      security_audit_log: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          ip_address: unknown | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown | null
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
      trading_positions: {
        Row: {
          created_at: string | null
          entry_price: number
          entry_timestamp: string
          high_price: number
          id: string
          lot_id: string
          owner_pubkey: string
          owner_secret: string
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
          owner_secret: string
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
          owner_secret?: string
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
      wallet_pools: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_balance_check: string | null
          pubkey: string
          secret_key: string
          session_id: string | null
          sol_balance: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_balance_check?: string | null
          pubkey: string
          secret_key: string
          session_id?: string | null
          sol_balance?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_balance_check?: string | null
          pubkey?: string
          secret_key?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_referral_discount: {
        Args: { user_id_param: string }
        Returns: Json
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
      decrypt_owner_secret: {
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
      encrypt_owner_secret: {
        Args: { input_secret: string }
        Returns: string
      }
      encrypt_user_secret: {
        Args: { input_secret: string }
        Returns: string
      }
      encrypt_wallet_secret: {
        Args: { input_secret: string }
        Returns: string
      }
      generate_referral_code: {
        Args: { user_id_param: string }
        Returns: string
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
      get_security_config: {
        Args: { config_key_param: string }
        Returns: Json
      }
      get_security_status: {
        Args: Record<PropertyKey, never>
        Returns: Json
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
      log_auth_failure: {
        Args: { client_info?: Json; failure_reason: string; user_email: string }
        Returns: undefined
      }
      mask_sensitive_data: {
        Args: { input_text: string }
        Returns: string
      }
      track_referral_signup: {
        Args: { new_user_id: string; referral_code_param: string }
        Returns: Json
      }
      validate_secret_access: {
        Args: { requesting_user_id: string; target_user_id: string }
        Returns: boolean
      }
      verify_access_password: {
        Args: { input_password: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
