import { create } from "zustand";

import { supabase } from "@/lib/supabase/client";

// stores/editPresenceStore.ts
import type { RealtimeChannel } from "@supabase/supabase-js";

/** Idle threshold (5 minutes) after which another user may take over an edit claim. */
export const IDLE_AFTER_MS = 5 * 60 * 1000;

/** Minimum interval (30 seconds) between presence `track()` heartbeats on editor activity. */
export const TOUCH_THROTTLE_MS = 30 * 1000;

/** Interval (30 seconds) at which lock states are re-evaluated so `idle` flips without new events. */
const TICK_INTERVAL_MS = 30 * 1000;

/** Random per-iframe presence key so dashboard and sidebar iframes of the same user stay distinct. */
const PRESENCE_KEY = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface EditPresencePayload {
	entryId: string | null;
	profileId: string;
	name: string;
	claimedAt: number | null;
	lastActiveAt: number | null;
}

interface RawPresenceClaim {
	presenceKey: string;
	entryId: string;
	profileId: string;
	name: string;
	claimedAt: number;
	lastActiveAt: number;
}

export type EntryEditLockState = "free" | "busy" | "idle" | "self";

export interface EntryEditLockInfo {
	state: EntryEditLockState;
	holderName: string | null;
	holderProfileId: string | null;
	since: string | null;
	idleMinutes: number;
}

export const FREE_LOCK_INFO: EntryEditLockInfo = {
	state: "free",
	holderName: null,
	holderProfileId: null,
	since: null,
	idleMinutes: 0,
};

interface LocalClaim {
	entryId: string;
	claimedAt: number;
	lastActiveAt: number;
}

