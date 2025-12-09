"use client";

import React from "react";
import { TimePicker as MantineTimePicker } from "@mantine/dates";
import { TimePickerComponentProps } from "./types";
import "@/public/css/components/ui/forms/TimePicker.module.css";

export const TimePicker: React.FC<TimePickerComponentProps> = ({ error, validationState, className = "", value, onChange, ...props }) => {
	const timePickerClass = ["time-picker", validationState ? `time-picker--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineTimePicker className={timePickerClass} value={value} onChange={onChange} error={typeof error === "string" ? error : error ? "Invalid time" : null} {...props} />;
};
