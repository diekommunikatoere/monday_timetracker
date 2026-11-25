// components/shared/time-entries/EditLockMenuItem.tsx
"use client";

import { Flex, Menu, Popover, Text, Tooltip } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import { Button, Icon } from "@/components";

import { useEntryEditLock, type EntryEditLockInfo } from "../hooks/useEntryEditLock";

import type { IconProps } from "@/components/ui/icons/types";

export function formatLockDescription(lock: EntryEditLockInfo): string {
	const name = lock.holderName || "Jemand";
	const since = lock.since || "--:--";
	switch (lock.state) {
		case "busy":
			return `${name} bearbeitet diesen Eintrag gerade (seit ${since}).`;
		case "idle":
			return `${name} hat diesen Eintrag seit ${since} geöffnet, ist aber seit ${lock.idleMinutes} Min. inaktiv. Wenn du übernimmst, kann ${name} nicht mehr speichern.`;
		case "self":
			return "Du bearbeitest diesen Eintrag bereits in einer anderen Ansicht. Dort wird die Bearbeitung beendet.";
		default:
			return "";
	}
}

export interface EditLockMenuItemProps {
	entryId: string;
	defaultLabel: string;
	defaultIcon: IconProps["name"];
	onTrigger: () => void;
}

/**
 * Shared menu item for "Bearbeiten" and "Zuweisen" across row menus and the
 * calendar context menu.
 *
 * - `free`: normal clickable `Menu.Item`.
 * - `busy` ("In Bearbeitung"): disabled `Menu.Item` with `lock` icon + hover/tap `Popover`.
 * - `idle` ("Inaktiv"): enabled "Übernehmen…" `Menu.Item` with `lock_open` icon + `Popover` containing "Bearbeitung übernehmen".
 * - `self` ("Eigene andere Ansicht"): enabled "Hier bearbeiten" `Menu.Item` + `Popover` containing "Hier bearbeiten".
 */
export function EditLockMenuItem({ entryId, defaultLabel, defaultIcon, onTrigger }: EditLockMenuItemProps) {
	const lock = useEntryEditLock(entryId);
	const [popoverOpened, setPopoverOpened] = useState(false);
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current);
			}
		};
	}, []);

	if (lock.state === "free") {
		return (
			<Menu.Item leftSection={<Icon name={defaultIcon} size={18} />} onClick={onTrigger}>
				{defaultLabel}
			</Menu.Item>
		);
	}

	const clearCloseTimer = () => {
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current);
			closeTimeoutRef.current = null;
		}
	};

	const openPopover = () => {
		clearCloseTimer();
		setPopoverOpened(true);
	};

	const scheduleClosePopover = () => {
		clearCloseTimer();
		closeTimeoutRef.current = setTimeout(() => {
			setPopoverOpened(false);
		}, 150);
	};

	const isBusy = lock.state === "busy";
	const isIdle = lock.state === "idle";
	const itemLabel = isBusy ? defaultLabel : isIdle ? "Übernehmen…" : "Hier bearbeiten";
	const itemIcon: IconProps["name"] = isBusy ? "lock" : isIdle ? "lock_open" : defaultIcon;
	const actionButtonLabel = isIdle ? "Bearbeitung übernehmen" : "Hier bearbeiten";
	const description = formatLockDescription(lock);

	return (
		<Popover opened={popoverOpened} onChange={setPopoverOpened} position="left" withArrow shadow="md" width={260} withinPortal={false} floatingStrategy="fixed" zIndex={500}>
			<Popover.Target>
				<div
					onMouseEnter={openPopover}
					onMouseLeave={scheduleClosePopover}
					onFocusCapture={openPopover}
					onPointerDown={(e) => {
						if (e.pointerType === "touch") {
							e.stopPropagation();
							setPopoverOpened((prev) => !prev);
						}
					}}
				>
					<Menu.Item
						leftSection={<Icon name={itemIcon} size={18} />}
						disabled={isBusy}
						closeMenuOnClick={false}
						onClick={(e) => {
							e.stopPropagation();
							setPopoverOpened((prev) => !prev);
						}}
					>
						{itemLabel}
					</Menu.Item>
				</div>
			</Popover.Target>
			<Popover.Dropdown onMouseEnter={openPopover} onMouseLeave={scheduleClosePopover} onClick={(e) => e.stopPropagation()}>
				<Flex direction="column" gap="xs">
					<Text size="xs">{description}</Text>
					{!isBusy && (
						<Button
							size="xs"
							onClick={() => {
								setPopoverOpened(false);
								onTrigger();
							}}
						>
							{actionButtonLabel}
						</Button>
					)}
				</Flex>
			</Popover.Dropdown>
		</Popover>
	);
}

/**
 * Compact lock indicator rendered next to task names (table/sidebar row and
 * calendar event) so claims are visible without opening the context menu.
 */
export function EntryEditLockIcon({ entryId, size = 14 }: { entryId: string; size?: number }) {
	const lock = useEntryEditLock(entryId);
	if (lock.state === "free") return null;

	const iconName: IconProps["name"] = lock.state === "idle" ? "lock_open" : "lock";
	const label = formatLockDescription(lock);

	return (
		<Tooltip label={label} position="top" withArrow multiline maw={260}>
			<span aria-label={label} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
				<Icon name={iconName} size={size} color="var(--color--icon)" />
			</span>
		</Tooltip>
	);
}
