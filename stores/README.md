# Zustand Stores - Quick Reference

## ✅ Completed Setup

### SSR Infrastructure
- ✅ `lib/store-utils.ts` - Hydration utilities created
- ✅ `components/StoreProvider.tsx` - Store hydration provider created  
- ✅ `app/layout.tsx` - StoreProvider added to root layout

### Updated Stores (SSR-Compatible)
- ✅ `stores/userStore.ts` - Added `skipHydration: true`
- ✅ `stores/timerStore.ts` - Added `skipHydration: true`
- ✅ `stores/appStore.ts` - Already SSR-safe (no persist)

### New Stores
- ✅ `stores/mondayStore.ts` - Replaces `useMondayContext`
- ✅ `stores/timeEntriesStore.ts` - Replaces `useTimeEntries`
- ✅ `stores/draftStore.ts` - Replaces draft-related hooks

### Documentation
- ✅ `stores/MIGRATION_GUIDE.md` - Complete migration guide
- ✅ `components/dashboard/TimeEntriesTable.example.tsx` - Example component

## 📋 Next Steps (Migration Tasks)

### 1. Update Components Using Old Hooks

**Priority: High**
Find all components using these hooks and migrate them to stores:

```bash
# Find components using old hooks
grep -r "useMondayContext" --include="*.tsx" --include="*.ts" .
grep -r "useTimeEntries" --include="*.tsx" --include="*.ts" .
grep -r "useCommentFieldState" --include="*.tsx" --include="*.ts" .
grep -r "useDraftAutoSave" --include="*.tsx" --include="*.ts" .
grep -r "useDraftManualSave" --include="*.tsx" --include="*.ts" .
```

### 2. Test SSR and Hydration

**Priority: High**
- [ ] Start the dev server: `npm run dev`
- [ ] Check browser console for hydration warnings
- [ ] Test all pages with persisted stores
- [ ] Verify localStorage persistence works
- [ ] Test with cache cleared (hard refresh)

### 3. Remove Old Hooks (After Migration)

**Priority: Medium**
Once all components are migrated, delete:
- [ ] `hooks/useMondayContext.ts`
- [ ] `hooks/useTimeEntries.ts`
- [ ] `hooks/useCommentFieldState.ts`
- [ ] `hooks/useDraftAutoSave.ts`
- [ ] `hooks/useDraftManualSave.ts`

### 4. Optional Improvements

**Priority: Low**
- [ ] Add Redux DevTools for debugging: `npm install @redux-devtools/extension`
- [ ] Add store testing with `@testing-library/react`
- [ ] Consider using `immer` middleware for complex state updates
- [ ] Add store persistence encryption if handling sensitive data

## 🎯 Quick Start

### Using a Store

```typescript
import { useUserStore } from "@/stores/userStore";

function MyComponent() {
  // Select specific values (recommended)
  const theme = useUserStore((state) => state.theme);
  
  // Select multiple values
  const { mondayUser, supabaseUser } = useUserStore((state) => ({
    mondayUser: state.mondayUser,
    supabaseUser: state.supabaseUser,
  }));
  
  // Call actions
  const setTheme = useUserStore((state) => state.setTheme);
  setTheme("dark");
}
```

### Preventing Hydration Issues

```typescript
import { useHydration } from "@/lib/store-utils";

function MyComponent() {
  const hydrated = useHydration();
  const persistedValue = useStore((state) => state.persistedValue);
  
  // Don't render persisted values until hydrated
  if (!hydrated) return <div>Loading...</div>;
  
  return <div>{persistedValue}</div>;
}
```

## 📖 Store Reference

| Store | Persisted | Purpose | Replaces |
|-------|-----------|---------|----------|
| `useUserStore` | Theme only | User authentication & preferences | - |
| `useTimerStore` | Comment, draftId, sessionId | Timer state management | - |
| `useAppStore` | No | App-level UI state | - |
| `useMondayStore` | No | Monday.com SDK integration | `useMondayContext` |
| `useTimeEntriesStore` | No | Time entries data | `useTimeEntries` |
| `useDraftStore` | Comment, taskName | Draft management & auto-save | `useCommentFieldState`, `useDraftAutoSave`, `useDraftManualSave` |

## 🐛 Common Issues

### Hydration Mismatch
**Symptom:** Console error about server/client HTML mismatch  
**Solution:** Use `useHydration()` hook and wait for hydration before rendering persisted state

### Store Not Updating
**Symptom:** UI doesn't reflect state changes  
**Solution:** Make sure you're using the store hook correctly: `const value = useStore((state) => state.value)`

### Values Resetting
**Symptom:** Persisted values reset on page refresh  
**Solution:** Check that `StoreProvider` is in your layout and `skipHydration: true` is set

### TypeScript Errors
**Symptom:** Type errors when using stores  
**Solution:** Restart your TypeScript server or check your import paths

## 📚 Resources

- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [Next.js SSR Guide](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- Full migration guide: `stores/MIGRATION_GUIDE.md`
- Example component: `components/dashboard/TimeEntriesTable.example.tsx`

## 💡 Tips

1. **Always select specific values** from stores to avoid unnecessary re-renders
2. **Use `useEffect` for data fetching** - stores don't auto-fetch
3. **Check for null/undefined** - user data may not be available immediately
4. **Clean up timers** - especially in `draftStore.autoSaveDraft`
5. **Use TypeScript** - stores are fully typed for better DX
