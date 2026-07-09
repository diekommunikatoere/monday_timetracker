// components/shared/time-entries/TimeEntryTableConfigs.tsx
import { Checkbox, Text } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { ColumnDef } from "@/components/ui/tables/types";
import { TaskCell } from "./columns/TaskCell";
import { RoleCell } from "./columns/RoleCell";
import { TimeRangeCell } from "./columns/TimeRangeCell";
import { formatDuration } from "@/lib/utils";
import { TimeEntryRowMenu } from "./TimeEntryRowMenu";

/**
 * Callback + context bundle passed into the column factories below.
 *
 * `currentUserId` is the Supabase `user_profiles.id` of the logged-in user;
 * it gates per-row checkbox visibility (only own rows get a checkbox) and the
 * header select-all's "own entries" count.
 *
 * @property onEdit        - Wired into {@link TaskCell} / {@link TimeEntryRowMenu} as the edit action.
 * @property onDelete      - Wired into the cell menus as the delete action.
 * @property onSaveDraft   - Wired into the cell menus as the save-draft action.
 * @property onSelectRow   - Row-checkbox callback `(id, selected)`; rendered only for rows owned by `currentUserId`.
 * @property onSelectAll   - Header-checkbox callback `(selected)`; checked against own-entry count.
 * @property selectedIds   - Currently-selected row ids.
 * @property currentUserId - Supabase user id used for ownership checks.
 */
interface ConfigOptions {
	onEdit?: (entry: TimeEntry) => void;
	onDelete?: (entry: TimeEntry) => void;
	onSaveDraft?: (entry: TimeEntry) => void;
	onSelectRow?: (id: string, selected: boolean) => void;
	onSelectAll?: (selected: boolean) => void;
	selectedIds?: string[];
	currentUserId?: string;
}

/**
 * Builds the column set for the **dashboard** time-entries view.
 *
 * Returns an ordered array of {@link ColumnDef} covering: a row-select checkbox
 * (own entries only), task (via {@link TaskCell}, which embeds a
 * {@link TimeEntryRowMenu}), board name, role (via {@link RoleCell}), comment,
 * date, start ("… Uhr"), end ("… Uhr"), and total duration formatted via
 * `formatDuration`. Date/time cells render `entry.start_time` /
 * `entry.end_time` — **ISO 8601 timestamp strings** — localized with `de-DE`.
 * The total uses `formatDuration(row.duration)` where `row.duration` is in
 * **seconds**.
 *
 * @param opts - {@link ConfigOptions}; destructured for `onEdit`, `onDelete`,
 *   `onSelectRow`, `onSelectAll`, `selectedIds`, `currentUserId`.
 * @returns Array of {@link ColumnDef} for {@link TimeEntryTable}.
 */
