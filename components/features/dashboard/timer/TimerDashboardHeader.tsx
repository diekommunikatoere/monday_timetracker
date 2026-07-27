"use client";

import { Flex, Tooltip, Text } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";

import { DashboardMenuButton, Logo } from "@/components";
import EmptyCommentConfirmationModal from "@/components/dashboard/EmptyCommentConfirmationModal";
import SaveTimerModal from "@/components/dashboard/SaveTimerModal";
import { ManualTimeEntryModal } from "@/components/features/timer";
import TimerContainer from "@/components/features/timer/TimerContainer";
import ManualTimeEntryButton from "@/components/ManualTimeEntryButton";
import { useTimerContext } from "@/contexts/TimerContext";
import { APP_VERSION } from "@/lib/version";
import { useModalStore } from "@/stores/modalStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";

import "@/public/css/components/AppHeader.css";

/**
 * `TimerDashboardHeader` — top app header for the timer dashboard widget.
 *
 * Composes the brand logo, the "manual time entry" trigger, the theme toggle,
 * and the live {@link TimerContainer}. It also mounts the modal layer for this
 * dashboard: {@link ManualTimeEntryModal}, `SaveTimerModal`, and
 * `EmptyCommentConfirmationModal` — the latter two being driven by
 * `useModalStore` so the save flow can be opened from `actions.openSaveModal`
 * inside {@link useTimer}.
 *
 * Reads `appTheme` from `useUserStore` to pick a `brand` (light) vs `light`
 * (dark) logo variant, and reads timer `actions`/`state` from
 * {@link useTimerContext} to wire the empty-comment confirmation modal's
 * `onConfirm`/`isSaving` props.
 *
 * @returns A header containing the logo, manual-entry button, theme toggle, and
 *          timer, followed by the manual-entry, save, and empty-comment modals.
 */
export function TimerDashboardHeader() {
	const { allEntries } = useTimeEntriesStore();
	const userId = useUserStore((state) => state.supabaseUser?.id);
	const [showManualSaveModal, setShowManualSaveModal] = useState(false);
	const { showTimerSave, closeTimerSave, showEmptyCommentConfirmation, closeEmptyCommentConfirmation } = useModalStore((s) => s);
	const { actions, state } = useTimerContext();
	const appTheme = useUserStore((state) => state.appTheme);
	const [totalHoursToday, setTotalHoursToday] = useState(0);

	const logoStyle = appTheme === "light" ? "brand" : "light";

	useEffect(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const totalSecondsToday = allEntries.filter((entry) => entry.user_id === userId && new Date(entry.start_time) >= today).reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
		setTotalHoursToday(totalSecondsToday / 3600); // Convert seconds to hours
	}, [allEntries, userId]);

	const handleManualTimeModalOpen = useCallback(() => {
		setShowManualSaveModal(true);
	}, []);

	const handleManualTimeModalClose = useCallback(() => {
		setShowManualSaveModal(false);
	}, []);

	return (
		<>
			<header id="app-header">
				<Flex gap="sm" className="header-left-section">
					<Flex gap="sm" className="section-left-inner">
						<DashboardMenuButton />

						<Tooltip label={`v${APP_VERSION}`} position="bottom">
							<Logo size={{ height: 21 }} style={logoStyle} loading="eager" />
						</Tooltip>
					</Flex>
					<Flex align="center" gap="sm" className="section-right-inner">
						<Flex className="total-hours-today" align="center" gap={8} style={{ backgroundColor: "var(--color--background-secondary)", padding: ".5rem 1rem", borderRadius: 4 }} wrap="wrap">
							{/* Total hours today */}
							<Text className="text-today" size="sm" fw={600} ta="center">
								Heute:
							</Text>
							<Text size="sm" fw={600} ff="mono" ta="center">
								{totalHoursToday.toFixed(2)} h
							</Text>
						</Flex>
						<ManualTimeEntryButton
							onClick={() => {
								handleManualTimeModalOpen();
							}}
						/>
					</Flex>
				</Flex>
				<div className="header-right-section">
					<TimerContainer />
				</div>
			</header>
			<ManualTimeEntryModal show={showManualSaveModal} onClose={handleManualTimeModalClose} />
			<SaveTimerModal show={showTimerSave} onClose={closeTimerSave} />
			<EmptyCommentConfirmationModal show={showEmptyCommentConfirmation} onClose={closeEmptyCommentConfirmation} onConfirm={actions.confirmSaveAsDraft} isSaving={state.isSaving} />
		</>
	);
}

export default TimerDashboardHeader;
