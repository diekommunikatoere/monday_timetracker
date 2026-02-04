// stores/modalStore.ts
import { create } from "zustand";

interface ModalState {
	showTimerSave: boolean;
	openTimerSave: () => void;
	closeTimerSave: () => void;
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
