// lib/permissions/keys.ts
// Registry of the named permissions that admins can grant to users or monday
// teams (stored in `permission_grant`, see 043_permissions_and_time_entry_audit.sql).
// Isomorphic — imported by server code, client hooks and the admin UI.
// monday admins implicitly hold every permission.

/** Permission key -> stable string persisted in `permission_grant.permission`. */
export const PERMISSIONS = {
	/** Create, edit (incl. reassign) and delete other users' time entries. */
	MANAGE_OTHERS_ENTRIES: "time_entries.manage_others",
	/** Open the Auswertung (per-user utilization) dashboard. */
	VIEW_AUSWERTUNG: "analytics.auswertung",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** UI metadata for a permission (German copy; drives the admin "Berechtigungen" tab). */
export interface PermissionDefinition {
	key: PermissionKey;
	label: string;
	description: string;
}

/** Ordered list of all permissions, as shown in the admin UI. Keep in sync with the CHECK constraint on `permission_grant.permission`. */
export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
	{
		key: PERMISSIONS.MANAGE_OTHERS_ENTRIES,
		label: "Zeiteinträge anderer verwalten",
		description: "Darf Zeiteinträge für andere Benutzer anlegen sowie Einträge anderer bearbeiten, neu zuweisen und löschen.",
	},
	{
		key: PERMISSIONS.VIEW_AUSWERTUNG,
		label: "Auswertung einsehen",
		description: "Darf das Auswertungs-Dashboard (wöchentliche Auslastung pro Benutzer) öffnen.",
	},
];

/** Runtime guard for untrusted input (e.g. request bodies). */
export function isPermissionKey(value: unknown): value is PermissionKey {
	return PERMISSION_DEFINITIONS.some((d) => d.key === value);
}
