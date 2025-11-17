"use client";

import { useState, useEffect } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

interface MondayUser {
	id: string;
	name: string;
	email: string;
	account_id: string;
}

interface UserProfile {
	id: string;
	monday_user_id: string;
	monday_account_id: string;
	email: string | null;
	name: string | null;
}

export function useMondayContext() {
	const [isLoading, setIsLoading] = useState(true);
	const [mondayUser, setMondayUser] = useState<MondayUser | null>(null);
	const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [rawContext, setRawContext] = useState<any>(null);

	useEffect(() => {
		async function initializeMondayUser() {
			try {
				// Get current user from Monday.com SDK
				const context = await monday.get("context");
				const user = await monday.api(`query { me { id name email } }`);

				if (!context?.data.user) {
					throw new Error("No user found in Monday.com context");
				}

				setRawContext(context);

				const mondayUserData: MondayUser = {
					id: context.data.user.id,
					name: user.data.me.name,
					email: user.data.me.email,
					account_id: context.data.account.id,
				};

				setMondayUser(mondayUserData);

				// Find or create user in our database
				const response = await fetch("/api/auth/monday-user", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						mondayUserId: mondayUserData.id,
						mondayAccountId: mondayUserData.account_id,
						email: mondayUserData.email,
						name: mondayUserData.name,
					}),
				});

				if (!response.ok) {
					throw new Error("Failed to authenticate user");
				}

				const data = await response.json();
				setUserProfile(data.user);
				setIsLoading(false);
			} catch (err) {
				console.error("Error initializing Monday user:", err);
				setError(err instanceof Error ? err.message : "Unknown error");
				setIsLoading(false);
			}
		}

		initializeMondayUser();
	}, []);

	return {
		isLoading,
		mondayUser,
		userProfile,
		error,
		rawContext,
		// Helper to get the Supabase user ID for database operations
		getUserId: () => userProfile?.id || null,
	};
}
