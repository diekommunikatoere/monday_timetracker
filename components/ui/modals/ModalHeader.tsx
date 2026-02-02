"use client";

import React from "react";
import { Modal } from "@mantine/core";
import { ModalHeaderProps } from "./types";
import styles from "@/components/styles/ui/modals/ModalHeader.module.css";

export const ModalHeader: React.FC<ModalHeaderProps> = ({ children, className = "" }) => {
	return (
		<Modal.Header className={`${styles["modal-header"]} ${className}`}>
			<Modal.Title>{children}</Modal.Title>

			<Modal.CloseButton />
		</Modal.Header>
	);
};
