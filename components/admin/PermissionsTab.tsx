// components/admin/PermissionsTab.tsx
"use client";

import { Avatar, Divider, Group, Loader, MultiSelect, Text, type ComboboxItem } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { useAssignableUsers } from "@/components/shared/hooks/useAssignableUsers";
import { PERMISSION_DEFINITIONS, type PermissionKey } from "@/lib/permissions/keys";
import { useMondayStore } from "@/stores/mondayStore";

import styles from "@/components/styles/features/admin/PermissionsTab.module.css";

/** A `permission_grant` row as returned by `/api/admin/permissions`. */
interface Grant {
	id: string;
	permission: PermissionKey;
	user_id: string | null;
	team_id: string | null;
}

interface Team {
	id: string;
	name: string;
	picture_url: string | null;
}

/** Prefix of client-side placeholder ids for grants whose POST is still in flight. */
const TEMP_PREFIX = "temp:";

/**
 * Admin tab "Berechtigungen": for every permission in `PERMISSION_DEFINITIONS`, a section with a
 * headline, description, a "Benutzer" multi-select and a "Teams" multi-select (pills). Changes
 * auto-save per pill — adding POSTs a grant, removing DELETEs it — updating optimistically and
 * reverting with a toast on error. A grant whose user/team can't be resolved (e.g. the monday
 * teams API is down) shows its raw id as the pill label. monday admins implicitly hold every
 * permission, so they need no grant.
 */
