// components/shared/UserSelect.tsx
"use client";

import { Avatar, Group, Text, type ComboboxItem } from "@mantine/core";

import { Select } from "@/components";

import type { AssignableUser } from "./hooks/useAssignableUsers";

/**
 * Props for {@link UserSelect}.
 *
 * @property users    - Selectable users, typically from `useAssignableUsers`.
 * @property value    - Selected `user_profiles.id`, or `null`/`""` for none.
 * @property onChange - Fired with the new `user_profiles.id` (never cleared — an entry always has an owner).
 * @property loading  - Disables the input while the users query is in flight.
 * @property label    - Field label; defaults to "Benutzer".
 */
export interface UserSelectProps {
	users: AssignableUser[];
	value: string | null;
	onChange: (userId: string) => void;
	loading?: boolean;
	label?: string;
}

/**
 * Presentational, fully-controlled user picker: a searchable `Select` whose options show the
 * user's avatar and name. Holds no state and does not fetch.
 */
export function UserSelect({ users, value, onChange, loading, label = "Benutzer" }: UserSelectProps) {
	const data: ComboboxItem[] = users.map((user) => ({ value: user.id, label: user.name || "Unbekannter Benutzer" }));
	const photoById = new Map(users.map((user) => [user.id, user.photo_urls?.thumb_small ?? null]));

	return (
		<Select
			label={label}
			placeholder="Benutzer auswählen..."
			data={data}
			value={value || null}
			onChange={(val) => val && onChange(val)}
			disabled={loading}
			searchable
			allowDeselect={false}
			nothingFoundMessage="Keine Benutzer gefunden"
			leftSection={value ? <Avatar src={photoById.get(value)} size="xs" radius="xl" /> : undefined}
			renderOption={({ option }) => (
				<Group gap="xs" wrap="nowrap">
					<Avatar src={photoById.get(option.value)} size="xs" radius="xl" />
					<Text size="sm">{option.label}</Text>
				</Group>
			)}
		/>
	);
}

export default UserSelect;
