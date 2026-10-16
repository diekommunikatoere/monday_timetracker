// app/api/admin/sentinel/route.ts
import { NextRequest, NextResponse } from "next/server";

import { getUserProfileByMondayId } from "@/lib/database/users";
import { requireAdmin } from "@/lib/monday-auth";
import { getSentinelSettings, getSentinelState, getSentinelStatus, parseSentinelSettingsPatch, SENTINEL_SETTINGS_KEY, sentinel, valve } from "@/lib/sentinel";
import { setSetting } from "@/lib/settings";

/**
 * GET /api/admin/sentinel
 * Settings, live Pipe counts and the last cycle's status.
 */
export async function GET(request: NextRequest) {
	const auth = requireAdmin(request);
	if (auth instanceof NextResponse) return auth;

	try {
		const [{ settings, persisted }, live] = await Promise.all([getSentinelSettings(), getSentinelStatus()]);

		return NextResponse.json({
			success: true,
			settings,
			settingsPersisted: persisted,
			...live,
			running: valve.isRunning(),
			disabled: sentinel.isDisabled(),
		});
	} catch (error) {
		console.error("[Sentinel] Admin GET failed:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/sentinel
 * Updates `intervalSeconds` and/or `valveOpen`. The new values are pushed straight into the
 * Valve (instead of waiting out the settings cache); a changed interval re-arms a pending timer,
 * and opening the Valve arms it so collected work drains.
 */
export async function PATCH(request: NextRequest) {
	const auth = requireAdmin(request);
	if (auth instanceof NextResponse) return auth;

	try {
		const parsed = parseSentinelSettingsPatch(await request.json().catch(() => null));
		if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

		const { settings: current } = await getSentinelSettings();
		const merged = { ...current, ...parsed.patch };

		const actor = await getUserProfileByMondayId(auth.userId);
		await setSetting(SENTINEL_SETTINGS_KEY, merged, actor?.id ?? null);

		getSentinelState().settings = merged;
		if (merged.intervalSeconds !== current.intervalSeconds) valve.rearm();
		if (merged.valveOpen && !current.valveOpen) valve.arm();

		return NextResponse.json({ success: true, settings: merged });
	} catch (error) {
		console.error("[Sentinel] Admin PATCH failed:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * POST /api/admin/sentinel
 * "Jetzt ausführen": runs a cycle now, even if the Valve is closed. Answers 202 once the cycle
 * is under way (the UI polls GET), or 409 when it can't start.
 */
export async function POST(request: NextRequest) {
	const auth = requireAdmin(request);
	if (auth instanceof NextResponse) return auth;

	try {
		if (valve.isRunning()) return NextResponse.json({ error: "Durchlauf läuft bereits" }, { status: 409 });

		const run = valve.cycle({ force: true });
		const early = await Promise.race([run, new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))]);

		if (early && !early.ran && "reason" in early) {
			const error = early.reason === "locked" ? "Ein anderer Prozess führt gerade einen Durchlauf aus" : "Durchlauf läuft bereits";
			return NextResponse.json({ error, reason: early.reason }, { status: 409 });
		}
		return NextResponse.json({ success: true }, { status: 202 });
	} catch (error) {
		console.error("[Sentinel] Admin POST failed:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
