// stores/drawerStore.ts
import { create } from "zustand";

interface DrawerState {
	showTimerSave: boolean;
	openTimerSave: () => void;
	closeTimerSave: () => void;
}

export const useDrawerStore = create<DrawerState>((set, get) => ({
	showTimerSave: false,
	openTimerSave: () => set({ showTimerSave: true }),
	closeTimerSave: () => set({ showTimerSave: false }),
}));
