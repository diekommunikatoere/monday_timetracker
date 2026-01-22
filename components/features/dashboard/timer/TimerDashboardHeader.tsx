"use client";

import { useCallback, useState } from "react";
import { Logo } from "@/components/Logo";
import TimerContainer from "@/components/features/timer/TimerContainer";
import ManualTimeEntryButton from "@/components/ManualTimeEntryButton";
import { Flex } from "@mantine/core";
import { useModalStore } from "@/stores/modalStore";
import { ManualTimeEntryModal } from "@/components/features/timer";
import SaveTimerModal from "@/components/dashboard/SaveTimerModal";

import "@/public/css/components/AppHeader.css";

export function TimerDashboardHeader(variant?) {
	const [showManualSaveModal, setShowManualSaveModal] = useState(false);
	const { showTimerSave, closeTimerSave } = useModalStore((s) => s);

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
					<Logo size={{ width: 231, height: 40 }} style="brand" />

					<ManualTimeEntryButton
						onClick={() => {
							handleManualTimeModalOpen();
						}}
					/>
				</Flex>
				<TimerContainer />
			</header>
			<ManualTimeEntryModal show={showManualSaveModal} onClose={handleManualTimeModalClose} />
			<SaveTimerModal show={showTimerSave} onClose={closeTimerSave} />
		</>
	);
}

export default TimerDashboardHeader;
