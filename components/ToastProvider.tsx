// components/ToastProvider.tsx
"use client";

import React, { createContext, useContext, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { Button } from "@mantine/core";

export type ToastType = "normal" | "positive" | "negative" | "warning" | "dark";

interface ToastAction {
	actionLabel: string;
	onAction: () => void;
}

interface ToastContextType {
	showToast: (message: string, type?: ToastType, autoHideDuration?: number, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within a ToastProvider");
	}
	return context;
};

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
