// lib/permissions/routes.ts
// Central registry of route-level access rules, keyed by pathname. A
// "requirement" is a small predicate over the current user's permission-
// relevant fields; canAccessRoute(pathname, user) looks up and evaluates the
// rule for a path. Isomorphic — usable from client pages/components today,
// and from server route preambles once analytics API routes exist.

import { PERMISSIONS, type PermissionKey } from "./keys";

export interface RouteUser {
	isAdmin?: boolean | null;
	/** Effective permission keys (see `getEffectivePermissions`); admins may omit — {@link isAdmin} short-circuits. */
	permissions?: PermissionKey[] | null;
}

type RouteRequirement = (user: RouteUser) => boolean;

/** True when the user is a monday admin (mondayUser.isAdmin / session.isAdmin). */
export const isAdmin: RouteRequirement = (user) => !!user.isAdmin;

/** Requirement factory: the user's effective permissions must include `key`. */
export function hasPermissionKey(key: PermissionKey): RouteRequirement {
	return (user) => !!user.permissions?.includes(key);
}

/** Path -> requirement. Add an entry here for each route that needs gating. */
const ROUTE_REQUIREMENTS: Record<string, RouteRequirement> = {
	"/admin": isAdmin,
	"/dashboards/analytics/auswertung": (user) => [hasPermissionKey(PERMISSIONS.VIEW_AUSWERTUNG), isAdmin].some((r) => r(user)),
};

/**
 * Whether `user` may access `pathname`. Unregistered routes are unrestricted
 * (`true`) — only add entries for routes that need gating. `/admin/*` falls
 * back to the `/admin` rule so nested admin routes (e.g. `/admin/boards/[boardId]`)
 * are covered without a separate registry entry.
 */
export function canAccessRoute(pathname: string, user: RouteUser): boolean {
	const requirement = ROUTE_REQUIREMENTS[pathname] ?? (pathname.startsWith("/admin/") ? ROUTE_REQUIREMENTS["/admin"] : undefined);
	return requirement ? requirement(user) : true;
}
