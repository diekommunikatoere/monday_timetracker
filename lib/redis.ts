import Redis from "ioredis";

const redis = new Redis({
	host: process.env.REDIS_HOST || "localhost",
	port: parseInt(process.env.REDIS_PORT || "6379"),
	password: process.env.REDIS_PASSWORD,
	retryStrategy: (times) => {
		const delay = Math.min(times * 50, 2000);
		return delay;
	},
	maxRetriesPerRequest: 3,
});

redis.on("error", (error) => {
	console.error("Redis connection error:", error);
});

redis.on("connect", () => {
	console.log("✅ Redis connected");
});

export default redis;

// Cache helper functions
export const cacheHelper = {
	// Get cached data
	async get<T>(key: string): Promise<T | null> {
		try {
			const data = await redis.get(key);
			return data ? JSON.parse(data) : null;
		} catch (error) {
			console.error(`Cache get error for key ${key}:`, error);
			return null;
		}
	},

	// Set cached data with TTL (in seconds)
	async set(key: string, value: any, ttl: number = 3600): Promise<void> {
		try {
			await redis.setex(key, ttl, JSON.stringify(value));
		} catch (error) {
			console.error(`Cache set error for key ${key}:`, error);
		}
	},

	// Delete cached data
	async del(key: string): Promise<void> {
		try {
			await redis.del(key);
		} catch (error) {
			console.error(`Cache delete error for key ${key}:`, error);
		}
	},

	// Clear all cached data matching a pattern
	async clearPattern(pattern: string): Promise<void> {
		try {
			const keys = await redis.keys(pattern);
			if (keys.length > 0) {
				await redis.del(...keys);
			}
		} catch (error) {
			console.error(`Cache clear pattern error for ${pattern}:`, error);
		}
	},

	// Get all keys matching a pattern
	async keys(pattern: string): Promise<string[]> {
		try {
			return await redis.keys(pattern);
		} catch (error) {
			console.error(`Cache keys error for ${pattern}:`, error);
			return [];
		}
	},
};
