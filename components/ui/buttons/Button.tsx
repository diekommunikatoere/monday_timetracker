"use client";

import { Button as MantineButton } from "@mantine/core";
import { ButtonProps } from "./types";
import classes from "@/components/styles/ui/buttons/Button.module.css";

export function Button({ iconLeft, iconRight, children, onClick, loading, disabled, ...props }: ButtonProps) {
    let className = props.className || "";

    if (props.variant) {
        className = className + ` ${classes.root} ${classes[`button--${props.variant}`]}`;
    } else {
        className = className + ` ${classes.root} ${classes["button--default"]}`;
    }

    return (
        <MantineButton
            className={`button test ${className}`}
            loading={loading}
            disabled={disabled}
            leftSection={iconLeft}
            rightSection={iconRight}
            onClick={onClick}
            {...props}
        >
            {children}
        </MantineButton>
    );
}
