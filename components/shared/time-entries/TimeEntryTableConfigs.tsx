// components/shared/time-entries/TimeEntryTableConfigs.tsx
import { Checkbox, Text } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { ColumnDef } from "@/components/ui/tables/types";
import { TaskCell } from "./columns/TaskCell";
import { RoleCell } from "./columns/RoleCell";
import { TimeRangeCell } from "./columns/TimeRangeCell";
import { formatDuration } from "@/lib/utils";
import { TimeEntryRowMenu } from "./TimeEntryRowMenu";

interface ConfigOptions {
	onEdit?: (entry: TimeEntry) => void;
	onDelete?: (entry: TimeEntry) => void;
	onSelectRow?: (id: string, selected: boolean) => void;
	onSelectAll?: (selected: boolean) => void;
	selectedIds?: string[];
	currentUserId?: string;
}

export const getDashboardColumns = ({ onEdit, onDelete, onSelectRow, onSelectAll, selectedIds = [], currentUserId }: ConfigOptions): ColumnDef<TimeEntry>[] => [
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
		cell: ({ row }) => <TaskCell entry={row} onEdit={onEdit} onDelete={onDelete} />,
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
		header: "Gesamtzeit",
		minWidth: 100,
		cell: ({ row }) => <Text size="sm">{formatDuration(row.duration)}</Text>,
	},
];

export const getSidebarColumns = ({ onEdit, onDelete }: ConfigOptions): ColumnDef<TimeEntry>[] => [
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
		cell: ({ row }) => <TimeEntryRowMenu entry={row} onEdit={onEdit} onDelete={onDelete} />,
	},
];
