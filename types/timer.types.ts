// types/timer.types.ts
// Timer domain types for the 2-table model (time_entry + timer_segment).
//
// A live timer IS a non-finalized `time_entry`; its id is the `entryId`. There is
// no longer a `timer_session` table or a `sessionId` — see docs/timer-redesign.md.

/**
 * Timer lifecycle as surfaced by the live widget.
 *
 * The DB `timer_state` enum has four values (running / paused / parked /
 * finalized); the widget only ever tracks a `running` or `paused` timer, so
 * `parked` (saved-as-draft) and `finalized` entries live in the entries table,
 * not here. `idle` means there is no active timer for the user.
 */
export type TimerStatus = "idle" | "running" | "paused";

/**
 * Server sync reference for calculating elapsed time locally between server
 * syncs. `baseElapsedTime` is in **milliseconds**; the local tick adds
 * `Date.now() - syncedAt`.
 */
export interface ServerSyncRef {
	baseElapsedTime: number;
	syncedAt: number; // Local timestamp when we synced
}

/**
 * One active (non-finalized) timer as returned by the `get_active_timers` RPC
 * (and `GET /api/timer`). `elapsed_seconds` is server-computed from the entry's
 * segments (the open segment counted up to now); the client ticks the live
 * second locally between updates.
 */
export interface ActiveTimer {
	id: string;
	user_id: string;
	timer_state: "running" | "paused" | "parked" | "finalized";
	board_id: string | null;
	item_id: string | null;
	role_id: string | null;
	comment: string | null;
	start_time: string;
	created_at: string;
	updated_at: string;
	elapsed_seconds: number;
}

/**
 * Unified timer state shape consumed by the UI.
 */
export interface TimerState {
	// Active timer (a non-finalized time_entry)
	entryId: string | null;
	elapsedTime: number; // milliseconds
	startTime: string | null;
	status: TimerStatus;

	// Comment (auto-saved to the active entry, debounced; also set on park/finalize)
	comment: string;

	// UI state
	isSaving: boolean;
	isLoading: boolean;
	error: string | null;

	// Server sync (internal)
	_serverSync: ServerSyncRef | null;
}

/**
 * Actions interface for timer operations.
 * Used by presentational components via callbacks.
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
 * Complete timer hook return type.
 */
export interface UseTimerReturn {
	// State
	state: TimerState;

	// Computed properties
	isActive: boolean; // status === 'running'
	hasSession: boolean; // entryId !== null
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
 * Response from `GET /api/timer` — the user's active (non-finalized) timers,
 * each with server-computed `elapsed_seconds`.
 */
export interface ActiveTimersResponse {
	timers: ActiveTimer[];
}

// ============================================
// Store Types
// ============================================

/**
 * Timer store state (internal)
 */
export interface TimerStoreState {
	entryId: string | null;
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
 * Minimal active-timer shape the store needs to bind a timer. Accepts any source
 * (the `get_active_timers` row or a `time_entry` row returned by a transition
 * RPC), so `timer_state` is typed permissively.
 */
export type ActiveTimerInput = {
	id: string;
	start_time?: string | null;
	timer_state?: string | null;
};

/**
 * Timer store actions
 */
export interface TimerStoreActions {
	// Active timer
	setActiveTimer: (timer: ActiveTimerInput | null) => void;
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
