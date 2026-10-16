// lib/sentinel/types.ts
// Shared types for Sentinel (observations → rules → sync targets → Pipe entries).

/**
 * The item whose columns must be recomputed — always the item whose columns get written
 * (the parent for subitem cases). `boardIdHint` is used only when the item has no
 * `monday_item` row at drain time.
 */
export interface SyncTarget {
	itemId: string;
	boardIdHint: string | null;
}

/** One Pipe field value (the field name is the item id). Collapsing targets keeps only the latest `reason`. */
export interface PipeEntry {
	boardIdHint: string | null;
	reason: string;
	/** Epoch ms of the (latest) enqueue. */
	queuedAt: number;
	/** Failed drain attempts so far; a fresh event resets it to 0. */
	attempts: number;
}

interface ParentRef {
	parentId: string;
	boardId: string;
}

/** A structural monday event, as seen by the webhook handler, handed to {@link Sentinel}. */
export type Observation =
	| { type: "subitem.reparented"; subitemId: string; from: ParentRef | null; to: ParentRef | null }
	| { type: "item.moved_board"; itemId: string; toBoardId: string; entriesRepointed: number; formerParent: ParentRef | null }
	| { type: "item.trashed"; itemId: string; parentId: string | null; boardId: string | null }
	| { type: "item.restored"; itemId: string; parentId: string | null; boardId: string | null };

/** A registry rule: trigger (`on`) → condition (`when`) → action (`then` = targets to sync). */
export interface Rule<T extends Observation["type"] = Observation["type"]> {
	name: string;
	on: T;
	when?(observation: Extract<Observation, { type: T }>): boolean;
	then(observation: Extract<Observation, { type: T }>): SyncTarget[];
}

/** Outcome of draining one sealed Pipe. */
export interface DrainResult {
	pipe: string;
	total: number;
	succeeded: number;
	skipped: number;
	requeued: number;
	dropped: number;
	/** Entries left in the sealed Pipe (deadline hit or lock lost). */
	remaining: number;
	durationMs: number;
}

export type CycleResult = { ran: true; sealed: string | null; drains: DrainResult[] } | { ran: false; reason: "busy" | "closed" | "locked" };

/** Best-effort status snapshot persisted in Redis for the admin tab. */
export interface SentinelStatus {
	lastCycleAt: string | null;
	lastCycleResult: CycleResult | null;
	lastDrain: DrainResult | null;
	lastError: string | null;
	lastErrorAt: string | null;
}
