// lib/monday/client.ts — Factory for the shared monday.com ApiClient, version-pinned in one place.

import { ApiClient } from "@mondaydotcomorg/api";

/**
 * The single monday.com API version every {@link createMondayClient} call is pinned to.
 */
export const MONDAY_API_VERSION = "2026-07";

/**
 * Creates a monday.com `ApiClient` pinned to {@link MONDAY_API_VERSION}.
 *
 * The token defaults to the `MONDAY_API_TOKEN` env var, read **at call time** (via the
 * default parameter), so this always reflects the current process env rather than a value
 * captured at import. Pass an explicit `token` only to override — in practice all callers
 * use the env token, so most call sites invoke this with no arguments.
 *
 * No validation is performed: if the env var is unset and no token is passed, `token` is
 * `undefined` and the resulting client will fail unauthenticated requests. Callers that must
 * tolerate a missing token (e.g. `lib/columnSync.ts`, which disables sync when absent) guard
 * before calling.
 *
 * @param token - monday API token; defaults to `process.env.MONDAY_API_TOKEN`.
 * @returns An `ApiClient` configured with the token and the app-wide API version.
 */
export function createMondayClient(token = process.env.MONDAY_API_TOKEN) {
	return new ApiClient({ token, apiVersion: MONDAY_API_VERSION });
}
