"use client";

import React from "react";
import { DatePickerInput as MantineDatePickerInput } from "@mantine/dates";
import { DatePickerProps } from "./types";
import "@/components/styles/ui/forms/DatePicker.module.css";

export const DatePicker: React.FC<DatePickerProps> = ({ error, validationState, className = "", ...props }) => {
	const datePickerClass = ["date-picker", validationState ? `date-picker--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineDatePickerInput className={datePickerClass} error={typeof error === "string" ? error : error ? "Invalid date" : null} {...props} />;
};
