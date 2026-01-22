import React from "react";
import { TextInputProps as MantineTextInputProps, TextareaProps as MantineTextareaProps, SelectProps as MantineSelectProps } from "@mantine/core";
import { DatePickerInputProps } from "@mantine/dates";
import { TimePickerProps } from "@mantine/dates";

export interface InputProps extends Omit<MantineTextInputProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

export interface TextareaProps extends Omit<MantineTextareaProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

export interface SelectProps extends Omit<MantineSelectProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

export interface DatePickerProps extends Omit<DatePickerInputProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

export interface TimePickerComponentProps extends Omit<TimePickerProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
	value?: string;
	onChange?: (value: string) => void;
}
