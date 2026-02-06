import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMondayJwt } from "@/lib/monday-auth";
import type { BoardConfigInsert, BoardConfigUpdate } from "@/types/database";

/**
 * GET /api/admin/boards
 * Fetch all board configurations
 */
export async function GET(request: NextRequest) {
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

		if (!session.isAdmin) {
			return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
		}

		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");

		let query = supabaseAdmin.from("board_config").select("*, monday_board(name)");

		if (boardId) {
			query = query.eq("board_id", boardId);
		}

		const { data: boards, error } = await query;

		if (error) {
			console.error("Error fetching board configs. Query:", query, "Error:", error);
			return NextResponse.json({ error: `Failed to fetch board configurations: ${error.message}` }, { status: 500 });
		}

		// Fetch last sync for each board
		const boardIds = boards?.map((b) => b.board_id) || [];
		let lastSyncs: Record<string, any> = {};

		if (boardIds.length > 0) {
			const { data: syncLogs } = await supabaseAdmin.from("sync_log").select("board_id, created_at, success").in("board_id", boardIds).order("created_at", { ascending: false });

			// Group by board_id and take the first (latest) one
			if (syncLogs) {
				syncLogs.forEach((log: any) => {
					if (!lastSyncs[log.board_id]) {
						lastSyncs[log.board_id] = log;
					}
				});
			}
		}

		const boardsWithStatus = boards?.map((board) => {
			const lastSync = lastSyncs[board.board_id];
			const validationErrors: string[] = [];

			// Mandatory linking errors (RED)
			if (!board.budget_column_id) {
				validationErrors.push("Missing Budget Column");
			}
			if (board.sync_linked_items && !board.linked_board_id) {
				validationErrors.push("Missing Linked Board");
			}

			let configStatus = "GREEN";
			if (validationErrors.length > 0) {
				configStatus = "RED";
			} else if (!board.sync_enabled || (lastSync && !lastSync.success)) {
				configStatus = "YELLOW";
			}

			return {
				...board,
				last_sync: lastSync?.created_at || null,
				sync_success: lastSync?.success ?? null,
				config_status: configStatus,
				validation_errors: validationErrors,
			};
		});

		return NextResponse.json({
			success: true,
			boards: boardsWithStatus || [],
			count: boards?.length || 0,
		});
	} catch (error) {
		console.error("Error in GET /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * POST /api/admin/boards
 * Create or update a board configuration (upsert)
 */
export async function POST(request: NextRequest) {
	try {
		// Validate session and admin status
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		if (!session.isAdmin) {
			return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
		}

		const body = await request.json();
		const { board_id, board_name, sync_enabled, budget_column_id, budget_column_type, sync_on_finalize, sync_budget_used, linked_board_id, sync_linked_items } = body;

		// Validate required fields
		if (!board_id || typeof board_id !== "string") {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		if (!board_name || typeof board_name !== "string") {
			return NextResponse.json({ error: "Board name is required" }, { status: 400 });
		}

		const boardData: BoardConfigInsert = {
			board_id,
			sync_enabled: sync_enabled !== false, // Default to true
			budget_column_id: budget_column_id || null,
			budget_column_type: budget_column_type || null,
			sync_on_finalize: sync_on_finalize !== false,
			sync_budget_used: sync_budget_used !== false,
			linked_board_id: linked_board_id || null,
			sync_linked_items: sync_linked_items !== false,
		};

		// Upsert - update if exists, insert if not
		const { data: board, error } = await supabaseAdmin.from("board_config").upsert(boardData, { onConflict: "board_id" }).select().single();

		if (error) {
			console.error("Error creating/updating board config:", error);
			return NextResponse.json({ error: "Failed to save board configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			board,
		});
	} catch (error) {
		console.error("Error in POST /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/boards
 * Update an existing board configuration
 */
export async function PATCH(request: NextRequest) {
	try {
		// Validate session and admin status
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		if (!session.isAdmin) {
			return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
		}

		const body = await request.json();
		const { board_id, sync_enabled, budget_column_id, budget_column_type, sync_on_finalize, sync_budget_used, linked_board_id, sync_linked_items } = body;

		// Validate required fields
		if (!board_id) {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		const updateData: BoardConfigUpdate = {
			updated_at: new Date().toISOString(),
		};

		if (sync_enabled !== undefined) updateData.sync_enabled = sync_enabled;
		if (budget_column_id !== undefined) updateData.budget_column_id = budget_column_id || null;
		if (budget_column_type !== undefined) updateData.budget_column_type = budget_column_type || null;
		if (sync_on_finalize !== undefined) updateData.sync_on_finalize = sync_on_finalize;
		if (sync_budget_used !== undefined) updateData.sync_budget_used = sync_budget_used;
		if (linked_board_id !== undefined) updateData.linked_board_id = linked_board_id || null;
		if (sync_linked_items !== undefined) updateData.sync_linked_items = sync_linked_items;

		const { data: board, error } = await supabaseAdmin.from("board_config").update(updateData).eq("board_id", board_id).select().single();

		if (error) {
			console.error("Error updating board config:", error);
			return NextResponse.json({ error: "Failed to update board configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			board,
		});
	} catch (error) {
		console.error("Error in PATCH /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * DELETE /api/admin/boards
 * Delete a board configuration
 */
export async function DELETE(request: NextRequest) {
	try {
		// Validate session and admin status
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		if (!session.isAdmin) {
			return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
		}

		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");

		if (!boardId) {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		const { error } = await supabaseAdmin.from("board_config").delete().eq("board_id", boardId);

		if (error) {
			console.error("Error deleting board config:", error);
			return NextResponse.json({ error: "Failed to delete board configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			message: "Board configuration deleted successfully",
		});
	} catch (error) {
		console.error("Error in DELETE /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
