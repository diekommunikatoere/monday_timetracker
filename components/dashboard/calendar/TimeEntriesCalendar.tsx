// components/dashboard/calendar/TimeEntriesCalendar.tsx
"use client";

import { Divider, HoverCard, Text, UnstyledButton, Tooltip } from "@mantine/core";
import { DayViewProps, Schedule, ScheduleEventData, ScheduleLabelsOverride, ScheduleViewLevel } from "@mantine/schedule";
import { useCallback, useMemo, useState } from "react";

import { ErrorState, Icon, LoadingState } from "@/components";
import EditDraftEntryModal from "@/components/dashboard/EditDraftEntryModal";
import EditTimeEntryModal from "@/components/dashboard/EditTimeEntryModal";
import SaveTimerModal from "@/components/dashboard/SaveTimerModal";
import { ManualTimeEntryModal } from "@/components/features/timer/ManualTimeEntryModal";
import DeleteConfirmationDialog from "@/components/shared/time-entries/DeleteConfirmationDialog";
import { useToast } from "@/components/ToastProvider";
import { useTimeEntriesRefetch } from "@/contexts/TimeEntriesContext";
import { endOfDay, endOfISOWeek, formatDuration, formatTime, formatTimeString, secondsToDuration, startOfDay, startOfISOWeek } from "@/lib/utils";
import { useMondayStore } from "@/stores/mondayStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { TimeEntry } from "@/types/time-entry";

import { entryToScheduleEvent, filterEntriesForVisibleRange, getEntryFromEvent, rangeDurationSeconds, scheduleStringToIso } from "./calendar-utils";
import { CalendarEventContextMenu } from "./CalendarEventContextMenu";

import "dayjs/locale/de";

import styles from "@/components/styles/dashboard/calendar/TimeEntriesCalendar.module.css";

const GERMAN_LABELS: ScheduleLabelsOverride = {
	day: "Tag",
	week: "Woche",
	today: "Heute",
	next: "Weiter",
	previous: "Zurück",
	more: "Mehr",
	allDay: "Ganztägig",
	weekday: "Wochentag",
	timeSlot: "Zeitfenster",
	viewSelectLabel: "Ansicht wählen",
	noEvents: "Keine Zeiteinträge",
	moreLabel: (count) => `+${count} weitere`,
	switchToDayView: "Zur Tagesansicht wechseln",
	switchToWeekView: "Zur Wochenansicht wechseln",
};

/**
 * Week/day calendar of the current user's own time entries, backed by
 * `@mantine/schedule`.
 *
 * Renders `finalized`/`parked` entries from `useTimeEntriesStore().allEntries`
 * (the user's entire history — `running`/`paused` entries can't be placed on a
 * grid and are excluded, see {@link filterEntriesForVisibleRange}) as draggable,
 * resizable events. Click opens the same edit modals as the dashboard table
 * ({@link EditTimeEntryModal} / {@link EditDraftEntryModal}); right-click opens
 * {@link CalendarEventContextMenu}; dragging on an empty slot opens
 * {@link ManualTimeEntryModal} pre-filled with the selected range.
 *
 * Drag/resize is optimistic: the moved event's `start_time`/`end_time`/`duration`
 * are patched into the store immediately (the `Schedule` is controlled by
 * `events`, so without this the drag would visually snap back), then
 * `PATCH /api/time-entries/:id` is sent; any outcome (success, 409, other
 * failure) is followed by a `refetch()` so the store is the source of truth
 * rather than manually undoing the optimistic patch.
 *
 * @returns The `Schedule` (or a loading/error state), the event modals, the
 *          delete-confirmation dialog, and the context menu.
 */
