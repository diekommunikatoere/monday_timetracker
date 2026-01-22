/**
 * API Route: GET /api/items/[itemId]/time-breakdown
 *
 * Calculates and returns total tracked time for a monday.com item,
 * broken down by role with cost calculations.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatTimeValue, formatTimeByRoleBreakdown } from "@/lib/monday/columnSync";
import { GetItemTimeByRoleResult, TimeFormat } from "@/types/database";

export interface TimeBreakdownResponse {
	success: boolean;
	itemId: string;
	totalSeconds: number;
	totalFormatted: string;
	breakdown: Array<{
		roleId: string;
		roleName: string;
		totalSeconds: number;
		formattedTime: string;
		entryCount: number;
		hourlyRate?: number;
		cost?: number;
	}>;
	formattedBreakdown: string;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
	try {
		// Authenticate user from Monday context
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { itemId } = await params;

		// Validate itemId
		if (!itemId) {
			return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
		}

		// Get query parameters
		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");
		const userOnly = searchParams.get("userOnly") === "true";
		const format = (searchParams.get("format") as TimeFormat) || "hh:mm";
		const includeRates = searchParams.get("includeRates") === "true";

		// Get the user's profile ID
		const { data: userProfile, error: userError } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

		if (userError || !userProfile) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Use the database function to get time breakdown by role
		const { data: breakdown, error: breakdownError } = await supabaseAdmin.rpc("get_item_time_by_role", {
			p_item_id: itemId,
			p_user_id: userOnly ? userProfile.id : null,
		});

		if (breakdownError) {
			console.error("[GET /api/items/[itemId]/time-breakdown] RPC error:", breakdownError);
			return NextResponse.json({ error: "Failed to calculate time breakdown" }, { status: 500 });
		}

		const roleBreakdown = (breakdown as GetItemTimeByRoleResult[]) || [];

		// Get total time
		const { data: totalTime, error: totalError } = await supabaseAdmin.rpc("get_item_total_time", {
			p_item_id: itemId,
			p_user_id: userOnly ? userProfile.id : null,
		});

		if (totalError) {
			console.error("[GET /api/items/[itemId]/time-breakdown] Total time error:", totalError);
		}

		const totalSeconds = (totalTime as number) || 0;

		// If rates are requested and boardId is provided, fetch effective rates
		let breakdownWithRates = roleBreakdown.map((item) => ({
			roleId: item.role_id,
			roleName: item.role_name,
			totalSeconds: Number(item.total_seconds),
			formattedTime: String(formatTimeValue(Number(item.total_seconds), format)),
			entryCount: Number(item.entry_count),
		}));

		if (includeRates && boardId) {
			// Fetch effective rates for each role
			const ratesPromises = breakdownWithRates.map(async (item) => {
				const { data: rate } = await supabaseAdmin.rpc("get_effective_hourly_rate", {
					p_board_id: boardId,
					p_role_id: item.roleId,
				});

				const hourlyRate = (rate as number) || 0;
				const hours = item.totalSeconds / 3600;
				const cost = hours * hourlyRate;

				return {
					...item,
					hourlyRate,
					cost: Number(cost.toFixed(2)),
				};
			});

			breakdownWithRates = await Promise.all(ratesPromises);
		}

		// Format the breakdown as text
		const formattedBreakdown = formatTimeByRoleBreakdown(
			breakdownWithRates.map((item) => ({
				roleName: item.roleName,
				totalSeconds: item.totalSeconds,
			})),
			{ includeTotal: true, format },
		);

		const response: TimeBreakdownResponse = {
			success: true,
			itemId,
			totalSeconds,
			totalFormatted: String(formatTimeValue(totalSeconds, format)),
			breakdown: breakdownWithRates,
			formattedBreakdown,
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error("[GET /api/items/[itemId]/time-breakdown] Error:", error);

		const errorMessage = error instanceof Error ? error.message : "Failed to calculate time breakdown";
		const status = errorMessage.includes("Unauthorized") ? 401 : 500;

		return NextResponse.json({ error: errorMessage }, { status });
	}
}
