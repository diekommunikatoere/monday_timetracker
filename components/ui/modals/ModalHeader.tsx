"use client";

import React from "react";
import { Modal } from "@mantine/core";
import { ModalHeaderProps } from "./types";
import "@/components/styles/ui/modals/ModalHeader.module.css";

export const ModalHeader: React.FC<ModalHeaderProps> = ({ children, className = "" }) => {
	return (
		<Modal.Header>
			<Modal.Title>{children}</Modal.Title>

			<Modal.CloseButton />
		</Modal.Header>
	);
};
