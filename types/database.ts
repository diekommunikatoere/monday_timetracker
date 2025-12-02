export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Type for finalize_segment RPC result
export interface FinalizeSegmentResult {
	elapsed_time_ms: number;
	duration_added_ms: number;
}

// Type for get_current_elapsed_time RPC result
export interface GetCurrentElapsedTimeResult {
	elapsed_time_ms: number;
	server_time: string;
	is_paused?: boolean;
	stored_elapsed_time_ms?: number;
	error?: string;
}

// Type for get_timer_session_with_elapsed RPC result
export interface GetTimerSessionWithElapsedResult {
	session: {
		id: string;
		user_id: string;
		draft_id: string | null;
		start_time: string;
		elapsed_time: number;
		is_paused: boolean;
		created_at: string;
		time_entry: {
			id: string;
			comment: string | null;
		} | null;
	} | null;
	calculated_elapsed_time_ms: number;
	server_time: string;
}

// Type for get_item_time_by_role RPC result
export interface GetItemTimeByRoleResult {
	role_id: string;
	role_name: string;
	total_seconds: number;
	entry_count: number;
}

// Type for calculate_remaining_budget RPC result
export interface CalculateRemainingBudgetResult {
	budget_amount: number;
	total_cost: number;
	remaining_budget: number;
	utilization_percent: number;
}

// Sync purpose enum type
export type SyncPurpose = "total_time" | "time_by_role" | "remaining_budget";

// Time format enum type
export type TimeFormat = "hours" | "seconds" | "hh:mm";

// Column type for sync config
export type SyncColumnType = "numbers" | "text" | "long_text" | "time_tracking";

// Budget column type
export type BudgetColumnType = "numbers" | "formula" | "mirror";

