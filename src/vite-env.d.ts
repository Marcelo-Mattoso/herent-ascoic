/// <reference types="vite/client" />

declare module "*.yaml?raw" {
	const source: string;
	export default source;
}

declare module "*.yml?raw" {
	const source: string;
	export default source;
}

declare const process: {
	readonly env: Record<string, string | undefined>;
	readonly stdout: {
		write(text: string): void;
	};
	exitCode?: number;
};
