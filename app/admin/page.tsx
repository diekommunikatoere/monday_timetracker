"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Logo } from "@/components/Logo";
import { Accordion, TextInput, NumberInput, Switch, Modal, Loader, Badge, Tooltip, ColorInput, Textarea, Group, Stack, Text, Flex, Checkbox, ScrollArea } from "@mantine/core";
import { Button, IconButton, IconLink, LoadingState, ErrorState, Icon, Input } from "@/components";
import { notifications } from "@mantine/notifications";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import type { Role } from "@/types/database";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { canAccessRoute } from "@/lib/permissions";
import { usePathname } from "next/navigation";

import "@/public/css/components/AdminPage.css";

const DEFAULT_WORKSPACE_ID = "__default__";

interface WorkspaceBoardGroup {
	workspaceId: string;
	workspaceName: string;
	boards: Array<{ value: string; label: string; kind: string }>;
}

interface PickerBoardOption {
	value: string;
	label: string;
	workspaceId: string;
	workspaceName: string;
}

interface DisplayBoardRow {
	board_id: string;
	board_name: string;
	workspace_id: string | null;
	workspace_name: string;
	sync_enabled: boolean;
	config_status: "GREEN" | "YELLOW";
}

/** Draggable row in the "Boards verwalten" sortable list. */
function SortableBoardRow({ board, onRemove }: { board: DisplayBoardRow; onRemove: (boardId: string) => void }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.board_id });
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} className="board-row">
			<button type="button" className="board-row-handle" aria-label="Board verschieben" {...attributes} {...listeners}>
				<Icon name="menu" size={18} />
			</button>
			<div className="board-row-info">
				<span className="board-row-name">{board.board_name}</span>
				<span className="board-row-workspace">{board.workspace_name}</span>
			</div>
			<div className="board-row-actions">
				{board.sync_enabled && board.config_status === "YELLOW" && (
					<Tooltip label="Sync aktiv, aber keine Budget-verwendet-Spalte zugeordnet">
						<Badge size="xs" color="yellow" variant="light">
							Sync unvollständig
						</Badge>
					</Tooltip>
				)}
				<span className={`board-sync-badge ${board.sync_enabled ? "enabled" : "disabled"}`}>{board.sync_enabled ? "Sync aktiv" : "Sync inaktiv"}</span>
				<Tooltip label="Board-Einstellungen">
					<IconLink variant="filled" color="var(--color--background-secondary)" href={`/admin/boards/${board.board_id}`}>
						<Icon name="settings" size={20} color="var(--color--text-primary)" />
					</IconLink>
				</Tooltip>
				<Tooltip label="Board entfernen">
					<IconButton variant="filled" color="var(--color--primary)" onClick={() => onRemove(board.board_id)}>
						<Icon name="delete" size={20} color="var(--color--text-on-primary)" />
					</IconButton>
				</Tooltip>
			</div>
		</div>
	);
}

