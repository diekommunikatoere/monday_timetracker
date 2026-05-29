// components/TaskItemSelector.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Flex, Text, ComboboxItem, ComboboxItemGroup, Skeleton, Tooltip, Loader } from "@mantine/core";
import { IconButton, Select } from "@/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMondayStore } from "@/stores/mondayStore";
import { supabase } from "@/lib/supabase/client";
import RefreshIcon from "@/components/icons/Refresh";

import styles from "@/components/styles/features/timer/TaskItemSelector.module.css";

// Selection data type passed to parent
export interface TaskSelection {
	boardId?: string;
	boardName?: string;
	itemId?: string;
	itemName?: string;
	parentItemId?: string;
	parentItemName?: string;
	roleId?: string;
	roleName?: string;
}

interface TaskItemSelectorProps {
	onSelectionChange: (data: TaskSelection) => void;
	onResetRef?: (resetFn: () => void) => void;
	initialValues?: {
		boardId?: string;
		boardName?: string;
		itemId?: string;
		itemName?: string;
		roleId?: string;
		roleName?: string;
	};
	subItemsOnly?: boolean;
}

// Option type
type DropdownOption = {
	value: string;
	label: string;
	name?: string;
	disabled?: boolean;
	parentItemId?: string;
	parentItemName?: string;
};

type TaskGroupsResponse = {
	groups: {
		label: string;
		options: {
			value: string;
			label: string;
			name?: string;
			parentItemId?: string;
			parentItemName?: string;
		}[];
	}[];
};

