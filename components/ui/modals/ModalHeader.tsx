// components/ui/modals/ModalHeader.tsx
// Modal header sub-component rendering a title and close button.

"use client";

import { Modal } from "@mantine/core";
import React from "react";

import styles from "@/components/styles/ui/modals/ModalHeader.module.css";

import { ModalHeaderProps } from "./types";

/**
 * Header slot for {@link Modal}.
 *
 * Renders Mantine's `Modal.Header` (with the project's CSS-module class plus
 * any caller `className`), a `Modal.Title` wrapping the children, and a
 * `Modal.CloseButton`. Intended for use as `<Modal.Header>…</Modal.Header>`
 * via the compound attachment in {@link Modal}.
 *
 * @param props         - {@link ModalHeaderProps} for the header.
 * @param props.children - Title content rendered inside `Modal.Title`.
 * @param props.className - Extra classes appended to the header element.
 * @returns A Mantine `Modal.Header` containing the title and a close button.
 */
export const ModalHeader: React.FC<ModalHeaderProps> = ({ children, className = "" }) => {
	return (
		<Modal.Header className={`${styles["modal-header"]} ${className}`}>
			<Modal.Title>{children}</Modal.Title>

			<Modal.CloseButton />
		</Modal.Header>
	);
};
