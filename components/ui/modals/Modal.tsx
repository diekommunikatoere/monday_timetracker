// components/ui/modals/Modal.tsx
// Compound modal root backed by Mantine's Modal, with Header/Body/Footer slots.

"use client";

import React from "react";
import { Modal as MantineModal } from "@mantine/core";
import { ModalProps, ModalCompoundComponent } from "./types";
import { ModalHeader } from "./ModalHeader";
import { ModalBody } from "./ModalBody";
import { ModalFooter } from "./ModalFooter";
import "@/components/styles/ui/modals/Modal.module.css";

/**
 * Modal root component built on Mantine's `Modal`.
 *
 * Bridges the design-system `show`/`onClose` props to Mantine's
 * `opened`/`onClose`: `show` defaults to `false`, and when `onClose` is
 * omitted a no-op is installed so the modal cannot be dismissed by clicks.
 * Always renders an overlay plus a single content slot; the visible structure
 * (title, body, actions) is composed via the compound sub-components
 * {@link ModalHeader}, {@link ModalBody} and {@link ModalFooter}, which are
 * attached as static properties (`Modal.Header`, etc.) per
 * {@link ModalCompoundComponent}.
 *
 * @param props        - {@link ModalProps} for the modal.
 * @param props.show   - Visibility flag; defaults to `false`.
 * @param props.onClose - Close handler; defaults to a no-op.
 * @returns A Mantine `Modal.Root` with overlay, content and compound slots attached.
 */
const ModalRoot: React.FC<ModalProps> & ModalCompoundComponent = ({ children, show = false, onClose, ...props }) => {
	return (
		<MantineModal.Root opened={show} onClose={onClose || (() => {})} className="modal" {...props}>
			<MantineModal.Overlay />
			<MantineModal.Content>{children}</MantineModal.Content>
		</MantineModal.Root>
	);
};

// Attach compound components
ModalRoot.Header = ModalHeader;
ModalRoot.Body = ModalBody;
ModalRoot.Footer = ModalFooter;

export const Modal = ModalRoot;
