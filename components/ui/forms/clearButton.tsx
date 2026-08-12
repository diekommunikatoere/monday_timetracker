// components/ui/forms/clearButton.tsx
// Shared default clear-button styling so Select/DatePicker's native Mantine
// clear button renders identically to Input's hand-built one — both resolve
// to the same IconButton "tertiary" classes from IconGroup.module.css.

import { Icon } from "@/components/ui/icons/Icon";

import buttonStyles from "@/components/styles/ui/buttons/IconGroup.module.css";

/**
 * Mantine's internal `InputClearButton` (used by both `Select`'s Combobox
 * clear button and `DatePicker`'s `PickerInputBase` clear button) always
 * injects `style={{ pointerEvents: "all", background: "var(--input-bg)" }}`
 * on the button, which as an inline style beats our `.buttonTertiary`
 * background-color regardless of CSS specificity. It re-spreads the caller's
 * raw `style` object last, so supplying our own `style` here replaces
 * Mantine's entirely (not a merge) — omitting `background` keeps the DOM node
 * free of any inline background, letting `.buttonTertiary`'s base/`:hover`
 * background apply. `pointerEvents: "all"` is kept to preserve Mantine's
 * default (the button can otherwise sit in a `pointerEvents: "none"` zone).
 */
export const defaultClearButtonProps = {
	icon: <Icon name="close" size={18} />,
	classNames: { root: `${buttonStyles.iconButton} ${buttonStyles.buttonTertiary}` },
	style: { pointerEvents: "all" as const },
};
