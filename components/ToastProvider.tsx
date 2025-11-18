"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Toast } from "@vibe/core";

import "@/public/css/components/toast.css";

export type ToastType = "normal" | "positive" | "negative" | "warning" | "dark";

export interface ToastMessage {
	id: string;
	message: string;
	type: ToastType;
	autoHideDuration?: number;
	isLoading?: boolean;
}

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
	const [toasts, setToasts] = useState<ToastMessage[]>([]);

	const showToast = useCallback((message: string, type: ToastType = "normal", autoHideDuration = 3000, isLoading?: boolean) => {
		const id = Date.now().toString();
		const toast: ToastMessage = { id, message, type, autoHideDuration };

		setToasts((prev) => [...prev, toast]);
	}, []);

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	}, []);

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}
			{toasts.map((toast) => (
				<Toast key={toast.id} open type={toast.type} autoHideDuration={toast.autoHideDuration} onClose={() => removeToast(toast.id)} loading={toast.isLoading} className={`toast-notification${toast.type ? ` toast-${toast.type}` : ""}`}>
					{toast.message}
				</Toast>
			))}
		</ToastContext.Provider>
	);
}
