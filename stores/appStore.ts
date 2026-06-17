import { create } from "zustand";
import { useMondayStore } from "./mondayStore";

/**
 * App-level state: the boards connected to the current widget instance, plus
 * shared loading/error flags. Board IDs originate from the monday widget context;
 * `loadConnectedBoards` resolves them to board names via the API. Not persisted.
 */
interface AppState {
	/** Board IDs supplied by the monday widget context. */
	connectedBoardIds: number[];
	/** Resolved board metadata (id + name) for the connected boards. */
	connectedBoards: Array<{
		id: string;
		name: string;
	}>;

	isLoading: boolean;
	error: string | null;

	setConnectedBoardIds: (ids: number[]) => void;
	setConnectedBoards: (boards: AppState["connectedBoards"]) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	/**
	 * Resolve the current `connectedBoardIds` to board names via
	 * `POST /api/connectedBoards`. No-op when there are no IDs or no monday
	 * session token is available yet.
	 */
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

		const sessionToken = useMondayStore.getState().sessionToken;
		if (!sessionToken) return;

		set({ isLoading: true, error: null });
		try {
			const response = await fetch("/api/connectedBoards", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
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
