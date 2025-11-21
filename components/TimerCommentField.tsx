// components/TimerCommentField.tsx
"use client";

import { useState, useEffect } from "react";
import { Flex, TextField } from "@vibe/core";
import { useDraftStore } from "@/stores/draftStore";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import "@/public/css/components/TimerCommentField.css";

export default function TimerCommentField({ setComment, comment, activeSession }: { setComment?: (value: string) => void; comment?: string; activeSession?: boolean }) {
	const [focus, setFocus] = useState(false);
	const sessionId = useTimerStore((state) => state.sessionId);
	const supabaseUser = useUserStore((state) => state.supabaseUser);
	const { autoSaveDraft } = useDraftStore();

	// Auto-save comment when it changes
	useEffect(() => {
		if (comment && supabaseUser?.id && sessionId && activeSession) {
			autoSaveDraft({
				comment,
				userId: supabaseUser.id,
				sessionId,
			});
		}
	}, [comment, supabaseUser?.id, sessionId, activeSession, autoSaveDraft]);

	const handleBlur = async () => {
		setFocus(false);
	};

	const handleFocus = () => {
		setFocus(true);
	};

	return (
		<Flex direction="row" align="center" className="timer-comment-field-container" gap="small">
			<TextField className={`timer-comment-field${focus ? " focus" : ""}`} wrapperClassName="timer-comment-field-wrapper" placeholder="Kommentar hinzufügen..." inputAriaLabel="Kommentar hinzufügen..." onChange={setComment} onBlur={handleBlur} onFocus={handleFocus} value={comment} disabled={!activeSession} />
		</Flex>
	);
}
