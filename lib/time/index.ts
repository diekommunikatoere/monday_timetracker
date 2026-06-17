// lib/time/index.ts
// Barrel re-export for all time utilities. Import from here rather than from
// sub-modules. See calculations.ts for HH:MM/seconds conversions and
// formatting.ts for display-layer formatting (note: formatTime() takes
// milliseconds, all other functions take seconds).

export * from "./calculations";
export * from "./formatting";
