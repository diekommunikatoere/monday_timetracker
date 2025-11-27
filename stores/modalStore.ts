// stores/modalStore.ts
import { create } from "zustand";

interface ModalState {
	showTimerSave: boolean;
	openTimerSave: () => void;
	closeTimerSave: () => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
	showTimerSave: false,
	openTimerSave: () => set({ showTimerSave: true }),
	closeTimerSave: () => set({ showTimerSave: false }),
}));
