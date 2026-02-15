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
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          read_at?: string | null
          title?: string
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
          pubkey: string
          secret_key_encrypted: string
          sol_balance: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          pubkey: string
          secret_key_encrypted: string
          sol_balance?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          pubkey?: string
          secret_key_encrypted?: string
          sol_balance?: number | null
          updated_at?: string | null
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
      dev_wallet_reputation: {
        Row: {
          avg_dump_then_pump_pct: number | null
          avg_insider_pct: number | null
          avg_peak_mcap_usd: number | null
          avg_time_before_dump_mins: number | null
          avg_token_lifespan_mins: number | null
          created_at: string
          dev_pattern: string | null
          discord_servers: string[] | null
          downstream_wallets: string[] | null
          first_seen_at: string | null
          id: string
          is_legitimate_builder: boolean | null
          is_serial_spammer: boolean | null
          is_test_launcher: boolean | null
          known_aliases: string[] | null
          last_activity_at: string | null
          last_analyzed_at: string | null
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
          trust_level: string | null
          twitter_accounts: string[] | null
          typical_sell_percentage: number | null
          updated_at: string
          upstream_wallets: string[] | null
          wallet_address: string
        }
        Insert: {
          avg_dump_then_pump_pct?: number | null
          avg_insider_pct?: number | null
          avg_peak_mcap_usd?: number | null
          avg_time_before_dump_mins?: number | null
          avg_token_lifespan_mins?: number | null
          created_at?: string
          dev_pattern?: string | null
          discord_servers?: string[] | null
          downstream_wallets?: string[] | null
          first_seen_at?: string | null
          id?: string
          is_legitimate_builder?: boolean | null
          is_serial_spammer?: boolean | null
          is_test_launcher?: boolean | null
          known_aliases?: string[] | null
          last_activity_at?: string | null
          last_analyzed_at?: string | null
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
          trust_level?: string | null
          twitter_accounts?: string[] | null
          typical_sell_percentage?: number | null
          updated_at?: string
          upstream_wallets?: string[] | null
          wallet_address: string
        }
        Update: {
          avg_dump_then_pump_pct?: number | null
          avg_insider_pct?: number | null
          avg_peak_mcap_usd?: number | null
          avg_time_before_dump_mins?: number | null
          avg_token_lifespan_mins?: number | null
          created_at?: string
          dev_pattern?: string | null
          discord_servers?: string[] | null
          downstream_wallets?: string[] | null
          first_seen_at?: string | null
          id?: string
          is_legitimate_builder?: boolean | null
          is_serial_spammer?: boolean | null
          is_test_launcher?: boolean | null
          known_aliases?: string[] | null
          last_activity_at?: string | null
          last_analyzed_at?: string | null
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
          kyc_source: string | null
          kyc_verification_date: string | null
          kyc_verified: boolean | null
          last_analysis_at: string | null
          master_wallet_address: string
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
          kyc_source?: string | null
          kyc_verification_date?: string | null
          kyc_verified?: boolean | null
          last_analysis_at?: string | null
          master_wallet_address: string
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
          kyc_source?: string | null
          kyc_verification_date?: string | null
          kyc_verified?: boolean | null
          last_analysis_at?: string | null
          master_wallet_address?: string
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
        Relationships: []
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
          error_message: string | null
          id: string
          is_diamond_hand: boolean | null
          is_on_curve: boolean | null
          is_scalp_position: boolean | null
          is_test_position: boolean | null
          moon_bag_dump_threshold_pct: number | null
          moon_bag_enabled: boolean | null
          moon_bag_peak_change_pct: number | null
          moon_bag_peak_price_usd: number | null
          moon_bag_percent: number | null
          moon_bag_quantity_tokens: number | null
          original_quantity_tokens: number | null
          paired_position_id: string | null
          partial_sells: Json | null
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
          error_message?: string | null
          id?: string
          is_diamond_hand?: boolean | null
          is_on_curve?: boolean | null
          is_scalp_position?: boolean | null
          is_test_position?: boolean | null
          moon_bag_dump_threshold_pct?: number | null
          moon_bag_enabled?: boolean | null
          moon_bag_peak_change_pct?: number | null
          moon_bag_peak_price_usd?: number | null
          moon_bag_percent?: number | null
          moon_bag_quantity_tokens?: number | null
          original_quantity_tokens?: number | null
          paired_position_id?: string | null
          partial_sells?: Json | null
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
          error_message?: string | null
          id?: string
          is_diamond_hand?: boolean | null
          is_on_curve?: boolean | null
          is_scalp_position?: boolean | null
          is_test_position?: boolean | null
          moon_bag_dump_threshold_pct?: number | null
          moon_bag_enabled?: boolean | null
          moon_bag_peak_change_pct?: number | null
          moon_bag_peak_price_usd?: number | null
          moon_bag_percent?: number | null
          moon_bag_quantity_tokens?: number | null
          original_quantity_tokens?: number | null
          paired_position_id?: string | null
          partial_sells?: Json | null
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
          created_at: string
          error_message: string | null
          id: string
          market_cap: number | null
          name: string | null
          posted_at: string | null
          retry_count: number
          scheduled_at: string
          snapshot_slot: string | null
          status: string
          symbol: string | null
          token_mint: string
          trigger_comment: string | null
          trigger_source: string | null
          tweet_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          market_cap?: number | null
          name?: string | null
          posted_at?: string | null
          retry_count?: number
          scheduled_at: string
          snapshot_slot?: string | null
          status?: string
          symbol?: string | null
          token_mint: string
          trigger_comment?: string | null
          trigger_source?: string | null
          tweet_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          market_cap?: number | null
          name?: string | null
          posted_at?: string | null
          retry_count?: number
          scheduled_at?: string
          snapshot_slot?: string | null
          status?: string
          symbol?: string | null
          token_mint?: string
          trigger_comment?: string | null
          trigger_source?: string | null
          tweet_id?: string | null
        }
        Relationships: []
      }
      holders_intel_seen_tokens: {
        Row: {
          banner_url: string | null
          bonded_at: string | null
          first_seen_at: string
          health_grade: string | null
          image_uri: string | null
          last_seen_at: string
          market_cap_at_discovery: number | null
          minted_at: string | null
          name: string | null
          paid_composite_url: string | null
          snapshot_slot: string | null
          symbol: string | null
          times_posted: number | null
          times_seen: number
          token_mint: string
          was_posted: boolean
        }
        Insert: {
          banner_url?: string | null
          bonded_at?: string | null
          first_seen_at?: string
          health_grade?: string | null
          image_uri?: string | null
          last_seen_at?: string
          market_cap_at_discovery?: number | null
          minted_at?: string | null
          name?: string | null
          paid_composite_url?: string | null
          snapshot_slot?: string | null
          symbol?: string | null
          times_posted?: number | null
          times_seen?: number
          token_mint: string
          was_posted?: boolean
        }
        Update: {
          banner_url?: string | null
          bonded_at?: string | null
          first_seen_at?: string
          health_grade?: string | null
          image_uri?: string | null
          last_seen_at?: string
          market_cap_at_discovery?: number | null
          minted_at?: string | null
          name?: string | null
          paid_composite_url?: string | null
          snapshot_slot?: string | null
          symbol?: string | null
          times_posted?: number | null
          times_seen?: number
          token_mint?: string
          was_posted?: boolean
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
          template_name: string
          template_text: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          template_name: string
          template_text: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email_verified: boolean | null
          id: string
          oauth_full_name: string | null
          oauth_provider: string | null
          oauth_provider_id: string | null
          oauth_raw_data: Json | null
          oauth_username: string | null
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
          oauth_full_name?: string | null
          oauth_provider?: string | null
          oauth_provider_id?: string | null
          oauth_raw_data?: Json | null
          oauth_username?: string | null
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
          oauth_full_name?: string | null
          oauth_provider?: string | null
          oauth_provider_id?: string | null
          oauth_raw_data?: Json | null
          oauth_username?: string | null
          phone_number?: string | null
          phone_verified?: boolean | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          updated_at?: string
          user_id?: string
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
          current_price_sol: number | null
          current_price_usd: number | null
          entry_amount_sol: number
          entry_at: string | null
          entry_bonding_curve_pct: number | null
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
          lp_checked_at: string | null
          lp_liquidity_usd: number | null
          main_realized_pnl_sol: number | null
          main_sold_amount_sol: number | null
          main_sold_at: string | null
          main_sold_price_usd: number | null
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
          current_price_sol?: number | null
          current_price_usd?: number | null
          entry_amount_sol: number
          entry_at?: string | null
          entry_bonding_curve_pct?: number | null
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
          lp_checked_at?: string | null
          lp_liquidity_usd?: number | null
          main_realized_pnl_sol?: number | null
          main_sold_amount_sol?: number | null
          main_sold_at?: string | null
          main_sold_price_usd?: number | null
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
          current_price_sol?: number | null
          current_price_usd?: number | null
          entry_amount_sol?: number
          entry_at?: string | null
          entry_bonding_curve_pct?: number | null
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
          lp_checked_at?: string | null
          lp_liquidity_usd?: number | null
          main_realized_pnl_sol?: number | null
          main_sold_amount_sol?: number | null
          main_sold_at?: string | null
          main_sold_price_usd?: number | null
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
          buy_amount_sol: number | null
          buy_priority_fee_sol: number | null
          buy_slippage_bps: number | null
          buy_wallet_id: string | null
          candidates_found_count: number | null
          created_at: string
          daily_buy_cap: number | null
          daily_buys_today: number | null
          dead_holder_threshold: number | null
          dead_retention_hours: number | null
          dead_volume_threshold_sol: number | null
          fantasy_buy_amount_sol: number | null
          fantasy_buy_amount_usd: number | null
          fantasy_mode_enabled: boolean | null
          fantasy_moonbag_drawdown_limit: number | null
          fantasy_moonbag_percentage: number | null
          fantasy_moonbag_volume_check: boolean | null
          fantasy_sell_percentage: number | null
          fantasy_target_multiplier: number | null
          id: string
          is_enabled: boolean
          kill_switch_activated_at: string | null
          kill_switch_active: boolean | null
          kill_switch_reason: string | null
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
          min_rolling_win_rate: number | null
          min_rugcheck_score: number | null
          min_socials_count: number | null
          min_transactions: number
          min_volume_sol_5m: number
          min_volume_sol_fantasy: number | null
          min_watch_time_minutes: number | null
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
          soft_reject_resurrection_minutes: number | null
          tokens_processed_count: number | null
          updated_at: string
          win_rate_lookback_hours: number | null
        }
        Insert: {
          active_watchdog_count?: number | null
          auto_buy_enabled?: boolean | null
          auto_scalp_enabled?: boolean
          buy_amount_sol?: number | null
          buy_priority_fee_sol?: number | null
          buy_slippage_bps?: number | null
          buy_wallet_id?: string | null
          candidates_found_count?: number | null
          created_at?: string
          daily_buy_cap?: number | null
          daily_buys_today?: number | null
          dead_holder_threshold?: number | null
          dead_retention_hours?: number | null
          dead_volume_threshold_sol?: number | null
          fantasy_buy_amount_sol?: number | null
          fantasy_buy_amount_usd?: number | null
          fantasy_mode_enabled?: boolean | null
          fantasy_moonbag_drawdown_limit?: number | null
          fantasy_moonbag_percentage?: number | null
          fantasy_moonbag_volume_check?: boolean | null
          fantasy_sell_percentage?: number | null
          fantasy_target_multiplier?: number | null
          id?: string
          is_enabled?: boolean
          kill_switch_activated_at?: string | null
          kill_switch_active?: boolean | null
          kill_switch_reason?: string | null
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
          min_rolling_win_rate?: number | null
          min_rugcheck_score?: number | null
          min_socials_count?: number | null
          min_transactions?: number
          min_volume_sol_5m?: number
          min_volume_sol_fantasy?: number | null
          min_watch_time_minutes?: number | null
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
          soft_reject_resurrection_minutes?: number | null
          tokens_processed_count?: number | null
          updated_at?: string
          win_rate_lookback_hours?: number | null
        }
        Update: {
          active_watchdog_count?: number | null
          auto_buy_enabled?: boolean | null
          auto_scalp_enabled?: boolean
          buy_amount_sol?: number | null
          buy_priority_fee_sol?: number | null
          buy_slippage_bps?: number | null
          buy_wallet_id?: string | null
          candidates_found_count?: number | null
          created_at?: string
          daily_buy_cap?: number | null
          daily_buys_today?: number | null
          dead_holder_threshold?: number | null
          dead_retention_hours?: number | null
          dead_volume_threshold_sol?: number | null
          fantasy_buy_amount_sol?: number | null
          fantasy_buy_amount_usd?: number | null
          fantasy_mode_enabled?: boolean | null
          fantasy_moonbag_drawdown_limit?: number | null
          fantasy_moonbag_percentage?: number | null
          fantasy_moonbag_volume_check?: boolean | null
          fantasy_sell_percentage?: number | null
          fantasy_target_multiplier?: number | null
          id?: string
          is_enabled?: boolean
          kill_switch_activated_at?: string | null
          kill_switch_active?: boolean | null
          kill_switch_reason?: string | null
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
          min_rolling_win_rate?: number | null
          min_rugcheck_score?: number | null
          min_socials_count?: number | null
          min_transactions?: number
          min_volume_sol_5m?: number
          min_volume_sol_fantasy?: number | null
          min_watch_time_minutes?: number | null
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
          price_at_mint: number | null
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
          price_at_mint?: number | null
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
          price_at_mint?: number | null
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
          created_at: string
          creator_fetched_at: string | null
          creator_wallet: string | null
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
          token_mint: string
          updated_at: string
          validation_attempts: number | null
          validation_error: string | null
          validation_status: string | null
        }
        Insert: {
          created_at?: string
          creator_fetched_at?: string | null
          creator_wallet?: string | null
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
          token_mint: string
          updated_at?: string
          validation_attempts?: number | null
          validation_error?: string | null
          validation_status?: string | null
        }
        Update: {
          created_at?: string
          creator_fetched_at?: string | null
          creator_wallet?: string | null
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
          token_mint?: string
          updated_at?: string
          validation_attempts?: number | null
          validation_error?: string | null
          validation_status?: string | null
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
      token_lifecycle: {
        Row: {
          active_boosts: number | null
          created_at: string | null
          creator_wallet: string | null
          current_status: string | null
          developer_id: string | null
          dex_id: string | null
          discovery_source: string | null
          fdv: number | null
          first_seen_at: string
          highest_rank: number | null
          image_url: string | null
          last_fetched_at: string | null
          last_seen_at: string
          launchpad: string | null
          liquidity_usd: number | null
          lowest_rank: number | null
          market_cap: number | null
          metadata: Json | null
          name: string | null
          oracle_analyzed: boolean | null
          oracle_analyzed_at: string | null
          oracle_score: number | null
          pair_address: string | null
          pair_created_at: string | null
          price_usd: number | null
          symbol: string | null
          times_entered_top_200: number | null
          token_mint: string
          total_hours_in_top_200: number | null
          updated_at: string | null
          volume_24h: number | null
        }
        Insert: {
          active_boosts?: number | null
          created_at?: string | null
          creator_wallet?: string | null
          current_status?: string | null
          developer_id?: string | null
          dex_id?: string | null
          discovery_source?: string | null
          fdv?: number | null
          first_seen_at: string
          highest_rank?: number | null
          image_url?: string | null
          last_fetched_at?: string | null
          last_seen_at: string
          launchpad?: string | null
          liquidity_usd?: number | null
          lowest_rank?: number | null
          market_cap?: number | null
          metadata?: Json | null
          name?: string | null
          oracle_analyzed?: boolean | null
          oracle_analyzed_at?: string | null
          oracle_score?: number | null
          pair_address?: string | null
          pair_created_at?: string | null
          price_usd?: number | null
          symbol?: string | null
          times_entered_top_200?: number | null
          token_mint: string
          total_hours_in_top_200?: number | null
          updated_at?: string | null
          volume_24h?: number | null
        }
        Update: {
          active_boosts?: number | null
          created_at?: string | null
          creator_wallet?: string | null
          current_status?: string | null
          developer_id?: string | null
          dex_id?: string | null
          discovery_source?: string | null
          fdv?: number | null
          first_seen_at?: string
          highest_rank?: number | null
          image_url?: string | null
          last_fetched_at?: string | null
          last_seen_at?: string
          launchpad?: string | null
          liquidity_usd?: number | null
          lowest_rank?: number | null
          market_cap?: number | null
          metadata?: Json | null
          name?: string | null
          oracle_analyzed?: boolean | null
          oracle_analyzed_at?: string | null
          oracle_score?: number | null
          pair_address?: string | null
          pair_created_at?: string | null
          price_usd?: number | null
          symbol?: string | null
          times_entered_top_200?: number | null
          token_mint?: string
          total_hours_in_top_200?: number | null
          updated_at?: string | null
          volume_24h?: number | null
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
        ]
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
        ]
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
      token_socials_history: {
        Row: {
          captured_at: string
          discord: string | null
          id: string
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
          source?: string | null
          telegram?: string | null
          token_mint?: string
          twitter?: string | null
          website?: string | null
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
          pubkey: string
          secret_key: string
          secret_key_encrypted: string | null
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
          secret_key_encrypted?: string | null
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
          secret_key_encrypted?: string | null
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
          last_existence_check_at: string | null
          last_scraped_at: string | null
          linked_token_mints: string[] | null
          linked_wallets: string[] | null
          member_count: number | null
          moderator_usernames: string[] | null
          name: string | null
          raw_data: Json | null
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
          last_existence_check_at?: string | null
          last_scraped_at?: string | null
          linked_token_mints?: string[] | null
          linked_wallets?: string[] | null
          member_count?: number | null
          moderator_usernames?: string[] | null
          name?: string | null
          raw_data?: Json | null
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
          last_existence_check_at?: string | null
          last_scraped_at?: string | null
          linked_token_mints?: string[] | null
          linked_wallets?: string[] | null
          member_count?: number | null
          moderator_usernames?: string[] | null
          name?: string | null
          raw_data?: Json | null
          scrape_status?: string | null
          updated_at?: string | null
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
    }
    Functions: {
      apply_referral_discount: {
        Args: { user_id_param: string }
        Returns: Json
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
      increment_offspring_count: {
        Args: { amount?: number; whale_id: string }
        Returns: undefined
      }
      initialize_arb_balances_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
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
      process_active_blackbox_commands: { Args: never; Returns: undefined }
      refresh_mesh_summary: { Args: never; Returns: undefined }
      reset_daily_auto_buy_counts: { Args: never; Returns: undefined }
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
      app_role: "super_admin" | "admin" | "moderator" | "user"
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
      app_role: ["super_admin", "admin", "moderator", "user"],
    },
  },
} as const
