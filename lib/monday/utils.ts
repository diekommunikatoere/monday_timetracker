// lib/monday/utils.ts — Column-type compatibility metadata and predicate helpers for sync configuration.

import { SyncPurpose } from "@/types/database";

/**
 * Allowlist of monday.com column types that can receive synced time-tracking values,
 * mapped to a human-readable label and the {@link SyncPurpose} values each type accepts.
 *
 * **monday.com constraint**: the native `time_tracking` column type is read-only via the
 * API and is therefore excluded — only `numbers`, `text`, and `long_text` are writable.
 *
 * Purpose mapping at a glance:
 * - `numbers`   — accepts `total_time`, `remaining_budget`, `budget_used` (numeric values).
 * - `text`      — accepts `total_time`, `time_by_role` (formatted strings).
 * - `long_text` — accepts `time_by_role` only (multi-line breakdown string).
 */
export const COMPATIBLE_COLUMN_TYPES: Record<string, { label: string; purposes: SyncPurpose[] }> = {
	numbers: {
		label: "Numbers",
		purposes: ["total_time", "remaining_budget", "budget_used"],
	},
	text: {
		label: "Text",
		purposes: ["total_time", "time_by_role"],
	},
	long_text: {
		label: "Long Text",
		purposes: ["time_by_role"],
	},
	// Note: time_tracking column type is read-only in monday.com API
};

/**
 * Returns `true` when `columnType` supports the given `purpose`.
 *
 * Looks up `columnType` in {@link COMPATIBLE_COLUMN_TYPES} and checks that
 * `purpose` is listed in its `purposes` array. Returns `false` for any unknown
 * column type.
 *
 * @param columnType - monday.com column type string (e.g. `"numbers"`, `"text"`).
 * @param purpose    - The {@link SyncPurpose} to validate.
 * @returns `true` if the column can receive values for this purpose.
 */
export function isPurposeCompatible(columnType: string, purpose: SyncPurpose): boolean {
	const compatInfo = COMPATIBLE_COLUMN_TYPES[columnType];
	if (!compatInfo) return false;
	return compatInfo.purposes.includes(purpose);
}

/**
 * Returns `true` when `purpose` represents a time duration that needs to be formatted
 * before being written to monday (i.e. `"total_time"` or `"time_by_role"`).
 *
 * Use this predicate to decide whether to call {@link formatTimeValue} /
 * {@link formatTimeByRoleBreakdown} before invoking {@link updateColumnValue}.
 * Budget purposes (`"remaining_budget"`, `"budget_used"`) are monetary and use
 * {@link formatBudgetValue} instead.
 *
 * @param purpose - The {@link SyncPurpose} to test.
 * @returns `true` for `"total_time"` and `"time_by_role"`.
 */
export function isTimePurpose(purpose: SyncPurpose): boolean {
	return purpose === "total_time" || purpose === "time_by_role";
}

/**
 * Parses a numeric value out of a monday.com column's `.text` display string.
 *
 * Shared by {@link "../columnSync".getBudgetFromColumn} (single-item budget lookup)
 * and {@link "../monday".getBudgetBoardItems} (bulk budget-board fetch) so both
 * paths agree on number formatting without an extra network round-trip per item.
 *
 * Handles both US (`1,234.56`) and European (`1.234,56`) formats by inspecting
 * whichever of `.`/`,` appears last in the cleaned string:
 * 1. Strip everything except digits, `.`, `,`, and `-`.
 * 2. If the last comma comes after the last dot, treat comma as the decimal
 *    separator (European) — drop dots, replace the last comma with a dot.
 * 3. If the last dot comes after the last comma, treat dot as the decimal
 *    separator (US) — drop commas.
 * 4. If there's only a trailing comma followed by 1–2 digits, treat it as a
 *    decimal separator too (e.g. `"1234,5"`).
 *
 * @param text - The column's `.text` value (may be `null`/`undefined`/empty).
 * @returns The parsed number, or `null` if `text` is empty or not parseable.
 */
export function parseNumericColumnText(text: string | null | undefined): number | null {
	if (!text) return null;

	let cleaned = text.replace(/[^0-9.,-]/g, "");

	const lastDot = cleaned.lastIndexOf(".");
	const lastComma = cleaned.lastIndexOf(",");

	if (lastComma > lastDot) {
		// Comma is likely the decimal separator (European format)
		cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
	} else if (lastDot > lastComma) {
		// Dot is likely the decimal separator (US format)
		cleaned = cleaned.replace(/,/g, "");
	} else if (lastComma !== -1 && cleaned.length - lastComma <= 3) {
		// Only a comma present, close enough to the end to be a decimal separator
		cleaned = cleaned.replace(/,/g, ".");
	}

	const parsedValue = parseFloat(cleaned);
	return isNaN(parsedValue) ? null : parsedValue;
}
