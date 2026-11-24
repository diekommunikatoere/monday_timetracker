// components/admin/UsersTab.tsx
"use client";

import { Avatar, Badge, Group, Loader, Switch, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon, Input } from "@/components";
import { useMondayStore } from "@/stores/mondayStore";

export interface AdminUserProfile {
	id: string;
	monday_user_id: string;
	name: string | null;
	email: string | null;
	photo_urls: { thumb_small?: string | null; [size: string]: string | null | undefined } | null;
	is_admin: boolean | null;
	is_active: boolean;
	updated_at: string;
}

/**
 * Admin tab "Benutzer": lists all `user_profiles` of the monday account with an
 * "Aktiv" switch per row (`PATCH /api/admin/users/[profileId]`).
 *
 * `is_active` is a reporting and assignment flag (not access control): inactive
 * users are excluded from user pickers and hidden by default in Auswertung and
 * the sidebar item view, while historical time entries and Abrechnung costs
 * remain intact.
 */
export function UsersTab() {
	const sessionToken = useMondayStore((state) => state.sessionToken);
	const queryClient = useQueryClient();

	const [users, setUsers] = useState<AdminUserProfile[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

	const authHeaders = useMemo(
		() => ({
			"Content-Type": "application/json",
			Authorization: `Bearer ${sessionToken}`,
		}),
		[sessionToken],
	);

	useEffect(() => {
		if (!sessionToken) return;
		let cancelled = false;

		(async () => {
			try {
				const response = await fetch("/api/admin/users", { headers: authHeaders });
				if (!response.ok) throw new Error();
				const data = await response.json();
				if (!cancelled) setUsers(data.users ?? []);
			} catch {
				if (!cancelled) {
					notifications.show({
						color: "red",
						title: "Fehler",
						message: "Benutzer konnten nicht geladen werden.",
					});
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [sessionToken, authHeaders]);

	const toggleActive = useCallback(
		async (user: AdminUserProfile, nextActive: boolean) => {
			setPendingIds((prev) => new Set(prev).add(user.id));
			setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: nextActive } : u)));

			try {
				const response = await fetch(`/api/admin/users/${user.id}`, {
					method: "PATCH",
					headers: authHeaders,
					body: JSON.stringify({ is_active: nextActive }),
				});

				if (!response.ok) throw new Error();

				const { user: updated } = await response.json();
				setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
				void queryClient.invalidateQueries({ queryKey: ["assignable-users"] });
				void queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
			} catch {
				setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: user.is_active } : u)));
				notifications.show({
					color: "red",
					title: "Fehler",
					message: "Status konnte nicht aktualisiert werden.",
				});
			} finally {
				setPendingIds((prev) => {
					const next = new Set(prev);
					next.delete(user.id);
					return next;
				});
			}
		},
		[authHeaders, queryClient],
	);

	const filteredUsers = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return users;
		return users.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
	}, [users, search]);

	return (
		<div className="admin-section">
			<div className="admin-section-header">
				<div>
					<h2>Benutzer</h2>
					<p className="admin-section-description">Inaktive Benutzer werden aus Benutzerauswahlen, der Auswertung und der Seitenleiste standardmäßig ausgeblendet. Bestehende Zeiteinträge und Abrechnungen bleiben erhalten.</p>
				</div>
			</div>

			{loading ? (
				<div className="admin-loading">
					<Loader />
				</div>
			) : users.length === 0 ? (
				<div className="empty-state">
					<div className="empty-state-title">Keine Benutzer gefunden</div>
				</div>
			) : (
				<>
					<div style={{ maxWidth: 360, marginBottom: "var(--mantine-spacing-md)" }}>
						<Input placeholder="Benutzer suchen…" value={search} onChange={(e) => setSearch(e.currentTarget.value)} leftSection={<Icon name="search" size={16} />} leftSectionPointerEvents="none" clearable onClear={() => setSearch("")} clearButtonLabel="Suche löschen" />
					</div>

					<Table highlightOnHover withTableBorder verticalSpacing="sm">
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Benutzer</Table.Th>
								<Table.Th>E-Mail</Table.Th>
								<Table.Th>Status</Table.Th>
								<Table.Th style={{ width: 120 }}>Aktiv</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{filteredUsers.map((user) => {
								const displayName = user.name || "Unbekannter Benutzer";
								return (
									<Table.Tr key={user.id}>
										<Table.Td>
											<Group gap="sm" wrap="nowrap">
												<Avatar src={user.photo_urls?.thumb_small ?? null} alt={displayName} radius="xl" size="sm">
													{displayName.charAt(0)}
												</Avatar>
												<Text fw={500} size="sm">
													{displayName}
												</Text>
												{user.is_admin && (
													<Badge size="xs" variant="light">
														Admin
													</Badge>
												)}
											</Group>
										</Table.Td>
										<Table.Td>
											<Text size="sm" c="dimmed">
												{user.email || "–"}
											</Text>
										</Table.Td>
										<Table.Td>
											<span className={`role-card-status ${user.is_active ? "active" : "inactive"}`}>{user.is_active ? "Aktiv" : "Inaktiv"}</span>
										</Table.Td>
										<Table.Td>
											<Switch aria-label={`${displayName} aktiv`} checked={user.is_active} disabled={pendingIds.has(user.id)} onChange={(e) => void toggleActive(user, e.currentTarget.checked)} />
										</Table.Td>
									</Table.Tr>
								);
							})}
						</Table.Tbody>
					</Table>
				</>
			)}
		</div>
	);
}

export default UsersTab;
