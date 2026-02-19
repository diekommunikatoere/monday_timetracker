import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Configuration options for pagination strategies
 */
export interface PaginationConfig {
	/** Number of rows to fetch per batch (default: 1000, max: 1000) */
	batchSize?: number;
	/** Maximum number of rows to fetch in total (default: unlimited) */
	maxRows?: number;
	/** Delay between batches in milliseconds (default: 0) */
	delayMs?: number;
}

/**
 * Result type for paginated queries
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
 * Fetches all records from a table or view using range-based pagination.
 * Uses .range(start, end) to paginate through results.
 *
 * @param client - Supabase client instance
 * @param table - Table or view name to query
 * @param select - Columns to select (default: '*')
 * @param config - Pagination configuration options
 * @returns Promise<PaginatedResult<any>> - Consolidated results from all batches
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
 * Fetches all records from a table or view using keyset pagination.
 * Uses a cursor column (e.g., 'id' or 'created_at') with .gt() for efficient pagination.
 * This method is more performant for large datasets as it avoids OFFSET overhead.
 *
 * @param client - Supabase client instance
 * @param table - Table or view name to query
 * @param cursorColumn - Column to use for cursor-based pagination (default: 'id')
 * @param select - Columns to select (default: '*')
 * @param config - Pagination configuration options
 * @returns Promise<PaginatedResult<any>> - Consolidated results from all batches
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
 * Utility function to determine which pagination strategy to use based on table size.
 * For tables with less than 10,000 rows, range-based is fine.
 * For larger tables, keyset pagination is recommended.
 *
 * @param estimatedRowCount - Estimated number of rows in the table
 * @returns 'range' | 'keyset' - Recommended strategy
 */
export function recommendPaginationStrategy(estimatedRowCount: number): "range" | "keyset" {
	return estimatedRowCount > 10000 ? "keyset" : "range";
}
