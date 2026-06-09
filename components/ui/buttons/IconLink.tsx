"use client";

import { ActionIcon } from "@mantine/core";
import classes from "@/components/styles/ui/buttons/IconLink.module.css";

import { IconLinkProps } from "./types";

export function IconLink({ children, href, disabled, ...props }: IconLinkProps) {
    let className = props.className || "";

    if (props.variant) {
        className = className + ` ${classes.root} ${classes[`icon-link--${props.variant}`]}`;
    } else {
        className = className + ` ${classes.root}`;
    }

    return (
        <ActionIcon
            classNames={{ root: `icon-link ${className}` }}
            component="a"
            href={href}
            disabled={disabled}
            {...props}
        >
            {children}
        </ActionIcon>
    );
}

export default IconLink;
