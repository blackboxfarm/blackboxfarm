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
          created_at: string | null
          duration_hours: number
          end_time: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string
          payment_confirmed_at: string | null
          payment_status: string | null
          price_sol: number | null
          price_usd: number
          sol_price_at_order: number | null
          start_time: string
          title: string
          updated_at: string | null
        }
        Insert: {
          activation_key?: string | null
          advertiser_id?: string | null
          banner_ad_id?: string | null
          created_at?: string | null
          duration_hours: number
          end_time?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url: string
          payment_confirmed_at?: string | null
          payment_status?: string | null
          price_sol?: number | null
          price_usd: number
          sol_price_at_order?: number | null
          start_time: string
          title?: string
          updated_at?: string | null
        }
        Update: {
          activation_key?: string | null
          advertiser_id?: string | null
          banner_ad_id?: string | null
          created_at?: string | null
          duration_hours?: number
          end_time?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string
          payment_confirmed_at?: string | null
          payment_status?: string | null
          price_sol?: number | null
          price_usd?: number
          sol_price_at_order?: number | null
          start_time?: string
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
      developer_profiles: {
        Row: {
          average_token_lifespan_days: number | null
          avg_time_in_rankings_hours: number | null
          avg_token_rank_achieved: number | null
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
          reputation_score: number | null
          rug_pull_count: number | null
          slow_drain_count: number | null
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
          website_url: string | null
        }
        Insert: {
          average_token_lifespan_days?: number | null
          avg_time_in_rankings_hours?: number | null
          avg_token_rank_achieved?: number | null
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
          reputation_score?: number | null
          rug_pull_count?: number | null
          slow_drain_count?: number | null
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
          website_url?: string | null
        }
        Update: {
          average_token_lifespan_days?: number | null
          avg_time_in_rankings_hours?: number | null
          avg_token_rank_achieved?: number | null
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
          reputation_score?: number | null
          rug_pull_count?: number | null
          slow_drain_count?: number | null
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
          buy_amount_sol: number
          buy_price_max_usd: number
          buy_price_min_usd: number
          cancelled_at: string | null
          created_at: string
          executed_at: string | null
          executed_position_id: string | null
          expires_at: string
          id: string
          notification_email: string | null
          priority_fee_mode: string
          slippage_bps: number
          status: string
          target_multiplier: number
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          updated_at: string
          user_id: string | null
          wallet_id: string | null
        }
        Insert: {
          buy_amount_sol: number
          buy_price_max_usd: number
          buy_price_min_usd: number
          cancelled_at?: string | null
          created_at?: string
          executed_at?: string | null
          executed_position_id?: string | null
          expires_at: string
          id?: string
          notification_email?: string | null
          priority_fee_mode?: string
          slippage_bps?: number
          status?: string
          target_multiplier?: number
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          buy_amount_sol?: number
          buy_price_max_usd?: number
          buy_price_min_usd?: number
          cancelled_at?: string | null
          created_at?: string
          executed_at?: string | null
          executed_position_id?: string | null
          expires_at?: string
          id?: string
          notification_email?: string | null
          priority_fee_mode?: string
          slippage_bps?: number
          status?: string
          target_multiplier?: number
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          updated_at?: string
          user_id?: string | null
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
          buy_amount_usd: number | null
          buy_executed_at: string | null
          buy_price_usd: number | null
          buy_signature: string | null
          created_at: string | null
          dex_paid_status: Json | null
          emergency_sell_enabled: boolean | null
          emergency_sell_executed_at: string | null
          emergency_sell_price_usd: number | null
          emergency_sell_status: string | null
          error_message: string | null
          id: string
          profit_usd: number | null
          quantity_tokens: number | null
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
          sell_executed_at: string | null
          sell_price_usd: number | null
          sell_signature: string | null
          source: string | null
          source_channel_id: string | null
          status: string | null
          target_multiplier: number | null
          target_price_usd: number | null
          telegram_url: string | null
          token_image: string | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          twitter_url: string | null
          updated_at: string | null
          user_id: string | null
          wallet_id: string | null
          website_url: string | null
        }
        Insert: {
          buy_amount_usd?: number | null
          buy_executed_at?: string | null
          buy_price_usd?: number | null
          buy_signature?: string | null
          created_at?: string | null
          dex_paid_status?: Json | null
          emergency_sell_enabled?: boolean | null
          emergency_sell_executed_at?: string | null
          emergency_sell_price_usd?: number | null
          emergency_sell_status?: string | null
          error_message?: string | null
          id?: string
          profit_usd?: number | null
          quantity_tokens?: number | null
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
          sell_executed_at?: string | null
          sell_price_usd?: number | null
          sell_signature?: string | null
          source?: string | null
          source_channel_id?: string | null
          status?: string | null
          target_multiplier?: number | null
          target_price_usd?: number | null
          telegram_url?: string | null
          token_image?: string | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          wallet_id?: string | null
          website_url?: string | null
        }
        Update: {
          buy_amount_usd?: number | null
          buy_executed_at?: string | null
          buy_price_usd?: number | null
          buy_signature?: string | null
          created_at?: string | null
          dex_paid_status?: Json | null
          emergency_sell_enabled?: boolean | null
          emergency_sell_executed_at?: string | null
          emergency_sell_price_usd?: number | null
          emergency_sell_status?: string | null
          error_message?: string | null
          id?: string
          profit_usd?: number | null
          quantity_tokens?: number | null
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
          sell_executed_at?: string | null
          sell_price_usd?: number | null
          sell_signature?: string | null
          source?: string | null
          source_channel_id?: string | null
          status?: string | null
          target_multiplier?: number | null
          target_price_usd?: number | null
          telegram_url?: string | null
          token_image?: string | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          wallet_id?: string | null
          website_url?: string | null
        }
        Relationships: [
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
          id: string
          is_first_call: boolean | null
          market_cap_at_call: number | null
          message_id: number
          mint_age_minutes: number | null
          position_id: string | null
          price_at_call: number | null
          raw_message: string | null
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
          id?: string
          is_first_call?: boolean | null
          market_cap_at_call?: number | null
          message_id: number
          mint_age_minutes?: number | null
          position_id?: string | null
          price_at_call?: number | null
          raw_message?: string | null
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
          id?: string
          is_first_call?: boolean | null
          market_cap_at_call?: number | null
          message_id?: number
          mint_age_minutes?: number | null
          position_id?: string | null
          price_at_call?: number | null
          raw_message?: string | null
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
        ]
      }
      telegram_channel_config: {
        Row: {
          ape_keyword_enabled: boolean | null
          channel_id: string
          channel_name: string | null
          channel_type: string | null
          channel_username: string | null
          created_at: string
          email_notifications: boolean | null
          entity_access_hash: string | null
          fantasy_buy_amount_usd: number | null
          fantasy_mode: boolean | null
          flipit_buy_amount_sol: number | null
          flipit_buy_amount_usd: number | null
          flipit_enabled: boolean | null
          flipit_max_daily_positions: number | null
          flipit_sell_multiplier: number | null
          flipit_wallet_id: string | null
          id: string
          is_active: boolean | null
          large_buy_amount_usd: number | null
          large_sell_multiplier: number | null
          last_check_at: string | null
          last_message_id: number | null
          max_mint_age_minutes: number | null
          max_price_threshold: number | null
          min_price_threshold: number | null
          notification_email: string | null
          scan_window_minutes: number | null
          standard_buy_amount_usd: number | null
          standard_sell_multiplier: number | null
          total_buys_executed: number | null
          total_calls_detected: number | null
          trading_mode: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ape_keyword_enabled?: boolean | null
          channel_id: string
          channel_name?: string | null
          channel_type?: string | null
          channel_username?: string | null
          created_at?: string
          email_notifications?: boolean | null
          entity_access_hash?: string | null
          fantasy_buy_amount_usd?: number | null
          fantasy_mode?: boolean | null
          flipit_buy_amount_sol?: number | null
          flipit_buy_amount_usd?: number | null
          flipit_enabled?: boolean | null
          flipit_max_daily_positions?: number | null
          flipit_sell_multiplier?: number | null
          flipit_wallet_id?: string | null
          id?: string
          is_active?: boolean | null
          large_buy_amount_usd?: number | null
          large_sell_multiplier?: number | null
          last_check_at?: string | null
          last_message_id?: number | null
          max_mint_age_minutes?: number | null
          max_price_threshold?: number | null
          min_price_threshold?: number | null
          notification_email?: string | null
          scan_window_minutes?: number | null
          standard_buy_amount_usd?: number | null
          standard_sell_multiplier?: number | null
          total_buys_executed?: number | null
          total_calls_detected?: number | null
          trading_mode?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ape_keyword_enabled?: boolean | null
          channel_id?: string
          channel_name?: string | null
          channel_type?: string | null
          channel_username?: string | null
          created_at?: string
          email_notifications?: boolean | null
          entity_access_hash?: string | null
          fantasy_buy_amount_usd?: number | null
          fantasy_mode?: boolean | null
          flipit_buy_amount_sol?: number | null
          flipit_buy_amount_usd?: number | null
          flipit_enabled?: boolean | null
          flipit_max_daily_positions?: number | null
          flipit_sell_multiplier?: number | null
          flipit_wallet_id?: string | null
          id?: string
          is_active?: boolean | null
          large_buy_amount_usd?: number | null
          large_sell_multiplier?: number | null
          last_check_at?: string | null
          last_message_id?: number | null
          max_mint_age_minutes?: number | null
          max_price_threshold?: number | null
          min_price_threshold?: number | null
          notification_email?: string | null
          scan_window_minutes?: number | null
          standard_buy_amount_usd?: number | null
          standard_sell_multiplier?: number | null
          total_buys_executed?: number | null
          total_calls_detected?: number | null
          trading_mode?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      telegram_fantasy_positions: {
        Row: {
          call_id: string | null
          caller_display_name: string | null
          caller_username: string | null
          channel_config_id: string | null
          channel_name: string | null
          created_at: string
          current_price_usd: number | null
          entry_amount_usd: number
          entry_price_usd: number
          id: string
          interpretation_id: string | null
          realized_pnl_percent: number | null
          realized_pnl_usd: number | null
          rule_id: string | null
          sold_at: string | null
          sold_price_usd: number | null
          status: string
          stop_loss_pct: number | null
          stop_loss_triggered: boolean | null
          target_sell_multiplier: number | null
          token_amount: number | null
          token_mint: string
          token_name: string | null
          token_symbol: string | null
          unrealized_pnl_percent: number | null
          unrealized_pnl_usd: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          call_id?: string | null
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_name?: string | null
          created_at?: string
          current_price_usd?: number | null
          entry_amount_usd?: number
          entry_price_usd: number
          id?: string
          interpretation_id?: string | null
          realized_pnl_percent?: number | null
          realized_pnl_usd?: number | null
          rule_id?: string | null
          sold_at?: string | null
          sold_price_usd?: number | null
          status?: string
          stop_loss_pct?: number | null
          stop_loss_triggered?: boolean | null
          target_sell_multiplier?: number | null
          token_amount?: number | null
          token_mint: string
          token_name?: string | null
          token_symbol?: string | null
          unrealized_pnl_percent?: number | null
          unrealized_pnl_usd?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          call_id?: string | null
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_name?: string | null
          created_at?: string
          current_price_usd?: number | null
          entry_amount_usd?: number
          entry_price_usd?: number
          id?: string
          interpretation_id?: string | null
          realized_pnl_percent?: number | null
          realized_pnl_usd?: number | null
          rule_id?: string | null
          sold_at?: string | null
          sold_price_usd?: number | null
          status?: string
          stop_loss_pct?: number | null
          stop_loss_triggered?: boolean | null
          target_sell_multiplier?: number | null
          token_amount?: number | null
          token_mint?: string
          token_name?: string | null
          token_symbol?: string | null
          unrealized_pnl_percent?: number | null
          unrealized_pnl_usd?: number | null
          updated_at?: string
          user_id?: string | null
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
          caller_display_name: string | null
          caller_username: string | null
          channel_config_id: string | null
          channel_id: string
          confidence_score: number | null
          created_at: string
          decision: string
          decision_reasoning: string
          extracted_tokens: string[] | null
          id: string
          message_id: number
          price_at_detection: number | null
          raw_message: string | null
          token_mint: string | null
          token_symbol: string | null
        }
        Insert: {
          ai_interpretation: string
          ai_summary: string
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_id: string
          confidence_score?: number | null
          created_at?: string
          decision: string
          decision_reasoning: string
          extracted_tokens?: string[] | null
          id?: string
          message_id: number
          price_at_detection?: number | null
          raw_message?: string | null
          token_mint?: string | null
          token_symbol?: string | null
        }
        Update: {
          ai_interpretation?: string
          ai_summary?: string
          caller_display_name?: string | null
          caller_username?: string | null
          channel_config_id?: string | null
          channel_id?: string
          confidence_score?: number | null
          created_at?: string
          decision?: string
          decision_reasoning?: string
          extracted_tokens?: string[] | null
          id?: string
          message_id?: number
          price_at_detection?: number | null
          raw_message?: string | null
          token_mint?: string | null
          token_symbol?: string | null
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
      telegram_mtproto_session: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          phone_number: string | null
          session_string: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          phone_number?: string | null
          session_string: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          phone_number?: string | null
          session_string?: string
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
          account_status: string | null
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
          account_status?: string | null
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
          account_status?: string | null
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
      security_summary: {
        Row: {
          encrypted_keys: number | null
          encrypted_tokens: number | null
          table_name: string | null
          total_records: number | null
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
      get_security_config: { Args: { config_key_param: string }; Returns: Json }
      get_security_status: { Args: never; Returns: Json }
      get_super_admin_ids: {
        Args: never
        Returns: {
          user_id: string
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
      reset_daily_auto_buy_counts: { Args: never; Returns: undefined }
      schedule_arb_scanner: { Args: never; Returns: undefined }
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
