import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
	if (!request) {
		return new Response("Unauthorized", { status: 401 });
	}

	const userId = request.nextUrl.searchParams.get("userId");
	console.log("SSE connection initiated for userId:", userId);
	if (!userId) {
		return new Response("Unauthorized", { status: 401 });
	}

	// Set up SSE response
	const responseStream = new ReadableStream({
		async start(controller) {
			console.log("Starting SSE stream for userId:", userId);

			// Send initial connection message
			controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

			// Subscribe to Supabase real-time changes
			const channel = supabaseAdmin
				.channel("timer-updates")
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "timer_session",
						filter: `user_id=eq.${userId}`, // Enable user-specific filtering
					},
					async (payload) => {
						console.log("Received payload:", payload);

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
				.subscribe((status, err) => {
					console.log("Subscription status:", status);
					if (err) {
						console.error("Subscription error:", err);
						controller.enqueue(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
					}
					if (status === "SUBSCRIBED") {
						console.log("Successfully subscribed to timer-updates channel");
					}
				});

			// Handle client disconnect
			request.signal.addEventListener("abort", () => {
				console.log("SSE connection closed for userId:", userId);
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
