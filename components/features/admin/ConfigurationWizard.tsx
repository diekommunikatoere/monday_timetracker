"use client";

import { useState, useEffect, useMemo } from "react";
import { Stepper, Button, Group, Select, MultiSelect, Stack, Text, Title, Card, Badge, Loader, Alert, Box, Flex } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Icon } from "@/components";

interface BoardOption {
	value: string;
	label: string;
}

interface ColumnOption {
	id: string;
	title: string;
	type: string;
}

export function ConfigurationWizard() {
	const [active, setActive] = useState(0);
	const [loading, setLoading] = useState(false);
	const [boards, setBoards] = useState<BoardOption[]>([]);

	// Step 1: Budget Board
	const [budgetBoardId, setBudgetBoardId] = useState<string | null>(null);
	const [budgetColumns, setBudgetColumns] = useState<ColumnOption[]>([]);
	const [budgetColumnId, setBudgetColumnId] = useState<string | null>(null);

	// Step 2: Job Boards
	const [jobBoardIds, setJobBoardIds] = useState<string[]>([]);

	// Step 3: Column Mapping
	const [jobColumnsMap, setJobColumnsMap] = useState<Record<string, ColumnOption[]>>({});
	const [jobColumnMappings, setJobColumnMappings] = useState<Record<string, string>>({});

	// Fetch all boards on mount
	useEffect(() => {
		const fetchBoards = async () => {
			setLoading(true);
			try {
				const res = await fetch("/api/admin/monday/boards");
				const data = await res.json();
				if (data.success) setBoards(data.boards);
			} catch (err) {
				console.error("Failed to fetch boards", err);
			} finally {
				setLoading(false);
			}
		};
		fetchBoards();
	}, []);

	// Fetch columns when budget board changes
	useEffect(() => {
		if (budgetBoardId) {
			fetch(`/api/admin/monday/boards/${budgetBoardId}/columns`)
				.then((res) => res.json())
				.then((data) => {
					if (data.success) {
						setBudgetColumns(data.columns);
						// Smart detection
						const detected = data.columns.find((c: any) => c.title.toLowerCase().includes("budget") || c.title.toLowerCase().includes("cost"));
						if (detected) setBudgetColumnId(detected.id);
					}
				});
		}
	}, [budgetBoardId]);

	// Fetch columns for job boards
	useEffect(() => {
		jobBoardIds.forEach((id) => {
			if (!jobColumnsMap[id]) {
				fetch(`/api/admin/monday/boards/${id}/columns`)
					.then((res) => res.json())
					.then((data) => {
						if (data.success) {
							setJobColumnsMap((prev) => ({ ...prev, [id]: data.columns }));
							// Smart detection for job board
							const detected = data.columns.find((c: any) => c.title.toLowerCase().includes("budget") || c.title.toLowerCase().includes("used"));
							if (detected) {
								setJobColumnMappings((prev) => ({ ...prev, [id]: detected.id }));
							}
						}
					});
			}
		});
	}, [jobBoardIds, jobColumnsMap]);

	const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current));
	const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

	const handleSave = async () => {
		setLoading(true);
		try {
			// 1. Save Budget Board Config
			const budgetBoardName = boards.find((b) => b.value === budgetBoardId)?.label || "";
			await fetch("/api/admin/boards", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					board_id: budgetBoardId,
					board_name: budgetBoardName,
					sync_enabled: true,
					budget_column_id: budgetColumnId,
					sync_budget_used: true,
				}),
			});

			// 2. Save Job Boards Configs
			for (const jobId of jobBoardIds) {
				const jobBoardName = boards.find((b) => b.value === jobId)?.label || "";
				await fetch("/api/admin/boards", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						board_id: jobId,
						board_name: jobBoardName,
						sync_enabled: true,
						linked_board_id: budgetBoardId,
						sync_linked_items: true,
					}),
				});

				// Save column sync config for job board
				const col = jobColumnsMap[jobId]?.find((c) => c.id === jobColumnMappings[jobId]);
				if (col) {
					await fetch(`/api/admin/boards/${jobId}/columns`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							column_id: col.id,
							column_name: col.title,
							column_type: col.type,
							sync_purpose: "budget_used",
							sync_enabled: true,
						}),
					});
				}
			}

			notifications.show({
				title: "Configuration Saved",
				message: "The guided configuration has been applied successfully.",
				color: "green",
			});
			window.location.reload();
		} catch (err) {
			notifications.show({
				title: "Error",
				message: "Failed to save configuration.",
				color: "red",
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<Box p="md">
			<Title order={2} mb="xl">
				Guided Configuration Wizard
			</Title>

			<Stepper active={active} onStepClick={setActive} mb="xl">
				<Stepper.Step label="Budget Board" description="Select primary budget board">
					<Stack gap="md" mt="md">
						<Alert icon={<Icon name="settings" size={20} />} title="Step 1: Identify Budget Board" color="blue">
							Select the board where you manage the overall project budgets.
						</Alert>
						<Select label="Budget Board" placeholder="Search boards..." data={boards} searchable value={budgetBoardId} onChange={setBudgetBoardId} nothingFoundMessage="No boards found" />
						{budgetBoardId && <Select label="Budget Column (on Budget Board)" placeholder="Select column to receive updates" data={budgetColumns.map((c) => ({ value: c.id, label: `${c.title} (${c.type})` }))} value={budgetColumnId} onChange={setBudgetColumnId} description="This column will store the total budget used across all linked job boards." />}
					</Stack>
				</Stepper.Step>

				<Stepper.Step label="Job Boards" description="Link tracking boards">
					<Stack gap="md" mt="md">
						<Alert icon={<Icon name="settings" size={20} />} title="Step 2: Link Job Boards" color="blue">
							Select the boards where time is actively tracked. These will sync their data to the Budget Board.
						</Alert>
						<MultiSelect label="Job Boards" placeholder="Select one or more boards" data={boards.filter((b) => b.value !== budgetBoardId)} searchable value={jobBoardIds} onChange={setJobBoardIds} />
					</Stack>
				</Stepper.Step>

				<Stepper.Step label="Map Columns" description="Finalize sync mapping">
					<Stack gap="md" mt="md">
						<Alert icon={<Icon name="settings" size={20} />} title="Step 3: Map Columns" color="blue">
							Ensure each Job Board has a "Budget Used" column mapped correctly.
						</Alert>

						{jobBoardIds.map((jobId) => (
							<Card key={jobId} withBorder padding="sm">
								<Group justify="space-between" mb="xs">
									<Text fw={500}>{boards.find((b) => b.value === jobId)?.label}</Text>
									<Badge color="green">Sync Active</Badge>
								</Group>
								<Select label="Budget Used Column" placeholder="Select column" data={jobColumnsMap[jobId]?.map((c) => ({ value: c.id, label: c.title })) || []} value={jobColumnMappings[jobId]} onChange={(val) => setJobColumnMappings((prev) => ({ ...prev, [jobId]: val || "" }))} />
							</Card>
						))}

						<Box mt="xl">
							<Title order={4} mb="sm">
								Visual Board Map
							</Title>
							<Flex align="center" gap="xl" justify="center" p="xl" bg="gray.0" style={{ borderRadius: 8, border: "1px dashed #ccc" }}>
								<Stack gap="xs">
									{jobBoardIds.map((id) => (
										<Badge key={id} size="lg" variant="outline">
											{boards.find((b) => b.value === id)?.label}
										</Badge>
									))}
									{jobBoardIds.length === 0 && (
										<Text c="dimmed" size="sm">
											No job boards selected
										</Text>
									)}
								</Stack>
								<Icon name="chevron_right" size={32} />
								<Badge size="xl" color="blue" p="xl">
									{boards.find((b) => b.value === budgetBoardId)?.label || "Budget Board"}
								</Badge>
							</Flex>
						</Box>
					</Stack>
				</Stepper.Step>

				<Stepper.Completed>
					<Stack align="center" py="xl">
						<Icon name="check" size={64} color="green" />
						<Title order={3}>Ready to Save!</Title>
						<Text c="dimmed">Review your configuration and click "Finish" to apply changes.</Text>
					</Stack>
				</Stepper.Completed>
			</Stepper>

			<Group justify="center" mt="xl">
				<Button variant="default" onClick={prevStep} disabled={active === 0 || loading}>
					Back
				</Button>
				{active < 3 ? (
					<Button onClick={nextStep} disabled={active === 0 && !budgetBoardId}>
						Next step
					</Button>
				) : (
					<Button onClick={handleSave} loading={loading} color="green">
						Finish & Save
					</Button>
				)}
			</Group>
		</Box>
	);
}
