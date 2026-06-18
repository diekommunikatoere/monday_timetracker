"use client";

import { Flex, Group, TextInput, Tooltip } from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import { Button, ButtonGroup, DatePicker, Icon, IconButton, Select } from "@/components";

/**
 * Descriptor for a single quick-adjust (+/-) button rendered under the duration
 * field by {@link TimeEntryFormFields}.
 *
 * @property label   - Button text (e.g. `"+15"` or `"-5"`); supplied by the config.
 * @property minutes - Signed delta in **minutes**; positive for add, negative for subtract. Passed to `quickAdjustments.onAdjust`.
 * @property variant  - Optional Mantine button variant; falls back to `"default"` in the renderer.
 */
export type TimeEntryQuickAdjust = {
	label: string;
	minutes: number;
	variant?: "default";
};

/**
 * Props for {@link TimeEntryFormFields}, a controlled, presentational form.
 *
 * The component holds **no state of its own** — every value and mutation
 * callback is provided by the parent, typically via {@link useTimeEntryForm}.
 * All time/duration strings are `"HH:MM"` 24-hour local-time; see
 * {@link TimeEntryFormValues} for the unit convention.
 *
 * @property date                 - Calendar day (`Date`) selected in the date picker.
 * @property onDateChange         - Fired with the new `Date` when the picker changes.
 * @property duration             - Tracked duration as an `"HH:MM"` string.
 * @property onDurationChange      - Fired with the new `"HH:MM"` string on duration edit.
 * @property startTime            - Entry start time as an `"HH:MM"` local-time string.
 * @property onStartTimeChange     - Fired with the new `"HH:MM"` string.
 * @property endTime              - Entry end time as an `"HH:MM"` local-time string.
 * @property onEndTimeChange       - Fired with the new `"HH:MM"` string.
 * @property comment               - Free-text note (empty string when none).
 * @property onCommentChange       - Fired with the new comment string.
 * @property isLocked              - When `true`, the end-time input is disabled and styled as a live-tracking field; toggled by {@link onLockToggle}.
 * @property onLockToggle          - Fired when the lock button next to the end time is clicked.
 * @property onStartTimeNowClick   - Optional; when provided, renders a "now" icon button that sets the start time.
 * @property onEndTimeNowClick     - Optional; when provided, renders a "now" icon button that sets the end time.
 * @property quickAdjustments      - Optional `{ add?, subtract?, onAdjust }` to render quick-add / quick-subtract button groups; buttons pass their {@link TimeEntryQuickAdjust.minutes} to `onAdjust`.
 * @property taskSelector         - Optional `{ show, node }`; when `show` is true, `node` is inserted into the form (e.g. a monday task picker).
 * @property roleSelector         - Optional `{ show, roles, selectedRoleId, onRoleChange, loading? }`; when `show` is true, renders a searchable role `Select`.
 */
export interface TimeEntryFormFieldsProps {
	// Core fields
	date: Date;
	onDateChange: (date: Date) => void;
	duration: string;
	onDurationChange: (duration: string) => void;
	startTime: string;
	onStartTimeChange: (time: string) => void;
	endTime: string;
	onEndTimeChange: (time: string) => void;
	comment: string;
	onCommentChange: (comment: string) => void;

	// Lock behavior
	isLocked: boolean;
	onLockToggle: () => void;

	// Optional conveniences
	onStartTimeNowClick?: () => void;
	onEndTimeNowClick?: () => void;
	quickAdjustments?: {
		add?: TimeEntryQuickAdjust[];
		subtract?: TimeEntryQuickAdjust[];
		onAdjust: (minutes: number) => void;
	};

	// Optional content insertion (e.g. Task selector)
	taskSelector?: {
		show: boolean;
		node: React.ReactNode;
	};
	// Role selection
	roleSelector?: {
		show: boolean;
		roles: { label: string; value: string }[];
		selectedRoleId: string;
		onRoleChange: (roleId: string) => void;
		loading?: boolean;
	};
}

/**
 * Presentational, fully-controlled form for editing a single time entry's
 * date, times, duration, task, role, and comment.
 *
 * Renders start/end `TimeInput`s (with optional "now" + lock affordances), a
 * duration `TimeInput` paired with a `DatePicker`, optional quick-adjust and
 * task/role selectors, and a free-text comment input. All copy is German.
 * Designed to be driven by {@link useTimeEntryForm}; see that hook for the
 * field-sync semantics.
 *
 * @param props - {@link TimeEntryFormFieldsProps}.
 * @returns A column `Flex` of Mantine inputs.
 */
