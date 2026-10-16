// app/api/cron/sentinel/route.ts
import { NextRequest, NextResponse } from "next/server";

import { valve } from "@/lib/sentinel";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/sentinel
 * Backup trigger for the Sentinel Valve: runs one cycle (respecting a closed Valve) and returns
 * the CycleResult. NOT scheduled by default — a recurring external ping would keep the app from
 * sleeping on Railway. Use for manual recovery, or if a periodic waker already exists.
 */
export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");
		const cronSecret = process.env.CRON_SECRET;

		if (!cronSecret) {
			console.error("[Sentinel] CRON_SECRET is not set in environment variables.");
			return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 401 });
		}

		if (authHeader !== `Bearer ${cronSecret}`) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const result = await valve.cycle({ force: false });
		return NextResponse.json(result);
	} catch (error) {
		console.error("[Sentinel] Cron cycle failed:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
