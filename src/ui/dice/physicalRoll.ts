import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { sfxPlayer } from "@/ui/audio/sfxPlayer";

export type DieSide = "hero" | "enemy";
type RollArena = { element: HTMLElement; count: number; side: DieSide };
type Die = { body: RAPIER.RigidBody; mesh: THREE.Mesh; settledFrames: number };

const normals = [
	new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
	new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
	new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const values = [3, 4, 1, 6, 2, 5];

export function topFaceFromQuaternion(rotation: { x: number; y: number; z: number; w: number }): number {
	const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
	let best = -Infinity;
	let face = 1;
	for (let index = 0; index < normals.length; index++) {
		const height = normals[index].clone().applyQuaternion(quaternion).y;
		if (height > best) { best = height; face = values[index]; }
	}
	return face;
}

export function isDieAtRest(input: {
	position: { x: number; y: number; z: number };
	linear: { x: number; y: number; z: number };
	angular: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number; w: number };
	size: number; halfWidth: number; halfDepth: number;
}): boolean {
	const { position, linear, angular, rotation, size, halfWidth, halfDepth } = input;
	if (position.y < size * 0.35 || position.y > size * 0.67 ||
		Math.abs(position.x) > halfWidth - size / 2 + 0.15 ||
		Math.abs(position.z) > halfDepth - size / 2 + 0.15) return false;
	if (Math.hypot(linear.x, linear.y, linear.z) >= 0.18 ||
		Math.hypot(angular.x, angular.y, angular.z) >= 0.18) return false;
	const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
	return normals.some((normal) => normal.clone().applyQuaternion(quaternion).y > 0.8);
}

const pips: Record<number, [number, number][]> = {
	1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]],
	4: [[1, 1], [3, 1], [1, 3], [3, 3]],
	5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
	6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]],
};

function faceMaterial(face: number, side: DieSide): THREE.MeshStandardMaterial {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 128;
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = side === "hero" ? "#e8f4ff" : "#fff0e9";
	ctx.fillRect(0, 0, 128, 128);
	ctx.strokeStyle = side === "hero" ? "#4c88b5" : "#b95d53";
	ctx.lineWidth = 5;
	ctx.strokeRect(5, 5, 118, 118);
	ctx.fillStyle = side === "hero" ? "#164d83" : "#8d302c";
	for (const [column, row] of pips[face]) {
		ctx.beginPath();
		ctx.arc(column * 32, row * 32, 8, 0, Math.PI * 2);
		ctx.fill();
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0.04 });
}

const rapierReady = RAPIER.init();

