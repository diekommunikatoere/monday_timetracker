"use client";

import { Flex, Group, TextInput, Tooltip } from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import { Button, ButtonGroup, DatePicker, Icon, IconButton, Select } from "@/components";

export type TimeEntryQuickAdjust = {
	label: string;
	minutes: number;
	variant?: "default";
};

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