export function TimeEntryFormFields(props: TimeEntryFormFieldsProps) {
	const { date, onDateChange, duration, onDurationChange, startTime, onStartTimeChange, endTime, onEndTimeChange, comment, onCommentChange, isLocked, onLockToggle, onStartTimeNowClick, onEndTimeNowClick, quickAdjustments, taskSelector, roleSelector } = props;

	return (
		<Flex direction="column" gap="md">
			{/* Start and End Time Inputs */}
			<Flex gap="md">
				<TimeInput
					label="Startzeit"
					value={startTime}
					onChange={(event) => onStartTimeChange(event.currentTarget.value)}
					leftSection={
						onStartTimeNowClick ? (
							<Tooltip label="Jetzt" position="top" withArrow>
								<IconButton variant="filled" colorVariant="tertiary" onClick={onStartTimeNowClick} aria-label="Startzeit auf jetzt setzen">
									<Icon name="today" size={16} color="var(--color--text-secondary)" />
								</IconButton>
							</Tooltip>
						) : undefined
					}
					style={{ flex: 1 }}
				/>
				<TimeInput
					label="Endzeit"
					value={endTime}
					onChange={(event) => onEndTimeChange(event.currentTarget.value)}
					style={{ flex: 1 }}
					disabled={isLocked}
					leftSection={
						onEndTimeNowClick ? (
							<Tooltip label="Jetzt" position="top" withArrow>
								<IconButton variant="filled" colorVariant="tertiary" onClick={onEndTimeNowClick} aria-label="Endzeit auf jetzt setzen">
									<Icon name="today" size={16} color="var(--color--text-secondary)" />
								</IconButton>
							</Tooltip>
						) : undefined
					}
					rightSection={
						<Tooltip label={isLocked ? "Endzeit fixiert (Live)" : "Endzeit fixieren"} position="top" withArrow>
							<IconButton variant="filled" colorVariant={isLocked ? "primary" : "tertiary"} onClick={onLockToggle} aria-label="Endzeit fixieren">
								<Icon name={isLocked ? "lock" : "unlock"} size={16} color={isLocked ? "var(--color--text-on-primary)" : "var(--color--text-secondary)"} />
							</IconButton>
						</Tooltip>
					}
					styles={{
						input: isLocked
							? {
									color: "var(--color--text-primary)",
									borderColor: "transparent",
									backgroundColor: "var(--color--background-disabled)",
									transition: "all 0.2s ease",
								}
							: {},
					}}
				/>
			</Flex>

			{/* Duration + Date */}
			<Flex gap="sm">
				<TimeInput label="Dauer" required value={duration} onChange={(event) => onDurationChange(event.currentTarget.value)} style={{ flex: 2 }} />
				<DatePicker
					label="Datum"
					placeholder="Datum auswählen"
					value={date}
					onChange={(newDate) => {
						if (newDate) onDateChange(new Date(newDate));
					}}
					valueFormat="DD.MM.YYYY"
					leftSection={<Icon name="calendar" size={16} color="var(--color--tertiary)" />}
					leftSectionPointerEvents="none"
					style={{ flex: 1 }}
				/>
			</Flex>

			{/* Quick adjustments */}
			{quickAdjustments?.onAdjust && (quickAdjustments.add?.length || quickAdjustments.subtract?.length) ? (
				<Flex gap="sm">
					<ButtonGroup flex={2}>
						{(quickAdjustments.add || []).map((a, idx) => (
							<Button
								key={`add-${a.label}-${idx}`}
								size="sm"
								variant={a.variant || "default"}
								style={{
									flex: 1,
									borderRadius: idx === 0 ? "5px 0 0 5px" : idx === (quickAdjustments.add?.length || 1) - 1 ? "0 5px 5px 0" : "0",
								}}
								onClick={() => quickAdjustments.onAdjust(a.minutes)}
							>
								{a.label}
							</Button>
						))}
					</ButtonGroup>
					<ButtonGroup flex={1}>
						{(quickAdjustments.subtract || []).map((a, idx) => (
							<Button
								key={`sub-${a.label}-${idx}`}
								size="sm"
								variant={a.variant || "default"}
								style={{
									flex: 1,
									borderRadius: idx === 0 ? "5px 0 0 5px" : "0 5px 5px 0",
								}}
								onClick={() => quickAdjustments.onAdjust(a.minutes)}
							>
								{a.label}
							</Button>
						))}
					</ButtonGroup>
				</Flex>
			) : null}

			{/* Task selector */}
			{taskSelector?.show ? taskSelector.node : null}

			{/* Role selector */}
			{roleSelector?.show && <Select label="Rolle" placeholder="Rolle auswählen..." data={roleSelector.roles} value={roleSelector.selectedRoleId} onChange={(val) => roleSelector.onRoleChange(val || "")} disabled={roleSelector.loading} searchable />}

			{/* Comment */}
			<TextInput label="Kommentar" value={comment} onChange={(event) => onCommentChange(event.currentTarget.value)} placeholder="Kommentar hinzufügen..." />
		</Flex>
	);
}
