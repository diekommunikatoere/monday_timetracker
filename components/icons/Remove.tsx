import { IconComponentProps } from "@/components/ui/icons/types";

export default function Remove({
    size = 24,
    color = "currentColor",
    weight = "default",
    className,
}: IconComponentProps) {
    switch (weight) {
        case "bold":
            return (
                <svg
                    width={size}
                    height={size}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                >
                    <path
                        d="M5.8445 13.325C5.4765 13.325 5.16367 13.1962 4.906 12.9385C4.64833 12.681 4.5195 12.3682 4.5195 12C4.5195 11.6318 4.64833 11.319 4.906 11.0615C5.16367 10.8038 5.4765 10.675 5.8445 10.675H18.1555C18.5235 10.675 18.8363 10.8038 19.094 11.0615C19.3517 11.319 19.4805 11.6318 19.4805 12C19.4805 12.3682 19.3517 12.681 19.094 12.9385C18.8363 13.1962 18.5235 13.325 18.1555 13.325H5.8445Z"
                        fill={color}
                    />
                </svg>
            );
        case "default":
        default:
            return (
                <svg
                    width={size}
                    height={size}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={className}
                >
                    <path
                        d="M6 13C5.71667 13 5.47917 12.9042 5.2875 12.7125C5.09583 12.5208 5 12.2833 5 12C5 11.7167 5.09583 11.4792 5.2875 11.2875C5.47917 11.0958 5.71667 11 6 11H18C18.2833 11 18.5208 11.0958 18.7125 11.2875C18.9042 11.4792 19 11.7167 19 12C19 12.2833 18.9042 12.5208 18.7125 12.7125C18.5208 12.9042 18.2833 13 18 13H6Z"
                        fill={color}
                    />
                </svg>
            );
    }
}
