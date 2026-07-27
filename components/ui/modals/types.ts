// components/ui/modals/types.ts
// Shared prop types for the modal design-system components.

import { ModalProps as MantineModalProps } from "@mantine/core";
import React from "react";

/**
 * Props for the {@link Modal} root component.
 *
 * Extends Mantine's `ModalProps` but **omits `opened`/`onClose`** and re-exposes
 * them as the design-system's `show`/`onClose` pair. `show` defaults to `false`,
 * and `onClose` is optional — when omitted the root installs a no-op handler so
 * the overlay/backdrop is effectively non-dismissable via clicks. `title` is
 * declared here for API symmetry but the visible title is rendered by
 * {@link ModalHeader} via its children.
 *
 * @property children - Modal content (typically {@link ModalHeader}, {@link ModalBody}, {@link ModalFooter}).
 * @property title    - Optional title (rendered separately by {@link ModalHeader} in practice).
 * @property show     - Controlled visibility flag; defaults to `false`.
 * @property onClose  - Close handler; defaults to a no-op when not provided.
 */
export interface ModalProps extends Omit<MantineModalProps, "opened" | "onClose"> {
	children: React.ReactNode;
	title?: string;
	show?: boolean;
	onClose?: () => void;
}

/**
 * Props for the {@link ModalHeader} sub-component.
 *
 * @property children  - Header content; rendered inside Mantine's `Modal.Title`.
 * @property className - Extra classes appended to the header element.
 */
export interface ModalHeaderProps {
	children: React.ReactNode;
	className?: string;
}

/**
 * Props for the {@link ModalBody} sub-component.
 *
 * @property children  - Body content.
 * @property className - Extra classes appended to the body element.
 */
export interface ModalBodyProps {
	children: React.ReactNode;
	className?: string;
}

/**
 * Props for the {@link ModalFooter} sub-component.
 *
 * @property children  - Footer content (typically action buttons).
 * @property className - Extra classes appended to the footer element.
 */
export interface ModalFooterProps {
	children: React.ReactNode;
	className?: string;
}

/**
 * Compound-component shape attached to the {@link Modal} root.
 *
 * Lets callers compose a modal as `<Modal>`, `<Modal.Header>`, `<Modal.Body>`
 * and `<Modal.Footer>` rather than importing each piece separately. Each slot
 * is the corresponding typed sub-component.
 *
 * @property Header - {@link ModalHeader} component.
 * @property Body   - {@link ModalBody} component.
 * @property Footer - {@link ModalFooter} component.
 */
export interface ModalCompoundComponent {
	Header: React.FC<ModalHeaderProps>;
	Body: React.FC<ModalBodyProps>;
	Footer: React.FC<ModalFooterProps>;
}
