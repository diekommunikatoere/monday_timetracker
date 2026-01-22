"use client";

import React from "react";
import { ModalHeaderProps } from "./types";
import "@/components/styles/ui/modals/ModalHeader.module.css";

export const ModalHeader: React.FC<ModalHeaderProps> = ({ children, className = "" }) => {
	return <div className={`modal-header ${className}`}>{children}</div>;
};
