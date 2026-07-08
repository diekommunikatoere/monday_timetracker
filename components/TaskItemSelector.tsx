// components/TaskItemSelector.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Flex, Text, ComboboxItem, Skeleton, Tooltip, Loader, TreeSelect, TreeSelectProps, type TreeNodeData } from "@mantine/core";
import { Icon, IconButton, Select } from "@/components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMondayStore } from "@/stores/mondayStore";
import { supabase } from "@/lib/supabase/client";
import { useRoles } from "@/components/shared/hooks/useRoles";
import RefreshIcon from "@/components/icons/Refresh";

import styles from "@/components/styles/features/timer/TaskItemSelector.module.css";

/**
 * Selection payload emitted to the parent whenever the user picks (or clears)
 * a board, task, or role. **All fields are optional and `undefined` when
 * unset** — every `onSelectionChange` call delivers the *full* current
 * selection, not a delta, so consumers can replace their state wholesale.
 *
 * Note that `parentItemId`/`parentItemName` describe the **parent item** of a
 * subitem task (monday.com subitems), not the group; they are derived from the
 * task option's metadata, not stored separately.
 *
 * @property boardId         - monday.com board id (stringified).
 * @property boardName       - Human-readable board label.
 * @property itemId          - Selected task/item id (stringified).
 * @property itemName        - Selected task/item name.
 * @property parentItemId    - Id of the parent item when `itemId` is a subitem.
 * @property parentItemName  - Name of the parent item when `itemId` is a subitem.
 * @property roleId          - Supabase `role.id` (UUID) of the selected role.
 * @property roleName        - Display name of the selected role.
 */
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

/**
 * Props for {@link TaskItemSelector}. The component is a controlled-from-outside
 * selector that reports every change upward via {@link onSelectionChange} and
 * optionally exposes a reset callback to its parent.
 *
 * @property onSelectionChange - Fired on every board/task/role change with the full {@link TaskSelection}.
 * @property onResetRef        - If provided, called once with a `reset()` function the parent can invoke to clear all selections.
 * @property initialValues     - Optional preselected board/task/role; reconciled against loaded data (or rendered from the supplied names as a fallback).
 * @property subItemsOnly      - When `true`, top-level items without subitems are hidden from the task tree — only selectable leaves are subitems.
 */
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

/**
 * Internal option shape shared by the board, task, and role dropdowns. `value`
 * is the selectable identifier; `label` is what Mantine displays; `name`
 * carries the monday.com item name (which may differ from `label` for tasks);
 * `parentItemId`/`parentItemName` are populated only for subitem options.
 *
 * @property value          - Selectable identifier (stringified id).
 * @property label          - Display label shown in the dropdown.
 * @property name           - monday.com item name, where applicable.
 * @property disabled       - Reserved disabled flag (not currently set by the selector).
 * @property parentItemId   - Parent item id for subitems; absent for top-level items.
 * @property parentItemName - Parent item name for subitems; absent for top-level items.
 */
type DropdownOption = {
	value: string;
	label: string;
	name?: string;
	disabled?: boolean;
	parentItemId?: string;
	parentItemName?: string;
};

/**
 * Response shape returned by `GET /api/tasks?boardId=…`. Tasks are grouped by
 * monday.com group; each option within a group is a flattened task (top-level
 * or subitem). The selector repartitions these into a Group>Job>Task tree.
 *
 * @property groups         - One entry per monday.com group.
 * @property groups[].label - Group title.
 * @property groups[].options - Flattened task options belonging to the group.
 */
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