export type Database = {
	graphql_public: {
		Tables: {
			[_ in never]: never;
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			graphql: {
				Args: {
					extensions?: Json;
					operationName?: string;
					query?: string;
					variables?: Json;
				};
				Returns: Json;
			};
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
	public: {
		Tables: {
			board_config: {
				Row: {
					id: string;
					board_id: string;
					board_name: string;
					sync_enabled: boolean;
					budget_column_id: string | null;
					budget_column_type: BudgetColumnType | null;
					currency_symbol: string;
					sync_on_finalize: boolean;
					sync_total_time: boolean;
					sync_time_by_role: boolean;
					sync_remaining_budget: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					board_id: string;
					board_name: string;
					sync_enabled?: boolean;
					budget_column_id?: string | null;
					budget_column_type?: BudgetColumnType | null;
					currency_symbol?: string;
					sync_on_finalize?: boolean;
					sync_total_time?: boolean;
					sync_time_by_role?: boolean;
					sync_remaining_budget?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					board_id?: string;
					board_name?: string;
					sync_enabled?: boolean;
					budget_column_id?: string | null;
					budget_column_type?: BudgetColumnType | null;
					currency_symbol?: string;
					sync_on_finalize?: boolean;
					sync_total_time?: boolean;
					sync_time_by_role?: boolean;
					sync_remaining_budget?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			board_role_override: {
				Row: {
					id: string;
					board_id: string;
					role_id: string;
					hourly_rate: number;
					is_enabled: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					board_id: string;
					role_id: string;
					hourly_rate: number;
					is_enabled?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					board_id?: string;
					role_id?: string;
					hourly_rate?: number;
					is_enabled?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "board_role_override_board_id_fkey";
						columns: ["board_id"];
						isOneToOne: false;
						referencedRelation: "board_config";
						referencedColumns: ["board_id"];
					},
					{
						foreignKeyName: "board_role_override_role_id_fkey";
						columns: ["role_id"];
						isOneToOne: false;
						referencedRelation: "role";
						referencedColumns: ["id"];
					}
				];
			};
			column_sync_config: {
				Row: {
					id: string;
					board_id: string;
					column_id: string;
					column_name: string;
					column_type: SyncColumnType;
					sync_purpose: SyncPurpose;
					time_format: TimeFormat;
					include_breakdown: boolean;
					sync_enabled: boolean;
					last_synced_at: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					board_id: string;
					column_id: string;
					column_name: string;
					column_type: SyncColumnType;
					sync_purpose: SyncPurpose;
					time_format?: TimeFormat;
					include_breakdown?: boolean;
					sync_enabled?: boolean;
					last_synced_at?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					board_id?: string;
					column_id?: string;
					column_name?: string;
					column_type?: SyncColumnType;
					sync_purpose?: SyncPurpose;
					time_format?: TimeFormat;
					include_breakdown?: boolean;
					sync_enabled?: boolean;
					last_synced_at?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "column_sync_config_board_id_fkey";
						columns: ["board_id"];
						isOneToOne: false;
						referencedRelation: "board_config";
						referencedColumns: ["board_id"];
					}
				];
			};
			role: {
				Row: {
					created_at: string;
					description: string | null;
					id: string;
					name: string;
					hourly_rate: number;
					is_active: boolean;
					color_hex: string | null;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					description?: string | null;
					id?: string;
					name: string;
					hourly_rate?: number;
					is_active?: boolean;
					color_hex?: string | null;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					description?: string | null;
					id?: string;
					name?: string;
					hourly_rate?: number;
					is_active?: boolean;
					color_hex?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			sync_log: {
				Row: {
					id: string;
					board_id: string;
					item_id: string;
					column_id: string;
					sync_purpose: SyncPurpose;
					value_synced: string;
					success: boolean;
					error_message: string | null;
					triggered_by: string | null;
					time_entry_id: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					board_id: string;
					item_id: string;
					column_id: string;
					sync_purpose: SyncPurpose;
					value_synced: string;
					success: boolean;
					error_message?: string | null;
					triggered_by?: string | null;
					time_entry_id?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					board_id?: string;
					item_id?: string;
					column_id?: string;
					sync_purpose?: SyncPurpose;
					value_synced?: string;
					success?: boolean;
					error_message?: string | null;
					triggered_by?: string | null;
					time_entry_id?: string | null;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "sync_log_triggered_by_fkey";
						columns: ["triggered_by"];
						isOneToOne: false;
						referencedRelation: "user_profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "sync_log_time_entry_id_fkey";
						columns: ["time_entry_id"];
						isOneToOne: false;
						referencedRelation: "time_entry";
						referencedColumns: ["id"];
					}
				];
			};
			time_entry: {
				Row: {
					board_id: string | null;
					comment: string | null;
					created_at: string;
					duration: number | null;
					end_time: string | null;
					id: string;
					is_draft: boolean;
					item_id: string | null;
					item_name: string | null;
					parent_item_id: string | null;
					parent_item_name: string | null;
					role: string | null;
					role_name: string | null;
					start_time: string | null;
					synced_to_monday: boolean;
					task_name: string | null;
					timer_session: Json | null;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					board_id?: string | null;
					comment?: string | null;
					created_at?: string;
					duration?: number | null;
					end_time?: string | null;
					id?: string;
					is_draft?: boolean;
					item_id?: string | null;
					item_name?: string | null;
					parent_item_id?: string | null;
					parent_item_name?: string | null;
					role?: string | null;
					role_name?: string | null;
					start_time?: string | null; // Optional - uses DEFAULT NOW()
					synced_to_monday?: boolean;
					task_name?: string | null;
					timer_session?: Json | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					board_id?: string | null;
					comment?: string | null;
					created_at?: string;
					duration?: number | null;
					end_time?: string | null;
					id?: string;
					is_draft?: boolean;
					item_id?: string | null;
					item_name?: string | null;
					parent_item_id?: string | null;
					parent_item_name?: string | null;
					role?: string | null;
					role_name?: string | null;
					start_time?: string | null;
					synced_to_monday?: boolean;
					task_name?: string | null;
					timer_session?: Json | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "time_entry_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "user_profiles";
						referencedColumns: ["id"];
					}
				];
			};
			timer_segment: {
				Row: {
					created_at: string;
					duration: number | null;
					end_time: string | null;
					id: string;
					session_id: string;
					start_time: string;
				};
				Insert: {
					created_at?: string;
					duration?: number | null;
					end_time?: string | null;
					id?: string;
					session_id: string;
					start_time?: string; // Optional - uses DEFAULT NOW()
				};
				Update: {
					created_at?: string;
					duration?: number | null;
					end_time?: string | null;
					id?: string;
					session_id?: string;
					start_time?: string;
				};
				Relationships: [
					{
						foreignKeyName: "timer_segment_session_id_fkey";
						columns: ["session_id"];
						isOneToOne: false;
						referencedRelation: "timer_session";
						referencedColumns: ["id"];
					}
				];
			};
			timer_session: {
				Row: {
					created_at: string;
					draft_id: string | null;
					elapsed_time: number;
					id: string;
					is_paused: boolean;
					start_time: string;
					timer_segments: Json | null;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					draft_id?: string | null;
					elapsed_time?: number;
					id?: string;
					is_paused?: boolean;
					start_time?: string; // Optional - uses DEFAULT NOW()
					timer_segments?: Json | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					draft_id?: string | null;
					elapsed_time?: number;
					id?: string;
					is_paused?: boolean;
					start_time?: string;
					timer_segments?: Json | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "timer_session_draft_id_fkey";
						columns: ["draft_id"];
						isOneToOne: false;
						referencedRelation: "time_entry";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "timer_session_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "user_profiles";
						referencedColumns: ["id"];
					}
				];
			};
			user_profiles: {
				Row: {
					created_at: string;
					email: string | null;
					id: string;
					monday_account_id: string;
					monday_user_id: string;
					name: string | null;
					team_ids: string[] | null;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					email?: string | null;
					id?: string;
					monday_account_id: string;
					monday_user_id: string;
					name?: string | null;
					team_ids?: string[] | null;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					email?: string | null;
					id?: string;
					monday_account_id?: string;
					monday_user_id?: string;
					name?: string | null;
					team_ids?: string[] | null;
					updated_at?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			add_default_roles: { Args: Record<string, never>; Returns: undefined };
			calculate_remaining_budget: {
				Args: {
					p_board_id: string;
					p_item_id: string;
					p_budget_amount: number;
					p_user_id?: string;
				};
				Returns: CalculateRemainingBudgetResult;
			};
			finalize_draft: {
				Args: {
					p_comment: string;
					p_draft_id: string;
					p_task_name: string;
					p_user_id: string;
				};
				Returns: Json;
			};
			finalize_segment: {
				Args: { p_session_id: string };
				Returns: FinalizeSegmentResult;
			};
			finalize_time_entry: {
				Args: {
					p_board_id?: string;
					p_comment: string;
					p_draft_id: string;
					p_item_id?: string;
					p_role?: string;
					p_task_name: string;
					p_user_id: string;
				};
				Returns: Json;
			};
			get_current_elapsed_time: {
				Args: { p_session_id: string };
				Returns: GetCurrentElapsedTimeResult;
			};
			get_effective_hourly_rate: {
				Args: {
					p_board_id: string;
					p_role_id: string;
				};
				Returns: number;
			};
			get_item_time_by_role: {
				Args: {
					p_item_id: string;
					p_user_id?: string;
				};
				Returns: GetItemTimeByRoleResult[];
			};
			get_item_total_time: {
				Args: {
					p_item_id: string;
					p_user_id?: string;
				};
				Returns: number;
			};
			get_timer_session_with_elapsed: {
				Args: { p_user_id: string };
				Returns: GetTimerSessionWithElapsedResult;
			};
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
	DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
			Row: infer R;
	  }
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
	? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
			Row: infer R;
	  }
		? R
		: never
	: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I;
	  }
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
	? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
			Insert: infer I;
	  }
		? I
		: never
	: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U;
	  }
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
	? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
			Update: infer U;
	  }
		? U
		: never
	: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
		: never = never
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
	? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
	: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never = never
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
	? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
	: never;

