"use client";

import React from "react";
import { ModalFooterProps } from "./types";
import "@/public/css/components/ui/modals/ModalFooter.module.css";

export const ModalFooter: React.FC<ModalFooterProps> = ({ children, className = "" }) => {
	return <div className={`modal-footer ${className}`}>{children}</div>;
};
