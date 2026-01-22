import React from "react";
import { ButtonProps as MantineButtonProps, ButtonGroupProps as MantineButtonGroupProps, ActionIconProps as MantineActionIconProps } from "@mantine/core";

export type ButtonProps = MantineButtonProps & {
	iconLeft?: React.ReactNode;
	iconRight?: React.ReactNode;
	children: React.ReactNode;
	onClick?: () => void;
	loading?: boolean;
	disabled?: boolean;
};

export type ButtonGroupProps = MantineButtonGroupProps & {
	children: React.ReactNode;
};

export type IconButtonProps = MantineActionIconProps & {
	children: React.ReactNode;
	onClick?: () => void;
	href?: string;
};

export type IconLinkProps = MantineActionIconProps & {
	children: React.ReactNode;
	href: string;
};
