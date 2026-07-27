"use client";

import { Select } from "@/components";

import type { RoleOption } from "../hooks/useRoles";

/**
 * Props for {@link RoleSelector}.
 *
 * @property roles          - Selectable roles, typically from {@link useRoles}.
 * @property selectedRoleId - Currently selected `role.id` (empty string when none).
 * @property onChange       - Fired with the new `role.id`, or `""` when cleared.
 * @property loading        - Disables the input while the roles query is in flight.
 * @property required       - Marks the field as required (visual only; callers still
 *                            enforce it in their own save validation).
 */
export interface RoleSelectorProps {
	roles: RoleOption[];
	selectedRoleId: string;
	onChange: (roleId: string) => void;
	loading?: boolean;
	required?: boolean;
}

/**
 * Presentational, fully-controlled billing-role picker — the single role
 * `Select` shared by every time-entry form (dashboard manual entry, timer
 * save, edit, and the sidebar item entry). Holds no state and does not fetch;
 * callers supply `roles`/`loading` (typically from the shared {@link useRoles}
 * hook) so each form keeps its own fetch/caching per the "components don't
 * fetch" convention.
 *
 * `selectedRoleId` may be preseeded by the caller (e.g. from an existing
 * entry's `role_id`) before `roles` finishes loading; the label resolves once
 * `roles` arrives and contains a matching `value` — same behavior as the
 * sidebar's role select today.
 *
 * @param props - {@link RoleSelectorProps}.
 * @returns A labelled, searchable, clearable `Select`.
 */
export function RoleSelector({ roles, selectedRoleId, onChange, loading, required }: RoleSelectorProps) {
	return <Select label="Rolle" placeholder="Rolle auswählen..." data={roles} value={selectedRoleId || null} onChange={(val) => onChange(val || "")} disabled={loading} searchable clearable clearButtonProps={{ "aria-label": "Auswahl löschen" }} nothingFoundMessage="Keine Rollen verfügbar" required={required} />;
}

export default RoleSelector;
