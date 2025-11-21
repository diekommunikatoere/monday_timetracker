// components/TaskItemSelector.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Flex, Text } from "@vibe/core";
import Select from "react-select";
import { useQuery } from "@tanstack/react-query";
import { useMondayStore } from "@/stores/mondayStore";
import { supabase } from "@/lib/supabase/client";

// Type definitions for monday.com API responses
type APIError = {
	message: string;
	status: number;
	errors?: Array<{
		message: string;
		path?: string[];
	}>;
};

type APIResponse<T> = {
	loading: boolean;
	error: APIError | null;
	data: {
		loading: boolean;
		error: APIError | null;
		data: T;
	};
};

interface TaskItemSelectorProps {
	onSelectionChange: (data: { boardId?: string; itemId?: string; role?: string }) => void;
	onResetRef?: (resetFn: () => void) => void;
	initialValues?: {
		boardId?: string;
		itemId?: string;
		role?: string;
	};
}

type DropdownOption = {
	id: string;
	value: string;
	label: string;
	[key: string]: unknown;
};

type DropdownGroupOption = {
	label: string;
	options: DropdownOption[];
};

type TaskGroupsResponse = {
	groups: {
		label: string;
		options: {
			value: string;
			label: string;
		}[];
	}[];
};

export default function TaskItemSelector({ onSelectionChange, onResetRef, initialValues }: TaskItemSelectorProps) {
	// State management
	const [boards, setBoards] = useState<DropdownOption[]>([]);
	const [tasks, setTasks] = useState<DropdownGroupOption[]>([]);
	const [tasksOptions, setTasksOptions] = useState<DropdownOption[]>([]);
	const [selectedBoard, setSelectedBoard] = useState<DropdownOption | null>(null);
	const [selectedTask, setSelectedTask] = useState<DropdownOption | null>(null);
	const [selectedRole, setSelectedRole] = useState<DropdownOption | null>(null);
	const [loadingBoards, setLoadingBoards] = useState(false);
	const [loadingTasks, setLoadingTasks] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Use mondayStore instead of hook
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
			itemId: undefined,
			role: undefined,
		});
	}, [onSelectionChange]);

	// Provide reset function to parent via callback
	useEffect(() => {
		if (onResetRef) {
			onResetRef(resetSelections);
		}
	}, [onResetRef, resetSelections]);

	// Fetch role options from Supabase
	const fetchRoles = async () => {
		const { data, error } = await supabase.from("role").select("*");
		if (error) {
			console.error("Error fetching roles from Supabase:", error);
			return [];
		}
		return data.map((role) => ({
			label: role.name,
			id: role.id,
			value: role.id,
		}));
	};

	// Role options (German)
	const [roles, setRoles] = useState<DropdownOption[]>([]);
	useEffect(() => {
		const loadRoles = async () => {
			const fetchedRoles = await fetchRoles();
			setRoles(fetchedRoles);
		};
		loadRoles();
	}, []);

	// Load connected boards on mount (client-side only)
	useEffect(() => {
		if (rawContext) {
			console.log("Raw context in TaskItemSelector: ", rawContext);
			loadBoards();
		}
	}, [rawContext]);

	// Load boards function
	const loadBoards = async () => {
		if (typeof window === "undefined") return;
		if (!rawContext) return; // Wait for context to load

		setLoadingBoards(true);
		setError(null);

		try {
			const boardIds = rawContext.data?.boardIds;

			if (!boardIds || boardIds.length === 0) {
				setBoards([]);
				return;
			}

			console.log("Fetching boards for IDs: ", boardIds);

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

			const boardOptions = (data.boards || []).map((board: any) => ({
				label: board.label,
				id: board.value.toString(),
				value: board.value.toString(),
			}));
			setBoards(boardOptions);
			console.log("Loaded boards: ", boardOptions);
			console.log("boards: ", boards);

			// Set initial values if provided
			if (initialValues?.boardId && boardOptions.length > 0) {
				const initialBoard = boardOptions.find((board: DropdownOption) => board.id === initialValues.boardId);
				if (initialBoard) {
					setSelectedBoard(initialBoard);
				}
			}

			if (initialValues?.role && roles.length > 0) {
				const initialRole = roles.find((role) => role.id === initialValues.role);
				if (initialRole) {
					setSelectedRole(initialRole);
				}
			}
		} catch (err) {
			console.error("Error loading boards:", err);
			setError("Fehler beim Laden der Boards");
		} finally {
			setLoadingBoards(false);
		}
	};

	// React Query for tasks
	const {
		data: tasksData,
		isLoading: isLoadingTasks,
		error: tasksError,
	} = useQuery<TaskGroupsResponse>({
		queryKey: ["tasks", selectedBoard?.id],
		queryFn: async () => {
			if (!selectedBoard) return [];
			const params = new URLSearchParams({ boardId: selectedBoard.id });
			// Add searchTerm if needed (e.g., from a search input, but not implemented here)
			const response = await fetch(`/api/tasks?${params}`);
			if (!response.ok) {
				console.error(response);
				throw new Error("Failed to fetch tasks");
			}
			return response.json();
		},
		enabled: !!selectedBoard,
		staleTime: 5 * 60 * 1000, // 5 minutes
		gcTime: 10 * 60 * 1000, // 10 minutes
	});

	// Update tasks state when query data changes
	useEffect(() => {
		if (tasksData) {
			console.log("Fetched tasks data: ", JSON.stringify(tasksData));
			const mappedTasks: DropdownGroupOption[] = tasksData.groups.map((group) => ({
				label: group.label,
				options: group.options.map((option) => ({
					id: option.value, // Set id to value, as per existing pattern
					value: option.value,
					label: option.label,
				})),
			}));
			setTasks(mappedTasks);
			setLoadingTasks(false);
			setError(null);

			// Set initial task if provided
			if (initialValues?.itemId && mappedTasks.length > 0) {
				const initialTask = mappedTasks.flatMap((group) => group.options).find((task) => task.id === initialValues.itemId);
				if (initialTask) {
					setSelectedTask(initialTask);
				}
			}
		}
	}, [tasksData, initialValues?.itemId]);

	// Handle errors from query
	useEffect(() => {
		if (tasksError) {
			console.error("Error loading tasks:", tasksError);
			setError("Fehler beim Laden der Aufgaben");
			setTasks([]);
			setLoadingTasks(false);
		}
	}, [tasksError]);

	// Handle board selection
	const handleBoardChange = useCallback(
		async (option: DropdownOption | null) => {
			setSelectedBoard(option);
			setSelectedTask(null);
			setTasksOptions([]);

			console.log("Selected board:", option);
			console.log("selectedBoard state:", selectedBoard);

			if (option) {
				// React Query will handle fetching automatically via enabled prop
			} else {
				setTasks([]);
			}

			onSelectionChange({
				boardId: option?.id,
				itemId: undefined,
				role: selectedRole?.id,
			});
		},
		[selectedRole, onSelectionChange]
	);

	// Handle task selection
	const handleTaskChange = useCallback(
		(option: DropdownOption | null) => {
			// Prevent selection of loading placeholder items (if any remain)
			if ((typeof option?.id === "string" && option.id.startsWith("loading-")) || option?.disabled) {
				return;
			}

			setSelectedTask(option);

			onSelectionChange({
				boardId: selectedBoard?.id,
				itemId: option?.id,
				role: selectedRole?.id,
			});
		},
		[selectedBoard, selectedRole, onSelectionChange]
	);

	// Handle role selection
	const handleRoleChange = useCallback(
		(option: DropdownOption | null) => {
			setSelectedRole(option);

			onSelectionChange({
				boardId: selectedBoard?.id,
				itemId: selectedTask?.id,
				role: option?.id,
			});
		},
		[selectedBoard, selectedTask, onSelectionChange]
	);

	const taskPlaceholder = isLoadingTasks ? "Lade Aufgaben..." : selectedBoard ? "Aufgabe auswählen..." : "Zuerst ein Board auswählen";

	return (
		<Flex
			direction="column"
			align="stretch"
			gap="large"
			style={{
				width: "100%",
			}}
		>
			{/* Error Display */}
			{error && <Text style={{ color: "var(--negative-color)" }}>{error}</Text>}

			{/* Board Selector */}
			<label htmlFor="board-selector">Board auswählen</label>
			<Select
				id="board-selector"
				className="dropdown dropdown-board"
				placeholder="Board auswählen..."
				options={boards}
				value={selectedBoard}
				onChange={handleBoardChange}
				isClearable
				isSearchable
				noOptionsMessage={() => "Keine Boards verfügbar"}
				aria-label="Board auswählen"
				menuPortalTarget={document.getElementById("save-timer-modal-outer") || undefined}
				styles={{
					menuPortal: (base) => ({ ...base, zIndex: 10000 }),
				}}
			/>

			{/* Task Selector - Now with groups */}
			<label htmlFor="task-selector">Aufgabe auswählen</label>
			<Select
				id="task-selector"
				className="dropdown dropdown-task"
				placeholder={taskPlaceholder}
				options={tasks}
				value={selectedTask}
				onChange={handleTaskChange}
				isClearable
				isSearchable={!isLoadingTasks}
				isDisabled={!selectedBoard || !tasks.length}
				noOptionsMessage={() => (!selectedBoard ? "Wählen Sie zuerst ein Board aus" : "Keine Aufgaben gefunden")}
				isLoading={isLoadingTasks}
				aria-label="Aufgabe auswählen"
				menuPortalTarget={document.getElementById("save-timer-modal-outer") || undefined}
				styles={{
					menuPortal: (base) => ({ ...base, zIndex: 10000 }),
				}}
			/>

			{/* Role Selector */}
			<label htmlFor="role-selector">Rolle auswählen</label>
			<Select
				id="role-selector"
				className="dropdown dropdown-role"
				placeholder="Rolle auswählen..."
				options={roles}
				value={selectedRole}
				onChange={handleRoleChange}
				isClearable
				isSearchable
				noOptionsMessage={() => "Keine Rollen verfügbar"}
				aria-label="Rolle auswählen"
				menuPortalTarget={document.getElementById("save-timer-modal-outer") || undefined}
				styles={{
					menuPortal: (base) => ({ ...base, zIndex: 10000 }),
				}}
			/>
		</Flex>
	);
}
