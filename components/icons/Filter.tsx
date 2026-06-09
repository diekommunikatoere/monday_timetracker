import { IconComponentProps } from "@/components/ui/icons/types";

export default function Filter({
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
                        d="M11 20.4805C10.5942 20.4805 10.246 20.3352 9.9555 20.0445C9.66484 19.754 9.5195 19.4058 9.5195 19V13.1695L3.8325 5.8825C3.45067 5.38917 3.392 4.872 3.6565 4.331C3.921 3.79 4.36884 3.5195 5 3.5195H19C19.6312 3.5195 20.079 3.79 20.3435 4.331C20.608 4.872 20.5493 5.38917 20.1675 5.8825L14.4805 13.1695V19.1555C14.4805 19.533 14.354 19.8482 14.101 20.101C13.8482 20.354 13.533 20.4805 13.1555 20.4805H11ZM12 12.0175L16.5825 6.1695H7.4175L12 12.0175Z"
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
                        d="M11 20C10.7167 20 10.4792 19.9042 10.2875 19.7125C10.0958 19.5208 10 19.2833 10 19V13L4.2 5.6C3.95 5.26667 3.9125 4.91667 4.0875 4.55C4.2625 4.18333 4.56667 4 5 4H19C19.4333 4 19.7375 4.18333 19.9125 4.55C20.0875 4.91667 20.05 5.26667 19.8 5.6L14 13V19C14 19.2833 13.9042 19.5208 13.7125 19.7125C13.5208 19.9042 13.2833 20 13 20H11ZM12 12.3L16.95 6H7.05L12 12.3Z"
                        fill={color}
                    />
                </svg>
            );
    }
}
