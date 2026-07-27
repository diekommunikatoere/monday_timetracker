// lib/permissions/routes.ts
// Central registry of route-level access rules, keyed by pathname. A
// "requirement" is a small predicate over the current user's permission-
// relevant fields; canAccessRoute(pathname, user) looks up and evaluates the
// rule for a path. Isomorphic — usable from client pages/components today,
// and from server route preambles once analytics API routes exist.

export interface RouteUser {
	isAdmin?: boolean | null;
	teamIds?: string[] | null;
}

type RouteRequirement = (user: RouteUser) => boolean;

function parseTeamIds(raw: string | undefined): string[] {
	return (raw ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
}

/** True when the user is a monday admin (mondayUser.isAdmin / session.isAdmin). */
export const isAdmin: RouteRequirement = (user) => !!user.isAdmin;

/**
 * Requirement factory: user.teamIds must intersect `allowedTeamIds`.
 * Deny-by-default when either list is empty.
 *
 * NOTE: resolve `NEXT_PUBLIC_*` env vars as a static `process.env.NEXT_PUBLIC_X`
 * reference at the call site (see ANALYTICS_TEAM_IDS below) — Next.js only
 * inlines static property access into the client bundle, not `process.env[dynamicKey]`.
 */
export function inTeamAllowlist(allowedTeamIds: string[]): RouteRequirement {
	return (user) => allowedTeamIds.length > 0 && !!user.teamIds?.some((id) => allowedTeamIds.includes(id));
}

const ANALYTICS_TEAM_IDS = parseTeamIds(process.env.NEXT_PUBLIC_ANALYTICS_TEAM_IDS);

/** Path -> requirement. Add an entry here for each route that needs gating. */
const ROUTE_REQUIREMENTS: Record<string, RouteRequirement> = {
	"/admin": isAdmin,
	"/dashboards/analytics/auswertung": (user) => [inTeamAllowlist(ANALYTICS_TEAM_IDS), isAdmin].some((r) => r(user)),
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
