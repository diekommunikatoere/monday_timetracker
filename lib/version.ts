// lib/version.ts — Exposes the app version string from package.json at runtime.

import pkg from "../package.json" with { type: "json" };

/** Semver string read from `package.json` at build time. Not re-read at runtime. */
export const APP_VERSION = pkg.version;
