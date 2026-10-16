// components/admin/SentinelTab.tsx
"use client";

import { Alert, Divider, Loader, NumberInput, Switch } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components";
import { useMondayStore } from "@/stores/mondayStore";

import styles from "@/components/styles/features/admin/SentinelTab.module.css";

import type { SentinelSettings } from "@/lib/sentinel/settings";
import type { CycleResult, DrainResult, SentinelStatus } from "@/lib/sentinel/types";

interface SentinelResponse {
	settings: SentinelSettings;
	settingsPersisted: boolean;
	status: SentinelStatus | null;
	openPipeSize: number | null;
	sealedPipeCount: number | null;
	running: boolean;
	disabled: boolean;
}

const QUERY_KEY = ["admin-sentinel"];

const entries = (n: number) => `${n} ${n === 1 ? "Eintrag" : "Einträge"}`;
const batches = (n: number) => `${n} Stapel`;

function describeDrain(drain: DrainResult): string {
	return `${drain.succeeded} erfolgreich / ${drain.skipped} übersprungen / ${drain.requeued} erneut eingereiht / ${drain.dropped} verworfen`;
}

function describeCycle(cycle: CycleResult | null): string | null {
	if (!cycle || !("reason" in cycle)) return null;
	return { busy: "Durchlauf lief bereits", closed: "Ventil geschlossen", locked: "Ein anderer Prozess führte den Durchlauf aus" }[cycle.reason];
}

/**
 * Admin tab "Sentinel": Valve switch (open/closed), interval, live queue counts, the last
 * cycle's outcome and a "Jetzt ausführen" button. Polls the status every 5 s while mounted
 * (the tab panel is unmounted when hidden). The Valve switch saves immediately and optimistically;
 * the interval saves with its button.
 */
export function SentinelTab() {
	const sessionToken = useMondayStore((state) => state.sessionToken);
	const authHeaders = useMemo(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` }), [sessionToken]);
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async (): Promise<SentinelResponse> => {
			const response = await fetch("/api/admin/sentinel", { headers: authHeaders });
			if (!response.ok) throw new Error("Sentinel-Status konnte nicht geladen werden");
			return response.json();
		},
		enabled: !!sessionToken,
		refetchInterval: 5000,
	});

	const [interval, setInterval] = useState<number | string>(60);
	const [saving, setSaving] = useState(false);
	const [running, setRunning] = useState(false);

	const serverInterval = data?.settings.intervalSeconds;
	useEffect(() => {
		if (serverInterval !== undefined) setInterval(serverInterval);
	}, [serverInterval]);

	const fail = (message: string) => notifications.show({ color: "red", title: "Fehler", message });

	const patch = async (body: Partial<SentinelSettings>): Promise<boolean> => {
		try {
			const response = await fetch("/api/admin/sentinel", { method: "PATCH", headers: authHeaders, body: JSON.stringify(body) });
			if (!response.ok) throw new Error();
			return true;
		} catch {
			fail("Einstellungen konnten nicht gespeichert werden.");
			return false;
		}
	};

	const toggleValve = async (valveOpen: boolean) => {
		const previous = queryClient.getQueryData<SentinelResponse>(QUERY_KEY);
		if (previous) queryClient.setQueryData(QUERY_KEY, { ...previous, settings: { ...previous.settings, valveOpen } });

		if (!(await patch({ valveOpen })) && previous) queryClient.setQueryData(QUERY_KEY, previous);
		void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
	};

	const saveInterval = async () => {
		setSaving(true);
		const ok = typeof interval === "number" && (await patch({ intervalSeconds: interval }));
		if (typeof interval !== "number") fail("Bitte ein gültiges Intervall angeben.");
		setSaving(false);
		if (ok) void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
	};

	const runNow = async () => {
		setRunning(true);
		try {
			const response = await fetch("/api/admin/sentinel", { method: "POST", headers: authHeaders });
			if (response.status === 409) {
				notifications.show({ color: "blue", title: "Hinweis", message: (await response.json().catch(() => null))?.error ?? "Durchlauf läuft bereits" });
			} else if (!response.ok) {
				throw new Error();
			}
		} catch {
			fail("Durchlauf konnte nicht gestartet werden.");
		} finally {
			setRunning(false);
			void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
		}
	};

	const status = data?.status;
	const cycleNote = describeCycle(status?.lastCycleResult ?? null);

	return (
		<div className="admin-section">
			<div className="admin-section-header">
				<div>
					<h2>Sentinel</h2>
					<p className="admin-section-description">Sentinel bündelt Spalten-Synchronisierungen, die durch Änderungen in monday (Verschieben, Löschen, Wiederherstellen von Items) ausgelöst werden, und führt sie gesammelt aus.</p>
				</div>
			</div>

			{isLoading || !data ? (
				<div className="admin-loading">
					<Loader />
				</div>
			) : (
				<>
					{data.disabled && (
						<Alert color="yellow" mb="md">
							Sentinel ist per Umgebungsvariable deaktiviert — Synchronisierungen laufen sofort.
						</Alert>
					)}
					{!data.settingsPersisted && (
						<Alert color="yellow" mb="md">
							Einstellungen konnten nicht geladen werden — es gelten die Standardwerte.
						</Alert>
					)}

					<section className={styles.section}>
						<Switch label="Ventil geöffnet" description="Geschlossen: Synchronisierungen werden gesammelt, aber nicht ausgeführt." checked={data.settings.valveOpen} onChange={(event) => void toggleValve(event.currentTarget.checked)} />

						<div className={styles.intervalRow}>
							<NumberInput label="Intervall (Sekunden)" min={15} max={120} step={5} allowDecimal={false} clampBehavior="strict" value={interval} onChange={(value) => setInterval(typeof value === "bigint" ? Number(value) : value)} className={styles.intervalInput} />
							<Button onClick={saveInterval} loading={saving} disabled={interval === data.settings.intervalSeconds}>
								Speichern
							</Button>
						</div>
					</section>

					<Divider my="lg" />

					<section className={styles.section}>
						<h3 className={styles.sectionTitle}>Status</h3>
						<ul className={styles.statusList}>
							<li>Offene Warteschlange: {data.openPipeSize === null ? "–" : entries(data.openPipeSize)}</li>
							<li>Versiegelte Stapel: {data.sealedPipeCount === null ? "–" : batches(data.sealedPipeCount)}</li>
							<li>
								Letzter Durchlauf: {status?.lastCycleAt ? new Date(status.lastCycleAt).toLocaleString("de-DE") : "noch nie"}
								{cycleNote && ` (${cycleNote})`}
								{data.running && " — läuft gerade"}
							</li>
							{status?.lastDrain && <li>Letzte Verarbeitung: {describeDrain(status.lastDrain)}</li>}
							{status?.lastError && (
								<li>
									Letzter Fehler: {status.lastError}
									{status.lastErrorAt && ` (${new Date(status.lastErrorAt).toLocaleString("de-DE")})`}
								</li>
							)}
						</ul>

						<div>
							<Button onClick={runNow} loading={running || data.running}>
								Jetzt ausführen
							</Button>
						</div>
					</section>
				</>
			)}
		</div>
	);
}

export default SentinelTab;
