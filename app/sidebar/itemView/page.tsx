// app/sidebar/itemView/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Flex, Loader, Center, Text, Card, Group, Divider } from "@mantine/core";
import { useMondayStore } from "@/stores/mondayStore";
import { useItemTimeEntriesStore } from "@/stores/itemTimeEntriesStore";
import { ItemSidebarHeader } from "@/components/sidebar/ItemSidebarHeader";
import { ItemTimeEntriesView } from "@/components/sidebar/ItemTimeEntriesView";
import { ItemManualEntryModal } from "@/components/sidebar/ItemManualEntryModal";
import { TimeEntry } from "@/types/time-entry";
import EditTimeEntryModal from "@/components/dashboard/EditTimeEntryModal";
import { useUserStore } from "@/stores/userStore";
import { formatDuration } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

export default function ItemViewPage() {
	const userId = useUserStore((state) => state.supabaseUser?.id);
	const { timeEntries, loading, error, totalDuration, durationByRole, setItemContext, fetchItemTimeEntries, refetch } = useItemTimeEntriesStore();
	// Initialize Monday context (which sets up user authentication)
	const { initializeMondayContext, rawContext, isLoading: mondayLoading, error: mondayError } = useMondayStore();

	// Initialize Monday context on mount
	useEffect(() => {
		initializeMondayContext().catch((err) => console.error("Error initializing Monday context:", err));
	}, [initializeMondayContext]);

	// Update item context when rawContext is available
	useEffect(() => {
		if (rawContext?.data?.itemId && rawContext?.data?.boardId) {
			setItemContext(rawContext.data.itemId.toString(), rawContext.data.boardId.toString());
		}
	}, [rawContext, setItemContext]);

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
	const sessionToken = useMondayStore((state) => state.sessionToken);

	useEffect(() => {
		async function fetchDetails() {
			if (!itemId || !sessionToken) return;
			setLoadingDetails(true);
			try {
				const response = await fetch(`/api/tasks/details?itemId=${itemId}`, {
					headers: {
						Authorization: `Bearer ${sessionToken}`,
					},
				});
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
	}, [itemId, sessionToken]);

	const itemName = itemDetails?.name;
	const boardName = itemDetails?.parentBoardName;
	const effectiveBoardId = itemDetails?.parentBoardId || boardId;
	const parentItemId = itemDetails?.parentItemId;
	const parentItemName = itemDetails?.parentItemName;
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
			<ItemSidebarHeader onManualEntryClick={() => setShowManualModal(true)} />

			<Divider color="var(--color--border-layout)" mb={"sm"} mx={"sm"} />

			<Flex justify="space-between" align="center" px="16px">
				<Text fw={700} size="lg">
					{itemName}
				</Text>
				<Group gap="xs">
					<Text size="sm" c="dimmed">
						Gesamtzeit:
					</Text>
					<Text fw={700} size="md">
						{formatDuration(totalDuration)}
					</Text>
				</Group>
			</Flex>

			<div style={{ flex: 1, overflow: "hidden" }}>
				<ItemTimeEntriesView timeEntries={timeEntries} itemId={itemId} boardId={effectiveBoardId || boardId} onEdit={handleEdit} />
			</div>

			<ItemManualEntryModal show={showManualModal} onClose={() => setShowManualModal(false)} itemId={itemId} boardId={effectiveBoardId || boardId} itemName={itemName} boardName={boardName} parentItemId={parentItemId} parentItemName={parentItemName} roleId={roleId} roleName={roleName} />

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

			<Flex style={{ position: "fixed", bottom: 10, right: 10, fontFamily: "var(--font--mono)", fontSize: "12px", lineHeight: "1", backgroundColor: "var(--color--background-secondary)", padding: "4px 8px", borderRadius: "4px", borderWidth: "1px", borderColor: "var(--color--primary)" }} direction="column" align="flex-end" gap="xs">
				<span>v{APP_VERSION}</span>
			</Flex>
		</Flex>
	);
}
