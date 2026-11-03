import type { Page } from "@playwright/test";

export type Win = {
	__loadGameState: (state: unknown) => void;
};

export function readGame<T>(page: Page, read: string): Promise<T> {
	return page.evaluate(async (src) => {
		const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
		const access = await import("/src/core/state/access.ts");
		const fn = new Function(
			"state",
			"access",
			`return (${src})(state, access);`,
		);
		return fn(getElfGameState(), access);
	}, read);
}

export function mutateGame(
	page: Page,
	mutate: string,
	arg: unknown = null,
): Promise<unknown> {
	return page.evaluate(
		async ({ src, arg }) => {
			const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
			const access = await import("/src/core/state/access.ts");
			const engine = await import("/src/engine/state.ts");
			const fn = new Function(
				"state",
				"access",
				"engine",
				"arg",
				`return (${src})(state, access, engine, arg);`,
			);
			const result = fn(getElfGameState(), access, engine, arg) as {
				state: unknown;
				value?: unknown;
			};
			(window as unknown as Win).__loadGameState(result.state);
			return result.value;
		},
		{ src: mutate, arg },
	);
}

export function setElfState(page: Page, mutate: string, arg: unknown = null) {
	return page.evaluate(
		async ({ src, arg }) => {
			const { getElfGameState, setElfStoreProps } = await import(
				"/src/ui/store/elfStore.ts"
			);
			const access = await import("/src/core/state/access.ts");
			const engine = await import("/src/engine/state.ts");
			const fn = new Function(
				"state",
				"access",
				"engine",
				"arg",
				`return (${src})(state, access, engine, arg);`,
			);
			setElfStoreProps({
				gameState: fn(getElfGameState(), access, engine, arg),
			});
		},
		{ src: mutate, arg },
	);
}
