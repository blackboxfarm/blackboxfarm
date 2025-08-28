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
      decrypt_owner_secret: {
        Args: { encrypted_secret: string }
        Returns: string
      }
      encrypt_owner_secret: {
        Args: { input_secret: string }
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
