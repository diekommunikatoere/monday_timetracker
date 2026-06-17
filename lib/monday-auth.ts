// lib/monday-auth.ts — Verifies monday.com session-token JWTs for server-side auth.

import jwt from "jsonwebtoken";

/**
 * Decoded identity extracted from a monday.com session-token JWT.
 *
 * All IDs are **monday.com IDs**, not internal Supabase IDs. To resolve
 * the Supabase user, pass `userId` to {@link getUserProfileByMondayId} or
 * {@link findOrCreateUserByMondayId} from `lib/database/users.ts`.
 *
 * @property userId    - monday.com user ID (string-coerced from the JWT `dat.user_id` number).
 * @property accountId - monday.com account/workspace ID (`dat.account_id`).
 * @property isAdmin   - `true` when `dat.is_admin` is truthy — gates admin-only API routes.
 * @property isValid   - `false` on any verification failure; always check this before using other fields.
 */
export interface MondaySession {
	userId: string;
	accountId: string;
	isAdmin: boolean;
	isValid: boolean;
}

/**
 * Verifies a monday.com session-token JWT and returns the decoded identity.
 *
 * The client obtains the raw token via `monday.get("sessionToken")` and
 * sends it as `Authorization: Bearer <token>`. Pass the full header value
 * here — the `"Bearer "` prefix is stripped automatically.
 *
 * On any failure (missing secret, malformed token, expired, `dat` payload
 * absent) the function **does not throw** — it returns `{ isValid: false }`
 * so callers can handle auth errors uniformly with a single `if (!session.isValid)` check.
 *
 * Typical route preamble:
 * ```ts
 * const session = verifyMondayJwt(request.headers.get("authorization") ?? "");
 * if (!session.isValid) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
 * ```
 *
 * @param token - The raw `Authorization` header value, with or without `"Bearer "` prefix.
 * @returns A {@link MondaySession} — check `isValid` before trusting any other field.
 */
export function verifyMondayJwt(token: string): MondaySession {
	const secret = process.env.MONDAY_SIGNING_SECRET;

	if (!secret) {
		console.error("[JWT] MONDAY_SIGNING_SECRET is not set in environment variables");
		return { userId: "", accountId: "", isAdmin: false, isValid: false };
	}

	if (!token || token === "Bearer null" || token === "null") {
		console.error("[JWT] No token provided or token is 'null'");
		return { userId: "", accountId: "", isAdmin: false, isValid: false };
	}

	try {
		// Remove "Bearer " prefix if present
		const cleanToken = token.startsWith("Bearer ") ? token.substring(7) : token;

		const decoded = jwt.verify(cleanToken, secret) as any;

		// monday.com JWT structure: { dat: { user_id, account_id, is_admin, ... } }
		if (!decoded || !decoded.dat) {
			console.error("[JWT] Token decoded but 'dat' property is missing");
			return { userId: "", accountId: "", isAdmin: false, isValid: false };
		}

		return {
			userId: String(decoded.dat.user_id),
			accountId: String(decoded.dat.account_id),
			isAdmin: !!decoded.dat.is_admin,
			isValid: true,
		};
	} catch (err) {
		console.error("[JWT] Verification failed:", err instanceof Error ? err.message : err);
		return { userId: "", accountId: "", isAdmin: false, isValid: false };
	}
}