function formatTimeHHMM(timestampMs: number): string {
	const d = new Date(timestampMs);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface EditPresenceState {
	accountId: string | null;
	profileId: string | null;
	userName: string;
	channelStatus: "IDLE" | "JOINING" | "SUBSCRIBED" | "DISCONNECTED";
	hasConnectedOnce: boolean;
	browserOnline: boolean;

	/** Active claim owned by this iframe, or `null` when none / after takeover. */
	localClaim: LocalClaim | null;
	/** Entry id for which `takenOverBy` was latched during the currently open modal. */
	takenOverEntryId: string | null;
	/** Display name of the user/view that superseded this iframe's claim, or `null`. */
	takenOverBy: string | null;

	/** Count of open local time-entry modals in this iframe (suspends live background refetches). */
	openModalCount: number;
	/** Convenience flag: `openModalCount > 0 || localClaim !== null`. */
	isLocalEditing: boolean;

	/** Derived lock info keyed by `entryId` for all externally held claims. */
	locksByEntryId: Record<string, EntryEditLockInfo>;

	connect: (accountId: string, profileId: string, userName: string) => void;
	disconnect: () => void;
	beginEdit: (entryId: string) => void;
	touch: () => void;
	endEdit: (entryId?: string) => void;
	beginLocalModal: () => void;
	endLocalModal: () => void;
	getEntryLock: (entryId: string | null | undefined) => EntryEditLockInfo;
}

let activeChannel: RealtimeChannel | null = null;
let tickIntervalId: ReturnType<typeof setInterval> | null = null;
let cleanupOnlineListeners: (() => void) | null = null;
let rawWinnersByEntryId: Record<string, RawPresenceClaim> = {};

function buildTrackPayload(state: Pick<EditPresenceState, "localClaim" | "profileId" | "userName">): EditPresencePayload {
	return {
		entryId: state.localClaim?.entryId ?? null,
		profileId: state.profileId ?? "",
		name: state.userName || "Unbekannter Benutzer",
		claimedAt: state.localClaim?.claimedAt ?? null,
		lastActiveAt: state.localClaim?.lastActiveAt ?? null,
	};
}

function trackCurrentPresence(state: Pick<EditPresenceState, "localClaim" | "profileId" | "userName" | "channelStatus" | "browserOnline">) {
	if (!activeChannel || state.channelStatus !== "SUBSCRIBED" || !state.browserOnline || !state.profileId) return;
	void activeChannel.track(buildTrackPayload(state)).catch((err) => {
		console.warn("[EditPresence] track failed:", err);
	});
}

function extractWinners(channel: RealtimeChannel): Record<string, RawPresenceClaim> {
	const presenceState = channel.presenceState<EditPresencePayload>();
	const winners: Record<string, RawPresenceClaim> = {};

	for (const [presenceKey, metas] of Object.entries(presenceState)) {
		if (!Array.isArray(metas) || metas.length === 0) continue;
		// Pick the freshest meta for this presenceKey if multiple exist transiently.
		const latest = metas.reduce((best, curr) => {
			const bestTs = best.lastActiveAt ?? best.claimedAt ?? 0;
			const currTs = curr.lastActiveAt ?? curr.claimedAt ?? 0;
			return currTs >= bestTs ? curr : best;
		}, metas[0]);

		if (!latest.entryId || typeof latest.claimedAt !== "number" || !latest.profileId) continue;

		const candidate: RawPresenceClaim = {
			presenceKey,
			entryId: latest.entryId,
			profileId: latest.profileId,
			name: latest.name || "Unbekannter Benutzer",
			claimedAt: latest.claimedAt,
			lastActiveAt: typeof latest.lastActiveAt === "number" ? latest.lastActiveAt : latest.claimedAt,
		};

		const existing = winners[candidate.entryId];
		if (!existing || candidate.claimedAt > existing.claimedAt || (candidate.claimedAt === existing.claimedAt && candidate.presenceKey > existing.presenceKey)) {
			winners[candidate.entryId] = candidate;
		}
	}

	return winners;
}

function deriveLocks(winners: Record<string, RawPresenceClaim>, myProfileId: string | null, now: number): Record<string, EntryEditLockInfo> {
	const derived: Record<string, EntryEditLockInfo> = {};

	for (const [entryId, winner] of Object.entries(winners)) {
		if (winner.presenceKey === PRESENCE_KEY) {
			continue;
		}

		const idleMs = Math.max(0, now - winner.lastActiveAt);
		const idleMinutes = Math.floor(idleMs / 60000);
		const since = formatTimeHHMM(winner.claimedAt);

		if (myProfileId && winner.profileId === myProfileId) {
			derived[entryId] = {
				state: "self",
				holderName: winner.name,
				holderProfileId: winner.profileId,
				since,
				idleMinutes,
			};
		} else if (idleMs >= IDLE_AFTER_MS) {
			derived[entryId] = {
				state: "idle",
				holderName: winner.name,
				holderProfileId: winner.profileId,
				since,
				idleMinutes: Math.max(5, idleMinutes),
			};
		} else {
			derived[entryId] = {
				state: "busy",
				holderName: winner.name,
				holderProfileId: winner.profileId,
				since,
				idleMinutes,
			};
		}
	}

	return derived;
}

export const useEditPresenceStore = create<EditPresenceState>()((set, get) => {
	const recomputeFromPresence = () => {
		const state = get();
		const now = Date.now();
		const winners = activeChannel ? extractWinners(activeChannel) : {};
		rawWinnersByEntryId = winners;

		let nextLocalClaim = state.localClaim;
		let nextTakenOverEntryId = state.takenOverEntryId;
		let nextTakenOverBy = state.takenOverBy;
		let superseded = false;

		if (nextLocalClaim) {
			const winner = winners[nextLocalClaim.entryId];
			if (winner && winner.presenceKey !== PRESENCE_KEY && (winner.claimedAt > nextLocalClaim.claimedAt || (winner.claimedAt === nextLocalClaim.claimedAt && winner.presenceKey > PRESENCE_KEY))) {
				nextTakenOverEntryId = nextLocalClaim.entryId;
				nextTakenOverBy = winner.name;
				nextLocalClaim = null;
				superseded = true;
			}
		}

		const locksByEntryId = deriveLocks(winners, state.profileId, now);

		set({
			localClaim: nextLocalClaim,
			takenOverEntryId: nextTakenOverEntryId,
			takenOverBy: nextTakenOverBy,
			isLocalEditing: state.openModalCount > 0 || nextLocalClaim !== null,
			locksByEntryId,
		});

		if (superseded) {
			trackCurrentPresence(get());
		}
	};

	const recomputeTickOnly = () => {
		const state = get();
		const locksByEntryId = deriveLocks(rawWinnersByEntryId, state.profileId, Date.now());
		set({ locksByEntryId });
	};

	return {
		accountId: null,
		profileId: null,
		userName: "",
		channelStatus: "IDLE",
		hasConnectedOnce: false,
		browserOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
		localClaim: null,
		takenOverEntryId: null,
		takenOverBy: null,
		openModalCount: 0,
		isLocalEditing: false,
		locksByEntryId: {},

		connect: (accountId, profileId, userName) => {
			if (!accountId || !profileId) return;

			const current = get();
			if (activeChannel && current.accountId === accountId && current.profileId === profileId) {
				if (current.userName !== userName) {
					set({ userName });
					trackCurrentPresence(get());
				}
				return;
			}

			get().disconnect();

			set({
				accountId,
				profileId,
				userName,
				channelStatus: "JOINING",
				browserOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
			});

			if (typeof window !== "undefined") {
				const handleOnline = () => {
					set({ browserOnline: true });
					trackCurrentPresence(get());
				};
				const handleOffline = () => {
					set({ browserOnline: false });
				};
				window.addEventListener("online", handleOnline);
				window.addEventListener("offline", handleOffline);
				cleanupOnlineListeners = () => {
					window.removeEventListener("online", handleOnline);
					window.removeEventListener("offline", handleOffline);
				};
			}

			const channel = supabase.channel(`entry-edits:${accountId}`, {
				config: {
					presence: {
						key: PRESENCE_KEY,
					},
				},
			});

			activeChannel = channel;

			channel
				.on("presence", { event: "sync" }, () => {
					if (activeChannel !== channel) return;
					recomputeFromPresence();
				})
				.subscribe((status) => {
					if (activeChannel !== channel) return;

					if (status === "SUBSCRIBED") {
						set({ channelStatus: "SUBSCRIBED", hasConnectedOnce: true });
						// Always re-track current state (including original claimedAt across reconnects).
						trackCurrentPresence(get());
					} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
						set({ channelStatus: "DISCONNECTED" });
					}
				});

			tickIntervalId = setInterval(recomputeTickOnly, TICK_INTERVAL_MS);
		},

		disconnect: () => {
			if (tickIntervalId) {
				clearInterval(tickIntervalId);
				tickIntervalId = null;
			}
			if (cleanupOnlineListeners) {
				cleanupOnlineListeners();
				cleanupOnlineListeners = null;
			}
			if (activeChannel) {
				void supabase.removeChannel(activeChannel);
				activeChannel = null;
			}
			rawWinnersByEntryId = {};
			set({
				accountId: null,
				profileId: null,
				channelStatus: "IDLE",
				hasConnectedOnce: false,
				locksByEntryId: {},
			});
		},

		beginEdit: (entryId) => {
			if (!entryId) return;
			const now = Date.now();
			const nextClaim: LocalClaim = {
				entryId,
				claimedAt: now,
				lastActiveAt: now,
			};
			set((state) => {
				// Optimistically clear external lock on this entry while our track propagates.
				const nextLocks = { ...state.locksByEntryId };
				delete nextLocks[entryId];
				return {
					localClaim: nextClaim,
					takenOverEntryId: null,
					takenOverBy: null,
					isLocalEditing: true,
					locksByEntryId: nextLocks,
				};
			});
			trackCurrentPresence(get());
		},

		touch: () => {
			const state = get();
			if (!state.localClaim) return;
			const now = Date.now();
			if (now - state.localClaim.lastActiveAt < TOUCH_THROTTLE_MS) return;

			set({
				localClaim: {
					...state.localClaim,
					lastActiveAt: now,
				},
			});
			trackCurrentPresence(get());
		},

		endEdit: (entryId) => {
			const state = get();
			const matchesClaim = !entryId || state.localClaim?.entryId === entryId;
			const matchesTakenOver = !entryId || state.takenOverEntryId === entryId;
			if (!matchesClaim && !matchesTakenOver) return;

			const hadClaim = matchesClaim && state.localClaim !== null;
			const nextLocalClaim = matchesClaim ? null : state.localClaim;

			set({
				localClaim: nextLocalClaim,
				takenOverEntryId: matchesTakenOver ? null : state.takenOverEntryId,
				takenOverBy: matchesTakenOver ? null : state.takenOverBy,
				isLocalEditing: state.openModalCount > 0 || nextLocalClaim !== null,
			});

			if (hadClaim) {
				trackCurrentPresence(get());
			}
			// Re-derive locks so if someone else still holds a claim it shows immediately.
			recomputeTickOnly();
		},

		beginLocalModal: () => {
			set((state) => {
				const openModalCount = state.openModalCount + 1;
				return {
					openModalCount,
					isLocalEditing: true,
				};
			});
		},

		endLocalModal: () => {
			set((state) => {
				const openModalCount = Math.max(0, state.openModalCount - 1);
				return {
					openModalCount,
					isLocalEditing: openModalCount > 0 || state.localClaim !== null,
				};
			});
		},

		getEntryLock: (entryId) => {
			if (!entryId) return FREE_LOCK_INFO;
			return get().locksByEntryId[entryId] ?? FREE_LOCK_INFO;
		},
	};
});
