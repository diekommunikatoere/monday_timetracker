"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Logo } from "./Logo";
import Timer from "@/components/Timer";
import ManualTimeEntryButton from "@/components/ManualTimeEntryButton";
import { Flex } from "@mantine/core";
import TaskItemSelector from "./TaskItemSelector";
import { useDrawerStore } from "@/stores/drawerStore";
import ManualTimeEntryDrawer from "./ManualTimeEntryDrawer";
import SaveTimerDrawer from "./dashboard/SaveTimerDrawer";

import "@/public/css/components/AppHeader.css";

export default function AppHeader(variant?) {
	const [showManualSaveDrawer, setShowManualSaveDrawer] = useState(false);
	const { showTimerSave, closeTimerSave } = useDrawerStore((s) => s);

	const handleManualTimeDrawerOpen = useCallback(() => {
		setShowManualSaveDrawer(true);
	}, []);

	const handleManualTimeDrawerClose = useCallback(() => {
		setShowManualSaveDrawer(false);
	}, []);

	return (
		<>
			<header id="appHeader" className={`widget-header ${variant}`}>
				<Flex align="center" gap={16}>
					<Logo size={{ width: 231, height: 40 }} style="brand" />
					<ManualTimeEntryButton
						onClick={() => {
							handleManualTimeDrawerOpen();
						}}
					/>
				</Flex>
				<Timer />
			</header>
			<ManualTimeEntryDrawer show={showManualSaveDrawer} onClose={handleManualTimeDrawerClose} />
			<SaveTimerDrawer show={showTimerSave} onClose={closeTimerSave} />
		</>
	);
}
