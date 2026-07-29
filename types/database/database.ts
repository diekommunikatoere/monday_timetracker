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
      board_config: {
        Row: {
          board_id: string
          created_at: string
          display_enabled: boolean
          id: string
          settings: Json
          sort_order: number
          sync_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          board_id: string
          created_at?: string
          display_enabled?: boolean
          id?: string
          settings?: Json
          sort_order?: number
          sync_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          board_id?: string
          created_at?: string
          display_enabled?: boolean
          id?: string
          settings?: Json
          sort_order?: number
          sync_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_config_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: true
            referencedRelation: "monday_board"
            referencedColumns: ["id"]
          },
        ]
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
          sync_purpose?: string
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
          board_kind: string | null
          id: string
          name: string
          state: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          board_kind?: string | null
          id: string
          name: string
          state?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          board_kind?: string | null
          id?: string
          name?: string
          state?: string | null
          updated_at?: string
          workspace_id?: string | null
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
      monday_group: {
        Row: {
          board_id: string
          color: string | null
          id: string
          position: string | null
          sync_enabled: boolean
          title: string
          updated_at: string
        }
        Insert: {
          board_id: string
          color?: string | null
          id: string
          position?: string | null
          sync_enabled?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          board_id?: string
          color?: string | null
          id?: string
          position?: string | null
          sync_enabled?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monday_group_board_id_fkey"
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
          deleted_at: string | null
          group_id: string | null
          id: string
          is_active: boolean
          name: string
          parent_item_id: string | null
          updated_at: string
        }
        Insert: {
          board_id: string
          deleted_at?: string | null
          group_id?: string | null
          id: string
          is_active?: boolean
          name: string
          parent_item_id?: string | null
          updated_at?: string
        }
        Update: {
          board_id?: string
          deleted_at?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_item_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      monday_webhook: {
        Row: {
          board_id: string
          created_at: string
          event: string
          id: string
          is_active: boolean
          url: string
        }
        Insert: {
          board_id: string
          created_at?: string
          event: string
          id: string
          is_active?: boolean
          url: string
        }
        Update: {
          board_id?: string
          created_at?: string
          event?: string
          id?: string
          is_active?: boolean
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "monday_webhook_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "monday_board"
            referencedColumns: ["id"]
          },
        ]
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
          item_id: string | null
          role_id: string | null
          start_time: string
          synced_to_monday: boolean
          timer_state: Database["public"]["Enums"]["timer_state"]
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
          item_id?: string | null
          role_id?: string | null
          start_time?: string
          synced_to_monday?: boolean
          timer_state: Database["public"]["Enums"]["timer_state"]
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
          item_id?: string | null
          role_id?: string | null
          start_time?: string
          synced_to_monday?: boolean
          timer_state?: Database["public"]["Enums"]["timer_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "monday_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "monday_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "view_monday_tasks"
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
          end_time: string | null
          entry_id: string
          id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          entry_id: string
          id?: string
          start_time?: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          entry_id?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "timer_segment_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "time_entry"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_admin: boolean | null
          monday_account_id: string
          monday_user_id: string
          name: string | null
          photo_urls: Json | null
          team_ids: string[] | null
          theme: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_admin?: boolean | null
          monday_account_id: string
          monday_user_id: string
          name?: string | null
          photo_urls?: Json | null
          team_ids?: string[] | null
          theme?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_admin?: boolean | null
          monday_account_id?: string
          monday_user_id?: string
          name?: string | null
          photo_urls?: Json | null
          team_ids?: string[] | null
          theme?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      view_monday_tasks: {
        Row: {
          board_id: string | null
          group_id: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          parent_item_id: string | null
          parent_item_name: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_default_roles: { Args: never; Returns: undefined }
      calculate_remaining_budget: {
        Args: {
          p_board_id: string
          p_budget_amount: number
          p_end_date?: string
          p_item_ids: string[]
          p_start_date?: string
          p_user_id?: string
        }
        Returns: {
          budget_amount: number
          remaining_budget: number
          total_cost: number
          utilization_percent: number
        }[]
      }
      get_active_timers: {
        Args: { p_user_id: string }
        Returns: {
          board_id: string
          comment: string
          created_at: string
          elapsed_seconds: number
          id: string
          item_id: string
          role_id: string
          start_time: string
          timer_state: Database["public"]["Enums"]["timer_state"]
          updated_at: string
          user_id: string
        }[]
      }
      get_effective_hourly_rate: {
        Args: { p_board_id: string; p_role_id: string }
        Returns: number
      }
      get_item_time_by_role: {
        Args: {
          p_end_date?: string
          p_item_ids: string[]
          p_start_date?: string
          p_user_id?: string
        }
        Returns: {
          entry_count: number
          role_id: string
          role_name: string
          total_seconds: number
        }[]
      }
      get_item_time_entries: {
        Args: {
          p_board_id: string
          p_end_date?: string
          p_item_id: string
          p_start_date?: string
        }
        Returns: {
          board_id: string
          board_name: string
          comment: string
          created_at: string
          duration: number
          end_time: string
          id: string
          item_id: string
          item_name: string
          parent_item_id: string
          parent_item_name: string
          role_id: string
          role_name: string
          start_time: string
          synced_to_monday: boolean
          task_name: string
          timer_state: Database["public"]["Enums"]["timer_state"]
          updated_at: string
          user_id: string
          user_name: string
          user_photo_urls: Json
        }[]
      }
      get_item_total_time: {
        Args: {
          p_end_date?: string
          p_item_ids: string[]
          p_start_date?: string
          p_user_id?: string
        }
        Returns: number
      }
      get_items_time_by_role: {
        Args: {
          p_end_date?: string
          p_item_ids: string[]
          p_start_date?: string
          p_user_id?: string
        }
        Returns: {
          entry_count: number
          item_id: string
          role_id: string
          role_name: string
          total_cost: number
          total_seconds: number
        }[]
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
          item_id: string
          item_name: string
          parent_item_id: string
          parent_item_name: string
          role_id: string
          role_name: string
          start_time: string
          synced_to_monday: boolean
          task_name: string
          timer_state: Database["public"]["Enums"]["timer_state"]
          total_count: number
          updated_at: string
          user_id: string
          user_name: string
          user_photo_urls: Json
        }[]
      }
      get_users_time_by_role: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          entry_count: number
          hourly_rate: number
          role_color_hex: string
          role_id: string
          role_name: string
          total_seconds: number
          user_id: string
        }[]
      }
      purge_trashed_monday_items: {
        Args: { p_days?: number }
        Returns: {
          purged_items: number
          purged_time_entries: number
        }[]
      }
      timer_finalize:
        | {
            Args: {
              p_board_id?: string
              p_board_name?: string
              p_comment?: string
              p_duration?: number
              p_end_time?: string
              p_entry_id: string
              p_item_id?: string
              p_item_name?: string
              p_parent_item_id?: string
              p_parent_item_name?: string
              p_role_id?: string
              p_start_time?: string
              p_task_name?: string
              p_user_id: string
            }
            Returns: {
              board_id: string | null
              comment: string | null
              created_at: string
              deleted_at: string | null
              deleted_by: string | null
              duration: number | null
              end_time: string | null
              id: string
              item_id: string | null
              role_id: string | null
              start_time: string
              synced_to_monday: boolean
              timer_state: Database["public"]["Enums"]["timer_state"]
              updated_at: string
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "time_entry"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_board_id?: string
              p_board_name?: string
              p_comment?: string
              p_duration?: number
              p_end_time?: string
              p_entry_id: string
              p_item_id?: string
              p_item_name?: string
              p_keep_draft?: boolean
              p_parent_item_id?: string
              p_parent_item_name?: string
              p_role_id?: string
              p_start_time?: string
              p_task_name?: string
              p_user_id: string
            }
            Returns: {
              board_id: string | null
              comment: string | null
              created_at: string
              deleted_at: string | null
              deleted_by: string | null
              duration: number | null
              end_time: string | null
              id: string
              item_id: string | null
              role_id: string | null
              start_time: string
              synced_to_monday: boolean
              timer_state: Database["public"]["Enums"]["timer_state"]
              updated_at: string
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "time_entry"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      timer_park: {
        Args: { p_comment?: string; p_entry_id: string; p_user_id: string }
        Returns: {
          board_id: string | null
          comment: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          duration: number | null
          end_time: string | null
          id: string
          item_id: string | null
          role_id: string | null
          start_time: string
          synced_to_monday: boolean
          timer_state: Database["public"]["Enums"]["timer_state"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      timer_pause: {
        Args: { p_entry_id: string; p_user_id: string }
        Returns: {
          board_id: string | null
          comment: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          duration: number | null
          end_time: string | null
          id: string
          item_id: string | null
          role_id: string | null
          start_time: string
          synced_to_monday: boolean
          timer_state: Database["public"]["Enums"]["timer_state"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      timer_reset: {
        Args: { p_entry_id: string; p_user_id: string }
        Returns: undefined
      }
      timer_resume: {
        Args: { p_entry_id: string; p_user_id: string }
        Returns: {
          board_id: string | null
          comment: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          duration: number | null
          end_time: string | null
          id: string
          item_id: string | null
          role_id: string | null
          start_time: string
          synced_to_monday: boolean
          timer_state: Database["public"]["Enums"]["timer_state"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      timer_start: {
        Args: {
          p_board_id?: string
          p_item_id?: string
          p_role_id?: string
          p_user_id: string
        }
        Returns: {
          board_id: string | null
          comment: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          duration: number | null
          end_time: string | null
          id: string
          item_id: string | null
          role_id: string | null
          start_time: string
          synced_to_monday: boolean
          timer_state: Database["public"]["Enums"]["timer_state"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_board_config: {
        Args: {
          p_board_id: string
          p_display_enabled?: boolean
          p_patch?: Json
          p_sort_order?: number
          p_sync_enabled?: boolean
        }
        Returns: {
          board_id: string
          created_at: string
          display_enabled: boolean
          id: string
          settings: Json
          sort_order: number
          sync_enabled: boolean | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "board_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      timer_state: "running" | "paused" | "parked" | "finalized"
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
      timer_state: ["running", "paused", "parked", "finalized"],
    },
  },
} as const