/** Each arena owns its world and resources; the returned function cancels the frame immediately. */
export async function startPhysicalArena(
	arena: RollArena,
	onStop: (results: number[] | null) => void,
): Promise<() => void> {
	await rapierReady;
	let disposed = false;
	let frame = 0;
	let renderer: THREE.WebGLRenderer | undefined;
	let observer: ResizeObserver | undefined;
	const scene = new THREE.Scene();
	const world = new RAPIER.World({ x: 0, y: -25, z: 0 });
	const queue = new RAPIER.EventQueue(true);
	const objects: Die[] = [];
	const size = Math.max(0.56, Math.min(1.65, 4.5 / Math.max(2, arena.count)));
	const halfWidth = 4.2;
	const halfDepth = 2.6;
	const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
	camera.position.set(0, 10, 12);
	camera.lookAt(0, 0, 0);
	scene.add(new THREE.HemisphereLight(0xffffff, 0x57504d, 2.1));
	const key = new THREE.DirectionalLight(0xffffff, 2.7);
	key.position.set(-3, 9, 4);
	key.castShadow = true;
	key.shadow.mapSize.set(1024, 1024);
	scene.add(key);
	const floor = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.3, 5.5), new THREE.MeshStandardMaterial({ color: 0x48443f, roughness: 0.92 }));
	floor.position.y = -0.18;
	floor.receiveShadow = true;
	scene.add(floor);
	const floorCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(halfWidth, 0.15, halfDepth).setTranslation(0, -0.18, 0).setFriction(0.88).setRestitution(0.32));
	const diceColliderHandles = new Set<number>();
	for (const [x, z, hx, hz] of [
		[-halfWidth, 0, 0.15, halfDepth], [halfWidth, 0, 0.15, halfDepth],
		[0, -halfDepth, halfWidth, 0.15], [0, halfDepth, halfWidth, 0.15],
	]) {
		world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 1.3, hz).setTranslation(x, 1.15, z).setFriction(0.6).setRestitution(0.55));
	}
	try {
		renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
	} catch {
		floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
		queueMicrotask(() => { try { queue.free(); } catch { /* WASM may still be unwinding */ } try { world.free(); } catch { /* WASM may still be unwinding */ } });
		onStop(null);
		return () => undefined;
	}
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	arena.element.appendChild(renderer.domElement);
	const resize = () => {
		if (!renderer) return;
		const width = Math.max(1, arena.element.clientWidth);
		const height = Math.max(1, arena.element.clientHeight);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.position.set(0, 8.8, Math.max(9.4, 11.2 / camera.aspect));
		camera.updateProjectionMatrix();
	};
	resize();
	if (typeof ResizeObserver !== "undefined") {
		observer = new ResizeObserver(resize);
		observer.observe(arena.element);
	}
	for (let index = 0; index < arena.count; index++) {
		const launchX = (index % 4 - 1.5) * 1.5;
		const launchZ = index % 2 ? 0.7 : -0.7;
		const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
			.setTranslation(launchX, 2.8 + Math.floor(index / 4) * 1.25, launchZ)
			.setLinvel(-launchX * 1.5 + (Math.random() - 0.5) * 4.4, 2 + Math.random() * 1.5, -launchZ * 2 + (Math.random() - 0.5) * 4.4)
			.setAngvel({ x: Math.random() * 22 - 11, y: Math.random() * 20 - 10, z: Math.random() * 22 - 11 })
			.setLinearDamping(0.7).setAngularDamping(1.25));
		body.setRotation({ x: Math.random(), y: Math.random(), z: Math.random(), w: Math.random() }, true);
		const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
			.setFriction(0.72).setRestitution(0.46).setDensity(1)
			.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
		diceColliderHandles.add(collider.handle);
		const geometry = new RoundedBoxGeometry(size, size, size, 3, size * 0.11);
		const materials = values.map((value) => faceMaterial(value, arena.side));
		const mesh = new THREE.Mesh(geometry, materials);
		mesh.castShadow = true;
		scene.add(mesh);
		objects.push({ body, mesh, settledFrames: 0 });
	}
	sfxPlayer.play("dice_launch");
	let lastTime = 0;
	let accumulator = 0;
	let elapsed = 0;
	let complete = false;
	const step = (time: number) => {
		if (disposed || complete) return;
		const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
		lastTime = time;
		elapsed += delta;
		accumulator += delta;
		while (accumulator >= 1 / 60) {
			world.step(queue);
			accumulator -= 1 / 60;
		}
		queue.drainCollisionEvents((first, second, started) => {
			if (!started) return;
			const firstDie = diceColliderHandles.has(first);
			const secondDie = diceColliderHandles.has(second);
			if (firstDie && secondDie) sfxPlayer.play("dice_collision", 0.35);
			else if (first === floorCollider.handle || second === floorCollider.handle) sfxPlayer.play("dice_surface", 0.65);
			else if (firstDie || secondDie) sfxPlayer.play("dice_tumble", 0.25);
		});
		for (const die of objects) {
			const position = die.body.translation();
			const rotation = die.body.rotation();
			die.mesh.position.set(position.x, position.y, position.z);
			die.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
			die.settledFrames = isDieAtRest({ position, linear: die.body.linvel(), angular: die.body.angvel(),
				rotation, size, halfWidth, halfDepth }) ? die.settledFrames + 1 : 0;
		}
		renderer?.render(scene, camera);
		if (elapsed > 0.6 && objects.every((die) => die.settledFrames > 24 && (die.body.isSleeping() || elapsed > 1.2))) {
			complete = true;
			sfxPlayer.play("dice_settle");
			onStop(objects.map((die) => topFaceFromQuaternion(die.body.rotation())));
			return;
		}
		if (elapsed > 9) { complete = true; onStop(null); return; }
		frame = requestAnimationFrame(step);
	};
	frame = requestAnimationFrame(step);
	return () => {
		disposed = true;
		cancelAnimationFrame(frame);
		observer?.disconnect();
		for (const die of objects) {
			die.mesh.geometry.dispose();
			for (const material of die.mesh.material as THREE.Material[]) {
				const map = (material as THREE.MeshStandardMaterial).map;
				map?.dispose(); material.dispose();
			}
		}
		floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
		renderer?.dispose(); renderer?.domElement.remove();
		queueMicrotask(() => { try { queue.free(); } catch { /* WASM may still be unwinding */ } try { world.free(); } catch { /* WASM may still be unwinding */ } });
	};
}
