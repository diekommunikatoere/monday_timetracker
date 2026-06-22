import { NextRequest, NextResponse } from "next/server";
import { syncAfterFinalize } from "@/lib/columnSync";
import { insertTimeEntry } from "@/lib/database";
import { roundDuration } from "@/lib/utils";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";

interface ManualTimeEntryRequest {
	userId: string;
	taskName: string;
	comment?: string;
	boardId: string;
	boardName?: string;
	itemId: string;
	itemName?: string;
	parentItemId?: string;
	parentItemName?: string;
	roleId: string;
	duration: number; // in seconds
	date: string; // ISO date string (fallback)
	startTime: string; // ISO date-time string (preferred)
	endTime: string; // ISO date-time string (preferred)
}

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

		// Get user profile
		const userProfile = await getUserProfileByMondayId(session.userId);
		if (!userProfile) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Parse request body
		const body: ManualTimeEntryRequest = await request.json();
		const { userId, taskName, comment, boardId, boardName, itemId, itemName, parentItemId, parentItemName, roleId, duration, date, startTime, endTime } = body;

		// Validate required fields
		if (!userId || userId !== userProfile.id) {
			return NextResponse.json({ error: "Ungültige Benutzer-ID." }, { status: 400 });
		}

		if (!taskName || !boardId || !itemId) {
			return NextResponse.json({ error: "Ungültige Aufgaben- oder Board-ID." }, { status: 400 });
		}

		if (!roleId) {
			return NextResponse.json({ error: "Ungültige Rollen-ID." }, { status: 400 });
		}

		// Determine start_time, end_time, and duration values
		let finalStartTime: string;
		let finalEndTime: string;
		let finalDuration: number;

		if (startTime && endTime) {
			// Use provided start and end times (preferred)
			const startDate = new Date(startTime);
			const endDate = new Date(endTime);

			// Validate dates are valid
			if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
				return NextResponse.json({ error: "Ungültiges Start- oder Endzeitformat." }, { status: 400 });
			}

			// Calculate duration from provided times
			const durationMs = endDate.getTime() - startDate.getTime();
			finalDuration = Math.floor(durationMs / 1000);

			// Validate duration is positive
			if (finalDuration <= 0) {
				return NextResponse.json({ error: "Die Endzeit muss nach der Startzeit liegen." }, { status: 400 });
			}

			finalStartTime = startDate.toISOString();
			finalEndTime = endDate.toISOString();
		} else {
			// Fallback: use date + duration (legacy behavior)
			if (!duration || duration <= 0) {
				return NextResponse.json({ error: "Ungültige Dauer." }, { status: 400 });
			}

			if (!date) {
				return NextResponse.json({ error: "Ungültiges Datum." }, { status: 400 });
			}

			finalStartTime = new Date(date).toISOString();
			finalDuration = roundDuration(duration);
			finalEndTime = new Date(new Date(date).getTime() + finalDuration * 1000).toISOString();
		}

		// 1. Insert the time entry (this also handles dimension table updates)
		const timeEntry = await insertTimeEntry(
			{
				user_id: userId,
				comment: comment || null,
				board_id: boardId,
				item_id: itemId,
				role_id: roleId,
				duration: finalDuration,
				start_time: finalStartTime,
				end_time: finalEndTime,
				is_draft: false,
				// Dimension metadata for UPSERTing monday_item
				board_name: boardName,
				item_name: itemName,
				parent_item_id: parentItemId,
				parent_item_name: parentItemName,
			},
			userId,
		);

		if (!timeEntry) {
			return NextResponse.json({ error: "Fehler beim Erstellen des Zeiteintrags." }, { status: 500 });
		}

		// 2. Trigger column sync after successful manual entry creation
		// This runs asynchronously and doesn't block the response
		if (boardId && itemId && timeEntry.id) {
			// Don't await - let it run in the background
			syncAfterFinalize(itemId, boardId, userProfile.id, timeEntry.id).catch((syncError) => {
				console.error("[ColumnSync] Background sync failed:", syncError);
			});
		}

		return NextResponse.json({
			success: true,
			data: timeEntry,
		});
	} catch (error) {
		console.error("Error in manual time entry endpoint:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Interner Serverfehler" }, { status: 500 });
	}
}
