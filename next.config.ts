import type { NextConfig } from "next";

const path = require("path");

const nextConfig: NextConfig = {
	turbopack: {
		root: path.join(__dirname, ".."),
	},
	images: {
		localPatterns: [
			{
				pathname: "/public/img/**",
				search: "",
			},
		],
	},
};

export default nextConfig;
