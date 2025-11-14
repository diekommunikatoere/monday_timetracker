import { Flex, TextField } from "@vibe/core";

import "@/public/css/components/TimerCommentField.css";

export default function TimerCommentField({ setComment, comment, isRunning }: { setComment?: (value: string) => void; comment?: string; isRunning?: boolean }) {
	const handleBlur = async () => {
		setComment;
	};
	return (
		<Flex direction="row" align="center" className="timer-comment-field-container" gap="small">
			<TextField className="timer-comment-field" wrapperClassName="timer-comment-field-wrapper" placeholder="Kommentar hinzufügen..." inputAriaLabel="Kommentar hinzufügen..." onChange={setComment} onBlur={handleBlur} value={comment} disabled={isRunning} />
		</Flex>
	);
}
