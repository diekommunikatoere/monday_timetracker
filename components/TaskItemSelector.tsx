// components/TaskItemSelector.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Flex, Text, Select, ComboboxItem, ComboboxItemGroup } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMondayStore } from "@/stores/mondayStore";
import { supabase } from "@/lib/supabase/client";

// Selection data type passed to parent
export interface TaskSelection {
	boardId?: string;
	boardName?: string;
	itemId?: string;
	itemName?: string;
	parentItemId?: string;
	parentItemName?: string;
	role?: string;
	roleName?: string;
}

interface TaskItemSelectorProps {
	onSelectionChange: (data: TaskSelection) => void;
	onResetRef?: (resetFn: () => void) => void;
	initialValues?: {
		boardId?: string;
		itemId?: string;
		role?: string;
	};
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

export default function TaskItemSelector({ onSelectionChange, onResetRef, initialValues }: TaskItemSelectorProps) {
	// State management for selections
	const [tasks, setTasks] = useState<ComboboxItemGroup[]>([]);
	const [selectedBoard, setSelectedBoard] = useState<DropdownOption | null>(null);
	const [selectedTask, setSelectedTask] = useState<DropdownOption | null>(null);
	const [selectedRole, setSelectedRole] = useState<DropdownOption | null>(null);
	const [error, setError] = useState<string | null>(null);

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
		setTasks([]);
		onSelectionChange({
			boardId: undefined,
			boardName: undefined,
			itemId: undefined,
			itemName: undefined,
			parentItemId: undefined,
			parentItemName: undefined,
			role: undefined,
			roleName: undefined,
		});
	}, [onSelectionChange, resetBoard, resetTask, resetRole]);

	// Provide reset function to parent via callback
	useEffect(() => {
		if (onResetRef) {
			onResetRef(resetSelections);
		}
	}, [onResetRef, resetSelections]);

	// Boards query using React Query
	const boardIds = rawContext?.data?.boardIds;
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

			return (data.boards || []).map((board: any) => ({
				label: board.label,
				value: board.value.toString(),
			}));
		},
		enabled: !!boardIds?.length,
		staleTime: 5 * 60 * 1000, // 5 minutes
		gcTime: 10 * 60 * 1000, // 10 minutes
	});

	// Roles query
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
		staleTime: 10 * 60 * 1000, // Roles change infrequently
	});

	// Tasks query
	const {
		data: tasksData,
		isLoading: isLoadingTasks,
		error: tasksError,
	} = useQuery<TaskGroupsResponse>({
		queryKey: ["tasks", selectedBoard?.value],
		queryFn: async () => {
			if (!selectedBoard) return { groups: [] };
			const params = new URLSearchParams({ boardId: selectedBoard.value });
			const response = await fetch(`/api/tasks?${params}`);
			if (!response.ok) {
				throw new Error("Failed to fetch tasks");
			}
			return response.json();
		},
		enabled: !!selectedBoard,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});

	// Handle boards error
	useEffect(() => {
		if (boardsError) {
			console.error("Error loading boards:", boardsError);
			setError("Fehler beim Laden der Boards");
		}
	}, [boardsError]);

	// Set initial board when boards load
	useEffect(() => {
		if (initialValues?.boardId && boards.length > 0 && !selectedBoard) {
			const initialBoard = boards.find((board: DropdownOption) => board.value === initialValues.boardId);
			if (initialBoard) {
				setSelectedBoard(initialBoard);
			}
		}
	}, [boards, initialValues?.boardId, selectedBoard]);

	// Set initial role when roles load
	useEffect(() => {
		if (initialValues?.role && roles.length > 0 && !selectedRole) {
			const initialRole = roles.find((role: DropdownOption) => role.value === initialValues.role);
			if (initialRole) {
				setSelectedRole(initialRole);
			}
		}
	}, [roles, initialValues?.role, selectedRole]);

	// Update tasks state when query data changes
	useEffect(() => {
		if (tasksData?.groups) {
			const mappedTasks: ComboboxItemGroup[] = tasksData.groups.map((group) => ({
				group: group.label,
				items: group.options.map((option) => ({
					value: option.value,
					label: option.label,
					name: option.name,
					parentItemId: option.parentItemId,
					parentItemName: option.parentItemName,
				})),
			}));
			setTasks(mappedTasks);
			setError(null);

			// Set initial task if provided
			if (initialValues?.itemId && mappedTasks.length > 0 && !selectedTask) {
				const allItems = mappedTasks.flatMap((group) => group.items);
				const initialTask = allItems.find((task) => (task as DropdownOption).value === initialValues.itemId);
				if (initialTask) {
					// Need to cast because ComboboxItem doesn't guarantee label is string, but we know it is
					setSelectedTask(initialTask as DropdownOption);
				}
			}
		}
	}, [tasksData, initialValues?.itemId, selectedTask]);

	// Handle tasks error
	useEffect(() => {
		if (tasksError) {
			console.error("Error loading tasks:", tasksError);
			setError("Fehler beim Laden der Aufgaben");
			setTasks([]);
		}
	}, [tasksError]);

	// Handle board selection
	const handleBoardChange = useCallback(
		(value: string | null, option: ComboboxItem) => {
			const selectedOption = option as DropdownOption;
			setSelectedBoard(value ? selectedOption : null);
			setSelectedTask(null);

			if (!value) {
				setTasks([]);
			}

			onSelectionChange({
				boardId: value || undefined,
				boardName: selectedOption?.label,
				itemId: undefined,
				itemName: undefined,
				parentItemId: undefined,
				parentItemName: undefined,
				role: selectedRole?.value,
				roleName: selectedRole?.label,
			});
		},
		[selectedRole, onSelectionChange]
	);

	// Handle task selection
	const handleTaskChange = useCallback(
		(value: string | null, option: ComboboxItem) => {
			console.log("handleTaskChange", value, option);

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
				itemName: selectedOption?.name || selectedOption?.label,
				parentItemId: selectedOption?.parentItemId,
				parentItemName: selectedOption?.parentItemName,
				role: selectedRole?.value,
				roleName: selectedRole?.label,
			});
		},
		[selectedBoard, selectedRole, onSelectionChange, tasks]
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
				itemName: selectedTask?.label,
				role: value || undefined,
				roleName: selectedOption?.label,
			});
		},
		[selectedBoard, selectedTask, onSelectionChange]
	);

	const taskPlaceholder = isLoadingTasks ? "Lade Aufgaben..." : selectedBoard ? "Aufgabe auswählen..." : "Zuerst ein Board auswählen";

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

			{/* Board Selector */}
			<Select id="board-selector" label="Board auswählen" placeholder="Board auswählen..." data={boards} value={selectedBoard?.value || null} onChange={handleBoardChange} clearable searchable disabled={loadingBoards} nothingFoundMessage="Keine Boards verfügbar" />

			{/* Task Selector - with groups */}
			<Select id="task-selector" label="Aufgabe auswählen" placeholder={taskPlaceholder} data={tasks} value={selectedTask?.value || null} onChange={handleTaskChange} clearable searchable={!isLoadingTasks} disabled={!selectedBoard || isLoadingTasks} nothingFoundMessage={!selectedBoard ? "Wählen Sie zuerst ein Board aus" : "Keine Aufgaben gefunden"} />

			{/* Role Selector */}
			<Select id="role-selector" label="Rolle auswählen" placeholder="Rolle auswählen..." data={roles} value={selectedRole?.value || null} onChange={handleRoleChange} clearable searchable disabled={loadingRoles} nothingFoundMessage="Keine Rollen verfügbar" />
		</Flex>
	);
}
