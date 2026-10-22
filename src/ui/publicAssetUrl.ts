/** Resolve paths from public/ against Vite's deployment base (including GitHub Pages). */
export function publicAssetUrl(path: string): string {
	return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
