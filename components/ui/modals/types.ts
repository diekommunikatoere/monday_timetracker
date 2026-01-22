import React from "react";
import { ModalProps as MantineModalProps } from "@mantine/core";

export interface ModalProps extends Omit<MantineModalProps, "opened" | "onClose"> {
	children: React.ReactNode;
	show?: boolean;
	onClose?: () => void;
}

export interface ModalHeaderProps {
	children: React.ReactNode;
	className?: string;
}

export interface ModalBodyProps {
	children: React.ReactNode;
	className?: string;
}

export interface ModalFooterProps {
	children: React.ReactNode;
	className?: string;
}

export interface ModalCompoundComponent {
	Header: React.FC<ModalHeaderProps>;
	Body: React.FC<ModalBodyProps>;
	Footer: React.FC<ModalFooterProps>;
}
