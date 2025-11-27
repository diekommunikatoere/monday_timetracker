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
 * Timer session from database
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
	isSaving: boolean;
	onPlayPause: () => void;
	onSaveAsDraft: () => void;
	onSave: () => void;
}

/**
 * Props for TimerCommentField component
 */
export interface TimerCommentFieldProps {
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
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
 * Helper to convert boolean isPaused to TimerStatus
 */
export function toTimerStatus(isPaused: boolean, hasSession: boolean): TimerStatus {
	if (!hasSession) return "idle";
	return isPaused ? "paused" : "running";
}

/**
 * Helper to convert TimerStatus to boolean isPaused
 */
export function fromTimerStatus(status: TimerStatus): boolean {
	return status === "paused";
}
