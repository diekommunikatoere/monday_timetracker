// lib/supabase/pagination.ts
// Helpers for fetching more than 1 000 rows from Supabase, which caps a single
// query at 1 000 results. Two strategies are provided: range-based (simple,
// fine for moderate data) and keyset/cursor-based (efficient for large tables).

import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Shared configuration accepted by both {@link fetchAllWithRange} and
 * {@link fetchAllWithKeyset}.
 *
 * @property batchSize - Rows to request per Supabase query. Capped at 1 000
 *                       (the PostgREST hard limit). Defaults to `1000`.
 * @property maxRows   - Optional upper bound on total rows returned across all
 *                       batches. Useful for safety limits on unbounded tables.
 *                       Defaults to unlimited.
 * @property delayMs   - Milliseconds to wait between batch requests. Use a
 *                       small value (e.g. `50`) if you need to avoid hammering
 *                       the DB under a tight rate limit. Defaults to `0`.
 */
export interface PaginationConfig {
	/** Number of rows to fetch per batch (default: 1000, max: 1000) */
	batchSize?: number;
	/** Maximum number of rows to fetch in total (default: unlimited) */
	maxRows?: number;
	/** Delay between batches in milliseconds (default: 0) */
	delayMs?: number;
	/** Equality filters applied to every batch, e.g. `{ board_id: "123" }`. */
	eq?: Record<string, string | number | boolean>;
}

/**
 * Unified result shape returned by both {@link fetchAllWithRange} and
 * {@link fetchAllWithKeyset}.
 *
 * When `success` is `false` the function has already logged the error and
 * `data` contains all rows that were fetched **before** the failure — it is
 * non-empty when the error occurred mid-pagination.
 *
 * @typeParam T - Row type inferred from the table/view being queried. Typed as
 *               `any[]` at runtime because dynamic table names prevent
 *               compile-time narrowing; cast the result at the call site.
 *
 * @property data    - Flattened array of all rows received across every batch.
 * @property count   - `data.length` — convenience alias; always equals `data.length`.
 * @property batches - Number of batch requests that were issued. Useful for diagnostics.
 * @property success - `true` when all batches completed without error.
 * @property error   - Human-readable error message when `success` is `false`.
 */
export interface PaginatedResult<T> {
	/** All fetched data consolidated into a single array */
	data: T[];
	/** Total number of rows fetched */
	count: number;
	/** Number of batches executed */
	batches: number;
	/** Whether the fetch was successful */
	success: boolean;
	/** Error message if fetch failed */
	error?: string;
}

/**
 * Fetches every row from a Supabase table or view using **offset/range
 * pagination** (`.range(start, end)`), working around the PostgREST 1 000-row
 * cap by issuing multiple sequential requests.
 *
 * Prefer this strategy for tables with fewer than ~10 000 rows. For larger
 * tables, use {@link fetchAllWithKeyset} to avoid the performance penalty of
 * high-offset queries. Use {@link recommendPaginationStrategy} if unsure.
 *
 * On error the function logs to `console.error`, sets `success: false`, and
 * returns whatever rows were collected before the failure — **do not** assume
 * `data` is empty when `success` is `false`.
 *
 * The `client` parameter accepts either `supabaseAdmin` (server-side,
 * service-role) or the anon `supabase` client. Always use `supabaseAdmin`
 * from `lib/supabase/server.ts` for server routes.
 *
 * @param client - Typed Supabase client (`SupabaseClient<Database>`).
 * @param table  - Name of the table or view as it appears in the Supabase schema.
 * @param select - PostgREST column selector string (default: `'*'`).
 * @param config - Optional {@link PaginationConfig} overrides.
 * @returns A {@link PaginatedResult} containing all rows and batch diagnostics.
 *
 * @example
 * ```typescript
 * const result = await fetchAllWithRange(
 *   supabaseAdmin,
 *   'time_entry',
 *   'id, user_id, start_time, end_time',
 *   { batchSize: 1000 }
 * );
 *
 * if (result.success) {
 *   console.log(`Fetched ${result.count} time entries`);
 *   const allEntries = result.data;
 * }
 * ```
 */
