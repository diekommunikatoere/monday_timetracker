// components/icons/Refresh.tsx

interface RefreshIconProps {
	size?: number;
	color?: string;
	className?: string;
}

export default function RefreshIcon({ size = 16, color = "currentColor", className }: RefreshIconProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
			<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
			<path d="M3 3v5h5" />
			<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
			<path d="M16 21h5v-5" />
		</svg>
	);
}