export function PermissionsTab() {
	const sessionToken = useMondayStore((state) => state.sessionToken);
	const authHeaders = useMemo(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` }), [sessionToken]);

	const [grants, setGrants] = useState<Grant[]>([]);
	const [loadingGrants, setLoadingGrants] = useState(true);

	const { users, isLoading: loadingUsers } = useAssignableUsers();
	const { data: teams = [], isLoading: loadingTeams } = useQuery({
		queryKey: ["admin-monday-teams"],
		queryFn: async (): Promise<Team[]> => {
			const response = await fetch("/api/admin/monday/teams", { headers: authHeaders });
			if (!response.ok) throw new Error("Teams konnten nicht geladen werden");
			return (await response.json()).teams;
		},
		enabled: !!sessionToken,
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

	const fail = useCallback((message: string) => notifications.show({ color: "red", title: "Fehler", message }), []);

	useEffect(() => {
		if (!sessionToken) return;
		(async () => {
			try {
				const response = await fetch("/api/admin/permissions", { headers: authHeaders });
				if (!response.ok) throw new Error();
				setGrants((await response.json()).grants);
			} catch {
				fail("Berechtigungen konnten nicht geladen werden.");
			} finally {
				setLoadingGrants(false);
			}
		})();
	}, [sessionToken, authHeaders, fail]);

	const addGrant = async (permission: PermissionKey, target: { userId: string } | { teamId: string }) => {
		const tempId = `${TEMP_PREFIX}${crypto.randomUUID()}`;
		const optimistic: Grant = { id: tempId, permission, user_id: "userId" in target ? target.userId : null, team_id: "teamId" in target ? target.teamId : null };
		setGrants((prev) => [...prev, optimistic]);

		try {
			const response = await fetch("/api/admin/permissions", { method: "POST", headers: authHeaders, body: JSON.stringify({ permission, ...target }) });
			if (!response.ok && response.status !== 409) throw new Error();
			if (response.status === 409) {
				// Already granted (e.g. from another tab): drop the placeholder, the row exists.
				setGrants((prev) => prev.filter((g) => g.id !== tempId));
				return;
			}
			const { grant } = await response.json();
			setGrants((prev) => prev.map((g) => (g.id === tempId ? grant : g)));
		} catch {
			setGrants((prev) => prev.filter((g) => g.id !== tempId));
			fail("Berechtigung konnte nicht hinzugefügt werden.");
		}
	};

	const removeGrant = async (grant: Grant) => {
		if (grant.id.startsWith(TEMP_PREFIX)) return; // still being created
		setGrants((prev) => prev.filter((g) => g.id !== grant.id));

		try {
			const response = await fetch(`/api/admin/permissions/${grant.id}`, { method: "DELETE", headers: authHeaders });
			if (!response.ok) throw new Error();
		} catch {
			setGrants((prev) => [...prev, grant]);
			fail("Berechtigung konnte nicht entfernt werden.");
		}
	};

	/** Diff the multi-select's new value list against the current grants and save the change. */
	const handleChange = (permission: PermissionKey, kind: "user" | "team", nextValues: string[]) => {
		const current = grants.filter((g) => g.permission === permission && (kind === "user" ? g.user_id : g.team_id));
		const keyOf = (g: Grant) => (kind === "user" ? g.user_id! : g.team_id!);

		const added = nextValues.find((v) => !current.some((g) => keyOf(g) === v));
		if (added) {
			void addGrant(permission, kind === "user" ? { userId: added } : { teamId: added });
			return;
		}
		const removed = current.find((g) => !nextValues.includes(keyOf(g)));
		if (removed) void removeGrant(removed);
	};

	const userData = (permission: PermissionKey): ComboboxItem[] => {
		const items = users.map((user) => ({ value: user.id, label: user.name || "Unbekannter Benutzer" }));
		const known = new Set(items.map((i) => i.value));
		const unresolved = grants.filter((g) => g.permission === permission && g.user_id && !known.has(g.user_id)).map((g) => ({ value: g.user_id!, label: g.user_id! }));
		return [...items, ...unresolved];
	};

	const teamData = (permission: PermissionKey): ComboboxItem[] => {
		const items = teams.map((team) => ({ value: team.id, label: team.name }));
		const known = new Set(items.map((i) => i.value));
		const unresolved = grants.filter((g) => g.permission === permission && g.team_id && !known.has(g.team_id)).map((g) => ({ value: g.team_id!, label: g.team_id! }));
		return [...items, ...unresolved];
	};

	const photoById = useMemo(() => new Map(users.map((user) => [user.id, user.photo_urls?.thumb_small ?? null])), [users]);

	return (
		<div className="admin-section">
			<div className="admin-section-header">
				<div>
					<h2>Berechtigungen</h2>
					<p className="admin-section-description">Admins haben automatisch alle Berechtigungen.</p>
				</div>
			</div>

			{loadingGrants ? (
				<div className="admin-loading">
					<Loader />
				</div>
			) : (
				PERMISSION_DEFINITIONS.map((definition, index) => (
					<Fragment key={definition.key}>
						{index > 0 && <Divider my="lg" />}
						<section className={styles.section}>
							<h3 className={styles.sectionTitle}>{definition.label}</h3>
							<p className={styles.sectionDescription}>{definition.description}</p>

							<div className={styles.pickers}>
								<MultiSelect
									label="Benutzer"
									placeholder="Benutzer hinzufügen..."
									data={userData(definition.key)}
									value={grants.filter((g) => g.permission === definition.key && g.user_id).map((g) => g.user_id!)}
									onChange={(values) => handleChange(definition.key, "user", values)}
									disabled={loadingUsers}
									searchable
									nothingFoundMessage="Keine Benutzer gefunden"
									renderOption={({ option }) => (
										<Group gap="xs" wrap="nowrap">
											<Avatar src={photoById.get(option.value)} size="xs" radius="xl" />
											<Text size="sm">{option.label}</Text>
										</Group>
									)}
								/>
								<MultiSelect
									label="Teams"
									placeholder="Teams hinzufügen..."
									data={teamData(definition.key)}
									value={grants.filter((g) => g.permission === definition.key && g.team_id).map((g) => g.team_id!)}
									onChange={(values) => handleChange(definition.key, "team", values)}
									disabled={loadingTeams}
									searchable
									nothingFoundMessage="Keine Teams gefunden"
								/>
							</div>
						</section>
					</Fragment>
				))
			)}
		</div>
	);
}

export default PermissionsTab;