export function TimeEntriesCalendar() {
	const { allEntries, loading, error, setTimeEntries } = useTimeEntriesStore();
	const { sessionToken } = useMondayStore();
	const refetch = useTimeEntriesRefetch();
	const { showToast } = useToast();

	const [date, setDate] = useState<Date>(new Date());
	const [view, setView] = useState<ScheduleViewLevel>("week");
	const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: TimeEntry } | null>(null);

	const [showSaveModal, setShowSaveModal] = useState(false);
	const [selectedDraft, setSelectedDraft] = useState<TimeEntry | null>(null);
	const [showEditModal, setShowEditModal] = useState(false);
	const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
	const [showEditDraftModal, setShowEditDraftModal] = useState(false);
	const [editingDraftEntry, setEditingDraftEntry] = useState<TimeEntry | null>(null);
	const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<(() => void) | null>(null);

	const [showManualEntryModal, setShowManualEntryModal] = useState(false);
	const [manualEntryInitialRange, setManualEntryInitialRange] = useState<{ date: Date; startTime: string; endTime: string } | null>(null);

	const events = useMemo(() => {
		const rangeStart = view === "week" ? startOfISOWeek(date) : startOfDay(date);
		const rangeEnd = view === "week" ? endOfISOWeek(date) : endOfDay(date);
		return filterEntriesForVisibleRange(allEntries, rangeStart, rangeEnd).map(entryToScheduleEvent);
	}, [allEntries, date, view]);

	// Edit dispatch mirrors TimeEntriesTable.handleEdit: finalized -> full modal,
	// parked -> reduced draft modal. paused/running never reach the calendar.
	const handleEdit = useCallback((entry: TimeEntry) => {
		if (entry.timer_state === "parked") {
			setEditingDraftEntry(entry);
			setShowEditDraftModal(true);
		} else {
			setEditingEntry(entry);
			setShowEditModal(true);
		}
	}, []);

	const handleEventClick = useCallback(
		(event: ScheduleEventData) => {
			handleEdit(getEntryFromEvent(event));
		},
		[handleEdit],
	);

	const handleEditSaved = useCallback(() => {
		refetch();
	}, [refetch]);

	const handleOpenSaveModal = useCallback((entry: TimeEntry) => {
		setSelectedDraft(entry);
		setShowSaveModal(true);
	}, []);

	const handleCloseSaveModal = useCallback(() => {
		setShowSaveModal(false);
		setSelectedDraft(null);
	}, []);

	const handleDeleteRequest = useCallback(
		(entry: TimeEntry) => {
			setPendingDelete(() => async () => {
				try {
					const response = await fetch(`/api/time-entries/${entry.id}`, {
						method: "DELETE",
						headers: { Authorization: `Bearer ${sessionToken}` },
					});

					if (!response.ok) {
						throw new Error("Failed to delete entry");
					}

					const { undoToken } = await response.json();

					showToast("Eintrag gelöscht", "warning", 5000, {
						actionLabel: "Rückgängig",
						onAction: () => handleUndo(entry.id, undoToken),
					});

					refetch();
				} catch (err) {
					console.error("Error deleting entry:", err);
					showToast("Fehler beim Löschen", "negative", 2000);
				}
			});
			setShowDeleteConfirmation(true);
		},
		[sessionToken, showToast, refetch],
	);

	const handleUndo = useCallback(
		async (entryId: string, undoToken: string) => {
			try {
				const response = await fetch(`/api/time-entries/${entryId}/undo`, {
					method: "POST",
					headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
					body: JSON.stringify({ undoToken }),
				});

				if (!response.ok) {
					throw new Error("Failed to undo delete");
				}

				showToast("Eintrag wiederhergestellt", "positive", 2000);
				refetch();
			} catch (err) {
				console.error("Error undoing delete:", err);
				showToast("Fehler beim Wiederherstellen", "negative", 2000);
			}
		},
		[sessionToken, showToast, refetch],
	);

	const handleConfirmDelete = useCallback(() => {
		if (pendingDelete) {
			pendingDelete();
			setPendingDelete(null);
		}
		setShowDeleteConfirmation(false);
	}, [pendingDelete]);

	const handleCancelDelete = useCallback(() => {
		setPendingDelete(null);
		setShowDeleteConfirmation(false);
	}, []);

	const handleMove = useCallback(
		async ({ eventId, newStart, newEnd, event }: { eventId: string | number; newStart: string; newEnd: string; event: ScheduleEventData }) => {
			const entry = getEntryFromEvent(event);
			const newStartIso = scheduleStringToIso(newStart);
			const newEndIso = scheduleStringToIso(newEnd);

			if (Number.isNaN(new Date(newStartIso).getTime()) || Number.isNaN(new Date(newEndIso).getTime())) return;
			if (new Date(newEndIso).getTime() <= new Date(newStartIso).getTime()) return;

			const newDuration = rangeDurationSeconds(newStartIso, newEndIso);

			setSavingIds((prev) => new Set(prev).add(String(eventId)));
			setTimeEntries(allEntries.map((e) => (e.id === entry.id ? { ...e, start_time: newStartIso, end_time: newEndIso, duration: newDuration } : e)));

			try {
				const body: Record<string, unknown> = {
					start_time: newStartIso,
					end_time: newEndIso,
					duration: newDuration,
					expectedUpdatedAt: entry.updated_at,
				};
				if (entry.timer_state === "finalized") {
					body.board_id = entry.board_id;
					body.item_id = entry.item_id;
					body.role_id = entry.role_id;
				}

				const response = await fetch(`/api/time-entries/${entry.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
					body: JSON.stringify(body),
				});

				if (!response.ok) {
					showToast(response.status === 409 ? "Konflikt erkannt" : "Fehler beim Aktualisieren", "negative", response.status === 409 ? 3000 : 2000);
					return;
				}

				showToast("Zeiteintrag aktualisiert", "positive", 2000);
			} catch (err) {
				console.error("Error updating time entry:", err);
				showToast("Fehler beim Aktualisieren", "negative", 2000);
			} finally {
				refetch();
				setSavingIds((prev) => {
					const next = new Set(prev);
					next.delete(String(eventId));
					return next;
				});
			}
		},
		[allEntries, setTimeEntries, sessionToken, showToast, refetch],
	);

	const handleSlotClick = useCallback(({ slotStart, slotEnd }: { slotStart: string; slotEnd: string; nativeEvent: React.MouseEvent<HTMLButtonElement> }) => {
		const start = new Date(scheduleStringToIso(slotStart));
		const end = new Date(scheduleStringToIso(slotEnd));
		setManualEntryInitialRange({ date: start, startTime: formatTimeString(start), endTime: formatTimeString(end) });
		setShowManualEntryModal(true);
	}, []);

	const handleSlotDrag = useCallback((rangeStart: string, rangeEnd: string) => {
		const start = new Date(scheduleStringToIso(rangeStart));
		const end = new Date(scheduleStringToIso(rangeEnd));
		setManualEntryInitialRange({ date: start, startTime: formatTimeString(start), endTime: formatTimeString(end) });
		setShowManualEntryModal(true);
	}, []);

	// Customizes only the inner event body (becomes the children of Mantine's own
	// `eventInner` box), so the resize-handle elements and `--event-bg` wiring
	// `renderEvent` would otherwise discard stay intact.
	const renderEventBody: NonNullable<DayViewProps["renderEventBody"]> = useCallback((event) => {
		const entry = getEntryFromEvent(event);
		return (
			<div className={styles.eventBody}>
				<div className={styles.eventNameContainer}>
					<Text className={styles.eventTaskName} fw={600} truncate data-timer-state={entry.timer_state}>
						{entry.task_name}
					</Text>
					<Text className={styles.eventParentItemName} truncate>
						{entry.parent_item_name}
					</Text>
				</div>
				{/* {entry.comment && (
					<Tooltip label={entry.comment} withArrow position="top">
						<UnstyledButton aria-label="Kommentar anzeigen" tabIndex={-1} style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "help" }} className={styles.eventComment}>
							<Icon name="comment" size={14} />
						</UnstyledButton>
					</Tooltip>
				)} */}
			</div>
		);
	}, []);

	// Decorates the default event button (via `props`) with the context menu and
	// state attribute; renders `props.children` untouched so Mantine's resize
	// handles and `eventInner` (see renderEventBody above) still mount.
	const renderEvent: NonNullable<DayViewProps["renderEvent"]> = useCallback((event, props) => {
		const entry = getEntryFromEvent(event);
		return (
			<HoverCard width={200} withArrow openDelay={100} closeDelay={200}>
				<HoverCard.Target>
					<UnstyledButton
						{...props}
						className={`${props.className} ${styles.event}`}
						data-timer-state={entry.timer_state}
						onContextMenu={(e: React.MouseEvent<HTMLButtonElement>) => {
							e.preventDefault();
							setContextMenu({ x: e.clientX, y: e.clientY, entry });
						}}
					>
						{props.children}
					</UnstyledButton>
				</HoverCard.Target>
				<HoverCard.Dropdown className={styles.cardDropdown}>
					<div className={styles.cardInnerContainer}>
						{/* Event name container */}
						<div className={styles.cardNameContainer}>
							{/* Task name */}
							<Text className={styles.cardTaskName} size="xs">
								{entry.task_name}
							</Text>
							{/* Job name  */}
							<Text className={styles.cardParentItemName} size="xs">
								{entry.parent_item_name}
							</Text>
						</div>
						<Divider my={8} />
						{/* Additional info container */}
						<div className={styles.cardInfoContainer}>
							{/* Board */}
							<Text className={styles.boardName} size="xs">
								<Icon name="dock_to_right" size={14} />
								{entry.board_name}
							</Text>
							{/* Role */}
							<Text className={styles.roleName} size="xs">
								<Icon name="assignment_ind" size={14} />
								{entry.role_name}
							</Text>
							{entry.comment && (
								<Text className={styles.comment} size="xs">
									<Icon name="comment" size={14} />
									{entry.comment}
								</Text>
							)}
							{/* Duration */}
							<Text className={styles.duration} size="xs">
								<Icon name="access_time" size={14} />
								{formatDuration(entry.duration)}
							</Text>
							{/* Start and endtime */}
							<Text className={styles.startEndTime} size="xs">
								<Icon name="access_time" size={14} />
								{formatTimeString(new Date(entry.start_time))} - {formatTimeString(new Date(entry.end_time))}
							</Text>
						</div>
					</div>
				</HoverCard.Dropdown>
			</HoverCard>
		);
	}, []);

	const canInteractWithEvent = useCallback((event: ScheduleEventData) => !savingIds.has(String(event.id)), [savingIds]);

	if (loading) {
		return <LoadingState />;
	}

	if (error) {
		return <ErrorState message={error} />;
	}

	return (
		<>
			<div className={styles.calendarContainer}>
				<Schedule
					view={view}
					onViewChange={setView}
					date={date}
					onDateChange={(d) => setDate(new Date(d))}
					events={events}
					locale="de"
					labels={GERMAN_LABELS}
					withEventsDragAndDrop
					withEventResize
					withDragSlotSelect
					canDragEvent={canInteractWithEvent}
					canResizeEvent={canInteractWithEvent}
					onEventDrop={handleMove}
					onEventResize={handleMove}
					onEventClick={handleEventClick}
					onTimeSlotClick={handleSlotClick}
					onSlotDragEnd={handleSlotDrag}
					className={styles.schedule}
					renderEventBody={renderEventBody}
					dayViewProps={{
						className: styles.dayView,
						classNames: { dayViewScrollArea: styles.viewScrollArea, header: styles.viewHeader },
						intervalMinutes: 15,
						startScrollTime: "07:00:00",
						withAllDaySlot: false,
						viewSelectProps: { views: ["week", "day"] },
						renderEvent,
					}}
					weekViewProps={{
						className: styles.weekView,
						classNames: { weekViewScrollArea: styles.viewScrollArea, header: styles.viewHeader },
						intervalMinutes: 15,
						startScrollTime: "07:00:00",
						withAllDaySlots: false,
						viewSelectProps: { views: ["week", "day"] },
						renderEvent,
					}}
				/>
			</div>

			<CalendarEventContextMenu entry={contextMenu?.entry ?? null} position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null} onClose={() => setContextMenu(null)} onEdit={handleEdit} onSaveDraft={handleOpenSaveModal} onDelete={handleDeleteRequest} />

			<SaveTimerModal
				show={showSaveModal}
				onClose={handleCloseSaveModal}
				initialData={
					selectedDraft
						? {
								entryId: selectedDraft.id,
								taskSelection: {
									boardId: selectedDraft.board_id || "",
									boardName: selectedDraft.board_name || "",
									itemId: selectedDraft.item_id || "",
									itemName: selectedDraft.item_name || "",
									parentItemId: selectedDraft.parent_item_id || undefined,
									parentItemName: selectedDraft.parent_item_name || undefined,
								},
								roleId: selectedDraft.role_id || "",
								roleName: selectedDraft.role_name || "",
								comment: selectedDraft.comment || "",
								date: selectedDraft.start_time ? new Date(selectedDraft.start_time) : new Date(),
								duration: secondsToDuration(selectedDraft.duration ?? 0),
								startTime: selectedDraft.start_time ? formatTimeString(new Date(selectedDraft.start_time)) : undefined,
								endTime: selectedDraft.end_time ? formatTimeString(new Date(selectedDraft.end_time)) : undefined,
							}
						: undefined
				}
			/>
			{editingEntry && <EditTimeEntryModal show={showEditModal} onClose={() => setShowEditModal(false)} entry={editingEntry} onSaved={handleEditSaved} />}
			{editingDraftEntry && <EditDraftEntryModal show={showEditDraftModal} onClose={() => setShowEditDraftModal(false)} entry={editingDraftEntry} onSaved={handleEditSaved} />}
			<DeleteConfirmationDialog show={showDeleteConfirmation} onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} count={1} />
			<ManualTimeEntryModal show={showManualEntryModal} onClose={() => setShowManualEntryModal(false)} initialRange={manualEntryInitialRange ?? undefined} />
		</>
	);
}

export default TimeEntriesCalendar;
