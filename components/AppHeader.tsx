"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Logo } from "./Logo";
import Timer from "@/components/Timer";
import ManualTimeEntryButton from "@/components/ManualTimeEntryButton";
import { Flex, Tooltip } from "@mantine/core";
import TaskItemSelector from "./TaskItemSelector";
import { useModalStore } from "@/stores/modalStore";
import ManualTimeEntryModal from "@/components/ManualTimeEntryModal";
import SaveTimerModal from "@/components/dashboard/SaveTimerModal";

import "@/public/css/components/AppHeader.css";

export default function AppHeader(variant?) {
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
				<Timer />
			</header>
			<ManualTimeEntryModal show={showManualSaveModal} onClose={handleManualTimeModalClose} />
			<SaveTimerModal show={showTimerSave} onClose={closeTimerSave} />
		</>
	);
}
