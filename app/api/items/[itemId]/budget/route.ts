/**
 * API Route: GET /api/items/[itemId]/budget
 *
 * Calculates remaining budget for a monday.com item based on
 * tracked time, role hourly rates, and the budget amount.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatBudgetValue } from "@/lib/monday/columnSync";
import { CalculateRemainingBudgetResult } from "@/types/database";

export interface BudgetResponse {
	success: boolean;
	itemIds: Array<string>;
	boardId: string;
	budgetAmount: number;
	totalCost: number;
	remainingBudget: number;
	utilizationPercent: number;
	currencySymbol: string;
	formattedRemaining: string;
	formattedBudget: string;
	formattedCost: string;
	costBreakdown?: Array<{
		roleId: string;
		roleName: string;
		hours: number;
		hourlyRate: number;
		cost: number;
	}>;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
	try {
		// Authenticate user from Monday context
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { itemId } = await params;
		const itemIds = [itemId];

		// Validate itemId
		if (!itemId) {
			return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
		}

		// Get query parameters
		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");
		const budgetAmountParam = searchParams.get("budgetAmount");
		const userOnly = searchParams.get("userOnly") === "true";
		const includeBreakdown = searchParams.get("includeBreakdown") === "true";

		if (!boardId) {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		if (!budgetAmountParam) {
			return NextResponse.json({ error: "Budget amount is required" }, { status: 400 });
		}

		const budgetAmount = parseFloat(budgetAmountParam);
		if (isNaN(budgetAmount) || budgetAmount < 0) {
			return NextResponse.json({ error: "Budget amount must be a valid positive number" }, { status: 400 });
		}

		// Get the user's profile ID (for userOnly filtering)
		let userId: string | null = null;
		if (userOnly) {
			const { data: userProfile, error: userError } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

			if (userError || !userProfile) {
				return NextResponse.json({ error: "User not found" }, { status: 404 });
			}
			userId = userProfile.id;
		}

		// Get board config for currency symbol
		const { data: boardConfig } = await supabaseAdmin.from("board_config").select("currency_symbol").eq("board_id", boardId).single();

		const currencySymbol = boardConfig?.currency_symbol || "€";

		// Use the database function to calculate remaining budget
		const { data: budgetResult, error: budgetError } = await supabaseAdmin.rpc("calculate_remaining_budget", {
			p_board_id: boardId,
			p_item_ids: itemIds,
			p_budget_amount: budgetAmount,
			p_user_id: userId,
		});

		if (budgetError) {
			console.error("[GET /api/items/[itemId]/budget] RPC error:", budgetError);
			return NextResponse.json({ error: "Failed to calculate budget" }, { status: 500 });
		}

		// The RPC returns a single row, handle the result
		const result = Array.isArray(budgetResult) ? budgetResult[0] : budgetResult;
		const typedResult = result as CalculateRemainingBudgetResult;

		let costBreakdown: BudgetResponse["costBreakdown"] | undefined;

		if (includeBreakdown) {
			// Get detailed breakdown from time entries with role rates
			const { data: timeBreakdown } = await supabaseAdmin.rpc("get_item_time_by_role", {
				p_item_ids: itemIds,
				p_user_id: userId,
			});

			if (timeBreakdown && Array.isArray(timeBreakdown)) {
				const breakdownPromises = timeBreakdown.map(async (item: any) => {
					const { data: rate } = await supabaseAdmin.rpc("get_effective_hourly_rate", {
						p_board_id: boardId,
						p_role_id: item.role_id,
					});

					const hourlyRate = (rate as number) || 0;
					const hours = Number(item.total_seconds) / 3600;
					const cost = hours * hourlyRate;

					return {
						roleId: item.role_id,
						roleName: item.role_name,
						hours: Number(hours.toFixed(2)),
						hourlyRate,
						cost: Number(cost.toFixed(2)),
					};
				});

				costBreakdown = await Promise.all(breakdownPromises);
			}
		}

		const response: BudgetResponse = {
			success: true,
			itemIds: itemIds,
			boardId,
			budgetAmount: Number(typedResult.budget_amount),
			totalCost: Number(typedResult.total_cost),
			remainingBudget: Number(typedResult.remaining_budget),
			utilizationPercent: Number(typedResult.utilization_percent?.toFixed(1) || 0),
			currencySymbol,
			formattedRemaining: formatBudgetValue(Number(typedResult.remaining_budget), { currencySymbol }),
			formattedBudget: formatBudgetValue(Number(typedResult.budget_amount), { currencySymbol }),
			formattedCost: formatBudgetValue(Number(typedResult.total_cost), { currencySymbol }),
			...(costBreakdown && { costBreakdown }),
		};

		return NextResponse.json(response);
	} catch (error) {
		console.error("[GET /api/items/[itemId]/budget] Error:", error);

		const errorMessage = error instanceof Error ? error.message : "Failed to calculate budget";
		const status = errorMessage.includes("Unauthorized") ? 401 : 500;

		return NextResponse.json({ error: errorMessage }, { status });
	}
}
