import { beforeEach, describe, expect, it } from "vitest";
import { _registerForTests, _resetForTests, getScript } from "./registry";
import type { ScriptHandler } from "./types";

describe("script registry", () => {
	beforeEach(() => {
		_resetForTests();
	});

	it("retorna null para ref desconhecido", () => {
		expect(getScript("inexistente.fn")).toBeNull();
	});

	it("resolve ref registrado manualmente", () => {
		const handler: ScriptHandler = (ctx) => ctx.state;
		_registerForTests("teste.handler", handler);
		expect(getScript("teste.handler")).toBe(handler);
	});

	it("limpa cache entre testes", () => {
		const handler: ScriptHandler = (ctx) => ctx.state;
		_registerForTests("outro.handler", handler);
		_resetForTests();
		expect(getScript("outro.handler")).toBeNull();
	});
});
