// components/Logo.tsx
// Renders the TimeTracker wordmark in one of four color styles via next/image.

import Image from "next/image";

import logoBlack from "@/public/img/logo/timetracker_logo_black.svg";
import logoBrand from "@/public/img/logo/timetracker_logo_brand.svg";
import logoLight from "@/public/img/logo/timetracker_logo_light.svg";
import logoWhite from "@/public/img/logo/timetracker_logo_white.svg";

/**
 * Renders the TimeTracker logo as a {@link next/image} `<Image>`. The `style`
 * prop selects which preimported SVG asset is used; an unrecognized `style`
 * falls back to `"brand"`. Both `alt` and `aria-label` are set to
 * `"TimeTracker Logo"` for accessibility.
 *
 * @param props.size    - Optional `{ width, height }` in CSS pixels; defaults to `231 × 40` when omitted.
 * @param props.style   - Color variant (`"brand"` | `"light"` | `"black"` | `"white"`); unrecognized values default to `"brand"`.
 * @param props.loading - next/image loading strategy (`"eager"` | `"lazy"`), forwarded verbatim.
 * @returns A next/image `<Image>` element for the selected logo asset.
 */
export const Logo = (props: { size: { width?: number; height?: number }; style?: string; loading?: "eager" | "lazy"; ref?: React.Ref<HTMLImageElement> }) => {
	let sizeProps;

	if (props.size) {
		sizeProps = { width: props.size.width, height: props.size.height };
	} else if (props.size?.height) {
		sizeProps = { width: (props.size.height / 40) * 231, height: props.size.height };
	} else if (props.size?.width) {
		sizeProps = { width: props.size.width, height: (props.size.width / 231) * 40 };
	} else {
		sizeProps = { width: 231, height: 40 };
	}

	switch (props.style) {
		case "brand":
			return <Image src={logoBrand} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} ref={props.ref} />;
		case "light":
			return <Image src={logoLight} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} ref={props.ref} />;
		case "black":
			return <Image src={logoBlack} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} ref={props.ref} />;
		case "white":
			return <Image src={logoWhite} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} ref={props.ref} />;
		default:
			return <Image src={logoBrand} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} ref={props.ref} />;
	}
};