export async function fetchAllWithRange(client: SupabaseClient<Database>, table: string, select: string = "*", config: PaginationConfig = {}): Promise<PaginatedResult<any>> {
	const { batchSize = 1000, maxRows, delayMs = 0 } = config;
	const allData: any[] = [];
	let offset = 0;
	let batchCount = 0;
	let hasMore = true;

	try {
		while (hasMore) {
			// Check if we've reached the max rows limit
			if (maxRows && allData.length >= maxRows) {
				break;
			}

			// Calculate the end of the range
			const currentBatchSize = maxRows ? Math.min(batchSize, maxRows - allData.length) : batchSize;
			const end = offset + currentBatchSize - 1;

			// Execute the query with range
			// Using type assertion to allow dynamic table names
			const { data, error } = await (client
				.from(table as any)
				.select(select)
				.range(offset, end) as any);

			if (error) {
				throw new Error(`Supabase error: ${error.message}`);
			}

			if (!data || data.length === 0) {
				hasMore = false;
				break;
			}

			// Add data to results
			allData.push(...data);
			batchCount++;

			// Check if we got fewer results than requested (last batch)
			if (data.length < currentBatchSize) {
				hasMore = false;
				break;
			}

			// Move to next batch
			offset += currentBatchSize;

			// Optional delay between batches
			if (delayMs > 0 && hasMore) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}

		return {
			data: allData,
			count: allData.length,
			batches: batchCount,
			success: true,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
		console.error(`[fetchAllWithRange] Error fetching from ${table}:`, errorMessage);

		return {
			data: allData,
			count: allData.length,
			batches: batchCount,
			success: false,
			error: errorMessage,
		};
	}
}

/**
 * Fetches every row from a Supabase table or view using **keyset (cursor)
 * pagination**, advancing via `.gt(cursorColumn, lastCursor)` instead of
 * offset arithmetic.
 *
 * **Prefer this over {@link fetchAllWithRange} for tables larger than
 * ~10 000 rows** — high-offset queries degrade as the table grows; keyset
 * pagination stays O(log n) when `cursorColumn` is indexed.
 *
 * Constraints:
 * - `cursorColumn` **must be unique and sortable** (typically `'id'` for UUIDs
 *   or a monotonic timestamp). Non-unique cursor columns will produce
 *   duplicates or skipped rows at batch boundaries.
 * - Rows are always returned **ascending by `cursorColumn`**; the ordering
 *   cannot be changed without breaking cursor tracking.
 * - If a row is inserted mid-pagination with a cursor value smaller than the
 *   current cursor, it will be missed. For append-only tables this is safe.
 *
 * On error the function logs to `console.error`, sets `success: false`, and
 * returns whatever rows were collected before the failure.
 *
 * @param client       - Typed Supabase client (`SupabaseClient<Database>`).
 * @param table        - Name of the table or view as it appears in the Supabase schema.
 * @param cursorColumn - Unique, indexed column to use as the pagination cursor
 *                       (default: `'id'`). Must be included in `select`.
 * @param select       - PostgREST column selector string (default: `'*'`).
 * @param config       - Optional {@link PaginationConfig} overrides.
 * @returns A {@link PaginatedResult} containing all rows and batch diagnostics.
 *
 * @example
 * ```typescript
 * const result = await fetchAllWithKeyset(
 *   supabaseAdmin,
 *   'time_entry',
 *   'id',
 *   'id, user_id, start_time, end_time',
 *   { batchSize: 1000 }
 * );
 *
 * if (result.success) {
 *   console.log(`Fetched ${result.count} time entries`);
 *   const allEntries = result.data;
 * }
 * ```
 */
export async function fetchAllWithKeyset(client: SupabaseClient<Database>, table: string, cursorColumn: string = "id", select: string = "*", config: PaginationConfig = {}): Promise<PaginatedResult<any>> {
	const { batchSize = 1000, maxRows, delayMs = 0 } = config;
	const allData: any[] = [];
	let lastCursor: string | number | null = null;
	let batchCount = 0;
	let hasMore = true;

	try {
		while (hasMore) {
			// Check if we've reached the max rows limit
			if (maxRows && allData.length >= maxRows) {
				break;
			}

			// Calculate the current batch size
			const currentBatchSize = maxRows ? Math.min(batchSize, maxRows - allData.length) : batchSize;

			// Build the query
			// Using type assertion to allow dynamic table names
			let query = client
				.from(table as any)
				.select(select)
				.order(cursorColumn, { ascending: true })
				.limit(currentBatchSize);

			// Apply equality filters if provided to every batch
			if (config.eq) {
				for (const [col, value] of Object.entries(config.eq)) {
					query = query.eq(col, value);
				}
			}

			// Add cursor filter if we have a last cursor
			if (lastCursor !== null) {
				query = query.gt(cursorColumn, lastCursor);
			}

			// Execute the query
			const { data, error } = await query;

			if (error) {
				throw new Error(`Supabase error: ${error.message}`);
			}

			if (!data || data.length === 0) {
				hasMore = false;
				break;
			}

			// Add data to results
			allData.push(...data);
			batchCount++;

			// Update cursor to the last item's cursor value
			const lastItem = data[data.length - 1];
			if (lastItem && cursorColumn in lastItem) {
				lastCursor = lastItem[cursorColumn];
			} else {
				// If we can't get the cursor, fall back to checking if we got a full batch
				if (data.length < currentBatchSize) {
					hasMore = false;
					break;
				}
			}

			// Check if we got fewer results than requested (last batch)
			if (data.length < currentBatchSize) {
				hasMore = false;
				break;
			}

			// Optional delay between batches
			if (delayMs > 0 && hasMore) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}

		return {
			data: allData,
			count: allData.length,
			batches: batchCount,
			success: true,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
		console.error(`[fetchAllWithKeyset] Error fetching from ${table}:`, errorMessage);

		return {
			data: allData,
			count: allData.length,
			batches: batchCount,
			success: false,
			error: errorMessage,
		};
	}
}

/**
 * Returns the recommended pagination strategy for a given table size.
 *
 * The threshold is 10 000 rows: below that, the offset overhead of
 * {@link fetchAllWithRange} is negligible; above it, {@link fetchAllWithKeyset}
 * avoids the O(n) scan cost of high-offset queries.
 *
 * @param estimatedRowCount - Approximate row count (e.g. from a `COUNT(*)` or a
 *                            monitoring dashboard). An exact number is not required.
 * @returns `'range'` for smaller tables, `'keyset'` for larger ones.
 */
export function recommendPaginationStrategy(estimatedRowCount: number): "range" | "keyset" {
	return estimatedRowCount > 10000 ? "keyset" : "range";
}
