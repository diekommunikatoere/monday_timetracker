import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";

interface ManualTimeEntryRequest {
	userId: string;
	taskName: string;
	comment?: string;
	boardId?: string;
	boardName?: string;
	itemId?: string;
	itemName?: string;
	role?: string;
	roleName?: string;
	duration: number; // in seconds
	date: string; // ISO date string
}

export async function POST(request: NextRequest) {
	try {
		// Authenticate user from Monday context
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get the Supabase user ID from the Monday user ID
		const { data: userProfile, error: userError } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

		if (userError || !userProfile) {
			console.error("Error fetching user profile:", userError);
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Parse request body
		const body: ManualTimeEntryRequest = await request.json();
		const { userId, taskName, comment, boardId, boardName, itemId, itemName, role, roleName, duration, date } = body;

		// Validate required fields
		if (!userId || userId !== userProfile.id) {
			return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
		}

		if (!taskName) {
			return NextResponse.json({ error: "taskName is required" }, { status: 400 });
		}

		if (!duration || duration <= 0) {
			return NextResponse.json({ error: "Valid duration is required" }, { status: 400 });
		}

		if (!date) {
			return NextResponse.json({ error: "Date is required" }, { status: 400 });
		}

		// Insert the time entry directly (no draft needed for manual entries)
		const { data, error } = await supabaseAdmin
			.from("time_entry")
			.insert({
				user_id: userId,
				task_name: taskName,
				comment: comment || null,
				board_id: boardId || null,
				board_name: boardName || null,
				item_id: itemId || null,
				item_name: itemName || null,
				role: role || null,
				role_name: roleName || null,
				duration: duration,
				start_time: new Date(date).toISOString(),
				end_time: new Date(new Date(date).getTime() + duration * 1000).toISOString(),
				is_draft: false,
			})
			.select()
			.single();

		if (error) {
			console.error("Error creating manual time entry:", error);
			return NextResponse.json({ error: error.message || "Failed to create time entry" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			data,
		});
	} catch (error) {
		console.error("Error in manual time entry endpoint:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
	}
}
