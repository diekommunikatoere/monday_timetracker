"use client";

import { Tabs, NumberInput, Switch, Select, Modal, Loader, Badge, Table, Group, Stack, Text, Flex, Breadcrumbs, Anchor, Progress, Card } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import { Icon, Input, Logo, ErrorState } from "@/components";
import { Button, IconButton } from "@/components";
import { isTimePurpose } from "@/lib/monday/utils";
import { canAccessRoute } from "@/lib/permissions";
import { useMondayStore } from "@/stores/mondayStore";
import { useUserStore } from "@/stores/userStore";

import type { BoardConfig, Role, BoardRoleOverride, ColumnSyncConfig, SyncPurpose, TimeFormat, SyncColumnType, MondayGroup } from "@/types/database";

import "@/public/css/components/AdminPage.css";

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

interface WebhookStatus {
	event: string;
	id: string | null;
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
	const pathname = usePathname();

	// Monday context
	const { initializeMondayContext, isLoading: mondayLoading, error: mondayError, rawContext: mondayContext, sessionToken } = useMondayStore();
	const isAdmin = useUserStore((state) => state.mondayUser?.isAdmin);

	// Initialize Monday context on mount
	useEffect(() => {
		initializeMondayContext().catch((err) => console.error("Error initializing Monday context:", err));
	}, [initializeMondayContext]);

	const params = useParams();
	const router = useRouter();
	const boardId = params.boardId as string;

