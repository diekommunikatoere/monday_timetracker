export interface TimeEntry {
	id: number;
	task_name: string;
	start_time: string; // ISO timestamp
	end_time: string; // ISO timestamp
	duration: number; // in milliseconds
	created_at?: string;
}
