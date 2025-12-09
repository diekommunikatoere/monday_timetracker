"use client";

import React from "react";
import { Select as MantineSelect } from "@mantine/core";
import { SelectProps } from "./types";
import "@/public/css/components/ui/forms/Select.module.css";

export const Select: React.FC<SelectProps> = ({ error, validationState, className = "", ...props }) => {
	const selectClass = ["select", validationState ? `select--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineSelect className={selectClass} error={typeof error === "string" ? error : error ? "Invalid selection" : null} {...props} />;
};
