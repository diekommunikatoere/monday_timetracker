// components/shared/hooks/useEntryEditLock.ts
"use client";

import { FREE_LOCK_INFO, useEditPresenceStore, type EntryEditLockInfo } from "@/stores/editPresenceStore";

export type { EntryEditLockInfo, EntryEditLockState } from "@/stores/editPresenceStore";
export { EditLockMenuItem, EntryEditLockIcon } from "../time-entries/EditLockMenuItem";

/**
 * Subscribes to the derived soft edit-lock state for a single `time_entry`.
 *
 * Returns `FREE_LOCK_INFO` (`state: "free"`) when nobody else holds the entry
 * or when this iframe itself is the current holder.
 */
export function useEntryEditLock(entryId: string | null | undefined): EntryEditLockInfo {
	return useEditPresenceStore((state) => (entryId ? (state.locksByEntryId[entryId] ?? FREE_LOCK_INFO) : FREE_LOCK_INFO));
}
