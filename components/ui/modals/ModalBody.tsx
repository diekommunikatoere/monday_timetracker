"use client";

import React from "react";
import { ModalBodyProps } from "./types";
import "@/components/styles/ui/modals/ModalBody.module.css";

export const ModalBody: React.FC<ModalBodyProps> = ({ children, className = "" }) => {
	return <div className={`modal-body ${className}`}>{children}</div>;
};
