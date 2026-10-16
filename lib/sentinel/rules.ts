// lib/sentinel/rules.ts
// Code registry of Sentinel rules (trigger → condition → action). v1 mirrors the syncs the
// monday webhook handler used to run inline.

import type { Observation, Rule, SyncTarget } from "./types";

type ParentRef = { parentId: string; boardId: string } | null;

const target = (parent: ParentRef): SyncTarget[] => (parent ? [{ itemId: parent.parentId, boardIdHint: parent.boardId }] : []);

const subitemReparented: Rule<"subitem.reparented"> = {
	name: "subitem-reparented-sync-both-parents",
	on: "subitem.reparented",
	// Totals only move when the parent actually changed.
	when: (obs) => obs.from?.parentId !== obs.to?.parentId,
	then: (obs) => [...target(obs.from), ...target(obs.to)],
};

const itemMovedBoard: Rule<"item.moved_board"> = {
	name: "item-moved-board-sync-item-and-former-parent",
	on: "item.moved_board",
	then: (obs) => [...(obs.entriesRepointed > 0 ? [{ itemId: obs.itemId, boardIdHint: obs.toBoardId }] : []), ...target(obs.formerParent)],
};

const itemTrashed: Rule<"item.trashed"> = {
	name: "item-trashed-sync-parent",
	on: "item.trashed",
	// A trashed top-level item is gone from monday: nothing to update.
	then: (obs) => (obs.parentId ? [{ itemId: obs.parentId, boardIdHint: obs.boardId }] : []),
};

const itemRestored: Rule<"item.restored"> = {
	name: "item-restored-sync-parent-or-self",
	on: "item.restored",
	then: (obs) => [{ itemId: obs.parentId ?? obs.itemId, boardIdHint: obs.boardId }],
};

export const RULES: Rule[] = [subitemReparented, itemMovedBoard, itemTrashed, itemRestored] as Rule[];

/** Targets of all rules matching `observation`, deduplicated by item id (first hint wins). */
export function evaluate(observation: Observation): SyncTarget[] {
	const targets = new Map<string, SyncTarget>();
	for (const rule of RULES) {
		if (rule.on !== observation.type) continue;
		const typed = rule as Rule<typeof observation.type>;
		if (typed.when && !typed.when(observation as never)) continue;
		for (const t of typed.then(observation as never)) if (!targets.has(t.itemId)) targets.set(t.itemId, t);
	}
	return [...targets.values()];
}
