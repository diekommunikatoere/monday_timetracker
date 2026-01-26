"use client";

import React from "react";
import { Modal as MantineModal } from "@mantine/core";
import { ModalProps, ModalCompoundComponent } from "./types";
import { ModalHeader } from "./ModalHeader";
import { ModalBody } from "./ModalBody";
import { ModalFooter } from "./ModalFooter";
import "@/components/styles/ui/modals/Modal.module.css";

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
