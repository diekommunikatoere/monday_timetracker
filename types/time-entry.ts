export interface TimeEntry {
	id: string;
	user_id: string; // Supabase auth user UUID
	task_name: string;
	start_time: string; // ISO 8601 timestamp string
	end_time: string; // ISO 8601 timestamp string
	duration: number; // Duration in seconds
	board_id: string | null;
	board_name: string | null; // Human-readable board name
	item_id: string | null;
	item_name: string | null; // Human-readable task/item name
	parent_item_id: string | null;
	parent_item_name: string | null; // Human-readable parent item name
	role_id: string | null; // Foreign key to role table - primary source of truth
	role_name: string | null; // Human-readable role name
	is_draft: boolean;
	comment: string | null;
	synced_to_monday: boolean;
	created_at: string; // ISO 8601 timestamp string
	updated_at: string; // ISO 8601 timestamp string
}