/**
 * Three-step selector for choosing a board, a task, and a role for a time
 * entry. Boards come from the monday.com context (`boardIds`) plus any
 * `initialValues.boardId`; tasks are fetched per board from `/api/tasks` and
 * rendered in a {@link TreeSelect} as a **Group → Job → Task** tree (top-level
 * items with subitems become non-selectable "job" containers); roles are read
 * directly from Supabase (`role` table).
 *
 * Data flow: each React Query (`@tanstack/react-query`) query is cached with
 * generous `staleTime`/`gcTime`, tasks are **prefetched** for all loaded
 * boards on mount, and a **Supabase realtime** subscription on
 * `monday_item`/`monday_group` (filtered by `board_id`) invalidates the task
 * query so changes appear without a manual refresh. The refresh button calls
 * `/api/tasks/refresh` to bust the server-side Redis cache, then invalidates
 * the React Query cache.
 *
 * The component is uncontrolled internally but reports every change upward via
 * {@link onSelectionChange} (full {@link TaskSelection} snapshot, not a delta),
 * and optionally hands back a `reset()` via {@link onResetRef}. `initialValues`
 * are reconciled once the corresponding data loads; when the id isn't found
 * but a name is supplied, a temporary option is synthesized so the selection
 * still displays.
 *
 * @param props.onSelectionChange - Receives the full selection on each change.
 * @param props.onResetRef        - Optional; receives a reset-all function.
 * @param props.initialValues     - Optional preselection to reconcile against loaded data.
 * @param props.subItemsOnly      - When `true`, only subitems are selectable leaves.
 * @returns A vertical `Flex` of three labelled selectors (board / task / role) with skeleton loading and inline error text.
 */
