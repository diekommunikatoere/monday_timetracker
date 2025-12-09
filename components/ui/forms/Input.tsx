"use client";

import React from "react";
import { TextInput as MantineTextInput, Textarea as MantineTextarea } from "@mantine/core";
import { InputProps, TextareaProps } from "./types";
import "@/public/css/components/ui/forms/Input.module.css";

export const Input: React.FC<InputProps> = ({ error, validationState, className = "", ...props }) => {
	const inputClass = ["input", validationState ? `input--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineTextInput className={inputClass} error={typeof error === "string" ? error : error ? "Invalid input" : null} {...props} />;
};

export const Textarea: React.FC<TextareaProps> = ({ error, validationState, className = "", ...props }) => {
	const textareaClass = ["textarea", validationState ? `textarea--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineTextarea className={textareaClass} error={typeof error === "string" ? error : error ? "Invalid input" : null} {...props} />;
};
