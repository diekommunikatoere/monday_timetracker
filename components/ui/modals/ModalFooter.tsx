// components/ui/modals/ModalFooter.tsx
// Modal footer sub-component rendering action area.

"use client";

import React from "react";

import { ModalFooterProps } from "./types";

import styles from "@/components/styles/ui/modals/ModalFooter.module.css";

/**
 * Footer slot for {@link Modal}.
 *
 * Renders a plain `<div>` (not a Mantine component) styled with the
 * `modal-footer` class plus any caller `className`. Typically holds action
 * buttons (e.g. confirm/cancel). Use as `<Modal.Footer>…</Modal.Footer>` via
 * the compound attachment in {@link Modal}.
 *
 * @param props         - {@link ModalFooterProps} for the footer.
 * @param props.children - Footer content (typically buttons).
 * @param props.className - Extra classes appended to the footer element.
 * @returns A `div` styled as the modal footer.
 */
export const ModalFooter: React.FC<ModalFooterProps> = ({ children, className = "" }) => {
	const modalFooterClass = [styles["modal-footer"], className].filter(Boolean).join(" ");

	return <div className={modalFooterClass}>{children}</div>;
};