export default function TaskItemSelector({ onSelectionChange, onResetRef, initialValues, subItemsOnly }: TaskItemSelectorProps) {
	// State management for selections
	const [selectedBoard, setSelectedBoard] = useState<DropdownOption | null>(null);
	const [selectedTask, setSelectedTask] = useState<DropdownOption | null>(null);
	const [selectedRole, setSelectedRole] = useState<DropdownOption | null>(null);
	const [expandedValues, setExpandedValues] = useState<string[]>([]);
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

	// Roles (alphabetical, active-only) — shared fetch, see useRoles.
	const { roles, isLoading: loadingRoles } = useRoles();

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
					// Invalidate React Query cache to trigger refetch
					queryClient.invalidateQueries({
						queryKey: ["tasks", selectedBoard.value],
					});
				},
			)
			.subscribe();

		return () => {
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

	// Build hierarchical tree data (Group > Job > Task) from query data.
	// Also build a lookup map from a leaf value to its metadata, and a map
	// from a leaf value to the ancestor node values needed to reveal it.
	const { treeData, valueMeta, expansionMap } = useMemo(() => {
		const meta = new Map<string, { name?: string; parentItemId?: string; parentItemName?: string }>();
		const expansion = new Map<string, string[]>();

		if (!selectedBoard || !tasksData?.groups || tasksError) {
			return { treeData: [] as TreeNodeData[], valueMeta: meta, expansionMap: expansion };
		}

		const groups: TreeNodeData[] = [];

		tasksData.groups.forEach((group, gi) => {
			const groupValue = `group:${gi}:${group.label}`;
			const options = group.options;

			// Partition options into top-level items and subitems keyed by their parent.
			const childrenByParent = new Map<string, typeof options>();
			const topLevel: typeof options = [];
			options.forEach((option) => {
				if (option.parentItemId) {
					const arr = childrenByParent.get(option.parentItemId) ?? [];
					arr.push(option);
					childrenByParent.set(option.parentItemId, arr);
				} else {
					topLevel.push(option);
				}
			});

			const optionValues = new Set(options.map((o) => o.value));
			const usedParents = new Set<string>();
			const itemNodes: TreeNodeData[] = [];

			const makeLeaf = (option: (typeof options)[number], jobValue?: string): TreeNodeData => {
				meta.set(option.value, {
					name: option.name,
					parentItemId: option.parentItemId,
					parentItemName: option.parentItemName,
				});
				expansion.set(option.value, jobValue ? [groupValue, jobValue] : [groupValue]);
				return { value: option.value, label: option.name ?? option.label };
			};

			const sortByName = (a: (typeof options)[number], b: (typeof options)[number]) => (a.name ?? a.label).localeCompare(b.name ?? b.label);

			// Top-level items: containers when they have subitems, otherwise selectable leaves.
			topLevel.forEach((option) => {
				const subs = childrenByParent.get(option.value);
				if (subs && subs.length > 0) {
					const jobValue = `job:${option.value}`;
					usedParents.add(option.value);
					const childNodes = subs
						.slice()
						.sort(sortByName)
						.map((sub) => makeLeaf(sub, jobValue));
					itemNodes.push({ value: jobValue, label: option.name ?? option.label, children: childNodes });
				} else if (!subItemsOnly) {
					itemNodes.push(makeLeaf(option));
				}
			});

			// Orphan subitems whose parent item is not present as its own option.
			childrenByParent.forEach((subs, parentId) => {
				if (usedParents.has(parentId) || optionValues.has(parentId)) return;
				const jobValue = `job:${parentId}`;
				const parentName = subs.find((s) => s.parentItemName)?.parentItemName ?? "Aufgabe";
				const childNodes = subs
					.slice()
					.sort(sortByName)
					.map((sub) => makeLeaf(sub, jobValue));
				itemNodes.push({ value: jobValue, label: parentName, children: childNodes });
			});

			if (itemNodes.length > 0) {
				groups.push({ value: groupValue, label: group.label, children: itemNodes });
			}
		});

		return { treeData: groups, valueMeta: meta, expansionMap: expansion };
	}, [tasksData, subItemsOnly, selectedBoard, tasksError]);

	// Set initial task if provided and expand the path to reveal it.
	//
	// Important: do NOT seed the value from a name-only fallback while the task
	// tree is still loading. Mantine's searchable single TreeSelect derives the
	// text it shows in the input from `data` (via getNodeLabel) and only re-syncs
	// it when `value` changes — not when `data` later arrives. If we set `value`
	// to the item id before the tree contains that node, the input renders the raw
	// id and never recovers until the user interacts (blur re-runs getNodeLabel).
	// So wait until the node is present (preferred) or the query has resolved
	// without it (genuine archived/deleted fallback) before setting the value.
	useEffect(() => {
		if (!initialValues?.itemId || selectedTask?.value === initialValues.itemId) return;

		const m = valueMeta.get(initialValues.itemId);
		if (m) {
			setSelectedTask({
				value: initialValues.itemId,
				label: m.name ?? initialValues.itemName ?? "",
				name: m.name,
				parentItemId: m.parentItemId,
				parentItemName: m.parentItemName,
			});
			const path = expansionMap.get(initialValues.itemId);
			if (path) {
				setExpandedValues((prev) => Array.from(new Set([...prev, ...path])));
			}
		} else if ((tasksData || tasksError) && initialValues.itemName) {
			// Tasks have loaded (or errored) but this item isn't among them (e.g.
			// archived or deleted) — fall back to a name-only option so the
			// selection still displays something.
			setSelectedTask({
				value: initialValues.itemId,
				label: initialValues.itemName,
				name: initialValues.itemName,
			});
		}
	}, [initialValues?.itemId, initialValues?.itemName, valueMeta, expansionMap, selectedTask?.value, tasksData, tasksError]);

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

	// Handle task selection. TreeSelect returns only the node value, so we
	// reconstruct the full selection payload from the metadata lookup map.
	// Container nodes (groups/jobs) are non-selectable in single mode, but we
	// guard against their prefixed values defensively.
	const handleTaskChange = useCallback(
		(value: string | null) => {
			if (value && (value.startsWith("group:") || value.startsWith("job:"))) {
				return;
			}

			const m = value ? valueMeta.get(value) : undefined;
			setSelectedTask(
				value
					? {
							value,
							label: m?.name ?? value,
							name: m?.name,
							parentItemId: m?.parentItemId,
							parentItemName: m?.parentItemName,
						}
					: null,
			);

			onSelectionChange({
				boardId: selectedBoard?.value,
				boardName: selectedBoard?.label,
				itemId: value || undefined,
				itemName: m?.name,
				parentItemId: m?.parentItemId,
				parentItemName: m?.parentItemName,
				roleId: selectedRole?.value,
				roleName: selectedRole?.label,
			});
		},
		[selectedBoard, selectedRole, onSelectionChange, valueMeta],
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

	const hasTaskData = treeData.length > 0 || (tasksData?.groups && tasksData.groups.length > 0);
	const isTaskDropdownLoading = isLoadingTasks && !hasTaskData;

	// Placeholder text based on state
	const taskPlaceholder = useMemo(() => {
		if (!selectedBoard) return "Zuerst ein Board auswählen";
		if (isTaskDropdownLoading) return "Lade Aufgaben...";
		return "Aufgabe auswählen...";
	}, [selectedBoard, isTaskDropdownLoading]);

	const isTaskDropdownDisabled = !selectedBoard;

	// Add Checkmark before label if item is selected
	const renderTaskNode: TreeSelectProps["renderNode"] = useCallback(
		({ node, hasChildren, expanded }) => {
			const isGroupOrJob = node.value.startsWith("group:") || node.value.startsWith("job:");
			const isSelected = selectedTask?.value === node.value;
			return (
				<Flex align="center" gap="xs" {...node} className={styles.selectOption} style={{ paddingBlock: ".25rem" }}>
					{hasChildren && (
						<IconButton variant="filled" colorVariant="tertiary" size="xs" onClick={() => {}} aria-label="Nicht auswählbar">
							<Icon name={expanded ? "collapse" : "expand"} size={12} color="var(--color--text-secondary)" />
						</IconButton>
					)}
					{isSelected && <Icon name="check" size={14} color="var(--color--primary)" />}
					<span style={{ fontStyle: expanded ? "italic" : "normal" }}>{node.label}</span>
				</Flex>
			);
		},
		[selectedTask],
	);

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
					<Text size="sm" fw={500}>
						Board auswählen
					</Text>
					<Skeleton height={36} radius="sm" />
				</div>
			) : (
				<div>
					<label htmlFor="board-selector">
						<Text size="sm" fw={500} span>
							Board auswählen
						</Text>
					</label>
					<Select id="board-selector" placeholder="Board auswählen..." data={boards} value={selectedBoard?.value || null} onChange={handleBoardChange} clearable searchable disabled={loadingBoards} nothingFoundMessage="Keine Boards verfügbar" classNames={{ option: styles.selectOption }} required />
				</div>
			)}

			<div>
				<Flex justify="space-between" align="center">
					<label htmlFor="task-selector">
						<Text size="sm" fw={500} span>
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
				<TreeSelect
					id="task-selector"
					placeholder={taskPlaceholder}
					data={treeData}
					renderNode={renderTaskNode}
					value={selectedTask?.value ?? null}
					onChange={handleTaskChange}
					expandedValues={expandedValues}
					onExpandedChange={setExpandedValues}
					// Expand groups/jobs by clicking the whole row, not just the chevron.
					expandOnClick
					clearable
					clearButtonProps={{ "aria-label": "Auswahl löschen" }}
					// Searchable matches group, job and task labels and reveals ancestors.
					searchable={!!selectedBoard}
					disabled={isTaskDropdownDisabled}
					maxDropdownHeight={320}
					nothingFoundMessage={!selectedBoard ? "Wählen Sie zuerst ein Board aus" : isTaskDropdownLoading ? "Lade Aufgaben..." : "Keine Aufgaben gefunden"}
					// Show loading indicator for initial load or background refetch
					rightSection={isTaskDropdownLoading || (isFetchingTasks && hasTaskData) ? <Loader size={14} /> : undefined}
					classNames={{ option: styles.selectOption }}
					required
				/>
			</div>

			{/* Role Selector with skeleton loading */}
			{loadingRoles ? (
				<div>
					<Text size="sm" fw={500}>
						Rolle auswählen
					</Text>
					<Skeleton height={36} radius="sm" />
				</div>
			) : (
				<div>
					<label htmlFor="role-selector">
						<Text size="sm" fw={500} span>
							Rolle auswählen
						</Text>
					</label>
					<Select id="role-selector" placeholder="Rolle auswählen..." data={roles} value={selectedRole?.value || null} onChange={handleRoleChange} clearable searchable disabled={loadingRoles} nothingFoundMessage="Keine Rollen verfügbar" classNames={{ option: styles.selectOption }} required />
				</div>
			)}
		</Flex>
	);
}
