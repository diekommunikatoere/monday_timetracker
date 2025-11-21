// stores/appStore.ts
import { create } from "zustand";

interface AppState {
	// Connected boards from Monday context
	connectedBoardIds: number[];
	connectedBoards: Array<{
		id: string;
		name: string;
	}>;

	// App-level UI state
	isLoading: boolean;
	error: string | null;

	// Actions
	setConnectedBoardIds: (ids: number[]) => void;
	setConnectedBoards: (boards: AppState["connectedBoards"]) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	loadConnectedBoards: () => Promise<void>;
}

export const useAppStore = create<AppState>()((set, get) => ({
	connectedBoardIds: [],
	connectedBoards: [],
	isLoading: false,
	error: null,

	setConnectedBoardIds: (ids) => set({ connectedBoardIds: ids }),
	setConnectedBoards: (boards) => set({ connectedBoards: boards }),
	setLoading: (loading) => set({ isLoading: loading }),
	setError: (error) => set({ error }),

	loadConnectedBoards: async () => {
		const { connectedBoardIds } = get();
		if (connectedBoardIds.length === 0) return;

		set({ isLoading: true, error: null });
		try {
			const response = await fetch("/api/connectedBoards", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ boardIds: connectedBoardIds }),
			});

			if (!response.ok) throw new Error("Failed to load boards");

			const data = await response.json();
			set({ connectedBoards: data.boards });
		} catch (error) {
			set({ error: error instanceof Error ? error.message : "Unknown error" });
		} finally {
			set({ isLoading: false });
		}
	},
}));
