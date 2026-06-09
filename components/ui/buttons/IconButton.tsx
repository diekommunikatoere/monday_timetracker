"use client";

import { ActionIcon } from "@mantine/core";
import { IconButtonProps } from "./types";
import classes from "@/components/styles/ui/buttons/IconGroup.module.css";

export function IconButton({ children, onClick, href, disabled, ...props }: IconButtonProps) {
    let className = props.className || "";

    if (props.variant) {
        className = className + ` ${classes.root} ${classes[`icon-button--${props.variant}`]}`;
    } else {
        className = className + ` ${classes.root} `;
    }

    return (
        <ActionIcon classNames={{ root: `icon-button ${className}` }} onClick={onClick} disabled={disabled} {...props}>
            {children}
        </ActionIcon>
    );
}

export default IconButton;
