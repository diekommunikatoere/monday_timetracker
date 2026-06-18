// components/ToastProvider.tsx
// React context provider exposing a `showToast` helper backed by Mantine notifications.

"use client";

import React, { createContext, useContext, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { Button } from "@mantine/core";

/**
 * Visual severity of a toast. Maps to a Mantine notification `color`:
 * `normal`→blue, `positive`→green, `negative`→red, `warning`→yellow,
 * `dark`→gray.
 */
export type ToastType = "normal" | "positive" | "negative" | "warning" | "dark";

/**
 * Optional inline action rendered as a small button inside the toast.
 *
 * @property actionLabel - Button text shown to the user.
 * @property onAction    - Callback fired on click; the toast is dismissed afterwards.
 */
interface ToastAction {
	actionLabel: string;
	onAction: () => void;
}

/**
 * Shape of the toast context value exposed by {@link useToast}.
 *
 * @property showToast - Displays a toast. `type` defaults to `"normal"`,
 *   `autoHideDuration` to `3000` ms, and `action` is optional.
 */
interface ToastContextType {
	showToast: (message: string, type?: ToastType, autoHideDuration?: number, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Access the toast context. **Must be called within a {@link ToastProvider}**;
 * throws otherwise. Returns the `{ showToast }` value.
 *
 * @returns The toast context value (`{ showToast }`).
 */
export const useToast = () => {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within a ToastProvider");
	}
	return context;
};

/**
 * Provides a toast notification API to its subtree via context. `showToast`
 * delegates to Mantine's `notifications.show`, mapping {@link ToastType} to a
 * color and rendering an optional action button (which calls `onAction` and
 * then clears all notifications). The `showToast` callback is memoized with
 * `useCallback` so it is referentially stable across renders.
 *
 * @param children - React subtree that may call {@link useToast}.
 * @returns A `ToastContext.Provider` wrapping `children`.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
	const showToast = useCallback((message: string, type: ToastType = "normal", autoHideDuration = 3000, action?: ToastAction) => {
		let color = "blue";
		switch (type) {
			case "positive":
				color = "green";
				break;
			case "negative":
				color = "red";
				break;
			case "warning":
				color = "yellow";
				break;
			case "dark":
				color = "gray";
				break;
			default:
				color = "blue";
		}

		notifications.show({
			message: action ? (
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
					<span>{message}</span>
					<Button
						size="xs"
						variant="light"
						onClick={() => {
							action.onAction();
							notifications.clean();
						}}
					>
						{action.actionLabel}
					</Button>
				</div>
			) : (
				message
			),
			color,
			autoClose: autoHideDuration,
		});
	}, []);

	return <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>;
}
