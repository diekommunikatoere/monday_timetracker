// types/monday.ts
// Type definitions for monday.com SDK context data.
//
// These mirror the object returned by `monday.get("context")` from the
// embedded-widget SDK (monday-sdk-js). NOTE: as of this writing nothing imports
// from this module — the live `monday.get("context")` call in stores/mondayStore.ts
// consumes the SDK's own (untyped) payload. Treat these as a reference/spec for
// the context shape; wire them up if you want typed access to that payload.

/**
 * The acting monday user, as reported by the widget context.
 *
 * @property timeFormat     - User's clock preference; drives 12H/24H display.
 * @property timeZoneOffset - Offset from UTC in minutes (the only timezone signal
 *                            available client-side — see the project memory on the
 *                            absence of a server-side timezone).
 */
export interface MondayUser {
	id: string;
	isAdmin: boolean;
	isGuest: boolean;
	isViewOnly: boolean;
	countryCode: string;
	currentLanguage: string;
	timeFormat: "12H" | "24H";
	timeZoneOffset: number;
}

/** The monday account (workspace tenant) the widget is running under. */
export interface MondayAccount {
	id: string;
}

/** Identifies the installed monday app. */
export interface MondayApp {
	id: number;
	clientId: string;
}

/** Version metadata for the running app build. */
export interface MondayAppVersion {
	id: number;
	name: string;
	status: string;
	type: string;
	versionData: {
		major: number;
		minor: number;
		patch: number;
		number: number;
		type: string;
		displayNumber: string;
	};
}

/** The app surface/feature the widget is mounted into (e.g. dashboard widget vs. item view). */
export interface MondayAppFeature {
	type: string;
	name: string;
}

/** OAuth scopes the app has been granted vs. the scopes it declares it needs. */
export interface MondayPermissions {
	approvedScopes: string[];
	requiredScopes: string[];
}

/**
 * Full context object returned by `monday.get("context")`.
 *
 * @property theme    - Active monday platform theme. The app mirrors this, but a
 *                      user's explicit DB-persisted theme choice takes precedence
 *                      (see the styling notes in the root CLAUDE.md).
 * @property boardIds - Boards this widget instance is connected to.
 */
export interface MondayContext {
	themeConfig: any | null;
	theme: "black" | "light" | "dark";
	account: MondayAccount;
	user: MondayUser;
	region: string;
	productKind: string;
	app: MondayApp;
	appVersion: MondayAppVersion;
	boardIds: number[];
	widgetId: number;
	viewMode: string;
	editMode: boolean;
	instanceId: number;
	instanceType: string;
	appFeature: MondayAppFeature;
	permissions: MondayPermissions;
}

/**
 * Generic envelope the SDK wraps every `monday.get(...)` / `monday.api(...)`
 * response in.
 *
 * @typeParam T - Shape of the `data` payload for a given call.
 */
export interface MondaySDKResponse<T = any> {
	method: string;
	type: string;
	data: T;
	requestId?: string;
}
