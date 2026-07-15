import { Flex, Loader, LoadingOverlay } from "@mantine/core";

export default function LoadingState({ text }: { text?: string }) {
	const renderChildren = () => {
		return (
			<Flex direction="column" align="center" justify="center" gap="md">
				<Loader color="var(--color--primary-500)" />
				{text || "Wird geladen..."}
			</Flex>
		);
	};

	return <LoadingOverlay visible={true} zIndex={1000} overlayProps={{ blur: 10 }} loaderProps={{ children: renderChildren() }} />;
}
