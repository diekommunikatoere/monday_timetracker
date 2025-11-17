"use client";

import { Button, Flex } from "@vibe/core";
import { useTimerState } from "@/hooks/useTimerState";
import Play from "@/components/icons/Play";
import Pause from "@/components/icons/Pause";
import MoveDown from "@/components/icons/MoveDown";
import Save from "@/components/icons/Save";

import "@/public/css/components/TimerActionButtons.css";

export default function TimerActionButtons({ onClickStart, onClickResume, onClickPause, onClickSaveAsDraft, onClickSave, isRunning, isPaused, isSaving, ...props }) {
	const playPauseButton = !isRunning ? <Play fillColor={"var(--color--text-on-primary)"} /> : isPaused ? <Play fillColor={"var(--color--text-on-primary)"} /> : <Pause fillColor={"var(--color--text-on-primary)"} />;

	const playPauseAction = !isRunning ? onClickStart : isPaused ? onClickResume : onClickPause;

	return (
		<Flex>
			<Button className="button button--timer play-pause" kind="primary" size="small" onClick={playPauseAction} disabled={isSaving}>
				{playPauseButton}
			</Button>
			<Button className="button button--timer draft" kind="primary" size="small" onClick={onClickSaveAsDraft} disabled={!isRunning || isSaving}>
				<MoveDown fillColor={isRunning ? "var(--color--text-on-primary)" : "var(--color--text-disabled)"} />
			</Button>
			<Button className="button button--timer save" kind="primary" size="small" onClick={onClickSave} disabled={!isRunning || isSaving}>
				<Save fillColor={isRunning ? "var(--color--text-on-primary)" : "var(--color--text-disabled)"} />
			</Button>
		</Flex>
	);
}
