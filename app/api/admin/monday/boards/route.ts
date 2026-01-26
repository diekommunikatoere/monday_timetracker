import { NextRequest, NextResponse } from "next/server";
import { ApiClient } from "@mondaydotcomorg/api";

/**
 * GET /api/admin/monday/boards
 * Fetch all accessible boards from Monday.com API for the admin dropdowns.
 */
export async function GET(request: NextRequest) {
	try {
		const token = process.env.MONDAY_API_TOKEN;
		if (!token) {
			return NextResponse.json({ error: "MONDAY_API_TOKEN is not set" }, { status: 500 });
		}

		const client = new ApiClient({ token, apiVersion: "2025-10" });

		// Query to get boards the user has access to
		const query = `
			query {
				boards (limit: 100) {
					id
					name
					board_folder_id
					board_kind
				}
			}
		`;

		const response = await client.request<any>(query);

		if (response.error || response.data?.error) {
			return NextResponse.json({ error: response.error?.message || response.data?.error?.message }, { status: 500 });
		}

		const boards = response.data?.data?.boards || [];

		return NextResponse.json({
			success: true,
			boards: boards.map((b: any) => ({
				value: b.id,
				label: b.name,
				kind: b.board_kind,
			})),
		});
	} catch (error) {
		console.error("Error in GET /api/admin/monday/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
