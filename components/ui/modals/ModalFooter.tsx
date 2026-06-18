// components/ui/modals/ModalFooter.tsx
// Modal footer sub-component rendering action area.

"use client";

import React from "react";
import { ModalFooterProps } from "./types";
import "@/components/styles/ui/modals/ModalFooter.module.css";

/**
 * Footer slot for {@link Modal}.
 *
 * Renders a plain `<div>` (not a Mantine component) styled with the global
 * `modal-footer` class plus any caller `className`. Typically holds action
 * buttons (e.g. confirm/cancel). Use as `<Modal.Footer>…</Modal.Footer>` via
 * the compound attachment in {@link Modal}. Note that, unlike
 * {@link ModalHeader} and {@link ModalBody}, the styles here are loaded as a
 * plain global side-effect import rather than a CSS module.
 *
 * @param props         - {@link ModalFooterProps} for the footer.
 * @param props.children - Footer content (typically buttons).
 * @param props.className - Extra classes appended to the footer element.
 * @returns A `div` styled as the modal footer.
 */
export const ModalFooter: React.FC<ModalFooterProps> = ({ children, className = "" }) => {
	return <div className={`modal-footer ${className}`}>{children}</div>;
};
