import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server"; // Assuming this is your server-side client
import { getMondayContext } from "@/lib/monday"; // Helper to extract monday.com context

export async function GET(request: NextRequest) {
	// Extract monday.com context for authentication
	const context = await getMondayContext(request);
	if (!context?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const userId = context.user.id;

	// Set up SSE response
	const responseStream = new ReadableStream({
		start(controller) {
			// Subscribe to Supabase real-time changes (e.g., for timer table)
			const channel = supabaseAdmin
				.channel("timer-updates")
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "timer_session",
						filter: `user_id=eq.${userId}`, // Filter to user's data
					},
					async (payload) => {
						// Calculate elapsed time for running sessions
						let calculatedElapsedTime = (payload.new as any)?.elapsed_time || 0;
						if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
							if ((payload.new as any)?.is_running && !(payload.new as any)?.is_paused) {
								try {
									const { data: currentSegment } = await supabaseAdmin
										.from("timer_segment")
										.select("start_time")
										.eq("session_id", (payload.new as any).id)
										.eq("is_running", true)
										.is("end_time", null)
										.order("start_time", { ascending: false })
										.limit(1)
										.single();

									if (currentSegment) {
										const segmentStartTime = new Date(currentSegment.start_time).getTime();
										calculatedElapsedTime = (payload.new as any).elapsed_time + (Date.now() - segmentStartTime);
									}
								} catch (error) {
									console.error("Error calculating elapsed time:", error);
								}
							}
							const enhancedPayload = {
								...payload,
								new: {
									...(payload.new as any),
									calculatedElapsedTime,
								},
							};
							controller.enqueue(`data: ${JSON.stringify(enhancedPayload)}\n\n`);
						} else {
							// For DELETE, send as is
							controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
						}
					}
				)
				.subscribe();

			// Handle client disconnect
			request.signal.addEventListener("abort", () => {
				supabaseAdmin.removeChannel(channel);
				controller.close();
			});
		},
	});

	return new Response(responseStream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
