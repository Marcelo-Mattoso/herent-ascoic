import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { isDieAtRest, topFaceFromQuaternion } from "./physicalRoll";

describe("leitura da face superior do D6", () => {
	it.each([
		[1, "y", 0], [6, "x", Math.PI],
		[3, "z", Math.PI / 2], [4, "z", -Math.PI / 2],
		[2, "x", -Math.PI / 2], [5, "x", Math.PI / 2],
	] as const)("lê a face %i", (value, axis, angle) => {
		const rotation = new Quaternion().setFromAxisAngle(
			axis === "x" ? new Vector3(1, 0, 0) : axis === "y" ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1), angle,
		);
		expect(topFaceFromQuaternion(rotation)).toBe(value);
	});
});

describe("repouso físico", () => {
	const still = { x: 0, y: 0, z: 0 };
	const base = {
		position: { x: 0, y: 0.75, z: 0 }, linear: still, angular: still,
		rotation: new Quaternion(), size: 1.5, halfWidth: 4.2, halfDepth: 2.6,
	};
	it("aceita um dado apoiado e parado", () => expect(isDieAtRest(base)).toBe(true));
	it("rejeita movimento, dado fora da arena ou inclinado", () => {
		expect(isDieAtRest({ ...base, linear: { x: 1, y: 0, z: 0 } })).toBe(false);
		expect(isDieAtRest({ ...base, position: { x: 8, y: 0.75, z: 0 } })).toBe(false);
		expect(isDieAtRest({ ...base, position: { x: 0, y: 3, z: 0 } })).toBe(false);
		expect(isDieAtRest({ ...base, rotation: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 4) })).toBe(false);
	});
});