	const [activeTab, setActiveTab] = useState<string | null>("general");
	const [boardConfig, setBoardConfig] = useState<BoardConfig | null>(null);
	const [boardConfigLoading, setBoardConfigLoading] = useState(true);
	const [columns, setColumns] = useState<ColumnSyncConfig[]>([]);
	const [roleOverrides, setRoleOverrides] = useState<RoleOverrideWithRole[]>([]);
	const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
	const [mondayColumns, setMondayColumns] = useState<MondayColumn[]>([]);
	const [webhooks, setWebhooks] = useState<WebhookStatus[]>([]);
	const [webhooksLoading, setWebhooksLoading] = useState(false);
	const [registeringWebhooks, setRegisteringWebhooks] = useState(false);
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
				throw new Error(data.error || "Board-Konfiguration konnte nicht geladen werden");
			}

			if (data.boards && data.boards.length > 0) {
				setBoardConfig(data.boards[0]);
			} else {
				setError("Board-Konfiguration nicht gefunden");
			}
		} catch (err) {
			console.error("Error fetching board config:", err);
			setError(err instanceof Error ? err.message : "Board-Konfiguration konnte nicht geladen werden");
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
				throw new Error(data.error || "Spalten-Konfigurationen konnten nicht geladen werden");
			}

			setColumns(data.columns || []);
		} catch (err) {
			console.error("Error fetching columns:", err);
			setError(err instanceof Error ? err.message : "Spalten-Konfigurationen konnten nicht geladen werden");
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
				throw new Error(data.error || "Rollen-Überschreibungen konnten nicht geladen werden");
			}

			setRoleOverrides(data.overrides || []);
		} catch (err) {
			console.error("Error fetching role overrides:", err);
			setError(err instanceof Error ? err.message : "Rollen-Überschreibungen konnten nicht geladen werden");
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
				throw new Error(data.error || "Rollen konnten nicht geladen werden");
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
				throw new Error(data.error || "monday.com-Spalten konnten nicht geladen werden");
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
				throw new Error(data.error || "Gruppen konnten nicht geladen werden");
			}

			setGroups(data.groups || []);
		} catch (err) {
			console.error("Error fetching groups:", err);
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Gruppen konnten nicht geladen werden",
				color: "red",
			});
		} finally {
			setGroupsLoading(false);
		}
	}, [boardId, sessionToken]);

	// Fetch webhooks
	const fetchWebhooks = useCallback(async () => {
		if (!sessionToken) return;
		try {
			setWebhooksLoading(true);
			const response = await fetch(`/api/admin/boards/${boardId}/webhooks`, {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Webhooks konnten nicht geladen werden");
			}

			setWebhooks(data.webhooks || []);
		} catch (err) {
			console.error("Error fetching webhooks:", err);
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Webhooks konnten nicht geladen werden",
				color: "red",
			});
		} finally {
			setWebhooksLoading(false);
		}
	}, [boardId, sessionToken]);

	// Register any webhooks missing for this board, then refresh their status
	const handleRegisterWebhooks = async () => {
		if (!sessionToken) return;
		try {
			setRegisteringWebhooks(true);
			const response = await fetch(`/api/admin/boards/${boardId}/webhooks`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Webhooks konnten nicht registriert werden");
			}

			notifications.show({
				title: "Erfolg",
				message: "Fehlende Webhooks wurden registriert",
				color: "green",
			});

			await fetchWebhooks();
		} catch (err) {
			console.error("Error registering webhooks:", err);
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Webhooks konnten nicht registriert werden",
				color: "red",
			});
		} finally {
			setRegisteringWebhooks(false);
		}
	};

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

	// Load webhooks when tab changes to webhooks
	useEffect(() => {
		if (activeTab === "webhooks") {
			fetchWebhooks();
		}
	}, [activeTab, fetchWebhooks]);

	// Load groups when tab changes to groups
	useEffect(() => {
		if (activeTab === "groups") {
			fetchGroups();
		}
	}, [activeTab, fetchGroups]);

	// Handle board config update
	const updateBoardConfig = async (updatedConfig: Partial<BoardConfig>) => {
		if (!sessionToken) return;

		const newConfig = {
			...boardConfig,
			...updatedConfig,
			settings: {
				...(boardConfig?.settings as Record<string, unknown> | undefined),
				...(updatedConfig.settings as Record<string, unknown> | undefined),
			},
		};

		try {
			setBoardConfigLoading(true);

			const response = await fetch(`/api/admin/boards?boardId=${boardId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify(newConfig),
			});

			const data = await response.json();

			if (!response.ok) {
				setBoardConfigLoading(false);
				throw new Error(data.error || "Board-Konfiguration konnte nicht aktualisiert werden");
			}

			setBoardConfig(newConfig as BoardConfig);
		} catch (err) {
			console.error("Error updating board config:", err);
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Board-Konfiguration konnte nicht aktualisiert werden",
				color: "red",
			});
		} finally {
			setBoardConfigLoading(false);
		}
	};

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
				throw new Error(data.error || "Gruppen-Sync-Status konnte nicht aktualisiert werden");
			}

			// Update local state
			setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, sync_enabled: !currentSyncEnabled } : g)));

			notifications.show({
				title: "Erfolg",
				message: `Gruppe für Sync ${!currentSyncEnabled ? "aktiviert" : "deaktiviert"}`,
				color: "green",
			});
		} catch (err) {
			console.error("Error toggling group sync:", err);
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Gruppen-Sync-Status konnte nicht aktualisiert werden",
				color: "red",
			});
		} finally {
			setGroupsLoading(false);
		}
	};

	// Bulk sync handler. The API only syncs one page of items per call (a large
	// board can have far more finalized items than fit in one request's time
	// budget), so this loops on the returned cursor until the API reports
	// `done`. Re-calling without a cursor always restarts from the same first
	// page, so the loop — not just the button — is what makes a full-board sync
	// actually complete.
	const MAX_SYNC_PAGES = 100; // safety valve against a runaway loop, not an expected ceiling

	const handleBulkSync = async () => {
		if (!mondayContext || !sessionToken) {
			notifications.show({
				title: "Fehler",
				message: "Authentifizierung nicht bereit",
				color: "red",
			});
			return;
		}

		setSyncing(true);
		setSyncProgress(0);
		setSyncResults(null);

		const approxTotal = syncStats?.itemsWithTimeEntries || 0;
		const accumulatedResults: SyncResult[] = [];
		let cursor: string | null = null;
		let totalSynced = 0;
		let totalFailed = 0;
		let pages = 0;

		try {
			for (;;) {
				pages++;
				if (pages > MAX_SYNC_PAGES) {
					throw new Error(`Sync abgebrochen nach ${MAX_SYNC_PAGES} Seiten — bitte erneut starten, um fortzufahren.`);
				}

				const url = `/api/sync/board/${boardId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
				const response = await fetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"monday-context": JSON.stringify(mondayContext),
						Authorization: `Bearer ${sessionToken}`,
					},
				});

				const data = await response.json();

				if (!response.ok) {
					throw new Error(data.error || "Board-Synchronisierung fehlgeschlagen");
				}

				totalSynced += data.itemsSynced || 0;
				totalFailed += data.itemsFailed || 0;
				accumulatedResults.push(...(data.results || []));
				setSyncResults([...accumulatedResults]);
				setSyncProgress(approxTotal > 0 ? Math.min(99, Math.round(((totalSynced + totalFailed) / approxTotal) * 100)) : Math.min(90, pages * 10));

				// Treat a missing `done` as "stop" rather than loop forever against an
				// older/unexpected response shape.
				if (data.done !== false || !data.nextCursor) break;
				cursor = data.nextCursor;
			}

			setSyncProgress(100);

			notifications.show({
				title: totalFailed === 0 ? "Sync abgeschlossen" : "Sync mit Fehlern abgeschlossen",
				message: `${totalSynced} Items synchronisiert${totalFailed > 0 ? `, ${totalFailed} fehlgeschlagen` : ""} (${pages} Seite${pages === 1 ? "" : "n"})`,
				color: totalFailed === 0 ? "green" : "yellow",
			});

			// Refresh stats
			fetchSyncStats();
		} catch (err) {
			notifications.show({
				title: "Sync fehlgeschlagen",
				message: err instanceof Error ? err.message : "Board-Synchronisierung fehlgeschlagen",
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
				title: "Validierungsfehler",
				message: "Bitte eine Spalte auswählen",
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
				throw new Error(data.error || "Spalten-Konfiguration konnte nicht gespeichert werden");
			}

			notifications.show({
				title: "Erfolg",
				message: editingColumn ? "Spalten-Konfiguration aktualisiert" : "Spalten-Konfiguration erstellt",
				color: "green",
			});

			setColumnModalOpen(false);
			fetchColumns();
		} catch (err) {
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Spalten-Konfiguration konnte nicht gespeichert werden",
				color: "red",
			});
		} finally {
			setSavingColumn(false);
		}
	};

	const handleDeleteColumn = async (column: ColumnSyncConfig) => {
		if (!confirm(`Möchtest du die Sync-Konfiguration für "${column.column_name}" wirklich entfernen?`)) {
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
				throw new Error(data.error || "Spalten-Konfiguration konnte nicht gelöscht werden");
			}

			notifications.show({
				title: "Erfolg",
				message: "Spalten-Konfiguration entfernt",
				color: "green",
			});

			fetchColumns();
		} catch (err) {
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Spalten-Konfiguration konnte nicht gelöscht werden",
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
				title: "Validierungsfehler",
				message: "Bitte eine Rolle auswählen",
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
				throw new Error(data.error || "Rollen-Überschreibung konnte nicht gespeichert werden");
			}

			notifications.show({
				title: "Erfolg",
				message: editingOverride ? "Rollen-Überschreibung aktualisiert" : "Rollen-Überschreibung erstellt",
				color: "green",
			});

			setOverrideModalOpen(false);
			fetchRoleOverrides();
		} catch (err) {
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Rollen-Überschreibung konnte nicht gespeichert werden",
				color: "red",
			});
		} finally {
			setSavingOverride(false);
		}
	};

	const handleDeleteOverride = async (override: RoleOverrideWithRole) => {
		if (!confirm(`Möchtest du die Satzüberschreibung für "${override.role?.name}" wirklich entfernen?`)) {
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
				throw new Error(data.error || "Rollen-Überschreibung konnte nicht gelöscht werden");
			}

			notifications.show({
				title: "Erfolg",
				message: "Rollen-Überschreibung entfernt",
				color: "green",
			});

			fetchRoleOverrides();
		} catch (err) {
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Rollen-Überschreibung konnte nicht gelöscht werden",
				color: "red",
			});
		}
	};

	// Get roles not yet overridden
	const availableRolesForOverride = availableRoles.filter((role) => !roleOverrides.some((o) => o.role_id === role.id));

	// Purpose display names
	const purposeLabels: Record<SyncPurpose, string> = {
		total_time: "Gesamtzeit (Legacy)",
		time_by_role: "Zeit nach Rolle (Legacy)",
		remaining_budget: "Restbudget (Legacy)",
		budget_used: "Genutztes Budget",
	};

	// Format display names
	const formatLabels: Record<TimeFormat, string> = {
		hours: "Stunden (z. B. 2,5)",
		seconds: "Sekunden (z. B. 9000)",
		"hh:mm": "HH:MM (z. B. 02:30)",
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
		return <div className="admin-error">Fehler: {mondayError}</div>;
	}

	// Check admin access
	if (!canAccessRoute(pathname, { isAdmin: isAdmin })) {
		return (
			<div id="admin-app">
				<div className="admin-error">
					<ErrorState message="Zugriff verweigert: Du hast keine Administratorrechte." />
				</div>
			</div>
		);
	}

	if (!boardConfig) {
		return (
			<div id="admin-app">
				<div className="admin-error">Board-Konfiguration nicht gefunden</div>
			</div>
		);
	}

	return (
		<div id="admin-app">
			<header className="admin-header">
				<Flex align="center" gap={16}>
					<Button leftSection={<Icon name="chevron_left" size={21} />} onClick={() => router.back()}>
						Zurück
					</Button>
					<Logo size={{ height: 21 }} style="brand" loading="eager" />
				</Flex>
			</header>

			<Breadcrumbs mb="md">
				<Anchor component={Link} href="/admin">
					Admin
				</Anchor>
				<Anchor component={Link} href="/admin">
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
							Board-ID: {boardConfig.board_id}
						</Text>
					</div>
					<Badge size="lg" color={boardConfig.sync_enabled ? "green" : "gray"}>
						{boardConfig.sync_enabled ? "Sync aktiv" : "Sync inaktiv"}
					</Badge>
				</Flex>
			</div>

			<Tabs value={activeTab} onChange={setActiveTab} className="admin-tabs">
				<Tabs.List>
					<Tabs.Tab value="general">Allgemein</Tabs.Tab>
					<Tabs.Tab value="webhooks">Webhooks</Tabs.Tab>
					<Tabs.Tab value="columns">Spalten</Tabs.Tab>
					<Tabs.Tab value="groups">Gruppen</Tabs.Tab>
					<Tabs.Tab value="roles">Rollen</Tabs.Tab>
					<Tabs.Tab value="sync">Synchronisierung</Tabs.Tab>
				</Tabs.List>

				{/* General Settings Tab */}
				<Tabs.Panel value="general" pt="md">
					<div className="admin-section">
						<div className="admin-section-header">
							<div>
								<h2>Allgemeine Einstellungen</h2>
								<p className="admin-section-description">Legt fest, wie die Synchronisierung für dieses Board funktioniert.</p>
							</div>
						</div>

						<Stack gap="md">
							<Switch
								label="Board auswählbar"
								description="Legt fest, ob Nutzer dieses Board auswählen können. Die Spalten-Synchronisierung bleibt davon unberührt."
								checked={!!boardConfig.settings?.["board_selectable"]}
								onChange={(event) => {
									updateBoardConfig({
										settings: {
											board_selectable: event.currentTarget.checked,
										},
									});
								}}
							/>
							<Switch
								label="Jobs auswählbar"
								checked={!!boardConfig.settings?.["jobs_selectable"]}
								onChange={(event) => {
									updateBoardConfig({
										settings: {
											jobs_selectable: event.currentTarget.checked,
										},
									});
								}}
							/>
						</Stack>
					</div>
				</Tabs.Panel>

				{/* Webhooks Tab */}
				<Tabs.Panel value="webhooks" pt="md">
					<div className="admin-section">
						<div className="admin-section-header">
							<div>
								<h2>Webhooks</h2>
								<p className="admin-section-description">Legt fest, welche Webhooks für die Synchronisierung von Aufgaben und Zeitdaten verwendet werden.</p>
							</div>
							<Button leftSection={<Icon name="sync" size={21} />} onClick={handleRegisterWebhooks} loading={registeringWebhooks} disabled={webhooksLoading || webhooks.every((w) => w.id)}>
								Fehlende Webhooks registrieren
							</Button>
						</div>

						{webhooksLoading ? (
							<div className="admin-loading">
								<Loader size="sm" />
								<Text size="sm" c="dimmed" ml="xs">
									Webhooks werden geladen...
								</Text>
							</div>
						) : webhooks.length === 0 ? (
							<div className="empty-state">
								<div className="empty-state-title">Keine Webhooks gefunden</div>
								<p className="empty-state-description">Dieses Board hat keine Webhooks, oder sie wurden noch nicht geladen. Webhooks werden von monday.com abgerufen, sobald du diesen Tab öffnest.</p>
							</div>
						) : (
							<Table>
								<Table.Thead>
									<Table.Tr>
										<Table.Th>Event</Table.Th>
										<Table.Th>Webhook-ID</Table.Th>
										<Table.Th>Status</Table.Th>
									</Table.Tr>
								</Table.Thead>
								<Table.Tbody>
									{webhooks.map((webhook) => (
										<Table.Tr key={webhook.event}>
											<Table.Td>{webhook.event}</Table.Td>
											<Table.Td>{webhook.id ?? "–"}</Table.Td>
											<Table.Td>
												<Badge color={webhook.id ? "green" : "gray"}>{webhook.id ? "Eingerichtet" : "Fehlt"}</Badge>
											</Table.Td>
										</Table.Tr>
									))}
								</Table.Tbody>
							</Table>
						)}
					</div>
				</Tabs.Panel>

				{/* Column Mappings Tab */}
				<Tabs.Panel value="columns" pt="md">
					<div className="admin-section">
						<div className="admin-section-header">
							<div>
								<h2>Spalten-Zuordnungen</h2>
								<p className="admin-section-description">Legt fest, welche monday.com-Spalten synchronisierte Zeitdaten erhalten.</p>
							</div>
							<Button leftSection={<Icon name="add" size={21} />} onClick={() => handleOpenColumnModal()}>
								Spalten-Zuordnung hinzufügen
							</Button>
						</div>

						{columns.length === 0 ? (
							<div className="empty-state">
								<div className="empty-state-title">Keine Spalten-Zuordnungen</div>
								<p className="empty-state-description">Füge eine Spalten-Zuordnung hinzu, um Zeitdaten mit einer monday.com-Spalte zu synchronisieren.</p>
								<Button onClick={() => handleOpenColumnModal()}>Spalten-Zuordnung hinzufügen</Button>
							</div>
						) : (
							<Table>
								<Table.Thead>
									<Table.Tr>
										<Table.Th>Spalte</Table.Th>
										<Table.Th>Typ</Table.Th>
										<Table.Th>Sync-Zweck</Table.Th>
										<Table.Th>Format</Table.Th>
										<Table.Th>Status</Table.Th>
										<Table.Th>Aktionen</Table.Th>
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
												<Badge color={column.sync_enabled ? "green" : "gray"}>{column.sync_enabled ? "Aktiviert" : "Deaktiviert"}</Badge>
											</Table.Td>
											<Table.Td>
												<Group gap="xs">
													<IconButton variant="light" onClick={() => handleOpenColumnModal(column)}>
														<Icon name="edit" size={21} />
													</IconButton>
													<IconButton variant="light" color="red" onClick={() => handleDeleteColumn(column)}>
														<Icon name="delete" size={21} />
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
								<h2>Gruppen</h2>
								<p className="admin-section-description">Legt fest, welche Gruppen für die Aufgabenauswahl synchronisiert werden. Deaktivierte Gruppen erscheinen nicht im Aufgaben-Dropdown.</p>
							</div>
						</div>

						{groupsLoading ? (
							<div className="admin-loading">
								<Loader size="sm" />
								<Text size="sm" c="dimmed" ml="xs">
									Gruppen werden geladen...
								</Text>
							</div>
						) : groups.length === 0 ? (
							<div className="empty-state">
								<div className="empty-state-title">Keine Gruppen gefunden</div>
								<p className="empty-state-description">Dieses Board hat keine Gruppen, oder sie wurden noch nicht geladen. Gruppen werden von monday.com abgerufen, sobald du diesen Tab öffnest.</p>
							</div>
						) : (
							<Table>
								<Table.Thead>
									<Table.Tr>
										<Table.Th>Gruppe</Table.Th>
										<Table.Th>Position</Table.Th>
										<Table.Th>Sync-Status</Table.Th>
										<Table.Th>Aktionen</Table.Th>
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
												<Badge color={group.sync_enabled ? "green" : "gray"}>{group.sync_enabled ? "Synchronisiert" : "Nicht synchronisiert"}</Badge>
											</Table.Td>
											<Table.Td>
												<Switch label={group.sync_enabled ? "Aktiviert" : "Deaktiviert"} checked={group.sync_enabled} onChange={() => handleToggleGroupSync(group.id, group.sync_enabled)} />
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
								<h2>Satzüberschreibungen für Rollen</h2>
								<p className="admin-section-description">Überschreibe die Standard-Stundensätze für bestimmte Rollen auf diesem Board.</p>
							</div>
							<Button leftSection={<Icon name="add" size={21} />} onClick={() => handleOpenOverrideModal()} disabled={availableRolesForOverride.length === 0}>
								Satzüberschreibung hinzufügen
							</Button>
						</div>

						{roleOverrides.length === 0 ? (
							<div className="empty-state">
								<div className="empty-state-title">Keine Satzüberschreibungen</div>
								<p className="empty-state-description">Alle Rollen verwenden ihre Standard-Stundensätze. Füge eine Überschreibung hinzu, um die Sätze für dieses Board anzupassen.</p>
							</div>
						) : (
							<Table>
								<Table.Thead>
									<Table.Tr>
										<Table.Th>Rolle</Table.Th>
										<Table.Th>Standardsatz</Table.Th>
										<Table.Th>Überschreibungssatz</Table.Th>
										<Table.Th>Status</Table.Th>
										<Table.Th>Aktionen</Table.Th>
									</Table.Tr>
								</Table.Thead>
								<Table.Tbody>
									{roleOverrides.map((override) => (
										<Table.Tr key={override.id}>
											<Table.Td>
												<Flex align="center" gap="xs">
													<div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: override.role?.color_hex || "#0073ea" }} />
													<Text fw={500}>{override.role?.name || "Unbekannte Rolle"}</Text>
												</Flex>
											</Table.Td>
											<Table.Td>
												<Text c="dimmed">€{override.role?.hourly_rate?.toFixed(2) || "0.00"}</Text>
											</Table.Td>
											<Table.Td>
												<Text fw={600}>€{override.hourly_rate.toFixed(2)}</Text>
											</Table.Td>
											<Table.Td>
												<Badge color={override.is_enabled ? "green" : "gray"}>{override.is_enabled ? "Aktiv" : "Inaktiv"}</Badge>
											</Table.Td>
											<Table.Td>
												<Group gap="xs">
													<IconButton variant="light" onClick={() => handleOpenOverrideModal(override)}>
														<Icon name="edit" size={21} />
													</IconButton>
													<IconButton variant="light" color="red" onClick={() => handleDeleteOverride(override)}>
														<Icon name="delete" size={21} />
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
								<h2>Sync-Vorgänge</h2>
								<p className="admin-section-description">Synchronisiere Zeitdaten manuell mit monday.com-Spalten oder sieh dir die Sync-Statistiken an.</p>
							</div>
						</div>

						<Stack gap="lg">
							{/* Sync Stats */}
							{syncStats && (
								<Card withBorder padding="lg">
									<Text fw={600} mb="md">
										Sync-Statistiken (letzte 24 Stunden)
									</Text>
									<Group gap="xl">
										<div>
											<Text size="2xl" fw={700} c="green">
												{syncStats.last24Hours.successCount}
											</Text>
											<Text size="sm" c="dimmed">
												Erfolgreiche Syncs
											</Text>
										</div>
										<div>
											<Text size="2xl" fw={700} c="red">
												{syncStats.last24Hours.failureCount}
											</Text>
											<Text size="sm" c="dimmed">
												Fehlgeschlagene Syncs
											</Text>
										</div>
										<div>
											<Text size="2xl" fw={700}>
												{syncStats.itemsWithTimeEntries}
											</Text>
											<Text size="sm" c="dimmed">
												Aufgaben mit Zeiteinträgen
											</Text>
										</div>
									</Group>
								</Card>
							)}

							{/* Bulk Sync */}
							<Card withBorder padding="lg">
								<Text fw={600} mb="sm">
									Alle Aufgaben synchronisieren
								</Text>
								<Text size="sm" c="dimmed" mb="md">
									Synchronisiert Zeitdaten für alle Aufgaben auf diesem Board, die Zeiteinträge haben. Dabei werden alle konfigurierten Spalten gemäß deinen Spalten-Zuordnungen aktualisiert.
								</Text>

								{syncProgress > 0 && <Progress value={syncProgress} mb="md" animated={syncing} color={syncProgress === 100 ? "green" : "blue"} />}

								<Button leftSection={<Icon name="sync" size={21} />} onClick={handleBulkSync} loading={syncing} disabled={!boardConfig.sync_enabled || columns.length === 0}>
									{syncing ? "Synchronisiere..." : "Alle Aufgaben synchronisieren"}
								</Button>

								{!boardConfig.sync_enabled && (
									<Text size="sm" c="red" mt="sm">
										Sync ist für dieses Board deaktiviert. Aktiviere es in den Board-Einstellungen, um diese Funktion zu nutzen.
									</Text>
								)}

								{columns.length === 0 && boardConfig.sync_enabled && (
									<Text size="sm" c="orange" mt="sm">
										Keine Spalten-Zuordnungen konfiguriert. Füge Spalten-Zuordnungen hinzu, um Daten zu synchronisieren.
									</Text>
								)}
							</Card>

							{/* Sync Results */}
							{syncResults && syncResults.length > 0 && (
								<Card withBorder padding="lg">
									<Text fw={600} mb="md">
										Letzte Sync-Ergebnisse
									</Text>
									<Table>
										<Table.Thead>
											<Table.Tr>
												<Table.Th>Aufgaben-ID</Table.Th>
												<Table.Th>Status</Table.Th>
												<Table.Th>Aktualisierte Spalten</Table.Th>
												<Table.Th>Fehler</Table.Th>
											</Table.Tr>
										</Table.Thead>
										<Table.Tbody>
											{syncResults.slice(0, 20).map((result, idx) => (
												<Table.Tr key={idx}>
													<Table.Td>
														<Text size="sm">{result.itemId}</Text>
													</Table.Td>
													<Table.Td>
														<Badge color={result.success ? "green" : "red"}>{result.success ? "Erfolg" : "Fehlgeschlagen"}</Badge>
													</Table.Td>
													<Table.Td>{result.columnsUpdated}</Table.Td>
													<Table.Td>
														{result.errors.length > 0 ? (
															<Text size="xs" c="red">
																{result.errors.join(", ")}
															</Text>
														) : (
															<Text size="xs" c="dimmed">
																Keine
															</Text>
														)}
													</Table.Td>
												</Table.Tr>
											))}
										</Table.Tbody>
									</Table>
									{syncResults.length > 20 && (
										<Text size="sm" c="dimmed" mt="sm">
											Zeige die ersten 20 von {syncResults.length} Ergebnissen
										</Text>
									)}
								</Card>
							)}
						</Stack>
					</div>
				</Tabs.Panel>
			</Tabs>

			{/* Column Modal */}
			<Modal opened={columnModalOpen} onClose={() => setColumnModalOpen(false)} title={editingColumn ? "Spalten-Zuordnung bearbeiten" : "Spalten-Zuordnung hinzufügen"} size="lg">
				<Stack gap="md">
					{!editingColumn && (
						<Select
							label="Spalte auswählen"
							placeholder="Wähle eine monday.com-Spalte"
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

					{editingColumn && <Input label="Spalte" value={`${columnForm.column_name} (${columnForm.column_type})`} disabled />}

					<Switch label="Sync aktivieren" description="Sync für diese Spalten-Zuordnung umschalten" checked={columnForm.sync_enabled} onChange={(e) => setColumnForm({ ...columnForm, sync_enabled: e.currentTarget.checked })} />

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={() => setColumnModalOpen(false)}>
							Abbrechen
						</Button>
						<Button onClick={handleSaveColumn} loading={savingColumn}>
							{editingColumn ? "Zuordnung aktualisieren" : "Zuordnung hinzufügen"}
						</Button>
					</Group>
				</Stack>
			</Modal>

			{/* Role Override Modal */}
			<Modal opened={overrideModalOpen} onClose={() => setOverrideModalOpen(false)} title={editingOverride ? "Satzüberschreibung bearbeiten" : "Satzüberschreibung hinzufügen"} size="md">
				<Stack gap="md">
					{!editingOverride && (
						<Select
							label="Rolle auswählen"
							placeholder="Wähle eine Rolle"
							data={availableRolesForOverride.map((r) => ({
								value: r.id,
								label: `${r.name} (Standard: €${r.hourly_rate.toFixed(2)})`,
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

					{editingOverride && <Input label="Rolle" value={editingOverride.role?.name || "Unbekannte Rolle"} disabled />}

					<NumberInput
						label="Überschreibungs-Stundensatz (€)"
						description="Dieser Satz wird anstelle des Standards für dieses Board verwendet"
						placeholder="0.00"
						value={overrideForm.hourly_rate}
						onChange={(val) => setOverrideForm({ ...overrideForm, hourly_rate: Number(val) || 0 })}
						min={0}
						decimalScale={2}
					/>

					<Switch label="Aktiv" description="Legt fest, ob diese Überschreibung angewendet wird" checked={overrideForm.is_enabled} onChange={(e) => setOverrideForm({ ...overrideForm, is_enabled: e.currentTarget.checked })} />

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={() => setOverrideModalOpen(false)}>
							Abbrechen
						</Button>
						<Button onClick={handleSaveOverride} loading={savingOverride}>
							{editingOverride ? "Überschreibung aktualisieren" : "Überschreibung hinzufügen"}
						</Button>
					</Group>
				</Stack>
			</Modal>
		</div>
	);
}
