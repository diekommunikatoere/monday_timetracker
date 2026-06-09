// components/features/timer/TimerComment.tsx
"use client";

import { useState } from "react";
import { Flex, Tooltip } from "@mantine/core";
import { Icon, IconButton, Input } from "@/components";
import type { TimerCommentFieldProps } from "@/types/timer.types";
import styles from "@/components/styles/features/timer/TimerCommentField.module.css";

/**
 * TimerComment - Presentational component for comment input
 *
 * This is a pure presentational component that:
 * - Receives all data and callbacks via props
 * - Has NO store access
 * - Only handles rendering and local focus state
 *
 * @param value - Current comment value
 * @param onChange - Callback when comment changes
 * @param disabled - Whether the input should be disabled
 */
export function TimerComment({
    value,
    onChange,
    disabled,
    hasSession,
    isSaving,
    onSaveAsDraft,
}: TimerCommentFieldProps) {
    // Local state for focus styling only
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
    };

    const activeColor = "white";
    const disabledColor = "var(--color--text-disabled)";

    return (
        <Flex direction="row" align="center" className="timer-comment-field-container" gap="0" style={{ flex: 1 }}>
            <Tooltip label="Als Entwurf speichern" position="top" withArrow>
                <IconButton
                    variant="primary"
                    size="lg"
                    onClick={onSaveAsDraft}
                    disabled={!hasSession || isSaving}
                    loading={isSaving}
                    style={{
                        borderRadius: "var(--border-radius-small) 0 0 var(--border-radius-small)",
                        height: "100%",
                        width: "auto",
                    }}
                >
                    <Icon name="saveClock" size={21} />
                </IconButton>
            </Tooltip>
            <Input
                classNames={styles}
                placeholder="Kommentar hinzufügen..."
                aria-label="Kommentar hinzufügen..."
                onChange={(event) => onChange(event.currentTarget.value)}
                onBlur={handleBlur}
                onFocus={handleFocus}
                value={value}
                disabled={disabled}
                style={{ flex: 1, minWidth: "clamp(min(200px, 100vw), 25vw, 450px)" }}
            />
        </Flex>
    );
}

export default TimerComment;
