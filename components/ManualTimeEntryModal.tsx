import dynamic from "next/dynamic";
const Modal = dynamic(() => import("@vibe/core/next").then((mod) => mod.Modal));
import { ModalBasicLayout, ModalHeader, ModalContent, ModalFooter } from "@vibe/core/next";

interface ManualTimeEntryModalProps {
	show: boolean;
	onClose: () => void;
}
export default function ManualTimeEntryModal({ show, onClose }: ManualTimeEntryModalProps) {
	return (
		<Modal id="manualTimeEntryModal" show={show} onClose={onClose}>
			<ModalBasicLayout>
				<ModalHeader title={"Manual Time Entry"} />
				<ModalContent>
					<div>Manual Time Entry Modal Component</div>
				</ModalContent>
				<ModalFooter
					primaryButton={{
						text: "Speichern",
						onClick: () => {
							console.log("primary modal button clicked.");
							onClose();
						},
						ariaLabel: "Zeit-Eintrag speichern",
					}}
					secondaryButton={{
						text: "Abbrechen",
						onClick: () => {
							console.log("secondary modal button clicked.");
							onClose();
						},
						ariaLabel: "Zeit-Eintrag abbrechen",
					}}
				/>
			</ModalBasicLayout>
		</Modal>
	);
}
