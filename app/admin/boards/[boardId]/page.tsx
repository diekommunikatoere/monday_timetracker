"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Tabs, TextInput, NumberInput, Switch, Select, Modal, Loader, Badge, Table, Group, Stack, Text, Flex, Breadcrumbs, Anchor, Progress, Card } from "@mantine/core";
import { Button, IconButton } from "@/components";
import { notifications } from "@mantine/notifications";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import type { BoardConfig, Role, BoardRoleOverride, ColumnSyncConfig, SyncPurpose, TimeFormat, SyncColumnType, MondayGroup } from "@/types/database";
import { isTimePurpose } from "@/lib/monday/utils";

import "@/public/css/components/AdminPage.css";

// Icons
const IconPlus = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
	</svg>
);

const IconEdit = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const IconTrash = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M4 4l1 9a1 1 0 001 1h4a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const IconArrowLeft = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const IconSync = () => (
	<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path d="M2 8a6 6 0 0110.89-3.477M14 8a6 6 0 01-10.89 3.477" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		<path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

interface MondayColumn {
	id: string;
	title: string;
	type: string;
	isCompatible: boolean;
	compatiblePurposes: SyncPurpose[];
}

interface RoleOverrideWithRole extends BoardRoleOverride {
	role: Role;
}

interface SyncStats {
	last24Hours: {
		successCount: number;
		failureCount: number;
		totalSyncs: number;
	};
	itemsWithTimeEntries: number;
}

interface SyncResult {
	itemId: string;
	success: boolean;
	columnsUpdated: number;
	errors: string[];
}

export default function BoardConfigPage() {
	const params = useParams();
	const router = useRouter();
	const boardId = params.boardId as string;

	const [activeTab, setActiveTab] = useState<string | null>("columns");
	const [boardConfig, setBoardConfig] = useState<BoardConfig | null>(null);
	const [columns, setColumns] = useState<ColumnSyncConfig[]>([]);
	const [roleOverrides, setRoleOverrides] = useState<RoleOverrideWithRole[]>([]);
	const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
	const [mondayColumns, setMondayColumns] = useState<MondayColumn[]>([]);
	const [groups, setGroups] = useState<MondayGroup[]>([]);
	const [groupsLoading, setGroupsLoading] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Sync state
	const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [syncProgress, setSyncProgress] = useState(0);
	const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);

	// Column modal state
	const [columnModalOpen, setColumnModalOpen] = useState(false);
	const [editingColumn, setEditingColumn] = useState<ColumnSyncConfig | null>(null);
	const [columnForm, setColumnForm] = useState({
		column_id: "",
		column_name: "",
		column_type: "numbers" as SyncColumnType,
		sync_purpose: "total_time" as SyncPurpose,
		time_format: "hours" as TimeFormat,
		include_breakdown: false,
		sync_enabled: true,
	});
	const [savingColumn, setSavingColumn] = useState(false);

	// Role override modal state
	const [overrideModalOpen, setOverrideModalOpen] = useState(false);
	const [editingOverride, setEditingOverride] = useState<RoleOverrideWithRole | null>(null);
	const [overrideForm, setOverrideForm] = useState({
		role_id: "",
		hourly_rate: 0,
		is_enabled: true,
	});
	const [savingOverride, setSavingOverride] = useState(false);

	// Monday context
	const { initializeMondayContext, isLoading: mondayLoading, error: mondayError, rawContext: mondayContext, sessionToken } = useMondayStore();
	const isAdmin = useUserStore((state) => state.mondayUser?.isAdmin);

	// Initialize Monday context on mount
	useEffect(() => {
		initializeMondayContext().catch((err) => console.error("Error initializing Monday context:", err));
	}, [initializeMondayContext]);

	// Fetch board config
	const fetchBoardConfig = useCallback(async () => {
		if (!sessionToken) return;
		try {
			const response = await fetch(`/api/admin/boards?boardId=${boardId}`, {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to fetch board configuration");
			}

			if (data.boards && data.boards.length > 0) {
				setBoardConfig(data.boards[0]);
			} else {
				setError("Board configuration not found");
			}
		} catch (err) {
			console.error("Error fetching board config:", err);
			setError(err instanceof Error ? err.message : "Failed to fetch board configuration");
		}
	}, [boardId, sessionToken]);

	// Fetch column sync configs
	const fetchColumns = useCallback(async () => {
		if (!sessionToken) return;
		try {
			const response = await fetch(`/api/admin/boards/${boardId}/columns`, {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to fetch column configurations");
			}

			setColumns(data.columns || []);
		} catch (err) {
			console.error("Error fetching columns:", err);
			setError(err instanceof Error ? err.message : "Failed to fetch column configurations");
		}
	}, [boardId, sessionToken]);

	// Fetch role overrides
	const fetchRoleOverrides = useCallback(async () => {
		if (!sessionToken) return;
		try {
			const response = await fetch(`/api/admin/boards/${boardId}/role-overrides`, {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to fetch role overrides");
			}

			setRoleOverrides(data.overrides || []);
		} catch (err) {
			console.error("Error fetching role overrides:", err);
			setError(err instanceof Error ? err.message : "Failed to fetch role overrides");
		}
	}, [boardId, sessionToken]);

	// Fetch available roles
	const fetchRoles = useCallback(async () => {
		if (!sessionToken) return;
		try {
			const response = await fetch("/api/admin/roles?active=true", {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to fetch roles");
			}

			setAvailableRoles(data.roles || []);
		} catch (err) {
			console.error("Error fetching roles:", err);
		}
	}, [sessionToken]);

	// Fetch monday.com columns
	const fetchMondayColumns = useCallback(async () => {
		if (!sessionToken) return;
		try {
			const response = await fetch(`/api/boards/${boardId}/columns`, {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to fetch monday.com columns");
			}

			setMondayColumns(data.columns || []);
		} catch (err) {
			console.error("Error fetching monday columns:", err);
		}
	}, [boardId, sessionToken]);

	// Fetch groups
	const fetchGroups = useCallback(async () => {
		if (!sessionToken) return;
		try {
			setGroupsLoading(true);
			const response = await fetch(`/api/admin/boards/${boardId}/groups`, {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to fetch groups");
			}

			setGroups(data.groups || []);
		} catch (err) {
			console.error("Error fetching groups:", err);
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to fetch groups",
				color: "red",
			});
		} finally {
			setGroupsLoading(false);
		}
	}, [boardId, sessionToken]);

	// Fetch sync stats
	const fetchSyncStats = useCallback(async () => {
		if (!sessionToken) return;
		try {
			const response = await fetch(`/api/sync/board/${boardId}`, {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
					"monday-context": mondayContext ? JSON.stringify(mondayContext) : "",
				},
			});
			const data = await response.json();

			if (response.ok) {
				setSyncStats(data.statistics || null);
			}
		} catch (err) {
			console.error("Error fetching sync stats:", err);
		}
	}, [boardId, mondayContext, sessionToken]);

	// Load all data on mount
	useEffect(() => {
		if (!sessionToken) return;
		const loadData = async () => {
			setLoading(true);
			await Promise.all([fetchBoardConfig(), fetchColumns(), fetchRoleOverrides(), fetchRoles(), fetchMondayColumns()]);
			setLoading(false);
		};
		loadData();
	}, [fetchBoardConfig, fetchColumns, fetchRoleOverrides, fetchRoles, fetchMondayColumns, sessionToken]);

	// Load sync stats when tab changes to sync
	useEffect(() => {
		if (activeTab === "sync" && mondayContext) {
			fetchSyncStats();
		}
	}, [activeTab, fetchSyncStats, mondayContext]);

	// Load groups when tab changes to groups
	useEffect(() => {
		if (activeTab === "groups") {
			fetchGroups();
		}
	}, [activeTab, fetchGroups]);

	// Toggle group sync handler
	const handleToggleGroupSync = async (groupId: string, currentSyncEnabled: boolean) => {
		if (!sessionToken) return;
		try {
			const response = await fetch(`/api/admin/boards/${boardId}/groups`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify({
					groupId,
					sync_enabled: !currentSyncEnabled,
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to update group sync status");
			}

			// Update local state
			setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, sync_enabled: !currentSyncEnabled } : g)));

			notifications.show({
				title: "Success",
				message: `Group ${!currentSyncEnabled ? "enabled" : "disabled"} for sync`,
				color: "green",
			});
		} catch (err) {
			console.error("Error toggling group sync:", err);
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to update group sync status",
				color: "red",
			});
		}
	};

	// Bulk sync handler
	const handleBulkSync = async () => {
		if (!mondayContext || !sessionToken) {
			notifications.show({
				title: "Error",
				message: "Authentication not ready",
				color: "red",
			});
			return;
		}

		setSyncing(true);
		setSyncProgress(10);
		setSyncResults(null);

		try {
			const response = await fetch(`/api/sync/board/${boardId}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"monday-context": JSON.stringify(mondayContext),
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			setSyncProgress(90);

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to sync board");
			}

			setSyncProgress(100);
			setSyncResults(data.results || []);

			notifications.show({
				title: data.success ? "Sync Complete" : "Sync Completed with Errors",
				message: data.message,
				color: data.success ? "green" : "yellow",
			});

			// Refresh stats
			fetchSyncStats();
		} catch (err) {
			notifications.show({
				title: "Sync Failed",
				message: err instanceof Error ? err.message : "Failed to sync board",
				color: "red",
			});
		} finally {
			setSyncing(false);
			setTimeout(() => setSyncProgress(0), 1000);
		}
	};

	// Column handlers
	const handleOpenColumnModal = (column?: ColumnSyncConfig) => {
		if (column) {
			setEditingColumn(column);
			setColumnForm({
				column_id: column.column_id,
				column_name: column.column_name,
				column_type: column.column_type as SyncColumnType,
				sync_purpose: column.sync_purpose as SyncPurpose,
				time_format: column.time_format as TimeFormat,
				include_breakdown: column.include_breakdown,
				sync_enabled: column.sync_enabled,
			});
		} else {
			setEditingColumn(null);
			setColumnForm({
				column_id: "",
				column_name: "",
				column_type: "numbers",
				sync_purpose: "total_time",
				time_format: "hours",
				include_breakdown: false,
				sync_enabled: true,
			});
		}
		setColumnModalOpen(true);
	};

	const handleColumnSelect = (columnId: string | null) => {
		if (!columnId) return;
		const selected = mondayColumns.find((c) => c.id === columnId);
		if (selected) {
			setColumnForm({
				...columnForm,
				column_id: selected.id,
				column_name: selected.title,
				column_type: selected.type as SyncColumnType,
			});
		}
	};

	const handleSaveColumn = async () => {
		if (!columnForm.column_id || !columnForm.column_name) {
			notifications.show({
				title: "Validation Error",
				message: "Please select a column",
				color: "red",
			});
			return;
		}

		setSavingColumn(true);
		try {
			const method = editingColumn ? "PATCH" : "POST";

			const response = await fetch(`/api/admin/boards/${boardId}/columns`, {
				method,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify(columnForm),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to save column configuration");
			}

			notifications.show({
				title: "Success",
				message: editingColumn ? "Column configuration updated" : "Column configuration created",
				color: "green",
			});

			setColumnModalOpen(false);
			fetchColumns();
		} catch (err) {
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to save column configuration",
				color: "red",
			});
		} finally {
			setSavingColumn(false);
		}
	};

	const handleDeleteColumn = async (column: ColumnSyncConfig) => {
		if (!confirm(`Are you sure you want to remove the sync configuration for "${column.column_name}"?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/boards/${boardId}/columns?columnId=${column.column_id}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to delete column configuration");
			}

			notifications.show({
				title: "Success",
				message: "Column configuration removed",
				color: "green",
			});

			fetchColumns();
		} catch (err) {
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to delete column configuration",
				color: "red",
			});
		}
	};

	// Role override handlers
	const handleOpenOverrideModal = (override?: RoleOverrideWithRole) => {
		if (override) {
			setEditingOverride(override);
			setOverrideForm({
				role_id: override.role_id,
				hourly_rate: override.hourly_rate,
				is_enabled: override.is_enabled,
			});
		} else {
			setEditingOverride(null);
			setOverrideForm({
				role_id: "",
				hourly_rate: 0,
				is_enabled: true,
			});
		}
		setOverrideModalOpen(true);
	};

	const handleSaveOverride = async () => {
		if (!overrideForm.role_id) {
			notifications.show({
				title: "Validation Error",
				message: "Please select a role",
				color: "red",
			});
			return;
		}

		setSavingOverride(true);
		try {
			const method = editingOverride ? "PATCH" : "POST";

			const response = await fetch(`/api/admin/boards/${boardId}/role-overrides`, {
				method,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify(overrideForm),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to save role override");
			}

			notifications.show({
				title: "Success",
				message: editingOverride ? "Role override updated" : "Role override created",
				color: "green",
			});

			setOverrideModalOpen(false);
			fetchRoleOverrides();
		} catch (err) {
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to save role override",
				color: "red",
			});
		} finally {
			setSavingOverride(false);
		}
	};

	const handleDeleteOverride = async (override: RoleOverrideWithRole) => {
		if (!confirm(`Are you sure you want to remove the rate override for "${override.role?.name}"?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/boards/${boardId}/role-overrides?roleId=${override.role_id}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to delete role override");
			}

			notifications.show({
				title: "Success",
				message: "Role override removed",
				color: "green",
			});

			fetchRoleOverrides();
		} catch (err) {
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to delete role override",
				color: "red",
			});
		}
	};

	// Get roles not yet overridden
	const availableRolesForOverride = availableRoles.filter((role) => !roleOverrides.some((o) => o.role_id === role.id));

	// Purpose display names
	const purposeLabels: Record<SyncPurpose, string> = {
		total_time: "Total Time (Legacy)",
		time_by_role: "Time by Role (Legacy)",
		remaining_budget: "Remaining Budget (Legacy)",
		budget_used: "Budget Used",
	};

	// Format display names
	const formatLabels: Record<TimeFormat, string> = {
		hours: "Hours (e.g., 2.5)",
		seconds: "Seconds (e.g., 9000)",
		"hh:mm": "HH:MM (e.g., 02:30)",
	};

	// Show loading state while initializing
	if (mondayLoading || loading) {
		return (
			<div className="admin-loading">
				<Loader size="lg" />
			</div>
		);
	}

	// Show error if Monday initialization failed
	if (mondayError) {
		return <div className="admin-error">Error: {mondayError}</div>;
	}

	// Check admin access
	if (!isAdmin) {
		return (
			<div id="admin-app">
				<div className="admin-error">
					<Text fw={600}>Access Denied</Text>
					<Text size="sm">You need admin privileges to access this page.</Text>
				</div>
			</div>
		);
	}

	if (!boardConfig) {
		return (
			<div id="admin-app">
				<div className="admin-error">Board configuration not found</div>
			</div>
		);
	}

	return (
		<div id="admin-app">
			<header className="admin-header">
				<Flex align="center" gap={16}>
					<Button variant="subtle" leftSection={<IconArrowLeft />} onClick={() => router.back()}>
						Back
					</Button>
					<Logo size={{ width: 150, height: 26 }} style="brand" />
				</Flex>
			</header>

			<Breadcrumbs mb="md">
				<Anchor component={Link} href="/admin">
					Admin
				</Anchor>
				<Anchor component={Link} href="/admin?tab=boards">
					Boards
				</Anchor>
				<Text>{(boardConfig as any).monday_board?.name || (boardConfig as any).board_name || boardConfig.board_id}</Text>
			</Breadcrumbs>

			{error && <div className="admin-error">{error}</div>}

			<div className="admin-section" style={{ marginBottom: 24 }}>
				<Flex justify="space-between" align="center">
					<div>
						<Text size="xl" fw={600}>
							{(boardConfig as any).board_name || boardConfig.board_id}
						</Text>
						<Text size="sm" c="dimmed">
							Board ID: {boardConfig.board_id}
						</Text>
					</div>
					<Badge size="lg" color={boardConfig.sync_enabled ? "green" : "gray"}>
						{boardConfig.sync_enabled ? "Sync Enabled" : "Sync Disabled"}
					</Badge>
				</Flex>
			</div>

			<Tabs value={activeTab} onChange={setActiveTab} className="admin-tabs">
				<Tabs.List>
					<Tabs.Tab value="columns">Column Mappings</Tabs.Tab>
					<Tabs.Tab value="groups">Groups</Tabs.Tab>
					<Tabs.Tab value="roles">Role Rate Overrides</Tabs.Tab>
					<Tabs.Tab value="sync">Sync Operations</Tabs.Tab>
				</Tabs.List>

				{/* Column Mappings Tab */}
				<Tabs.Panel value="columns" pt="md">
					<div className="admin-section">
						<div className="admin-section-header">
							<div>
								<h2>Column Mappings</h2>
								<p className="admin-section-description">Configure which monday.com columns receive synced time data.</p>
							</div>
							<Button leftSection={<IconPlus />} onClick={() => handleOpenColumnModal()}>
								Add Column Mapping
							</Button>
						</div>

						{columns.length === 0 ? (
							<div className="empty-state">
								<div className="empty-state-title">No column mappings</div>
								<p className="empty-state-description">Add a column mapping to sync time data to a monday.com column.</p>
								<Button onClick={() => handleOpenColumnModal()}>Add Column Mapping</Button>
							</div>
						) : (
							<Table>
								<Table.Thead>
									<Table.Tr>
										<Table.Th>Column</Table.Th>
										<Table.Th>Type</Table.Th>
										<Table.Th>Sync Purpose</Table.Th>
										<Table.Th>Format</Table.Th>
										<Table.Th>Status</Table.Th>
										<Table.Th>Actions</Table.Th>
									</Table.Tr>
								</Table.Thead>
								<Table.Tbody>
									{columns.map((column) => (
										<Table.Tr key={column.id}>
											<Table.Td>
												<Text fw={500}>{column.column_name}</Text>
												<Text size="xs" c="dimmed">
													{column.column_id}
												</Text>
											</Table.Td>
											<Table.Td>
												<Badge variant="light">{column.column_type}</Badge>
											</Table.Td>
											<Table.Td>{purposeLabels[column.sync_purpose]}</Table.Td>
											<Table.Td>{formatLabels[column.time_format]}</Table.Td>
											<Table.Td>
												<Badge color={column.sync_enabled ? "green" : "gray"}>{column.sync_enabled ? "Enabled" : "Disabled"}</Badge>
											</Table.Td>
											<Table.Td>
												<Group gap="xs">
													<IconButton variant="light" onClick={() => handleOpenColumnModal(column)}>
														<IconEdit />
													</IconButton>
													<IconButton variant="light" color="red" onClick={() => handleDeleteColumn(column)}>
														<IconTrash />
													</IconButton>
												</Group>
											</Table.Td>
										</Table.Tr>
									))}
								</Table.Tbody>
							</Table>
						)}
					</div>
				</Tabs.Panel>

				{/* Groups Tab */}
				<Tabs.Panel value="groups" pt="md">
					<div className="admin-section">
						<div className="admin-section-header">
							<div>
								<h2>Groups</h2>
								<p className="admin-section-description">Control which groups are synced for the task selector. Disabled groups will not appear in the task dropdown.</p>
							</div>
						</div>

						{groupsLoading ? (
							<div className="admin-loading">
								<Loader size="sm" />
								<Text size="sm" c="dimmed" ml="xs">
									Loading groups...
								</Text>
							</div>
						) : groups.length === 0 ? (
							<div className="empty-state">
								<div className="empty-state-title">No groups found</div>
								<p className="empty-state-description">This board has no groups, or they haven't been loaded yet. Groups will be fetched from monday.com when you open this tab.</p>
							</div>
						) : (
							<Table>
								<Table.Thead>
									<Table.Tr>
										<Table.Th>Group</Table.Th>
										<Table.Th>Position</Table.Th>
										<Table.Th>Sync Status</Table.Th>
										<Table.Th>Actions</Table.Th>
									</Table.Tr>
								</Table.Thead>
								<Table.Tbody>
									{groups.map((group) => (
										<Table.Tr key={group.id}>
											<Table.Td>
												<Flex align="center" gap="xs">
													{group.color && (
														<div
															style={{
																width: 12,
																height: 12,
																borderRadius: 2,
																backgroundColor: group.color,
															}}
														/>
													)}
													<Text fw={500}>{group.title}</Text>
												</Flex>
												<Text size="xs" c="dimmed">
													{group.id}
												</Text>
											</Table.Td>
											<Table.Td>
												<Text size="sm">{group.position || "-"}</Text>
											</Table.Td>
											<Table.Td>
												<Badge color={group.sync_enabled ? "green" : "gray"}>{group.sync_enabled ? "Synced" : "Not Synced"}</Badge>
											</Table.Td>
											<Table.Td>
												<Switch label={group.sync_enabled ? "Enabled" : "Disabled"} checked={group.sync_enabled} onChange={() => handleToggleGroupSync(group.id, group.sync_enabled)} />
											</Table.Td>
										</Table.Tr>
									))}
								</Table.Tbody>
							</Table>
						)}
					</div>
				</Tabs.Panel>

				{/* Role Rate Overrides Tab */}
				<Tabs.Panel value="roles" pt="md">
					<div className="admin-section">
						<div className="admin-section-header">
							<div>
								<h2>Role Rate Overrides</h2>
								<p className="admin-section-description">Override default hourly rates for specific roles on this board.</p>
							</div>
							<Button leftSection={<IconPlus />} onClick={() => handleOpenOverrideModal()} disabled={availableRolesForOverride.length === 0}>
								Add Rate Override
							</Button>
						</div>

						{roleOverrides.length === 0 ? (
							<div className="empty-state">
								<div className="empty-state-title">No rate overrides</div>
								<p className="empty-state-description">All roles use their default hourly rates. Add an override to customize rates for this board.</p>
								{availableRolesForOverride.length > 0 && <Button onClick={() => handleOpenOverrideModal()}>Add Rate Override</Button>}
							</div>
						) : (
							<Table>
								<Table.Thead>
									<Table.Tr>
										<Table.Th>Role</Table.Th>
										<Table.Th>Default Rate</Table.Th>
										<Table.Th>Override Rate</Table.Th>
										<Table.Th>Status</Table.Th>
										<Table.Th>Actions</Table.Th>
									</Table.Tr>
								</Table.Thead>
								<Table.Tbody>
									{roleOverrides.map((override) => (
										<Table.Tr key={override.id}>
											<Table.Td>
												<Flex align="center" gap="xs">
													<div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: override.role?.color_hex || "#0073ea" }} />
													<Text fw={500}>{override.role?.name || "Unknown Role"}</Text>
												</Flex>
											</Table.Td>
											<Table.Td>
												<Text c="dimmed">€{override.role?.hourly_rate?.toFixed(2) || "0.00"}</Text>
											</Table.Td>
											<Table.Td>
												<Text fw={600}>€{override.hourly_rate.toFixed(2)}</Text>
											</Table.Td>
											<Table.Td>
												<Badge color={override.is_enabled ? "green" : "gray"}>{override.is_enabled ? "Active" : "Inactive"}</Badge>
											</Table.Td>
											<Table.Td>
												<Group gap="xs">
													<IconButton variant="light" onClick={() => handleOpenOverrideModal(override)}>
														<IconEdit />
													</IconButton>
													<IconButton variant="light" color="red" onClick={() => handleDeleteOverride(override)}>
														<IconTrash />
													</IconButton>
												</Group>
											</Table.Td>
										</Table.Tr>
									))}
								</Table.Tbody>
							</Table>
						)}
					</div>
				</Tabs.Panel>

				{/* Sync Operations Tab */}
				<Tabs.Panel value="sync" pt="md">
					<div className="admin-section">
						<div className="admin-section-header">
							<div>
								<h2>Sync Operations</h2>
								<p className="admin-section-description">Manually sync time data to monday.com columns or view sync statistics.</p>
							</div>
						</div>

						<Stack gap="lg">
							{/* Sync Stats */}
							{syncStats && (
								<Card withBorder padding="lg">
									<Text fw={600} mb="md">
										Sync Statistics (Last 24 Hours)
									</Text>
									<Group gap="xl">
										<div>
											<Text size="2xl" fw={700} c="green">
												{syncStats.last24Hours.successCount}
											</Text>
											<Text size="sm" c="dimmed">
												Successful Syncs
											</Text>
										</div>
										<div>
											<Text size="2xl" fw={700} c="red">
												{syncStats.last24Hours.failureCount}
											</Text>
											<Text size="sm" c="dimmed">
												Failed Syncs
											</Text>
										</div>
										<div>
											<Text size="2xl" fw={700}>
												{syncStats.itemsWithTimeEntries}
											</Text>
											<Text size="sm" c="dimmed">
												Items with Time Entries
											</Text>
										</div>
									</Group>
								</Card>
							)}

							{/* Bulk Sync */}
							<Card withBorder padding="lg">
								<Text fw={600} mb="sm">
									Bulk Sync All Items
								</Text>
								<Text size="sm" c="dimmed" mb="md">
									Sync time data for all items on this board that have time entries. This will update all configured columns based on your column mappings.
								</Text>

								{syncProgress > 0 && <Progress value={syncProgress} mb="md" animated={syncing} color={syncProgress === 100 ? "green" : "blue"} />}

								<Button leftSection={<IconSync />} onClick={handleBulkSync} loading={syncing} disabled={!boardConfig.sync_enabled || columns.length === 0}>
									{syncing ? "Syncing..." : "Sync All Items"}
								</Button>

								{!boardConfig.sync_enabled && (
									<Text size="sm" c="red" mt="sm">
										Sync is disabled for this board. Enable it in the board settings to use this feature.
									</Text>
								)}

								{columns.length === 0 && boardConfig.sync_enabled && (
									<Text size="sm" c="orange" mt="sm">
										No column mappings configured. Add column mappings to sync data.
									</Text>
								)}
							</Card>

							{/* Sync Results */}
							{syncResults && syncResults.length > 0 && (
								<Card withBorder padding="lg">
									<Text fw={600} mb="md">
										Last Sync Results
									</Text>
									<Table>
										<Table.Thead>
											<Table.Tr>
												<Table.Th>Item ID</Table.Th>
												<Table.Th>Status</Table.Th>
												<Table.Th>Columns Updated</Table.Th>
												<Table.Th>Errors</Table.Th>
											</Table.Tr>
										</Table.Thead>
										<Table.Tbody>
											{syncResults.slice(0, 20).map((result, idx) => (
												<Table.Tr key={idx}>
													<Table.Td>
														<Text size="sm">{result.itemId}</Text>
													</Table.Td>
													<Table.Td>
														<Badge color={result.success ? "green" : "red"}>{result.success ? "Success" : "Failed"}</Badge>
													</Table.Td>
													<Table.Td>{result.columnsUpdated}</Table.Td>
													<Table.Td>
														{result.errors.length > 0 ? (
															<Text size="xs" c="red">
																{result.errors.join(", ")}
															</Text>
														) : (
															<Text size="xs" c="dimmed">
																None
															</Text>
														)}
													</Table.Td>
												</Table.Tr>
											))}
										</Table.Tbody>
									</Table>
									{syncResults.length > 20 && (
										<Text size="sm" c="dimmed" mt="sm">
											Showing first 20 of {syncResults.length} results
										</Text>
									)}
								</Card>
							)}
						</Stack>
					</div>
				</Tabs.Panel>
			</Tabs>

			{/* Column Modal */}
			<Modal opened={columnModalOpen} onClose={() => setColumnModalOpen(false)} title={editingColumn ? "Edit Column Mapping" : "Add Column Mapping"} size="lg">
				<Stack gap="md">
					{!editingColumn && (
						<Select
							label="Select Column"
							placeholder="Choose a monday.com column"
							data={mondayColumns
								.filter((c) => c.isCompatible)
								.map((c) => ({
									value: c.id,
									label: `${c.title} (${c.type})`,
								}))}
							value={columnForm.column_id}
							onChange={handleColumnSelect}
							searchable
						/>
					)}

					{editingColumn && <TextInput label="Column" value={`${columnForm.column_name} (${columnForm.column_type})`} disabled />}

					<Switch label="Enable sync" description="Toggle sync for this column mapping" checked={columnForm.sync_enabled} onChange={(e) => setColumnForm({ ...columnForm, sync_enabled: e.currentTarget.checked })} />

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={() => setColumnModalOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSaveColumn} loading={savingColumn}>
							{editingColumn ? "Update Mapping" : "Add Mapping"}
						</Button>
					</Group>
				</Stack>
			</Modal>

			{/* Role Override Modal */}
			<Modal opened={overrideModalOpen} onClose={() => setOverrideModalOpen(false)} title={editingOverride ? "Edit Rate Override" : "Add Rate Override"} size="md">
				<Stack gap="md">
					{!editingOverride && (
						<Select
							label="Select Role"
							placeholder="Choose a role"
							data={availableRolesForOverride.map((r) => ({
								value: r.id,
								label: `${r.name} (Default: €${r.hourly_rate.toFixed(2)})`,
							}))}
							value={overrideForm.role_id}
							onChange={(val) => {
								const role = availableRoles.find((r) => r.id === val);
								setOverrideForm({
									...overrideForm,
									role_id: val || "",
									hourly_rate: role?.hourly_rate || 0,
								});
							}}
							searchable
						/>
					)}

					{editingOverride && <TextInput label="Role" value={editingOverride.role?.name || "Unknown Role"} disabled />}

					<NumberInput label="Override Hourly Rate (€)" description="This rate will be used instead of the default for this board" placeholder="0.00" value={overrideForm.hourly_rate} onChange={(val) => setOverrideForm({ ...overrideForm, hourly_rate: Number(val) || 0 })} min={0} decimalScale={2} />

					<Switch label="Active" description="Toggle whether this override is applied" checked={overrideForm.is_enabled} onChange={(e) => setOverrideForm({ ...overrideForm, is_enabled: e.currentTarget.checked })} />

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={() => setOverrideModalOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSaveOverride} loading={savingOverride}>
							{editingOverride ? "Update Override" : "Add Override"}
						</Button>
					</Group>
				</Stack>
			</Modal>
		</div>
	);
}
