"use client";

import { useCallback, useState } from "react";
import { Logo } from "@/components/Logo";
import TimerContainer from "@/components/features/timer/TimerContainer";
import ManualTimeEntryButton from "@/components/ManualTimeEntryButton";
import { Flex, Tooltip } from "@mantine/core";
import { useModalStore } from "@/stores/modalStore";
import { useUserStore } from "@/stores/userStore";
import { ManualTimeEntryModal } from "@/components/features/timer";
import SaveTimerModal from "@/components/dashboard/SaveTimerModal";
import EmptyCommentConfirmationModal from "@/components/dashboard/EmptyCommentConfirmationModal";
import { useTimerContext } from "@/contexts/TimerContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { APP_VERSION } from "@/lib/version";

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
 * Note: the function signature declares `variant` but never destructures it, so
 * the rendered `<header>` className always appends `undefined` (a no-op class).
 * Kept as-is; not modified.
 *
 * @returns A header containing the logo, manual-entry button, theme toggle, and
 *          timer, followed by the manual-entry, save, and empty-comment modals.
 */
export function TimerDashboardHeader(variant?) {
	const [showManualSaveModal, setShowManualSaveModal] = useState(false);
	const { showTimerSave, closeTimerSave, showEmptyCommentConfirmation, closeEmptyCommentConfirmation } = useModalStore((s) => s);
	const { actions, state } = useTimerContext();
	const appTheme = useUserStore((state) => state.appTheme);

	const logoStyle = appTheme === "light" ? "brand" : "light";

	const handleManualTimeModalOpen = useCallback(() => {
		setShowManualSaveModal(true);
	}, []);

	const handleManualTimeModalClose = useCallback(() => {
		setShowManualSaveModal(false);
	}, []);

	return (
		<>
			<header id="appHeader" className={`widget-header ${variant}`}>
				<Flex align="center" gap={16} className="header-left-section">
					<Flex align="center" gap={16} className="logo-container">
						{/* Logo for light/dark mode */}
						<Tooltip label={`v${APP_VERSION}`} position="bottom">
							<Logo size={{ width: 186, height: 32 }} style={logoStyle} loading="eager" />
						</Tooltip>

						<ManualTimeEntryButton
							onClick={() => {
								handleManualTimeModalOpen();
							}}
						/>
					</Flex>

					<ThemeToggle />
				</Flex>
				<TimerContainer />
			</header>
			<ManualTimeEntryModal show={showManualSaveModal} onClose={handleManualTimeModalClose} />
			<SaveTimerModal show={showTimerSave} onClose={closeTimerSave} />
			<EmptyCommentConfirmationModal show={showEmptyCommentConfirmation} onClose={closeEmptyCommentConfirmation} onConfirm={actions.confirmSaveAsDraft} isSaving={state.isSaving} />
		</>
	);
}

export default TimerDashboardHeader;
