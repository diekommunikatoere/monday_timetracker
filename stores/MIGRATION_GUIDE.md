# Zustand Store Migration Guide

This guide explains how to use the new SSR-compatible Zustand stores in your Next.js application.

## Overview

All stores are now configured to work with Next.js SSR without causing hydration mismatches. The key changes:

1. **`skipHydration: true`** - Prevents automatic hydration on mount
2. **`StoreProvider`** - Manually hydrates stores after client-side mount
3. **Store utilities** - Helper hooks for safe SSR usage

## Available Stores

### 1. **userStore** (Existing - Updated)

Manages Monday.com user data and Supabase authentication.

```typescript
import { useUserStore } from "@/stores/userStore";

function MyComponent() {
  const mondayUser = useUserStore((state) => state.mondayUser);
  const supabaseUser = useUserStore((state) => state.supabaseUser);
  const theme = useUserStore((state) => state.theme);
  const setTheme = useUserStore((state) => state.setTheme);
  
  // Use the values as before
}
```

### 2. **timerStore** (Existing - Updated)

Manages timer state including elapsed time, pause/resume, and session management.

```typescript
import { useTimerStore } from "@/stores/timerStore";

function TimerComponent() {
  const elapsedTime = useTimerStore((state) => state.elapsedTime);
  const isPaused = useTimerStore((state) => state.isPaused);
  const startTimer = useTimerStore((state) => state.startTimer);
  const pauseTimer = useTimerStore((state) => state.pauseTimer);
  const resetTimer = useTimerStore((state) => state.resetTimer);
  
  return (
    <div>
      <div>Elapsed: {elapsedTime}s</div>
      <button onClick={() => startTimer(mondayContext)}>Start</button>
      <button onClick={() => pauseTimer(mondayContext)}>Pause</button>
      <button onClick={() => resetTimer(mondayContext)}>Reset</button>
    </div>
  );
}
```

### 3. **appStore** (Existing)

Manages app-level state like connected boards.

```typescript
import { useAppStore } from "@/stores/appStore";

function AppComponent() {
  const connectedBoards = useAppStore((state) => state.connectedBoards);
  const isLoading = useAppStore((state) => state.isLoading);
  const loadConnectedBoards = useAppStore((state) => state.loadConnectedBoards);
}
```

### 4. **mondayStore** (New)

Replaces `useMondayContext` hook. Manages Monday.com SDK context and initialization.

```typescript
import { useMondayStore } from "@/stores/mondayStore";
import { useEffect } from "react";

function MondayComponent() {
  const { rawContext, isLoading, error, initializeMondayContext } = useMondayStore();
  
  useEffect(() => {
    initializeMondayContext();
  }, []);
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return <div>Monday context loaded</div>;
}
```

### 5. **timeEntriesStore** (New)

Replaces `useTimeEntries` hook. Manages time entries fetching and caching.

```typescript
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";
import { useEffect } from "react";

function TimeEntriesComponent() {
  const userId = useUserStore((state) => state.supabaseUser?.id);
  const { timeEntries, loading, error, fetchTimeEntries, refetch } = useTimeEntriesStore();
  
  useEffect(() => {
    if (userId) {
      fetchTimeEntries(userId);
    }
  }, [userId, fetchTimeEntries]);
  
  if (loading) return <div>Loading entries...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      {timeEntries.map((entry) => (
        <div key={entry.id}>{entry.task_name}</div>
      ))}
      <button onClick={() => refetch(userId)}>Refresh</button>
    </div>
  );
}
```

### 6. **draftStore** (New)

Replaces `useCommentFieldState`, `useDraftAutoSave`, and `useDraftManualSave` hooks. Manages draft comments with auto-save and manual save functionality.

```typescript
import { useDraftStore } from "@/stores/draftStore";
import { useUserStore } from "@/stores/userStore";
import { useTimerStore } from "@/stores/timerStore";
import { useToast } from "@/components/ToastProvider";
import { useEffect } from "react";

function DraftComponent() {
  const userId = useUserStore((state) => state.supabaseUser?.id);
  const sessionId = useTimerStore((state) => state.sessionId);
  const draftId = useTimerStore((state) => state.draftId);
  const { showToast } = useToast();
  
  const { 
    comment, 
    taskName, 
    isSaving, 
    setComment, 
    setTaskName,
    autoSaveDraft, 
    saveDraft 
  } = useDraftStore();
  
  // Auto-save on comment change
  useEffect(() => {
    if (userId && comment) {
      autoSaveDraft({ comment, userId, sessionId });
    }
  }, [comment, userId, sessionId]);
  
  const handleSave = async () => {
    if (draftId && userId) {
      await saveDraft({
        draftId,
        userProfileId: userId,
        comment,
        taskName,
        showToast,
        onSaved: () => console.log("Draft saved!"),
      });
    }
  };
  
  return (
    <div>
      <input 
        value={taskName} 
        onChange={(e) => setTaskName(e.target.value)}
        placeholder="Task name"
      />
      <textarea 
        value={comment} 
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comment"
      />
      <button onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
```

## Preventing Hydration Mismatches

### Using `useHydration` Hook

For components that need to conditionally render based on persisted state:

