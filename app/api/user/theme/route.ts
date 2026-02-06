import { NextRequest, NextResponse } from "next/server";
import { updateUserThemeByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";

export async function POST(request: NextRequest) {
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		const { theme } = await request.json();

		if (!theme) {
			return NextResponse.json({ error: "Missing theme" }, { status: 400 });
		}

		await updateUserThemeByMondayId(session.userId, theme);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error updating theme:", error);
		return NextResponse.json({ error: "Failed to update theme" }, { status: 500 });
	}
}
