"use client";

import { useState, useEffect } from "react";
import Timer from "@/components/Timer";
import TimeEntriesList from "@/components/TimeEntriesList";
import { TimeEntry } from "@/types/time-entry";

export default function Home() {
	const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
	const [loading, setLoading] = useState(true);

	// Fetch time entries on component mount
	useEffect(() => {
		fetchTimeEntries();
	}, []);

	const fetchTimeEntries = async () => {
		try {
			const response = await fetch("/api/time-entries");
			if (response.ok) {
				const entries = await response.json();
				setTimeEntries(entries);
			} else {
				console.error("Failed to fetch time entries");
			}
		} catch (error) {
			console.error("Error fetching time entries:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleTimeEntryAdded = (newEntry: TimeEntry) => {
		setTimeEntries((prev) => [...prev, newEntry]);
	};

	if (loading) {
		return (
			<main>
				<h1>Time Tracker</h1>
				<div className="loading">Loading...</div>
			</main>
		);
	}

	return (
		<main>
			<h1>Time Tracker</h1>

			<Timer onTimeEntryAdded={handleTimeEntryAdded} />

			<TimeEntriesList entries={timeEntries} />
		</main>
	);
}
