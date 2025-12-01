// types/monday.ts
// Type definitions for monday.com SDK context data

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

export interface MondayAccount {
	id: string;
}

export interface MondayApp {
	id: number;
	clientId: string;
}

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

export interface MondayAppFeature {
	type: string;
	name: string;
}

export interface MondayPermissions {
	approvedScopes: string[];
	requiredScopes: string[];
}

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

// SDK response wrapper
export interface MondaySDKResponse<T = any> {
	method: string;
	type: string;
	data: T;
	requestId?: string;
}
