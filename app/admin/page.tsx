"use client";

import { useEffect, useState, useCallback } from "react";
import { Logo } from "@/components/Logo";
import { Tabs, TextInput, NumberInput, Switch, Select, Modal, Loader, Badge, Tooltip, ColorInput, Textarea, Group, Stack, Text, Flex, Box } from "@mantine/core";
import { Button, IconButton, IconLink } from "@/components";
import { Icon } from "@/components";
import { notifications } from "@mantine/notifications";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import type { Role, BoardConfig } from "@/types/database";

import "@/public/css/components/AdminPage.css";

export default function AdminPage() {
	const [activeTab, setActiveTab] = useState<string | null>("roles");
	const [roles, setRoles] = useState<Role[]>([]);
	const [boards, setBoards] = useState<BoardConfig[]>([]);
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

	// Board modal state
	const [boardModalOpen, setBoardModalOpen] = useState(false);
	const [editingBoard, setEditingBoard] = useState<BoardConfig | null>(null);
	const [boardForm, setBoardForm] = useState({
		board_id: "",
		board_name: "",
		sync_enabled: true,
		sync_on_finalize: true,
		sync_budget_used: true,
		linked_board_id: "",
		sync_linked_items: true,
	});
	const [savingBoard, setSavingBoard] = useState(false);

	// Monday context
	const { initializeMondayContext, isLoading: mondayLoading, error: mondayError } = useMondayStore();
	const isAdmin = useUserStore((state) => state.mondayUser?.isAdmin);

	// Initialize Monday context on mount
	useEffect(() => {
		initializeMondayContext().catch((err) => console.error("Error initializing Monday context:", err));
	}, [initializeMondayContext]);

	// Fetch roles
	const fetchRoles = useCallback(async () => {
		try {
			const response = await fetch("/api/admin/roles");
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to fetch roles");
			}

			setRoles(data.roles || []);
		} catch (err) {
			console.error("Error fetching roles:", err);
			setError(err instanceof Error ? err.message : "Failed to fetch roles");
		}
	}, []);

	// Fetch board configs
	const fetchBoards = useCallback(async () => {
		try {
			const response = await fetch("/api/admin/boards");
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to fetch board configurations");
			}

			setBoards(data.boards || []);
		} catch (err) {
			console.error("Error fetching boards:", err);
			setError(err instanceof Error ? err.message : "Failed to fetch board configurations");
		}
	}, []);

	// Load data on mount
	useEffect(() => {
		const loadData = async () => {
			setLoading(true);
			await Promise.all([fetchRoles(), fetchBoards()]);
			setLoading(false);
		};
		loadData();
	}, [fetchRoles, fetchBoards]);

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
				title: "Validation Error",
				message: "Role name is required",
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
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to save role");
			}

			notifications.show({
				title: "Success",
				message: editingRole ? "Role updated successfully" : "Role created successfully",
				color: "green",
			});

			setRoleModalOpen(false);
			fetchRoles();
		} catch (err) {
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to save role",
				color: "red",
			});
		} finally {
			setSavingRole(false);
		}
	};

	const handleDeleteRole = async (role: Role) => {
		if (!confirm(`Are you sure you want to deactivate the role "${role.name}"?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/roles?id=${role.id}`, {
				method: "DELETE",
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to delete role");
			}

			notifications.show({
				title: "Success",
				message: "Role deactivated successfully",
				color: "green",
			});

			fetchRoles();
		} catch (err) {
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to delete role",
				color: "red",
			});
		}
	};

	// Board handlers
	const handleOpenBoardModal = (board?: BoardConfig) => {
		if (board) {
			setEditingBoard(board);
			setBoardForm({
				board_id: board.board_id,
				board_name: (board as any).monday_board?.name || "Unbenanntes Board",
				sync_enabled: board.sync_enabled || false,
				sync_on_finalize: board.sync_on_finalize || false,
				sync_budget_used: board.sync_budget_used || false,
				linked_board_id: board.linked_board_id || "",
				sync_linked_items: board.sync_linked_items || false,
			});
		} else {
			setEditingBoard(null);
			setBoardForm({
				board_id: "",
				board_name: "",
				sync_enabled: true,
				sync_on_finalize: true,
				sync_budget_used: true,
				linked_board_id: "",
				sync_linked_items: true,
			});
		}
		setBoardModalOpen(true);
	};

	const handleSaveBoard = async () => {
		if (!boardForm.board_id.trim() || !boardForm.board_name.trim()) {
			notifications.show({
				title: "Validation Error",
				message: "Board ID and name are required",
				color: "red",
			});
			return;
		}

		setSavingBoard(true);
		try {
			const method = editingBoard ? "PATCH" : "POST";

			const response = await fetch("/api/admin/boards", {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(boardForm),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to save board configuration");
			}

			notifications.show({
				title: "Success",
				message: editingBoard ? "Board configuration updated" : "Board configuration created",
				color: "green",
			});

			setBoardModalOpen(false);
			fetchBoards();
		} catch (err) {
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to save board configuration",
				color: "red",
			});
		} finally {
			setSavingBoard(false);
		}
	};

	const handleDeleteBoard = async (board: BoardConfig) => {
		const boardName = (board as any).monday_board?.name || board.board_id;
		if (!confirm(`Are you sure you want to delete the configuration for "${boardName}"?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/boards?boardId=${board.board_id}`, {
				method: "DELETE",
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to delete board configuration");
			}

			notifications.show({
				title: "Success",
				message: "Board configuration deleted",
				color: "green",
			});

			fetchBoards();
		} catch (err) {
			notifications.show({
				title: "Error",
				message: err instanceof Error ? err.message : "Failed to delete board configuration",
				color: "red",
			});
		}
	};

	// Show loading state while initializing
	if (mondayLoading) {
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

			{error && <div className="admin-error">{error}</div>}

			<Tabs value={activeTab} onChange={setActiveTab} className="admin-tabs">
				<Tabs.List>
					<Tabs.Tab value="roles">Roles</Tabs.Tab>
					<Tabs.Tab value="boards">Board Configurations</Tabs.Tab>
				</Tabs.List>

				{/* Roles Tab */}
				<Tabs.Panel value="roles" pt="md">
					<div className="admin-section">
						<div className="admin-section-header">
							<div>
								<h2>Role Management</h2>
								<p className="admin-section-description">Define roles and their default hourly rates for time tracking.</p>
							</div>
							<Button leftSection={<Icon name="add" size={21} color="white" />} onClick={() => handleOpenRoleModal()}>
								Add Role
							</Button>
						</div>

						{loading ? (
							<div className="admin-loading">
								<Loader />
							</div>
						) : roles.length === 0 ? (
							<div className="empty-state">
								<div className="empty-state-title">No roles defined</div>
								<p className="empty-state-description">Create your first role to start tracking time by role.</p>
								<Button onClick={() => handleOpenRoleModal()}>Create Role</Button>
							</div>
						) : (
							<div className="role-grid">
								{roles.map((role) => (
									<div key={role.id} className="role-card">
										<div className="role-card-header">
											<div className="role-card-title">
												<div className="role-color-indicator" style={{ backgroundColor: role.color_hex || "#0073ea" }} />
												<span className="role-card-name">{role.name}</span>
											</div>
											<span className={`role-card-status ${role.is_active ? "active" : "inactive"}`}>{role.is_active ? "Active" : "Inactive"}</span>
										</div>
										<div className="role-card-details">
											{role.description && (
												<div className="role-detail-row">
													<span className="role-detail-label">Description</span>
													<span className="role-detail-value">{role.description}</span>
												</div>
											)}
											<div className="role-detail-row">
												<span className="role-detail-label">Hourly Rate</span>
												<span className="role-detail-value">{role.hourly_rate.toFixed(2)} €</span>
											</div>
										</div>
										<div className="role-card-actions">
											<Tooltip label="Edit role">
												<IconButton variant="light" onClick={() => handleOpenRoleModal(role)}>
													<Icon name="edit" size={21} />
												</IconButton>
											</Tooltip>
											<Tooltip label={role.is_active ? "Deactivate role" : "Role is inactive"}>
												<IconButton variant="light" color="red" onClick={() => handleDeleteRole(role)} disabled={!role.is_active}>
													<Icon name="delete" size={21} />
												</IconButton>
											</Tooltip>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</Tabs.Panel>

				{/* Boards Tab */}
				<Tabs.Panel value="boards" pt="md">
					<div className="admin-section">
						<div className="admin-section-header">
							<div>
								<h2>Board Configurations</h2>
								<p className="admin-section-description">Configure which boards sync time data to monday.com columns.</p>
							</div>
							<Button leftSection={<Icon name="add" size={21} color="white" />} onClick={() => handleOpenBoardModal()}>
								Add Board
							</Button>
						</div>

						{loading ? (
							<div className="admin-loading">
								<Loader />
							</div>
						) : boards.length === 0 ? (
							<div className="empty-state">
								<div className="empty-state-title">No boards configured</div>
								<p className="empty-state-description">Add a board configuration to start syncing time data.</p>
								<Button onClick={() => handleOpenBoardModal()}>Add Board Configuration</Button>
							</div>
						) : (
							<div className="board-grid">
								{boards.map((board) => (
									<div key={board.board_id} className="board-card">
										<div className="board-card-header">
											<span className="board-card-name">{(board as any).monday_board?.name || board.board_id}</span>
											<span className={`board-sync-badge ${board.sync_enabled ? "enabled" : "disabled"}`}>{board.sync_enabled ? "Sync Enabled" : "Sync Disabled"}</span>
										</div>
										<div className="board-card-details">
											<div className="board-detail-row">
												<span className="board-detail-label">Board ID</span>
												<span className="board-detail-value">{board.board_id}</span>
											</div>
											<div className="board-sync-options">
												{board.sync_on_finalize && <Badge size="xs">Sync on Finalize</Badge>}
												{board.sync_budget_used && <Badge size="xs">Budget Used</Badge>}
											</div>
										</div>
										<div className="board-card-actions">
											<Tooltip label="Edit configuration">
												<IconButton variant="light" onClick={() => handleOpenBoardModal(board)}>
													<Icon name="edit" size={21} />
												</IconButton>
											</Tooltip>
											<Tooltip label="Configure columns">
												<IconLink variant="light" href={`/admin/boards/${board.board_id}`}>
													<Icon name="settings" size={21} />
												</IconLink>
											</Tooltip>
											<Tooltip label="Delete configuration">
												<IconButton variant="light" color="red" onClick={() => handleDeleteBoard(board)}>
													<Icon name="delete" size={21} />
												</IconButton>
											</Tooltip>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</Tabs.Panel>
			</Tabs>

			{/* Role Modal */}
			<Modal opened={roleModalOpen} onClose={() => setRoleModalOpen(false)} title={editingRole ? "Edit Role" : "Create Role"} size="md">
				<Stack gap="md">
					<TextInput label="Role Name" placeholder="e.g., Developer, Designer" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} required />

					<Textarea label="Description" placeholder="Brief description of this role" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />

					<NumberInput label="Default Hourly Rate (€)" placeholder="0.00" value={roleForm.hourly_rate} onChange={(val) => setRoleForm({ ...roleForm, hourly_rate: Number(val) || 0 })} min={0} decimalScale={2} />

					<ColorInput label="Color" value={roleForm.color_hex} onChange={(val) => setRoleForm({ ...roleForm, color_hex: val })} format="hex" swatches={["#0073ea", "#00c875", "#fdab3d", "#e2445c", "#a25ddc", "#037f4c", "#579bfc", "#ff5ac4", "#cab641", "#784bd1"]} />

					<Switch label="Active" checked={roleForm.is_active} onChange={(e) => setRoleForm({ ...roleForm, is_active: e.currentTarget.checked })} />

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={() => setRoleModalOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSaveRole} loading={savingRole}>
							{editingRole ? "Update Role" : "Create Role"}
						</Button>
					</Group>
				</Stack>
			</Modal>

			{/* Board Modal */}
			<Modal opened={boardModalOpen} onClose={() => setBoardModalOpen(false)} title={editingBoard ? "Edit Board Configuration" : "Add Board Configuration"} size="lg">
				<Stack gap="md">
					<Group grow>
						<TextInput label="Board ID" placeholder="e.g., 1234567890" value={boardForm.board_id} onChange={(e) => setBoardForm({ ...boardForm, board_id: e.target.value })} required disabled={!!editingBoard} />

						<TextInput label="Board Name" placeholder="e.g., Project Board" value={boardForm.board_name} onChange={(e) => setBoardForm({ ...boardForm, board_name: e.target.value })} required />
					</Group>

					<Box className="form-section">
						<Text className="form-section-title">Sync Options</Text>
						<Stack gap="sm">
							<Switch label="Enable Sync" description="Master toggle for all sync operations" checked={boardForm.sync_enabled} onChange={(e) => setBoardForm({ ...boardForm, sync_enabled: e.currentTarget.checked })} />

							<Switch label="Sync on Finalize" description="Automatically sync when time entries are finalized" checked={boardForm.sync_on_finalize} onChange={(e) => setBoardForm({ ...boardForm, sync_on_finalize: e.currentTarget.checked })} disabled={!boardForm.sync_enabled} />

							<Switch label="Sync Budget Used" description="Sync total expenditure (Total Cost) to a separate column" checked={boardForm.sync_budget_used} onChange={(e) => setBoardForm({ ...boardForm, sync_budget_used: e.currentTarget.checked })} disabled={!boardForm.sync_enabled} />

							<Switch label="Sync Linked Items" description="Trigger sync for items on a linked board" checked={boardForm.sync_linked_items} onChange={(e) => setBoardForm({ ...boardForm, sync_linked_items: e.currentTarget.checked })} disabled={!boardForm.sync_enabled} />

							{boardForm.sync_linked_items && <TextInput label="Linked Board ID" placeholder="e.g., 987654321" value={boardForm.linked_board_id} onChange={(e) => setBoardForm({ ...boardForm, linked_board_id: e.target.value })} description="The board where linked items (e.g. Budgets) are located" />}
						</Stack>
					</Box>

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={() => setBoardModalOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSaveBoard} loading={savingBoard}>
							{editingBoard ? "Update Configuration" : "Add Configuration"}
						</Button>
					</Group>
				</Stack>
			</Modal>
		</div>
	);
}
