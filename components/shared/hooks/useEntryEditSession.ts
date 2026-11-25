// components/shared/hooks/useEntryEditSession.ts
"use client";

import { useEffect } from "react";

import { useEditPresenceStore } from "@/stores/editPresenceStore";

export interface UseEntryEditSessionResult {
	/** Display name of the user/view that took over the claim while this modal was open, or `null`. */
	takenOverBy: string | null;
	/** `true` when this modal owns an entry claim and the presence channel or browser is disconnected. */
	connectionLost: boolean;
}

/**
 * Manages the soft edit-presence lifecycle, activity heartbeats, live-refetch
 * suspension, and `beforeunload` guard for an entry edit modal.
 *
 * - When `open` becomes `true`, marks a local modal open (suspending live
 *   background refetches) and, if `entryId` is non-empty, claims `entryId` on
 *   the account presence channel.
 * - While actively holding a claim (`open && entryId && !takenOverBy`), listens
 *   for `input`, `pointerdown`, and `keydown` events (capture phase so portaled
 *   dropdowns/pickers inside the modal also count) and calls throttled `touch()`.
 * - Installs a `beforeunload` prompt while `open && dirty && !takenOverBy`.
 *
 * @param entryId - `time_entry.id` being edited, or `null`/`undefined` when creating/saving a live timer.
 * @param open    - Whether the modal is currently open.
 * @param dirty   - Whether the form has unsaved edits compared to its initial values.
 */
export function useEntryEditSession(entryId: string | null | undefined, open: boolean, dirty: boolean): UseEntryEditSessionResult {
	const rawTakenOverBy = useEditPresenceStore((state) => (entryId && state.takenOverEntryId === entryId ? state.takenOverBy : null));
	const channelStatus = useEditPresenceStore((state) => state.channelStatus);
	const hasConnectedOnce = useEditPresenceStore((state) => state.hasConnectedOnce);
	const browserOnline = useEditPresenceStore((state) => state.browserOnline);

	const takenOverBy = open && entryId ? rawTakenOverBy : null;
	const connectionLost = Boolean(open && entryId && !takenOverBy) && (!browserOnline || channelStatus === "DISCONNECTED" || (hasConnectedOnce && channelStatus !== "SUBSCRIBED"));

	// Suspend background live refetches whenever the modal is open.
	useEffect(() => {
		if (!open) return;
		useEditPresenceStore.getState().beginLocalModal();
		return () => {
			useEditPresenceStore.getState().endLocalModal();
		};
	}, [open]);

	// Claim and release the entry on presence when open with an entryId.
	useEffect(() => {
		if (!open || !entryId) return;
		useEditPresenceStore.getState().beginEdit(entryId);
		return () => {
			useEditPresenceStore.getState().endEdit(entryId);
		};
	}, [open, entryId]);

	// Heartbeat editor activity (throttled in the store to TOUCH_THROTTLE_MS = 30s).
	useEffect(() => {
		if (!open || !entryId || takenOverBy) return;

		const handleActivity = () => {
			useEditPresenceStore.getState().touch();
		};

		window.addEventListener("input", handleActivity, true);
		window.addEventListener("pointerdown", handleActivity, true);
		window.addEventListener("keydown", handleActivity, true);

		return () => {
			window.removeEventListener("input", handleActivity, true);
			window.removeEventListener("pointerdown", handleActivity, true);
			window.removeEventListener("keydown", handleActivity, true);
		};
	}, [open, entryId, takenOverBy]);

	// Warn before closing/reloading the browser tab/iframe with unsaved changes.
	useEffect(() => {
		if (!open || !dirty || takenOverBy) return;

		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [open, dirty, takenOverBy]);

	return { takenOverBy, connectionLost };
}
