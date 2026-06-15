import Image from "next/image";

import logoBrand from "@/public/img/logo/timetracker_logo_brand.svg";
import logoLight from "@/public/img/logo/timetracker_logo_light.svg";
import logoBlack from "@/public/img/logo/timetracker_logo_black.svg";
import logoWhite from "@/public/img/logo/timetracker_logo_white.svg";

export const Logo = (props: { size?: { width: number; height: number }; style?: string; loading?: "eager" | "lazy" }) => {
	let sizeProps;

	if (props.size) {
		sizeProps = { width: props.size.width, height: props.size.height };
	} else {
		sizeProps = { width: 231, height: 40 };
	}

	switch (props.style) {
		case "brand":
			return <Image src={logoBrand} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} />;
		case "light":
			return <Image src={logoLight} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} />;
		case "black":
			return <Image src={logoBlack} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} />;
		case "white":
			return <Image src={logoWhite} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} />;
		default:
			return <Image src={logoBrand} alt="TimeTracker Logo" aria-label="TimeTracker Logo" {...sizeProps} loading={props.loading} />;
	}
};