export const getDashboardColumns = ({ onEdit, onDelete, onSaveDraft, onSelectRow, onSelectAll, selectedIds = [], currentUserId }: ConfigOptions): ColumnDef<TimeEntry>[] => [
	{
		id: "checkbox",
		width: 40,
		minWidth: 40,
		header: ({ data }) => {
			const ownEntries = data.filter((entry) => entry.user_id === currentUserId);
			const total = ownEntries.length;
			const selected = selectedIds.length;
			return <Checkbox checked={total > 0 && selected === total} indeterminate={selected > 0 && selected < total} onChange={(e) => onSelectAll?.(e.currentTarget.checked)} aria-label="Alle auswählen" />;
		},
		cell: ({ row }) => {
			const isOwner = row.user_id === currentUserId;
			if (!isOwner) return null;
			return <Checkbox checked={selectedIds.includes(row.id)} onChange={(e) => onSelectRow?.(row.id, e.currentTarget.checked)} aria-label={`Auswählen ${row.id}`} />;
		},
	},
	{
		id: "task",
		header: "Aufgabe",
		minWidth: 280,
		cell: ({ row }) => <TaskCell entry={row} onEdit={onEdit} onDelete={onDelete} onSaveDraft={onSaveDraft} />,
	},
	{
		id: "board",
		header: "Board",
		minWidth: 150,
		cell: ({ row }) => (
			<Text truncate size="sm">
				{row.board_name || "-"}
			</Text>
		),
	},
	{
		id: "role",
		header: "Rolle",
		minWidth: 120,
		cell: ({ row }) => <RoleCell entry={row} />,
	},
	{
		id: "comment",
		header: "Kommentar",
		minWidth: 200,
		cell: ({ row }) => (
			<Text truncate size="sm">
				{row.comment || "-"}
			</Text>
		),
	},
	{
		id: "date",
		header: "Datum",
		minWidth: 100,
		cell: ({ row }) => (
			<Text size="sm">
				{new Date(row.start_time).toLocaleDateString("de-DE", {
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
				})}
			</Text>
		),
	},
	{
		id: "start",
		header: "Start",
		minWidth: 100,
		cell: ({ row }) => (
			<Text size="sm">
				{new Date(row.start_time).toLocaleTimeString("de-DE", {
					hour: "2-digit",
					minute: "2-digit",
				})}{" "}
				Uhr
			</Text>
		),
	},
	{
		id: "end",
		header: "Ende",
		minWidth: 100,
		cell: ({ row }) => (
			<Text size="sm">
				{new Date(row.end_time).toLocaleTimeString("de-DE", {
					hour: "2-digit",
					minute: "2-digit",
				})}{" "}
				Uhr
			</Text>
		),
	},
	{
		id: "total",
		header: "Dauer",
		minWidth: 100,
		cell: ({ row }) => <Text size="sm">{formatDuration(row.duration)}</Text>,
	},
];

/**
 * Builds the column set for the compact **sidebar** time-entries view.
 *
 * A trimmed column array: total duration (`formatDuration`, **seconds** input,
 * shown bold), role (via {@link RoleCell} with `showCommentIcon` so the
 * `entry.comment` is reachable via a tooltip), date (2-digit year), a
 * start–end time range (via {@link TimeRangeCell}), and an actions column
 * embedding a {@link TimeEntryRowMenu}. No select column here.
 *
 * @param opts - {@link ConfigOptions}; uses `onEdit`, `onDelete`, and `onSaveDraft`
 *   (all forwarded to the {@link TimeEntryRowMenu}). In practice `onSaveDraft` is
 *   inert here — the sidebar's `get_item_time_entries` RPC returns only finalized
 *   entries, so no draft rows (which is where the "Speichern" item shows) reach
 *   this view — but the callback is wired through for parity with `getDashboardColumns`.
 * @returns Array of {@link ColumnDef} for {@link TimeEntryTable}.
 */
export const getSidebarColumns = ({ onEdit, onDelete, onSaveDraft }: ConfigOptions): ColumnDef<TimeEntry>[] => [
	{
		id: "total",
		header: "Dauer",
		minWidth: 80,
		cell: ({ row }) => (
			<Text size="sm" fw={600}>
				{formatDuration(row.duration)}
			</Text>
		),
	},
	{
		id: "role",
		header: "Rolle",
		minWidth: 120,
		cell: ({ row }) => <RoleCell entry={row} showCommentIcon />,
	},
	{
		id: "date",
		header: "Datum",
		minWidth: 100,
		cell: ({ row }) => (
			<Text size="sm">
				{new Date(row.start_time).toLocaleDateString("de-DE", {
					day: "2-digit",
					month: "2-digit",
					year: "2-digit",
				})}
			</Text>
		),
	},
	{
		id: "range",
		header: "Zeitraum",
		minWidth: 100,
		cell: ({ row }) => <TimeRangeCell entry={row} />,
	},
	{
		id: "actions",
		header: "",
		width: 40,
		cell: ({ row }) => <TimeEntryRowMenu entry={row} onEdit={onEdit} onDelete={onDelete} onSaveDraft={onSaveDraft} />,
	},
];
