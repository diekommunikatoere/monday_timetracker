// components/ui/forms/DatePicker.tsx
// Date picker wrapper with design-system validation styling.

"use client";

import { DatePickerInput as MantineDatePickerInput, DatePickerType } from "@mantine/dates";
import dayjs from "dayjs";

import styles from "@/components/styles/ui/forms/DatePicker.module.css";

import { defaultClearButtonProps } from "./clearButton";
import { DatePickerProps } from "./types";

/**
 * Date field built on Mantine's `DatePickerInput`.
 *
 * Applies a `date-picker` base class plus an optional `date-picker--<state>`
 * modifier and the caller's `className`. Resolves the design-system `error`
 * prop into Mantine's error slot: strings pass through verbatim, `true` falls
 * back to `"Ungültiges Datum"`, and falsy values clear it. Defaults
 * `clearButtonProps` to the shared {@link defaultClearButtonProps} icon/style
 * so the clear button (shown when `clearable` is set) matches `Input`'s and
 * `Select`'s. Mantine types this prop as plain `<button>` HTML attributes, but
 * the underlying `Input.ClearButton` also accepts `icon`/`classNames` at
 * runtime — merging through an intermediate variable (rather than an inline
 * object literal) avoids TypeScript's excess-property check on the narrower
 * type. Note this default is inert unless the caller also passes `clearable`.
 *
 * @param props                  - {@link DatePickerProps} for the field.
 * @param props.validationState  - When set, appends a state modifier class for styling.
 * @param props.error            - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className        - Extra classes appended after the base/modifier classes.
 * @param props.clearButtonProps - Merged over {@link defaultClearButtonProps}; only rendered when `clearable` is set.
 * @returns A Mantine `DatePickerInput` with design-system classes and a resolved error.
 */
export function DatePicker<Type extends DatePickerType = "default">({ error, validationState, className = "", clearButtonProps, ...props }: DatePickerProps<Type>) {
	const datePickerClass = [styles["date-picker"], validationState ? styles[`date-picker--${validationState}`] : "", className].filter(Boolean).join(" ");
	const mergedClearButtonProps = { ...defaultClearButtonProps, ...clearButtonProps };

	const getDayProps: DatePickerProps<"range">["getDayProps"] = (date) => {
		const d = dayjs(date);
		const isToday = d.isSame(dayjs(), "day");

		if (isToday) {
			return {
				style: {
					borderColor: "var(--color--border-ui)",
				},
			};
		}

		return {};
	};

	return <MantineDatePickerInput classNames={{ input: datePickerClass }} error={typeof error === "string" ? error : error ? "Ungültiges Datum" : null} clearButtonProps={mergedClearButtonProps} getDayProps={getDayProps} {...props} />;
}
