// app/sidebar/itemView/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Flex, Loader, Center, Text } from "@mantine/core";
import { useMondayStore } from "@/stores/mondayStore";
import { useItemTimeEntriesStore } from "@/stores/itemTimeEntriesStore";
import { ItemSidebarHeader } from "@/components/sidebar/ItemSidebarHeader";
import { ItemTimeEntriesView } from "@/components/sidebar/ItemTimeEntriesView";
import { ItemManualEntryModal } from "@/components/sidebar/ItemManualEntryModal";
import { Button, Icon } from "@/components";
import { TimeEntry } from "@/types/time-entry";
import EditTimeEntryModal from "@/components/dashboard/EditTimeEntryModal";
import { useUserStore } from "@/stores/userStore";

export default function ItemViewPage() {
	const userId = useUserStore((state) => state.supabaseUser?.id);
	const { timeEntries, loading, error, totalDuration, durationByRole, setItemContext, fetchItemTimeEntries, refetch } = useItemTimeEntriesStore();
	// Initialize Monday context (which sets up user authentication)
	const { initializeMondayContext, rawContext, isLoading: mondayLoading, error: mondayError } = useMondayStore();

	// Initialize Monday context on mount
	useEffect(() => {
		initializeMondayContext().catch((err) => console.error("Error initializing Monday context:", err));
		setItemContext(rawContext?.data?.itemId?.toString() || "", rawContext?.data?.boardId?.toString() || "");
	}, [initializeMondayContext]);

	// Fetch time entries when userId is available
	useEffect(() => {
		if (userId) {
			fetchItemTimeEntries();
		}
	}, [userId, fetchItemTimeEntries]);

	const [showManualModal, setShowManualModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);

	const [itemDetails, setItemDetails] = useState<any>(null);
	const [loadingDetails, setLoadingDetails] = useState(false);

	const itemId = rawContext?.data?.itemId?.toString();
	const boardId = rawContext?.data?.boardId?.toString();

	useEffect(() => {
		async function fetchDetails() {
			if (!itemId) return;
			setLoadingDetails(true);
			try {
				const response = await fetch(`/api/tasks/details?itemId=${itemId}`);
				if (response.ok) {
					const data = await response.json();
					setItemDetails(data);
				}
			} catch (err) {
				console.error("Error fetching item details:", err);
			} finally {
				setLoadingDetails(false);
			}
		}
		fetchDetails();
	}, [itemId]);

	const itemName = itemDetails?.name || "Aktuelle Aufgabe";
	const boardName = itemDetails?.boardName || "Projekt-Board";
	const effectiveBoardId = itemDetails?.parentBoardId || boardId;
	const roleId = "00000000-0000-0000-0000-000000000000"; // Placeholder
	const roleName = "Standard-Rolle";

	const handleEdit = (entry: TimeEntry) => {
		setEditingEntry(entry);
		setShowEditModal(true);
	};

	if (!itemId || !boardId || loadingDetails) {
		return (
			<Center h="100vh">
				<Flex direction="column" align="center" gap="md">
					<Loader size="lg" />
					<Text c="dimmed">Warte auf monday.com Kontext...</Text>
				</Flex>
			</Center>
		);
	}

	return (
		<Flex direction="column" style={{ height: "100vh", overflow: "hidden" }}>
			<ItemSidebarHeader itemName={itemName} totalDuration={totalDuration} />

			<Flex justify="flex-end" p="md" pb={0}>
				<Button leftSection={<Icon name="add" size={18} />} onClick={() => setShowManualModal(true)}>
					Zeit eintragen
				</Button>
			</Flex>

			<div style={{ flex: 1, overflow: "hidden" }}>
				<ItemTimeEntriesView timeEntries={timeEntries} itemId={itemId} boardId={effectiveBoardId || boardId} onEdit={handleEdit} />
			</div>

			<ItemManualEntryModal show={showManualModal} onClose={() => setShowManualModal(false)} itemId={itemId} boardId={effectiveBoardId || boardId} itemName={itemName} boardName={boardName} roleId={roleId} roleName={roleName} />

			{editingEntry && (
				<EditTimeEntryModal
					show={showEditModal}
					onClose={() => {
						setShowEditModal(false);
						setEditingEntry(null);
					}}
					entry={editingEntry}
					onSaved={() => refetch()}
				/>
			)}
		</Flex>
	);
}
