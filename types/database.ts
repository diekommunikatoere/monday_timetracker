export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      board_config: {
        Row: {
          board_id: string
          budget_column_id: string | null
          budget_column_type: string | null
          created_at: string
          currency_symbol: string | null
          id: string
          linked_board_id: string | null
          sync_budget_used: boolean | null
          sync_enabled: boolean | null
          sync_linked_items: boolean | null
          sync_on_finalize: boolean | null
          sync_remaining_budget: boolean | null
          sync_time_by_role: boolean | null
          sync_total_time: boolean | null
          updated_at: string
        }
        Insert: {
          board_id: string
          budget_column_id?: string | null
          budget_column_type?: string | null
          created_at?: string
          currency_symbol?: string | null
          id?: string
          linked_board_id?: string | null
          sync_budget_used?: boolean | null
          sync_enabled?: boolean | null
          sync_linked_items?: boolean | null
          sync_on_finalize?: boolean | null
          sync_remaining_budget?: boolean | null
          sync_time_by_role?: boolean | null
          sync_total_time?: boolean | null
          updated_at?: string
        }
        Update: {
          board_id?: string
          budget_column_id?: string | null
          budget_column_type?: string | null
          created_at?: string
          currency_symbol?: string | null
          id?: string
          linked_board_id?: string | null
          sync_budget_used?: boolean | null
          sync_enabled?: boolean | null
          sync_linked_items?: boolean | null
          sync_on_finalize?: boolean | null
          sync_remaining_budget?: boolean | null
          sync_time_by_role?: boolean | null
          sync_total_time?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      board_role_override: {
        Row: {
          board_id: string
          created_at: string
          hourly_rate: number
          id: string
          is_enabled: boolean | null
          role_id: string
          updated_at: string
        }
        Insert: {
          board_id: string
          created_at?: string
          hourly_rate: number
          id?: string
          is_enabled?: boolean | null
          role_id: string
          updated_at?: string
        }
        Update: {
          board_id?: string
          created_at?: string
          hourly_rate?: number
          id?: string
          is_enabled?: boolean | null
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_role_override_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "board_config"
            referencedColumns: ["board_id"]
          },
          {
            foreignKeyName: "board_role_override_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["id"]
          },
        ]
      }
      column_sync_config: {
        Row: {
          board_id: string
          column_id: string
          column_name: string
          column_type: string
          created_at: string
          id: string
          include_breakdown: boolean | null
          last_synced_at: string | null
          sync_enabled: boolean | null
          sync_purpose: string
          time_format: string | null
          updated_at: string
        }
        Insert: {
          board_id: string
          column_id: string
          column_name: string
          column_type: string
          created_at?: string
          id?: string
          include_breakdown?: boolean | null
          last_synced_at?: string | null
          sync_enabled?: boolean | null
          sync_purpose: string
          time_format?: string | null
          updated_at?: string
        }
        Update: {
          board_id?: string
          column_id?: string
          column_name?: string
          column_type?: string
          created_at?: string
          id?: string
          include_breakdown?: boolean | null
          last_synced_at?: string | null
          sync_enabled?: boolean | null
          sync_purpose?: string
          time_format?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "column_sync_config_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "board_config"
            referencedColumns: ["board_id"]
          },
        ]
      }
      monday_board: {
        Row: {
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      monday_column: {
        Row: {
          board_id: string
          id: string
          monday_column_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          board_id: string
          id?: string
          monday_column_id: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          board_id?: string
          id?: string
          monday_column_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monday_column_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "monday_board"
            referencedColumns: ["id"]
          },
        ]
      }
      monday_item: {
        Row: {
          board_id: string
          id: string
          name: string
          parent_item_id: string | null
          updated_at: string
        }
        Insert: {
          board_id: string
          id: string
          name: string
          parent_item_id?: string | null
          updated_at?: string
        }
        Update: {
          board_id?: string
          id?: string
          name?: string
          parent_item_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role: {
        Row: {
          color_hex: string | null
          created_at: string
          description: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          description?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          description?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          board_id: string
          column_id: string
          created_at: string
          error_message: string | null
          id: string
          item_id: string
          success: boolean
          sync_purpose: string
          time_entry_id: string | null
          triggered_by: string | null
          value_synced: string
        }
        Insert: {
          board_id: string
          column_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          item_id: string
          success: boolean
          sync_purpose: string
          time_entry_id?: string | null
          triggered_by?: string | null
          value_synced: string
        }
        Update: {
          board_id?: string
          column_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          item_id?: string
          success?: boolean
          sync_purpose?: string
          time_entry_id?: string | null
          triggered_by?: string | null
          value_synced?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_log_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry: {
        Row: {
          board_id: string | null
          comment: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          duration: number | null
          end_time: string | null
          id: string
          is_draft: boolean
          item_id: string | null
          parent_item_id: string | null
          role_id: string | null
          start_time: string
          synced_to_monday: boolean
          timer_session: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          board_id?: string | null
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          duration?: number | null
          end_time?: string | null
          id?: string
          is_draft?: boolean
          item_id?: string | null
          parent_item_id?: string | null
          role_id?: string | null
          start_time?: string
          synced_to_monday?: boolean
          timer_session?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          board_id?: string | null
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          duration?: number | null
          end_time?: string | null
          id?: string
          is_draft?: boolean
          item_id?: string | null
          parent_item_id?: string | null
          role_id?: string | null
          start_time?: string
          synced_to_monday?: boolean
          timer_session?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_time_entry_board"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "monday_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_time_entry_item"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "monday_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timer_segment: {
        Row: {
          created_at: string
          duration: number | null
          end_time: string | null
          id: string
          session_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          duration?: number | null
          end_time?: string | null
          id?: string
          session_id: string
          start_time?: string
        }
        Update: {
          created_at?: string
          duration?: number | null
          end_time?: string | null
          id?: string
          session_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "timer_segment_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "timer_session"
            referencedColumns: ["id"]
          },
        ]
      }
      timer_session: {
        Row: {
          created_at: string
          draft_id: string | null
          elapsed_time: number
          id: string
          is_paused: boolean
          start_time: string
          timer_segments: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_id?: string | null
          elapsed_time?: number
          id?: string
          is_paused?: boolean
          start_time?: string
          timer_segments?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          draft_id?: string | null
          elapsed_time?: number
          id?: string
          is_paused?: boolean
          start_time?: string
          timer_segments?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timer_session_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "time_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timer_session_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          monday_account_id: string
          monday_user_id: string
          name: string | null
          team_ids: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          monday_account_id: string
          monday_user_id: string
          name?: string | null
          team_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          monday_account_id?: string
          monday_user_id?: string
          name?: string | null
          team_ids?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_default_roles: { Args: never; Returns: undefined }
      calculate_remaining_budget: {
        Args: {
          p_board_id: string
          p_budget_amount: number
          p_item_ids: string[]
          p_user_id?: string
        }
        Returns: {
          budget_amount: number
          remaining_budget: number
          total_cost: number
          utilization_percent: number
        }[]
      }
      create_timer_session: { Args: { p_user_id: string }; Returns: Json }
      finalize_draft: {
        Args: {
          p_comment: string
          p_draft_id: string
          p_task_name: string
          p_user_id: string
        }
        Returns: Json
      }
      finalize_segment: { Args: { p_session_id: string }; Returns: Json }
      finalize_time_entry: {
        Args: {
          p_board_id?: string
          p_board_name?: string
          p_comment: string
          p_date?: string
          p_draft_id: string
          p_duration?: number
          p_item_id?: string
          p_item_name?: string
          p_parent_item_id?: string
          p_parent_item_name?: string
          p_role_id?: string
          p_task_name: string
          p_user_id: string
        }
        Returns: Json
      }
      get_active_timer_session: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          draft_id: string
          elapsed_time: number
          id: string
          is_paused: boolean
          start_time: string
          timer_segments: Json
          updated_at: string
          user_id: string
        }[]
      }
      get_current_elapsed_time: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_effective_hourly_rate: {
        Args: { p_board_id: string; p_role_id: string }
        Returns: number
      }
      get_item_time_by_role: {
        Args: { p_item_ids: string[]; p_user_id?: string }
        Returns: {
          entry_count: number
          role_id: string
          role_name: string
          total_seconds: number
        }[]
      }
      get_item_total_time: {
        Args: { p_item_ids: string[]; p_user_id?: string }
        Returns: number
      }
      get_timer_session_with_elapsed: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_user_time_entries: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: {
          board_id: string
          board_name: string
          comment: string
          created_at: string
          duration: number
          end_time: string
          id: string
          is_draft: boolean
          item_id: string
          item_name: string
          parent_item_id: string
          parent_item_name: string
          role_id: string
          start_time: string
          synced_to_monday: boolean
          task_name: string
          timer_session: Json
          updated_at: string
          user_id: string
        }[]
      }
      soft_reset_timer: {
        Args: {
          p_old_draft_id: string
          p_old_session_id: string
          p_user_id: string
        }
        Returns: Json
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