```typescript
import { useHydration } from "@/lib/store-utils";
import { useTimerStore } from "@/stores/timerStore";

function TimerDisplay() {
  const hydrated = useHydration();
  const elapsedTime = useTimerStore((state) => state.elapsedTime);
  
  // Show loading state during SSR and initial hydration
  if (!hydrated) {
    return <div>Loading...</div>;
  }
  
  // Safe to use persisted values after hydration
  return <div>Elapsed: {elapsedTime}s</div>;
}
```

### Using `useSSRSafeValue` Hook

For specific values that need SSR fallbacks:

```typescript
import { useSSRSafeValue } from "@/lib/store-utils";
import { useUserStore } from "@/stores/userStore";

function ThemeDisplay() {
  const storeTheme = useUserStore((state) => state.theme);
  // Use default theme during SSR, persisted theme after hydration
  const theme = useSSRSafeValue(storeTheme, "light");
  
  return <div className={theme}>Theme: {theme}</div>;
}
```

## Migration Steps

### 1. Replace Hook Imports

**Before:**

```typescript
import { useMondayContext } from "@/hooks/useMondayContext";
import { useTimeEntries } from "@/hooks/useTimeEntries";
import { useCommentFieldState } from "@/hooks/useCommentFieldState";
import { useDraftAutoSave } from "@/hooks/useDraftAutoSave";
import { useDraftManualSave } from "@/hooks/useDraftManualSave";
```

**After:**

```typescript
import { useMondayStore } from "@/stores/mondayStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useDraftStore } from "@/stores/draftStore";
```

### 2. Update Hook Usage

**Before (useMondayContext):**

```typescript
const { isLoading, error, rawContext } = useMondayContext();
```

**After (mondayStore):**

```typescript
const { isLoading, error, rawContext, initializeMondayContext } = useMondayStore();

useEffect(() => {
  initializeMondayContext();
}, []);
```

**Before (useTimeEntries):**

```typescript
const { timeEntries, loading, error, refetch } = useTimeEntries();
```

**After (timeEntriesStore):**

```typescript
const { timeEntries, loading, error, fetchTimeEntries, refetch } = useTimeEntriesStore();
const userId = useUserStore((state) => state.supabaseUser?.id);

useEffect(() => {
  if (userId) fetchTimeEntries(userId);
}, [userId, fetchTimeEntries]);
```

**Before (useCommentFieldState + useDraftAutoSave):**

```typescript
const { comment, setComment, clearComment } = useCommentFieldState(initialValue, sessionId);
```

**After (draftStore):**

```typescript
const { comment, setComment, clearComment, autoSaveDraft } = useDraftStore();
const userId = useUserStore((state) => state.supabaseUser?.id);
const sessionId = useTimerStore((state) => state.sessionId);

useEffect(() => {
  if (userId && comment) {
    autoSaveDraft({ comment, userId, sessionId });
  }
}, [comment, userId, sessionId]);
```

## Important Notes

1. **StoreProvider is required** - Make sure `<StoreProvider>` is added to your root layout (already done in `app/layout.tsx`)

2. **Persisted stores need manual hydration** - The `StoreProvider` handles this automatically for all stores with `persist` middleware

3. **Non-persisted stores are safe to use immediately** - Stores like `appStore`, `mondayStore`, and `timeEntriesStore` don't use persistence, so they work fine during SSR

4. **Always check for null/undefined** - User data might not be available immediately, especially during initial load

5. **Use `useEffect` for initialization** - Stores don't auto-fetch data, you need to trigger fetch actions in your components

## Best Practices

1. **Select only what you need**

   ```typescript
   // Good - only subscribes to theme changes
   const theme = useUserStore((state) => state.theme);
   
   // Bad - subscribes to all state changes
   const store = useUserStore();
   ```

2. **Use shallow comparison for objects**

   ```typescript
   import { shallow } from "zustand/shallow";
   
   const { mondayUser, supabaseUser } = useUserStore(
     (state) => ({ 
       mondayUser: state.mondayUser, 
       supabaseUser: state.supabaseUser 
     }),
     shallow
   );
   ```

3. **Avoid using stores in Server Components**
   - All stores require "use client" directive
   - Fetch data on server using Server Components or API routes
   - Pass data to Client Components as props

4. **Clean up timers and effects**

   ```typescript
   useEffect(() => {
     const { autoSaveDraft, clearDebounce } = useDraftStore.getState();
     
     return () => {
       clearDebounce(); // Clean up on unmount
     };
   }, []);
   ```

## Troubleshooting

### Hydration Mismatch Errors

If you see hydration errors:

1. Make sure `StoreProvider` is in your layout
2. Use `useHydration()` hook for conditional rendering
3. Check that `skipHydration: true` is set in persist config

### Store Not Updating

1. Verify you're using the store correctly: `const value = useStore((state) => state.value)`
2. Check that actions are being called: `useStore.getState().action()`
3. Use Redux DevTools to inspect state changes

### TypeScript Errors

If you get TypeScript errors with store types:

1. Make sure all stores have proper type definitions
2. Check that you're importing from the correct path
3. Restart your TypeScript server (VS Code: Cmd+Shift+P -> "TypeScript: Restart TS Server")
