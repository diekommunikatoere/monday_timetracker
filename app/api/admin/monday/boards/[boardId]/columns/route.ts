import { ApiClient } from "@mondaydotcomorg/api";
import { NextRequest, NextResponse } from "next/server";

import { createMondayClient } from "@/lib/monday/client";
import { requireAdmin } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * GET /api/admin/monday/boards/[boardId]/columns
 * Fetch columns for a specific board, using DB cache (monday_column) if available.
 * Note: Authentication is handled server-side via requireAdmin
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;
		const token = process.env.MONDAY_API_TOKEN;
		if (!token) {
			return NextResponse.json({ error: "MONDAY_API_TOKEN is not set" }, { status: 500 });
		}

		// 1. Check Supabase cache first
		const { data: cachedColumns, error: cacheError } = await supabaseAdmin.from("monday_column").select("monday_column_id, title, type").eq("board_id", boardId);

		if (!cacheError && cachedColumns && cachedColumns.length > 0) {
			return NextResponse.json({
				success: true,
				source: "cache",
				columns: cachedColumns.map((c) => ({
					id: c.monday_column_id,
					title: c.title,
					type: c.type,
				})),
			});
		}

		// 2. If not in cache, fetch from Monday API
		const client = createMondayClient();
		const query = `
			query ($boardId: [ID!]) {
				boards (ids: $boardId) {
					id
					name
					columns {
						id
						title
						type
					}
				}
			}
		`;

		const response = await client.request<any>(query, { variables: { boardId: [boardId] } });

		if (response.error || response.data?.error) {
			return NextResponse.json({ error: response.error?.message || response.data?.error?.message }, { status: 500 });
		}

		const board = response.data?.data?.boards?.[0];
		if (!board) {
			return NextResponse.json({ error: "Board not found" }, { status: 404 });
		}

		const columns = board.columns || [];

		// 3. Update cache in background (upsert board first, then columns)
		// Ensure board exists in monday_board
		await supabaseAdmin.from("monday_board").upsert({ id: boardId, name: board.name }, { onConflict: "id" });

		const columnData = columns.map((c: any) => ({
			board_id: boardId,
			monday_column_id: c.id,
			title: c.title,
			type: c.type,
			updated_at: new Date().toISOString(),
		}));

		if (columnData.length > 0) {
			await supabaseAdmin.from("monday_column").upsert(columnData, { onConflict: "board_id, monday_column_id" });
		}

		return NextResponse.json({
			success: true,
			source: "api",
			columns: columns.map((c: any) => ({
				id: c.id,
				title: c.title,
				type: c.type,
			})),
		});
	} catch (error) {
		console.error("Error in GET /api/admin/monday/boards/[boardId]/columns:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