export default function TaskItemSelector({ onSelectionChange, onResetRef, initialValues, subItemsOnly }: TaskItemSelectorProps) {
	// State management for selections
	const [selectedBoard, setSelectedBoard] = useState<DropdownOption | null>(null);
	const [selectedTask, setSelectedTask] = useState<DropdownOption | null>(null);
	const [selectedRole, setSelectedRole] = useState<DropdownOption | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const { sessionToken } = useMondayStore();

	// Query client for prefetching
	const queryClient = useQueryClient();

	// Fetch tasks function
	const fetchTasks = useCallback(
		async (boardId: string): Promise<TaskGroupsResponse> => {
			const params = new URLSearchParams({ boardId });
			const response = await fetch(`/api/tasks?${params}`, {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});
			if (!response.ok) {
				throw new Error("Failed to fetch tasks");
			}
			return response.json();
		},
		[sessionToken],
	);

	// Invalidate cache and refetch - returns true on success
	const invalidateAndRefetchTasks = useCallback(
		async (boardId: string): Promise<boolean> => {
			try {
				// First, invalidate the Redis cache on the server
				const response = await fetch(`/api/tasks/refresh?boardId=${boardId}`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${sessionToken}`,
					},
				});
				if (!response.ok) {
					throw new Error("Failed to invalidate cache");
				}
				return true;
			} catch (error) {
				console.error("Error refreshing tasks:", error);
				return false;
			}
		},
		[sessionToken],
	);

	// Use mondayStore for context
	const { rawContext } = useMondayStore();

	// Reset functions
	const resetBoard = useCallback(() => {
		setSelectedBoard(null);
		setSelectedTask(null);
	}, []);

	const resetTask = useCallback(() => {
		setSelectedTask(null);
	}, []);

	const resetRole = useCallback(() => {
		setSelectedRole(null);
	}, []);

	const resetSelections = useCallback(() => {
		resetBoard();
		resetTask();
		resetRole();
		onSelectionChange({
			boardId: undefined,
			boardName: undefined,
			itemId: undefined,
			itemName: undefined,
			parentItemId: undefined,
			parentItemName: undefined,
			roleId: undefined,
			roleName: undefined,
		});
	}, [onSelectionChange, resetBoard, resetTask, resetRole]);

	// Provide reset function to parent via callback
	useEffect(() => {
		if (onResetRef) {
			onResetRef(resetSelections);
		}
	}, [onResetRef, resetSelections]);

	// Boards query using React Query with enhanced caching
	const contextBoardIds = rawContext?.data?.boardIds;
	const contextBoardId = rawContext?.data?.boardId;
	const boardIds = useMemo(() => {
		const ids = new Set<string>();

		// Add boards from context
		if (contextBoardIds && contextBoardIds.length > 0) {
			contextBoardIds.forEach((id) => ids.add(id.toString()));
		}
		if (contextBoardId) {
			ids.add(contextBoardId.toString());
		}

		// Add initial board if provided
		if (initialValues?.boardId) {
			ids.add(initialValues.boardId.toString());
		}

		return Array.from(ids);
	}, [contextBoardIds, contextBoardId, initialValues?.boardId]);

	const {
		data: boards = [],
		isLoading: loadingBoards,
		error: boardsError,
	} = useQuery({
		queryKey: ["boards", boardIds],
		queryFn: async () => {
			if (!boardIds || boardIds.length === 0) return [];

			const response = await fetch("/api/connectedBoards", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify({ boardIds }),
			});

			if (!response.ok) {
				throw new Error("Failed to fetch boards");
			}

			const data = await response.json();

			if (data.error) {
				throw new Error(data.error);
			}

			return (data.boards || [])
				.map((board: any) => ({
					label: board.label,
					value: board.value.toString(),
				}))
				.sort((a, b) => a.label.localeCompare(b.label));
		},
		enabled: !!boardIds?.length,
		staleTime: 10 * 60 * 1000, // 10 minutes - boards rarely change
		gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
		refetchOnWindowFocus: false, // Don't refetch on tab focus
		refetchOnMount: false, // Use cached data on remount
	});

	useEffect(() => {
		if (boards.length > 0) {
			const prefetchSequentially = async () => {
				for (const board of boards) {
					// Check if already cached before fetching
					const cached = queryClient.getQueryData(["tasks", board.value]);
					if (!cached) {
						try {
							await queryClient.prefetchQuery({
								queryKey: ["tasks", board.value],
								queryFn: () => fetchTasks(board.value),
								staleTime: 5 * 60 * 1000, // 5 minutes
							});
							console.log(`[TaskItemSelector] Prefetched tasks for board ${board.value}`);
						} catch (err) {
							console.warn(`[TaskItemSelector] Failed to prefetch board ${board.value}:`, err);
							// Continue with next board even if one fails
						}
					}
				}
			};

			// Start sequential prefetch in background
			prefetchSequentially();
		}
	}, [boards, queryClient, fetchTasks]);

	// Roles query with enhanced caching
	const { data: roles = [], isLoading: loadingRoles } = useQuery({
		queryKey: ["roles"],
		queryFn: async () => {
			const { data, error } = await supabase.from("role").select("*");
			if (error) throw error;
			return data
				.filter((role) => role.is_active)
				.sort((a, b) => {
					if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
					return a.name.localeCompare(b.name);
				})
				.map((role) => ({
					label: role.name,
					value: role.id,
				}));
		},
		// OPTIMIZATION: Roles change very infrequently
		staleTime: 30 * 60 * 1000, // 30 minutes
		gcTime: 60 * 60 * 1000, // 1 hour
		refetchOnWindowFocus: false,
		refetchOnMount: false,
	});

	// Tasks query with enhanced caching
	const {
		data: tasksData,
		isLoading: isLoadingTasks,
		isFetching: isFetchingTasks,
		error: tasksError,
	} = useQuery<TaskGroupsResponse>({
		queryKey: ["tasks", selectedBoard?.value],
		queryFn: async () => {
			if (!selectedBoard) return { groups: [] };
			return fetchTasks(selectedBoard.value);
		},
		enabled: !!selectedBoard,
		// OPTIMIZATION: Enhanced caching with stale-while-revalidate pattern
		staleTime: 5 * 60 * 1000, // 5 minutes
		gcTime: 15 * 60 * 1000, // 15 minutes
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		// Show previous data immediately while revalidating
		placeholderData: (previousData) => previousData,
	});

	// Real-time subscription to task changes
	useEffect(() => {
		if (!selectedBoard?.value) return;

		console.log(`[TaskItemSelector] Subscribing to realtime changes for board ${selectedBoard.value}`);

		const itemChannel = supabase
			.channel(`tasks-${selectedBoard.value}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "monday_item",
					filter: `board_id=eq.${selectedBoard.value}`,
				},
				(payload) => {
					console.log("[TaskItemSelector] Task change detected via Realtime:", payload.eventType);
					// Invalidate React Query cache to trigger refetch from fast DB-backed API
					queryClient.invalidateQueries({
						queryKey: ["tasks", selectedBoard.value],
					});
				},
			)
			.subscribe();

		const groupChannel = supabase
			.channel(`groups-${selectedBoard.value}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "monday_group",
					filter: `board_id=eq.${selectedBoard.value}`,
				},
				(payload) => {
					console.log("[TaskItemSelector] Group change detected via Realtime:", payload.eventType);
					// Invalidate React Query cache to trigger refetch
					queryClient.invalidateQueries({
						queryKey: ["tasks", selectedBoard.value],
					});
				},
			)
			.subscribe();

		return () => {
			console.log(`[TaskItemSelector] Unsubscribing from realtime changes for board ${selectedBoard.value}`);
			supabase.removeChannel(itemChannel);
			supabase.removeChannel(groupChannel);
		};
	}, [selectedBoard?.value, queryClient]);

	// Handle refresh button click
	const handleRefreshTasks = useCallback(async () => {
		if (!selectedBoard || isRefreshing) return;

		setIsRefreshing(true);
		try {
			// Invalidate server-side Redis cache
			const success = await invalidateAndRefetchTasks(selectedBoard.value);

			if (success) {
				// Invalidate React Query cache and trigger refetch
				await queryClient.invalidateQueries({
					queryKey: ["tasks", selectedBoard.value],
				});
			} else {
				setError("Fehler beim Aktualisieren der Aufgaben");
			}
		} finally {
			setIsRefreshing(false);
		}
	}, [selectedBoard, isRefreshing, queryClient]);

	// Handle boards error
	useEffect(() => {
		if (boardsError) {
			console.error("Error loading boards:", boardsError);
			setError("Fehler beim Laden der Boards");
		}
	}, [boardsError]);

	// Set initial board when boards load
	useEffect(() => {
		if (initialValues?.boardId && selectedBoard?.value !== initialValues.boardId) {
			// Try to find in loaded boards
			const initialBoard = boards.find((board: DropdownOption) => board.value === initialValues.boardId);
			if (initialBoard) {
				setSelectedBoard(initialBoard);
			} else if (initialValues.boardName) {
				// If not found but we have a name, create a temporary option
				setSelectedBoard({
					value: initialValues.boardId,
					label: initialValues.boardName,
				});
			}
		}
	}, [boards, initialValues?.boardId, initialValues?.boardName, selectedBoard?.value]);

	// Set initial role when roles load
	useEffect(() => {
		if (initialValues?.roleId && selectedRole?.value !== initialValues.roleId) {
			const initialRole = roles.find((role: DropdownOption) => role.value === initialValues.roleId);
			if (initialRole) {
				setSelectedRole(initialRole);
			} else if (initialValues.roleName) {
				setSelectedRole({
					value: initialValues.roleId,
					label: initialValues.roleName,
				});
			}
		}
	}, [roles, initialValues?.roleId, initialValues?.roleName, selectedRole?.value]);

	// Derive tasks from query data
	const tasks = useMemo<ComboboxItemGroup[]>(() => {
		if (!selectedBoard || !tasksData?.groups || tasksError) return [];
		return tasksData.groups.map((group) => ({
			group: group.label,
			items: group.options
				.filter((option) => !subItemsOnly || !!option.parentItemId)
				.map((option) => ({
					value: option.value,
					label: option.label,
					name: option.name,
					parentItemId: option.parentItemId,
					parentItemName: option.parentItemName,
				})),
		}));
	}, [tasksData, subItemsOnly, selectedBoard, tasksError]);

	// Set initial task if provided
	useEffect(() => {
		if (initialValues?.itemId && selectedTask?.value !== initialValues.itemId) {
			const allItems = tasks.flatMap((group) => group.items);
			const initialTask = allItems.find((task) => (task as DropdownOption).value === initialValues.itemId);
			if (initialTask) {
				// Need to cast because ComboboxItem doesn't guarantee label is string, but we know it is
				setSelectedTask(initialTask as DropdownOption);
			} else if (initialValues.itemName) {
				// If not found but we have a name, create a temporary option
				setSelectedTask({
					value: initialValues.itemId,
					label: initialValues.itemName,
					name: initialValues.itemName,
				});
			}
		}
	}, [initialValues?.itemId, initialValues?.itemName, tasks, selectedTask?.value]);

	// Handle tasks error
	useEffect(() => {
		if (tasksError) {
			console.error("Error loading tasks:", tasksError);
			setError("Fehler beim Laden der Aufgaben");
		}
	}, [tasksError]);

	// Handle board selection
	const handleBoardChange = useCallback(
		(value: string | null, option: ComboboxItem) => {
			const selectedOption = option as DropdownOption;
			setSelectedBoard(value ? selectedOption : null);
			setSelectedTask(null);

			onSelectionChange({
				boardId: value || undefined,
				boardName: selectedOption?.label,
				itemId: undefined,
				itemName: undefined,
				parentItemId: undefined,
				parentItemName: undefined,
				roleId: selectedRole?.value,
				roleName: selectedRole?.label,
			});
		},
		[selectedRole, onSelectionChange],
	);

	// Handle task selection
	const handleTaskChange = useCallback(
		(value: string | null, option: ComboboxItem) => {
			// Find the full option object from state to ensure we have all properties
			// Mantine's Select might strip extra properties from the option argument
			let fullOption: DropdownOption | null = null;
			if (value) {
				const allItems = tasks.flatMap((group) => group.items);
				fullOption = (allItems.find((item) => (item as DropdownOption).value === value) as DropdownOption) || null;
			}

			const selectedOption = fullOption || (option as DropdownOption);
			setSelectedTask(value ? selectedOption : null);

			onSelectionChange({
				boardId: selectedBoard?.value,
				boardName: selectedBoard?.label,
				itemId: value || undefined,
				itemName: selectedOption?.name,
				parentItemId: selectedOption?.parentItemId,
				parentItemName: selectedOption?.parentItemName,
				roleId: selectedRole?.value,
				roleName: selectedRole?.label,
			});
		},
		[selectedBoard, selectedRole, onSelectionChange, tasks],
	);

	// Handle role selection
	const handleRoleChange = useCallback(
		(value: string | null, option: ComboboxItem) => {
			const selectedOption = option as DropdownOption;
			setSelectedRole(value ? selectedOption : null);

			onSelectionChange({
				boardId: selectedBoard?.value,
				boardName: selectedBoard?.label,
				itemId: selectedTask?.value,
				itemName: selectedTask?.name,
				parentItemId: selectedTask?.parentItemId,
				parentItemName: selectedTask?.parentItemName,
				roleId: value || undefined,
				roleName: selectedOption?.label,
			});
		},
		[selectedBoard, selectedTask, onSelectionChange],
	);

	const hasTaskData = tasks.length > 0 || (tasksData?.groups && tasksData.groups.length > 0);
	const isTaskDropdownLoading = isLoadingTasks && !hasTaskData;

	// Placeholder text based on state
	const taskPlaceholder = useMemo(() => {
		if (!selectedBoard) return "Zuerst ein Board auswählen";
		if (isTaskDropdownLoading) return "Lade Aufgaben...";
		return "Aufgabe auswählen...";
	}, [selectedBoard, isTaskDropdownLoading]);

	const isTaskDropdownDisabled = !selectedBoard;

	return (
		<Flex
			direction="column"
			gap="md"
			style={{
				width: "100%",
			}}
		>
			{/* Error Display */}
			{error && <Text c="dki-error">{error}</Text>}

			{/* Board Selector with skeleton loading */}
			{loadingBoards ? (
				<div>
					<Text size="sm" fw={500} mb={4}>
						Board auswählen
					</Text>
					<Skeleton height={36} radius="sm" />
				</div>
			) : (
				<div>
					<label htmlFor="board-selector" style={{ marginBottom: 0 }}>
						<Text size="sm" fw={500} mb={4}>
							Board auswählen
						</Text>
					</label>
					<Select id="board-selector" placeholder="Board auswählen..." data={boards} value={selectedBoard?.value || null} onChange={handleBoardChange} clearable searchable disabled={loadingBoards} nothingFoundMessage="Keine Boards verfügbar" classNames={{ option: styles.selectOption }} />
				</div>
			)}

			{/* OPTIMIZATION: Task Selector - Always render dropdown immediately */}
			{/* Removed skeleton blocking - dropdown is interactive from the start */}
			<div>
				<Flex justify="space-between" align="center" mb={4}>
					<label htmlFor="task-selector" style={{ marginBottom: 0 }}>
						<Text size="sm" fw={500}>
							Aufgabe auswählen
						</Text>
					</label>
					{selectedBoard && (
						<Tooltip label="Aufgabenliste aktualisieren" position="left">
							<IconButton variant="filled" colorVariant="tertiary" size="sm" onClick={handleRefreshTasks} disabled={isRefreshing || isFetchingTasks} aria-label="Aufgaben aktualisieren">
								{isRefreshing ? <Loader size={14} /> : <RefreshIcon size={14} />}
							</IconButton>
						</Tooltip>
					)}
				</Flex>
				<Select
					id="task-selector"
					placeholder={taskPlaceholder}
					data={tasks}
					value={selectedTask?.value || null}
					onChange={handleTaskChange}
					clearable
					// OPTIMIZATION: Always searchable once board is selected
					// The dropdown is interactive even while loading
					searchable={!!selectedBoard}
					disabled={isTaskDropdownDisabled}
					nothingFoundMessage={!selectedBoard ? "Wählen Sie zuerst ein Board aus" : isTaskDropdownLoading ? "Lade Aufgaben..." : "Keine Aufgaben gefunden"}
					// Show loading indicator for initial load or background refetch
					rightSection={isTaskDropdownLoading || (isFetchingTasks && hasTaskData) ? <Loader size={14} /> : undefined}
					classNames={{ option: styles.selectOption }}
				/>
			</div>

			{/* Role Selector with skeleton loading */}
			{loadingRoles ? (
				<div>
					<Text size="sm" fw={500} mb={4}>
						Rolle auswählen
					</Text>
					<Skeleton height={36} radius="sm" />
				</div>
			) : (
				<div>
					<label htmlFor="role-selector" style={{ marginBottom: 0 }}>
						<Text size="sm" fw={500} mb={4}>
							Rolle auswählen
						</Text>
					</label>
					<Select id="role-selector" placeholder="Rolle auswählen..." data={roles} value={selectedRole?.value || null} onChange={handleRoleChange} clearable searchable disabled={loadingRoles} nothingFoundMessage="Keine Rollen verfügbar" classNames={{ option: styles.selectOption }} />
				</div>
			)}
		</Flex>
	);
}