export default function AdminPage() {
	const pathname = usePathname();
	const mondayIsAdmin = useUserStore((state) => state.mondayUser?.isAdmin);

	if (!canAccessRoute(pathname, { isAdmin: mondayIsAdmin })) {
		return (
			<div id="admin-app">
				<div className="admin-error">
					<ErrorState message="Zugriff verweigert: Du hast keine Administratorrechte." />
				</div>
			</div>
		);
	}

	const [roles, setRoles] = useState<Role[]>([]);
	const [allBoardConfigs, setAllBoardConfigs] = useState<any[]>([]);
	const [pickerGroups, setPickerGroups] = useState<WorkspaceBoardGroup[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Role modal state
	const [roleModalOpen, setRoleModalOpen] = useState(false);
	const [editingRole, setEditingRole] = useState<Role | null>(null);
	const [roleForm, setRoleForm] = useState({
		name: "",
		description: "",
		hourly_rate: 0,
		color_hex: "#0073ea",
		is_active: true,
	});
	const [savingRole, setSavingRole] = useState(false);

	// Board picker modal state
	const [pickerOpen, setPickerOpen] = useState(false);
	const [pickerLoading, setPickerLoading] = useState(false);
	const [pickerSearch, setPickerSearch] = useState("");
	const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());
	const [savingBoards, setSavingBoards] = useState(false);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

	// Monday context
	const { initializeMondayContext, isLoading: mondayLoading, error: mondayError, sessionToken } = useMondayStore();
	const isAdmin = useUserStore((state) => state.mondayUser?.isAdmin);

	// Initialize Monday context on mount
	useEffect(() => {
		initializeMondayContext().catch((err) => console.error("Error initializing Monday context:", err));
	}, [initializeMondayContext]);

	// Fetch roles
	const fetchRoles = useCallback(async () => {
		if (!sessionToken) return;

		try {
			const response = await fetch("/api/admin/roles", {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Rollen konnten nicht geladen werden");
			}

			setRoles(data.roles || []);
		} catch (err) {
			console.error("Error fetching roles:", err);
			setError(err instanceof Error ? err.message : "Rollen konnten nicht geladen werden");
		}
	}, [sessionToken]);

	// Fetch board configs (all rows; display list is derived client-side)
	const fetchBoards = useCallback(async () => {
		if (!sessionToken) return;

		try {
			const response = await fetch("/api/admin/boards", {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Board-Konfigurationen konnten nicht geladen werden");
			}

			setAllBoardConfigs(data.boards || []);
		} catch (err) {
			console.error("Error fetching boards:", err);
			setError(err instanceof Error ? err.message : "Board-Konfigurationen konnten nicht geladen werden");
		}
	}, [sessionToken]);

	// Fetch all monday boards grouped by workspace, for the picker + workspace-name lookup
	const fetchPickerGroups = useCallback(async () => {
		if (!sessionToken) return;

		setPickerLoading(true);
		try {
			const response = await fetch("/api/admin/monday/boards", {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Monday-Boards konnten nicht geladen werden");
			}

			setPickerGroups(data.groups || []);
		} catch (err) {
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Monday-Boards konnten nicht geladen werden",
				color: "red",
			});
		} finally {
			setPickerLoading(false);
		}
	}, [sessionToken]);

	// Load data on mount or when sessionToken becomes available
	useEffect(() => {
		if (!sessionToken) return;

		const loadData = async () => {
			setLoading(true);
			await Promise.all([fetchRoles(), fetchBoards(), fetchPickerGroups()]);
			setLoading(false);
		};
		loadData();
	}, [fetchRoles, fetchBoards, fetchPickerGroups, sessionToken]);

	// Sort roles by status and then alphabetically
	const sortedRoles = useMemo(
		() =>
			[...roles].sort((a, b) => {
				if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
				return a.name.localeCompare(b.name);
			}),
		[roles],
	);

	const workspaceNameById = useMemo(() => {
		const map: Record<string, string> = {};
		pickerGroups.forEach((group) => {
			map[group.workspaceId] = group.workspaceName;
		});
		return map;
	}, [pickerGroups]);

	// The enabled, ordered "Boards verwalten" list, derived from the raw board_config rows
	const displayBoards: DisplayBoardRow[] = useMemo(() => {
		return allBoardConfigs
			.filter((b: any) => b.display_enabled)
			.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
			.map((b: any) => {
				const workspaceId: string | null = b.monday_board?.workspace_id ?? null;
				return {
					board_id: b.board_id,
					board_name: b.monday_board?.name || b.board_id,
					workspace_id: workspaceId,
					workspace_name: (workspaceId && workspaceNameById[workspaceId]) || "Hauptbereich",
					sync_enabled: !!b.sync_enabled,
					config_status: (b.config_status as "GREEN" | "YELLOW") || "GREEN",
				};
			});
	}, [allBoardConfigs, workspaceNameById]);

	const allPickerBoardsById = useMemo(() => {
		const map = new Map<string, PickerBoardOption>();
		pickerGroups.forEach((group) => {
			group.boards.forEach((b) => {
				map.set(b.value, { value: b.value, label: b.label, workspaceId: group.workspaceId, workspaceName: group.workspaceName });
			});
		});
		return map;
	}, [pickerGroups]);

	// Picker groups filtered to boards not already enabled, and matching the search term
	const filteredPickerGroups = useMemo(() => {
		const enabledIds = new Set(displayBoards.map((b) => b.board_id));
		const term = pickerSearch.trim().toLowerCase();

		return pickerGroups
			.map((group) => ({
				...group,
				boards: group.boards.filter((b) => !enabledIds.has(b.value) && (!term || b.label.toLowerCase().includes(term) || group.workspaceName.toLowerCase().includes(term))),
			}))
			.filter((group) => group.boards.length > 0);
	}, [pickerGroups, displayBoards, pickerSearch]);

	// Board display handlers
	const saveDisplayBoards = useCallback(
		async (list: DisplayBoardRow[]) => {
			if (!sessionToken) return;
			setSavingBoards(true);
			try {
				const response = await fetch("/api/admin/boards/display", {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${sessionToken}`,
					},
					body: JSON.stringify({
						boards: list.map((b) => ({ board_id: b.board_id, board_name: b.board_name, workspace_id: b.workspace_id })),
					}),
				});

				const data = await response.json();

				if (!response.ok) {
					throw new Error(data.error || "Board-Auswahl konnte nicht gespeichert werden");
				}

				notifications.show({
					title: "Gespeichert",
					message: "Board-Auswahl aktualisiert.",
					color: "green",
				});
			} catch (err) {
				notifications.show({
					title: "Fehler",
					message: err instanceof Error ? err.message : "Board-Auswahl konnte nicht gespeichert werden",
					color: "red",
				});
			} finally {
				await fetchBoards();
				setSavingBoards(false);
			}
		},
		[sessionToken, fetchBoards],
	);

	const handleOpenPicker = () => {
		setPickerSearch("");
		setPickerSelectedIds(new Set());
		setPickerOpen(true);
		fetchPickerGroups();
	};

	const togglePickerSelection = (boardId: string) => {
		setPickerSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(boardId)) {
				next.delete(boardId);
			} else {
				next.add(boardId);
			}
			return next;
		});
	};

	const handleAddSelectedBoards = () => {
		const toAdd = Array.from(pickerSelectedIds)
			.map((id) => allPickerBoardsById.get(id))
			.filter((b): b is PickerBoardOption => !!b && !displayBoards.some((d) => d.board_id === b.value));

		if (toAdd.length === 0) {
			setPickerOpen(false);
			return;
		}

		const newList: DisplayBoardRow[] = [
			...displayBoards,
			...toAdd.map((b) => ({
				board_id: b.value,
				board_name: b.label,
				workspace_id: b.workspaceId === DEFAULT_WORKSPACE_ID ? null : b.workspaceId,
				workspace_name: b.workspaceName,
				sync_enabled: true,
				config_status: "YELLOW" as const,
			})),
		];

		// Optimistic local update so the list reflects the change immediately
		setAllBoardConfigs((prev) => {
			const existingIds = new Set(prev.map((b: any) => b.board_id));
			const additions = toAdd
				.filter((b) => !existingIds.has(b.value))
				.map((b, idx) => ({
					board_id: b.value,
					sync_enabled: true,
					display_enabled: true,
					sort_order: displayBoards.length + idx,
					config_status: "YELLOW",
					monday_board: { name: b.label, workspace_id: b.workspaceId === DEFAULT_WORKSPACE_ID ? null : b.workspaceId },
				}));
			return [...prev, ...additions];
		});

		setPickerOpen(false);
		setPickerSelectedIds(new Set());
		saveDisplayBoards(newList);
	};

	const handleRemoveBoard = (boardId: string) => {
		const newList = displayBoards.filter((b) => b.board_id !== boardId);

		setAllBoardConfigs((prev) => prev.map((b: any) => (b.board_id === boardId ? { ...b, display_enabled: false, sort_order: 0 } : b)));

		saveDisplayBoards(newList);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const oldIndex = displayBoards.findIndex((b) => b.board_id === active.id);
		const newIndex = displayBoards.findIndex((b) => b.board_id === over.id);
		if (oldIndex === -1 || newIndex === -1) return;

		const reordered = arrayMove(displayBoards, oldIndex, newIndex);

		setAllBoardConfigs((prev) => {
			const sortIndex = new Map(reordered.map((b, idx) => [b.board_id, idx]));
			return prev.map((b: any) => (sortIndex.has(b.board_id) ? { ...b, sort_order: sortIndex.get(b.board_id) } : b));
		});

		saveDisplayBoards(reordered);
	};

	// Role handlers
	const handleOpenRoleModal = (role?: Role) => {
		if (role) {
			setEditingRole(role);
			setRoleForm({
				name: role.name,
				description: role.description || "",
				hourly_rate: role.hourly_rate,
				color_hex: role.color_hex || "#0073ea",
				is_active: role.is_active,
			});
		} else {
			setEditingRole(null);
			setRoleForm({
				name: "",
				description: "",
				hourly_rate: 0,
				color_hex: "#0073ea",
				is_active: true,
			});
		}
		setRoleModalOpen(true);
	};

	const handleSaveRole = async () => {
		if (!roleForm.name.trim()) {
			notifications.show({
				title: "Validierungsfehler",
				message: "Rollenname ist erforderlich",
				color: "red",
			});
			return;
		}

		setSavingRole(true);
		try {
			const method = editingRole ? "PATCH" : "POST";
			const body = editingRole ? { id: editingRole.id, ...roleForm } : roleForm;

			const response = await fetch("/api/admin/roles", {
				method,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify(body),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Rolle konnte nicht gespeichert werden");
			}

			notifications.show({
				title: "Erfolg",
				message: editingRole ? "Rolle erfolgreich aktualisiert" : "Rolle erfolgreich erstellt",
				color: "green",
			});

			setRoleModalOpen(false);
			fetchRoles();
		} catch (err) {
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Rolle konnte nicht gespeichert werden",
				color: "red",
			});
		} finally {
			setSavingRole(false);
		}
	};

	const handleDeleteRole = async (role: Role) => {
		if (!confirm(`Möchten Sie die Rolle "${role.name}" wirklich deaktivieren?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/roles?id=${role.id}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Rolle konnte nicht deaktiviert werden");
			}

			notifications.show({
				title: "Erfolg",
				message: "Rolle erfolgreich deaktiviert",
				color: "green",
			});

			fetchRoles();
		} catch (err) {
			notifications.show({
				title: "Fehler",
				message: err instanceof Error ? err.message : "Rolle konnte nicht deaktiviert werden",
				color: "red",
			});
		}
	};

	// Show loading state while initializing
	if (mondayLoading) {
		return (
			<div id="admin-app">
				<header className="admin-header">
					<Flex align="center" gap={16}>
						<Logo size={{ width: 180, height: 32 }} style="brand" />
						<Text size="lg" fw={600} c="dimmed">
							/ Admin Settings
						</Text>
					</Flex>
				</header>
				<LoadingState />
			</div>
		);
	}

	// Show error if Monday initialization failed
	if (mondayError) {
		return (
			<div className="admin-error">
				<ErrorState message={mondayError} />
			</div>
		);
	}

	// Check admin access
	if (!isAdmin) {
		return (
			<div id="admin-app">
				<div className="admin-error">
					<ErrorState message="Zugriff verweigert: Du hast keine Administratorrechte." />
				</div>
			</div>
		);
	}

	return (
		<div id="admin-app">
			<header className="admin-header">
				<Flex align="center" gap={16}>
					<Logo size={{ height: 27 }} style="brand" />
					<Text size="lg" fw={600} c="dimmed">
						/ Admin-Einstellungen
					</Text>
				</Flex>
			</header>

			{error && <div className="admin-error">{error}</div>}

			{/* Boards verwalten */}
			<div className="admin-section">
				<div className="admin-section-header">
					<div>
						<h2>Boards verwalten</h2>
						<p className="admin-section-description">Boards für die Zeiterfassung freigeben und ihre Reihenfolge in der Board-Auswahl festlegen.</p>
					</div>
					<Button leftSection={<Icon name="add" size={21} color="white" />} onClick={handleOpenPicker}>
						Board hinzufügen/aktivieren
					</Button>
				</div>

				{loading ? (
					<div className="admin-loading">
						<Loader />
					</div>
				) : displayBoards.length === 0 ? (
					<div className="empty-state">
						<div className="empty-state-title">Keine Boards aktiviert</div>
						<p className="empty-state-description">Aktivieren Sie ein Board, damit es in der Zeiterfassung ausgewählt werden kann.</p>
						<Button onClick={handleOpenPicker}>Board hinzufügen/aktivieren</Button>
					</div>
				) : (
					<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
						<SortableContext items={displayBoards.map((b) => b.board_id)} strategy={verticalListSortingStrategy}>
							<div className="board-sortable-list" aria-busy={savingBoards}>
								{displayBoards.map((board) => (
									<SortableBoardRow key={board.board_id} board={board} onRemove={handleRemoveBoard} />
								))}
							</div>
						</SortableContext>
					</DndContext>
				)}
			</div>

			{/* Rollen */}
			<div className="admin-section">
				<div className="admin-section-header">
					<div>
						<h2>Rollen</h2>
						<p className="admin-section-description">Rollen und ihre Standard-Stundensätze für die Zeiterfassung definieren.</p>
					</div>
					<Button leftSection={<Icon name="add" size={21} color="white" />} onClick={() => handleOpenRoleModal()}>
						Rolle hinzufügen
					</Button>
				</div>

				{loading ? (
					<div className="admin-loading">
						<Loader />
					</div>
				) : roles.length === 0 ? (
					<div className="empty-state">
						<div className="empty-state-title">Keine Rollen definiert</div>
						<p className="empty-state-description">Erstellen Sie Ihre erste Rolle, um Zeit nach Rolle zu erfassen.</p>
						<Button onClick={() => handleOpenRoleModal()}>Rolle erstellen</Button>
					</div>
				) : (
					<div className="role-grid">
						{sortedRoles.map((role) => (
							<div key={role.id} className="role-card">
								<div className="role-card-header">
									<div className="role-card-title">
										<div className="role-color-indicator" style={{ backgroundColor: role.color_hex || "#0073ea" }} />
										<span className="role-card-name">{role.name}</span>
									</div>
									<span className={`role-card-status ${role.is_active ? "active" : "inactive"}`}>{role.is_active ? "Aktiv" : "Inaktiv"}</span>
								</div>
								<div className="role-card-details">
									<div className="role-detail-row">
										<span className="role-detail-label">Beschreibung</span>
										<span className="role-detail-value">{role.description}</span>
									</div>
									<div className="role-detail-row">
										<span className="role-detail-label">Stundensatz</span>
										<span className="role-detail-value">{role.hourly_rate.toFixed(2)} €</span>
									</div>
								</div>
								<div className="role-card-actions">
									<Tooltip label="Rolle bearbeiten">
										<IconButton colorVariant="primary-muted" onClick={() => handleOpenRoleModal(role)}>
											<Icon name="edit" size={21} />
										</IconButton>
									</Tooltip>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Board Picker Modal */}
			<Modal opened={pickerOpen} onClose={() => setPickerOpen(false)} title="Boards hinzufügen/aktivieren" size="lg">
				<Stack gap="md">
					<Input placeholder="Board suchen…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} leftSection={<Icon name="search" size={18} />} clearable onClear={() => setPickerSearch("")} />

					{pickerLoading ? (
						<div className="admin-loading">
							<Loader size="sm" />
						</div>
					) : filteredPickerGroups.length === 0 ? (
						<Text size="sm" c="dimmed">
							Keine weiteren Boards gefunden.
						</Text>
					) : (
						<ScrollArea h={360}>
							<Accordion variant="separated" chevronPosition="right">
								{filteredPickerGroups.map((group) => (
									<Accordion.Item key={group.workspaceId} value={group.workspaceId}>
										<Accordion.Control>{group.workspaceName}</Accordion.Control>
										<Accordion.Panel>
											<div className="board-picker-checkboxes">
												{group.boards.map((board) => (
													<Checkbox key={board.value} label={board.label} checked={pickerSelectedIds.has(board.value)} onChange={() => togglePickerSelection(board.value)} />
												))}
											</div>
										</Accordion.Panel>
									</Accordion.Item>
								))}
							</Accordion>
						</ScrollArea>
					)}

					<Group justify="space-between" mt="md">
						<Text size="sm" c="dimmed">
							{pickerSelectedIds.size} ausgewählt
						</Text>
						<Group>
							<Button variant="default" onClick={() => setPickerOpen(false)}>
								Abbrechen
							</Button>
							<Button onClick={handleAddSelectedBoards} disabled={pickerSelectedIds.size === 0}>
								Hinzufügen
							</Button>
						</Group>
					</Group>
				</Stack>
			</Modal>

			{/* Role Modal */}
			<Modal opened={roleModalOpen} onClose={() => setRoleModalOpen(false)} title={editingRole ? "Rolle bearbeiten" : "Rolle erstellen"} size="md">
				<Stack gap="md">
					<TextInput label="Rollenname" placeholder="z. B. Entwickler, Designer" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} required />

					<Textarea label="Beschreibung" placeholder="Kurze Beschreibung dieser Rolle" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />

					<NumberInput label="Standard-Stundensatz (€)" placeholder="0,00" value={roleForm.hourly_rate} onChange={(val) => setRoleForm({ ...roleForm, hourly_rate: Number(val) || 0 })} min={0} decimalScale={2} />

					<ColorInput label="Farbe" value={roleForm.color_hex} onChange={(val) => setRoleForm({ ...roleForm, color_hex: val })} format="hex" swatches={["#0073ea", "#00c875", "#fdab3d", "#e2445c", "#a25ddc", "#037f4c", "#579bfc", "#ff5ac4", "#cab641", "#784bd1"]} />

					<Switch label="Aktiv" checked={roleForm.is_active} onChange={(e) => setRoleForm({ ...roleForm, is_active: e.currentTarget.checked })} />

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={() => setRoleModalOpen(false)}>
							Abbrechen
						</Button>
						<Button onClick={handleSaveRole} loading={savingRole}>
							{editingRole ? "Rolle aktualisieren" : "Rolle erstellen"}
						</Button>
					</Group>
				</Stack>
			</Modal>
		</div>
	);
}
