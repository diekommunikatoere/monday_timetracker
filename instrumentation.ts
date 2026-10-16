// instrumentation.ts
// Next.js runs `register` once per server instance, before requests are served (skipped during
// `next build`). On Railway with app sleeping it runs again after every wake.

export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;

	try {
		const { valve } = await import("./lib/sentinel");
		valve.start();
	} catch (error) {
		console.error("[Sentinel] failed to start", error);
	}
}
