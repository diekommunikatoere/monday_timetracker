import { create } from "zustand";

/**
 * Open/closed state for the app's global modals. UI-only — nothing here is
 * persisted or synced to the server. Components read the boolean flag and call
 * the matching open/close action.
 */
interface ModalState {
	/** Whether the "save timer" modal is open. */
	showTimerSave: boolean;
	openTimerSave: () => void;
	closeTimerSave: () => void;
	/** Whether the "confirm save with an empty comment" modal is open. */
	showEmptyCommentConfirmation: boolean;
	openEmptyCommentConfirmation: () => void;
	closeEmptyCommentConfirmation: () => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
	showTimerSave: false,
	openTimerSave: () => set({ showTimerSave: true }),
	closeTimerSave: () => set({ showTimerSave: false }),
	showEmptyCommentConfirmation: false,
	openEmptyCommentConfirmation: () => set({ showEmptyCommentConfirmation: true }),
	closeEmptyCommentConfirmation: () => set({ showEmptyCommentConfirmation: false }),
}));
