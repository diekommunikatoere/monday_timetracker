"use client";

import { useCallback, useState } from "react";
import { Logo } from "@/components/Logo";
import TimerContainer from "@/components/features/timer/TimerContainer";
import ManualTimeEntryButton from "@/components/ManualTimeEntryButton";
import { Flex } from "@mantine/core";
import { useModalStore } from "@/stores/modalStore";
import { useUserStore } from "@/stores/userStore";
import { ManualTimeEntryModal } from "@/components/features/timer";
import SaveTimerModal from "@/components/dashboard/SaveTimerModal";
import EmptyCommentConfirmationModal from "@/components/dashboard/EmptyCommentConfirmationModal";
import { useTimerContext } from "@/contexts/TimerContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

import "@/public/css/components/AppHeader.css";

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
				<Flex align="center" gap={16}>
					{/* Logo for light/dark mode */}

					<Logo size={{ width: 186, height: 32 }} style={logoStyle} />

					<ManualTimeEntryButton
						onClick={() => {
							handleManualTimeModalOpen();
						}}
					/>

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