export const Constants = {
	graphql_public: {
		Enums: {},
	},
	public: {
		Enums: {},
	},
} as const;

// Convenience type aliases for the new tables
export type BoardConfig = Database["public"]["Tables"]["board_config"]["Row"];
export type BoardConfigInsert = Database["public"]["Tables"]["board_config"]["Insert"];
export type BoardConfigUpdate = Database["public"]["Tables"]["board_config"]["Update"];

export type BoardRoleOverride = Database["public"]["Tables"]["board_role_override"]["Row"];
export type BoardRoleOverrideInsert = Database["public"]["Tables"]["board_role_override"]["Insert"];
export type BoardRoleOverrideUpdate = Database["public"]["Tables"]["board_role_override"]["Update"];

export type ColumnSyncConfig = Database["public"]["Tables"]["column_sync_config"]["Row"];
export type ColumnSyncConfigInsert = Database["public"]["Tables"]["column_sync_config"]["Insert"];
export type ColumnSyncConfigUpdate = Database["public"]["Tables"]["column_sync_config"]["Update"];

export type SyncLog = Database["public"]["Tables"]["sync_log"]["Row"];
export type SyncLogInsert = Database["public"]["Tables"]["sync_log"]["Insert"];
export type SyncLogUpdate = Database["public"]["Tables"]["sync_log"]["Update"];

export type Role = Database["public"]["Tables"]["role"]["Row"];
export type RoleInsert = Database["public"]["Tables"]["role"]["Insert"];
export type RoleUpdate = Database["public"]["Tables"]["role"]["Update"];
