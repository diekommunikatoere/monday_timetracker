"use client";

import { useState, useEffect, useRef } from "react";
import { TimeEntry } from "@/types/time-entry";
import { formatTime } from "@/lib/utils";

interface TimerProps {
	onTimeEntryAdded: (entry: TimeEntry) => void;
}

export default function Timer({ onTimeEntryAdded }: TimerProps) {
	const [isRunning, setIsRunning] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [elapsedTime, setElapsedTime] = useState(0);
	const [showTaskInput, setShowTaskInput] = useState(false);
	const [taskName, setTaskName] = useState("");
	const [startTime, setStartTime] = useState<Date | null>(null);
	const intervalRef = useRef<NodeJS.Timeout | null>(null);

	// Timer logic
	useEffect(() => {
		if (isRunning && !isPaused) {
			intervalRef.current = setInterval(() => {
				setElapsedTime((prev) => prev + 1000);
			}, 1000);
		} else {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		}

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, [isRunning, isPaused]);

	const handleStart = () => {
		if (!isRunning) {
			setIsRunning(true);
			setIsPaused(false);
			setStartTime(new Date());
			setElapsedTime(0);
		} else if (isPaused) {
			setIsPaused(false);
		}
	};

	const handlePause = () => {
		if (isRunning && !isPaused) {
			setIsPaused(true);
		}
	};

	const handleStop = () => {
		if (isRunning) {
			setIsRunning(false);
			setIsPaused(false);
			setShowTaskInput(true);
		}
	};

	const handleSave = async () => {
		if (!taskName.trim() || !startTime) return;

		const endTime = new Date();
		const duration = elapsedTime;

		try {
			const response = await fetch("/api/time-entries/add", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					task_name: taskName.trim(),
					start_time: startTime.toISOString(),
					end_time: endTime.toISOString(),
					duration: duration,
				}),
			});

			if (response.ok) {
				const newEntry = await response.json();
				onTimeEntryAdded(newEntry);
				resetTimer();
			} else {
				console.error("Failed to save time entry");
			}
		} catch (error) {
			console.error("Error saving time entry:", error);
		}
	};

	const resetTimer = () => {
		setTaskName("");
		setShowTaskInput(false);
		setStartTime(null);
		setElapsedTime(0);
	};

	const handleCancel = () => {
		resetTimer();
		setIsRunning(false);
		setIsPaused(false);
	};

	return (
		<div className="timer-container">
			<div className="timer-display">
				<span className="timer-time">{formatTime(elapsedTime)}</span>
			</div>

			<div className="timer-controls">
				{!isRunning ? (
					<button className="btn btn-primary" onClick={handleStart} disabled={showTaskInput}>
						Start
					</button>
				) : (
					<>
						{!isPaused ? (
							<button className="btn btn-secondary" onClick={handlePause}>
								Pause
							</button>
						) : (
							<button className="btn btn-primary" onClick={handleStart}>
								Resume
							</button>
						)}
						<button className="btn btn-danger" onClick={handleStop}>
							Stop
						</button>
					</>
				)}
			</div>

			{showTaskInput && (
				<div className="task-input-container">
					<h3>Log Time Entry</h3>
					<div className="task-input">
						<label htmlFor="taskName">Task Name:</label>
						<input id="taskName" type="text" value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="Enter task name..." autoFocus />
					</div>
					<div className="task-actions">
						<button className="btn btn-primary" onClick={handleSave} disabled={!taskName.trim()}>
							Save
						</button>
						<button className="btn btn-secondary" onClick={handleCancel}>
							Cancel
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
