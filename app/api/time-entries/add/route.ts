import { NextResponse } from "next/server";
import { insertTimeEntry } from "@/lib/database";

export async function POST(request: Request) {
	try {
		const { task_name, start_time, end_time, duration } = await request.json();

		if (!task_name || !start_time || !end_time || duration === undefined) {
			return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
		}

		const result = insertTimeEntry.run(task_name, start_time, end_time, duration);

		return NextResponse.json({
			id: result.lastInsertRowid,
			task_name,
			start_time,
			end_time,
			duration,
		});
	} catch (error) {
		console.error("Error adding time entry:", error);
		return NextResponse.json({ error: "Failed to add time entry" }, { status: 500 });
	}
}
