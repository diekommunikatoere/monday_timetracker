import jwt from "jsonwebtoken";

export interface MondaySession {
	userId: string;
	accountId: string;
	isAdmin: boolean;
	isValid: boolean;
}

/**
 * Verifies the monday.com session token (JWT)
 * @param token The JWT from the Authorization header
 * @returns Decoded session data or invalid status
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
