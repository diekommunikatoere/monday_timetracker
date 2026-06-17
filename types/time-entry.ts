// types/time-entry.ts
// The flattened, app-facing time-entry shape.

/**
 * A time entry as consumed by the UI and stores — a **flattened, display-ready**
 * view of a row in the `time_entry` table.
 *
 * This is intentionally *not* the raw DB row
 * (`Database["public"]["Tables"]["time_entry"]["Row"]` from `@/types/database`).
 * The DB row stores only foreign keys (`board_id`, `item_id`, `role_id`,
 * `user_id`); the human-readable `*_name` fields and the `parent_item_*` fields
 * below are resolved by JOINs in the read-side RPCs (e.g. `get_user_time_entries`,
 * `get_item_time_entries`) and flattened in `lib/database.ts` before reaching the
 * client. When writing back, strip these derived fields (see how `lib/database.ts`
 * destructures them out before an insert/update).
 *
 * @property id                - Time-entry UUID (`time_entry.id`).
 * @property user_id           - Internal `user_profiles.id` (Supabase UUID), not the monday user id.
 * @property user_name         - Display name, joined from `user_profiles`.
 * @property user_photo_urls   - monday avatar URLs at several sizes, joined from `user_profiles`.
 * @property task_name         - Free-text label for the work performed.
 * @property start_time        - ISO 8601 timestamp the entry started.
 * @property end_time          - ISO 8601 timestamp the entry ended.
 * @property duration          - Total tracked time, in **seconds**.
 * @property board_id          - monday board id, or null for unassigned entries.
 * @property board_name        - Display name, joined from `monday_board`.
 * @property item_id           - monday item (task) id, or null.
 * @property item_name         - Display name, joined from `monday_item` / `view_monday_tasks`.
 * @property parent_item_id    - Parent item id for subitems. Resolved via the `monday_item` JOIN; not a column on `time_entry`.
 * @property parent_item_name  - Parent item display name. Resolved via JOIN; not stored on `time_entry`.
 * @property role_id           - FK to `role` — the source of truth for the billing role.
 * @property role_name         - Display name, joined from `role`.
 * @property is_draft          - True while a timer is live / the entry is unfinalized.
 * @property comment           - Optional free-text note.
 * @property synced_to_monday  - True once the entry's totals have been pushed to monday columns.
 * @property created_at        - ISO 8601 creation timestamp.
 * @property updated_at        - ISO 8601 last-update timestamp.
 */
export interface TimeEntry {
	id: string;
	user_id: string; // Supabase auth user UUID
	user_name?: string;
	user_photo_urls?: {
		original: string | null;
		small: string | null;
		thumb: string | null;
		thumb_small: string | null;
		tiny: string | null;
	} | null;
	task_name: string;
	start_time: string; // ISO 8601 timestamp string
	end_time: string; // ISO 8601 timestamp string
	duration: number; // Duration in seconds
	board_id: string | null;
	board_name: string | null; // Human-readable board name
	item_id: string | null;
	item_name: string | null; // Human-readable task/item name
	parent_item_id?: string | null; // Resolved via monday_item JOIN (not stored on time_entry)
	parent_item_name?: string | null; // Resolved via monday_item JOIN (not stored on time_entry)
	role_id: string | null; // Foreign key to role table - primary source of truth
	role_name: string | null; // Human-readable role name
	is_draft: boolean;
	comment: string | null;
	synced_to_monday: boolean;
	created_at: string; // ISO 8601 timestamp string
	updated_at: string; // ISO 8601 timestamp string
}
