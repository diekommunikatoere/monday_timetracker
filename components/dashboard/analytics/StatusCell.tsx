// components/dashboard/analytics/StatusCell.tsx
"use client";

import { Text } from "@mantine/core";

/** Status text + monday label color — the shape shared by `AbrechnungBudgetItem.status` and `AbrechnungLinkedItem.status` (see `@/types/abrechnung`). */
export interface StatusCellStatus {
	text: string | null;
	color: string | null;
}

export interface StatusCellProps {
	status: StatusCellStatus | null | undefined;
	/** `"sm"` for the budget-item table, `"xs"` for the nested linked-items table — matches the existing `Text size` used in each. */
	size?: "sm" | "xs";
}

/**
 * Relative luminance (WCAG formula) of a `#rrggbb` hex color, used to pick a readable
 * foreground for an arbitrary monday status-label background. Returns `null` for anything
 * that isn't a plain 6-digit hex (monday's `label_style.color` always is, but this stays
 * defensive rather than throwing on an unexpected shape).
 */
function relativeLuminance(hex: string): number | null {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;

	const int = parseInt(match[1], 16);
	const [r, g, b] = [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff].map((channel) => {
		const s = channel / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	});

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White text on dark labels, the DS's primary text token on light ones — fixes the previous hardcoded `c="white"`, unreadable on yellow/light-grey monday labels. */
function foregroundFor(hex: string): string {
	const luminance = relativeLuminance(hex);
	if (luminance === null) return "var(--color--text-primary)";
	return luminance > 0.55 ? "black" : "white";
}

/**
 * Shared status-chip renderer for a monday status column value. Used by both
 * `AbrechnungTable`'s own "Status" column (the budget item's status) and the nested
 * "Verknüpfte Agentur-Projekte" table's per-linked-item status column — see
 * `lib/abrechnung.ts` for how both are populated.
 *
 * - No `text`: renders nothing (no chip, no background).
 * - `color` present: a full-width rounded chip carrying its own background (the monday
 *   label hex), with a luminance-picked foreground for contrast — so the containing
 *   `<Table.Td>` no longer needs a background special-case for the status column.
 * - `text` present but `color` null (e.g. a plain `dropdown` column, which has no
 *   `label_style`): plain text, no chip.
 */
export function StatusCell({ status, size = "sm" }: StatusCellProps) {
	const text = status?.text ?? null;
	if (!text) return null;

	if (!status?.color) {
		return (
			<Text size={size} fw={500} title={text}>
				{text}
			</Text>
		);
	}

	return (
		<Text
			size={size}
			fw={500}
			title={text}
			ta="center"
			style={{
				backgroundColor: status.color,
				color: foregroundFor(status.color),
				borderRadius: "var(--border-radius--sm)",
				padding: size === "xs" ? "2px 8px" : "4px 10px",
				width: "100%",
			}}
		>
			{text}
		</Text>
	);
}
