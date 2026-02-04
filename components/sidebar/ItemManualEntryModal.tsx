// components/sidebar/ItemManualEntryModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Group, Flex, Text } from "@mantine/core";
import { Button, Modal, Select } from "@/components";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useItemTimeEntriesStore } from "@/stores/itemTimeEntriesStore";
import { useToast } from "@/components/ToastProvider";
import { TimeEntryFormFields } from "../shared/time-entries/TimeEntryFormFields";
import { useTimeEntryForm } from "../shared/hooks/useTimeEntryForm";
import { combineDateAndTime, durationToSeconds } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

export interface ItemManualEntryModalProps {
	show: boolean;
	onClose: () => void;
	itemId: string;
	boardId: string;
	itemName: string;
	boardName: string;
	roleId: string;
	roleName: string;
}

export function ItemManualEntryModal({ show, onClose, itemId, boardId, itemName, boardName, roleId, roleName }: ItemManualEntryModalProps) {
	const { values, isLocked, handlers } = useTimeEntryForm({ isEnabled: show, initialIsLocked: true });
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedRoleId, setSelectedRoleId] = useState<string>(roleId);

	// Fetch available roles
	const { data: roles = [], isLoading: loadingRoles } = useQuery({
		queryKey: ["roles"],
		queryFn: async () => {
			const { data, error } = await supabase.from("role").select("*");
			if (error) throw error;
			return data.map((role) => ({
				label: role.name,
				value: role.id,
			}));
		},
		staleTime: 30 * 60 * 1000,
	});

	// Synchronize selectedRoleId with prop if it changes
	useEffect(() => {
		if (roleId && (selectedRoleId === "00000000-0000-0000-0000-000000000000" || selectedRoleId === "")) {
			setSelectedRoleId(roleId);
		}
	}, [roleId]);

	const { refetch } = useItemTimeEntriesStore();
	const { showToast } = useToast();
	const { rawContext } = useMondayStore();
	const userProfile = useUserStore((state) => state.supabaseUser);

	const handleSave = async () => {
		if (!userProfile?.id) return;

		const durationSeconds = durationToSeconds(values.duration);
		if (durationSeconds === 0) {
			setError("Bitte geben Sie eine Dauer ein");
			return;
		}

		setIsSaving(true);
		setError(null);

		try {
			const context = rawContext || (await monday.get("context"));
			const startTimeIso = combineDateAndTime(values.date, values.startTime);
			const endTimeIso = combineDateAndTime(values.date, values.endTime);

			const response = await fetch("/api/time-entries/manual", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"monday-context": JSON.stringify(context),
				},
				body: JSON.stringify({
					userId: userProfile.id,
					taskName: itemName,
					comment: values.comment,
					boardId: boardId,
					boardName: boardName,
					itemId: itemId,
					itemName: itemName,
					roleId: selectedRoleId,
					duration: durationSeconds,
					date: values.date.toISOString(),
					startTime: startTimeIso,
					endTime: endTimeIso,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to save time entry");
			}

			showToast("Zeiteintrag gespeichert.", "positive", 2000);
			refetch();
			onClose();
		} catch (err: any) {
			setError(err.message || "Fehler beim Speichern");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Modal show={show} onClose={onClose} size={"lg"}>
			<Modal.Header>Zeit eintragen</Modal.Header>
			<Modal.Body>
				<Flex direction="column" gap="md">
					{error && <Text c="red">{error}</Text>}

					<Flex direction="column" gap="xs" p="xs" style={{ backgroundColor: "var(--color--background-secondary)", border: "1px solid var(--color--border-ui)", borderRadius: "4px" }}>
						<Text size="xs" c="var(--color--text-secondary)" fw={700} tt="uppercase">
							Aufgabe
						</Text>
						<Text size="sm" fw={600}>
							{boardName} › {itemName}
						</Text>
					</Flex>

					<TimeEntryFormFields
						date={values.date}
						onDateChange={handlers.setDate}
						duration={values.duration}
						onDurationChange={handlers.handleDurationChange}
						startTime={values.startTime}
						onStartTimeChange={handlers.handleStartTimeChange}
						endTime={values.endTime}
						onEndTimeChange={handlers.handleEndTimeChange}
						comment={values.comment}
						onCommentChange={handlers.setComment}
						isLocked={isLocked}
						onLockToggle={handlers.toggleLock}
						onStartTimeNowClick={handlers.handleStartTimeNow}
						onEndTimeNowClick={handlers.handleEndTimeNow}
						roleSelector={{
							show: true,
							roles: roles,
							selectedRoleId: selectedRoleId,
							onRoleChange: setSelectedRoleId,
							loading: loadingRoles,
						}}
						quickAdjustments={{
							add: [
								{ label: "+15m", minutes: 15 },
								{ label: "+30m", minutes: 30 },
								{ label: "+1h", minutes: 60 },
								{ label: "+2h", minutes: 120 },
							],
							subtract: [
								{ label: "-15m", minutes: -15 },
								{ label: "-1h", minutes: -60 },
							],
							onAdjust: handlers.adjustDuration,
						}}
					/>

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={onClose}>
							Abbrechen
						</Button>
						<Button onClick={handleSave} loading={isSaving}>
							Speichern
						</Button>
					</Group>
				</Flex>
			</Modal.Body>
		</Modal>
	);
}
