// components/ui/modals/ModalBody.tsx
// Modal body sub-component rendering padded content.

"use client";

import React from "react";
import { ModalBodyProps } from "./types";
import styles from "@/components/styles/ui/modals/ModalBody.module.css";

/**
 * Body slot for {@link Modal}.
 *
 * Renders a plain `<div>` (not a Mantine component) styled with the project's
 * CSS-module `modalBody` class plus any caller `className`. Use as
 * `<Modal.Body>…</Modal.Body>` via the compound attachment in {@link Modal}.
 *
 * @param props         - {@link ModalBodyProps} for the body.
 * @param props.children - Body content.
 * @param props.className - Extra classes appended to the body element.
 * @returns A `div` styled as the modal body.
 */
export const ModalBody: React.FC<ModalBodyProps> = ({ children, className = "" }) => {
	return <div className={`${styles.modalBody} ${className}`}>{children}</div>;
};
