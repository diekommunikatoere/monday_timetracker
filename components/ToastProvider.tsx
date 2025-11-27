// components/ToastProvider.tsx
"use client";

import React, { createContext, useContext, useCallback } from "react";
import { notifications } from "@mantine/notifications";

export type ToastType = "normal" | "positive" | "negative" | "warning" | "dark";

interface ToastContextType {
	showToast: (message: string, type?: ToastType, autoHideDuration?: number, isLoading?: boolean) => void;
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
	const showToast = useCallback((message: string, type: ToastType = "normal", autoHideDuration = 3000, isLoading?: boolean) => {
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
			message,
			color,
			loading: isLoading,
			autoClose: autoHideDuration,
		});
	}, []);

	return <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>;
}
