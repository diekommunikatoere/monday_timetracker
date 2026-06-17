// types/timer.types.ts
// Timer domain types for the refactored architecture

/**
 * Timer session status - clearer semantics than boolean isPaused
 */
export type TimerStatus = "idle" | "running" | "paused";

/**
 * Server sync reference for calculating elapsed time locally
 * while maintaining accuracy with server timestamps
 */
export interface ServerSyncRef {
	baseElapsedTime: number;
	syncedAt: number; // Local timestamp when we synced
}

/**
 * Timer session as used by the client (store / hooks / API responses).
 *
 * NOTE: this collides by name with the DB-row `TimerSession` exported from
 * `@/types/database` (the generated `timer_session` Row). They are different
 * shapes — this one nests an optional `time_entry` and is what the realtime
 * subscription and timer API routes hand back. Import from `@/types/timer.types`
 * when you mean this client shape, and from `@/types/database` when you mean the
 * raw row.
 */
export interface TimerSession {
	id: string;
	user_id: string;
	draft_id: string | null;
	start_time: string;
	elapsed_time: number;
	is_paused: boolean;
	created_at: string;
	time_entry?: {
		id: string;
		comment: string | null;
	} | null;
}

/**
 * Timer state shape - unified state interface
 */
export interface TimerState {
	// Session data
	sessionId: string | null;
	draftId: string | null;
	elapsedTime: number;
	startTime: string | null;
	status: TimerStatus;

	// Comment
	comment: string;

	// UI state
	isSaving: boolean;
	isLoading: boolean;
	error: string | null;

	// Server sync (internal)
	_serverSync: ServerSyncRef | null;
}

/**
 * Actions interface for timer operations
 * Used by presentational components via callbacks
 */
export interface TimerActions {
	start: () => Promise<void>;
	pause: () => Promise<void>;
	resume: () => Promise<void>;
	reset: () => Promise<void>;
	saveAsDraft: () => Promise<void>;
	confirmSaveAsDraft: () => Promise<void>;
	openSaveModal: () => void;
	updateComment: (comment: string) => void;
}

/**
 * Complete timer hook return type
 */
export interface UseTimerReturn {
	// State
	state: TimerState;

	// Computed properties
	isActive: boolean; // status === 'running'
	hasSession: boolean; // sessionId !== null
	canSave: boolean; // hasSession && !isSaving

	// Actions
	actions: TimerActions;
}

// ============================================
// Presentational Component Props
// ============================================

/**
 * Props for TimerDisplay component (formerly RunningTimerDisplay)
 */
export interface TimerDisplayProps {
	elapsedTime: number;
	status: TimerStatus;
	onReset: () => void;
	disabled: boolean;
}

/**
 * Props for TimerControls component (formerly TimerActionButtons)
 */
export interface TimerControlsProps {
	status: TimerStatus;
	hasSession: boolean;
	hasComment: boolean;
	isSaving: boolean;
	onPlayPause: () => void;
	onSave: () => void;
}

/**
 * Props for TimerCommentField component
 */
export interface TimerCommentFieldProps {
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	hasSession: boolean;
	isSaving: boolean;
	onSaveAsDraft: () => void;
}

// ============================================
// API Response Types
// ============================================

/**
 * Response from /api/timer/start
 */
export interface TimerStartResponse {
	session: TimerSession;
	draft?: { id: string };
	elapsedTime: number;
	resumed?: boolean;
	created?: boolean;
}

/**
 * Response from /api/timer/pause
 */
export interface TimerPauseResponse {
	success: boolean;
	paused: boolean;
	elapsedTime: number;
}

/**
 * Response from /api/timer/session
 */
export interface TimerSessionResponse {
	session: (TimerSession & { calculatedElapsedTime: number }) | null;
	serverTime: string;
}

// ============================================
// Store Types
// ============================================

/**
 * Timer store state (internal)
 */
export interface TimerStoreState {
	// Session data
	sessionId: string | null;
	draftId: string | null;
	elapsedTime: number;
	startTime: string | null;
	status: TimerStatus;

	// Comment
	comment: string;

	// UI state
	isSaving: boolean;
	isLoading: boolean;
	error: string | null;

	// Server sync reference (for local time calculation)
	_serverSync: ServerSyncRef | null;
}

/**
 * Timer store actions
 */
export interface TimerStoreActions {
	// Session management
	setSession: (session: Partial<TimerSession> | null) => void;
	setStatus: (status: TimerStatus) => void;
	setElapsedTime: (time: number) => void;

	// Server sync
	updateServerSync: (baseTime: number) => void;
	clearServerSync: () => void;

	// Comment
	setComment: (comment: string) => void;
	clearComment: () => void;

	// UI state
	setSaving: (saving: boolean) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;

	// Full reset
	reset: () => void;
}

/**
 * Complete timer store type
 */
export type TimerStore = TimerStoreState & TimerStoreActions;

// ============================================
// Utility Types
// ============================================

/**
 * Derive the {@link TimerStatus} string from the DB's boolean `is_paused` flag.
 *
 * `is_paused` alone is ambiguous (a missing session also reads as "not paused"),
 * so the presence of a session is required to distinguish `idle` from `running`.
 *
 * @param isPaused   - The session's `is_paused` flag.
 * @param hasSession - Whether an active `timer_session` exists for the user.
 * @returns `"idle"` when no session, else `"paused"` / `"running"`.
 */
export function toTimerStatus(isPaused: boolean, hasSession: boolean): TimerStatus {
	if (!hasSession) return "idle";
	return isPaused ? "paused" : "running";
}

/**
 * Inverse of {@link toTimerStatus}: collapse a {@link TimerStatus} back to the
 * DB's boolean `is_paused` flag (both `idle` and `running` map to `false`).
 *
 * @param status - The UI timer status.
 * @returns `true` only when `status === "paused"`.
 */
export function fromTimerStatus(status: TimerStatus): boolean {
	return status === "paused";
}
