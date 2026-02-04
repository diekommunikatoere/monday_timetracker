// app/api/user/theme/route.ts
import { NextRequest, NextResponse } from "next/server";
import { updateUserThemeByMondayId } from "@/lib/database/users";
import { getMondayContext } from "@/lib/monday";

export async function POST(request: NextRequest) {
	try {
		const context = await getMondayContext(request);
		const { theme } = await request.json();

		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		if (!theme) {
			return NextResponse.json({ error: "Missing theme" }, { status: 400 });
		}

		await updateUserThemeByMondayId(context.user.id.toString(), theme);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error updating theme:", error);
		return NextResponse.json({ error: "Failed to update theme" }, { status: 500 });
	}
}
