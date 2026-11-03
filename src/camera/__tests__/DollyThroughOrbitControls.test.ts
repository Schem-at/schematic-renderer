// "Zoom speed set to 0 after zooming in on big builds; eventually can't zoom anymore."
// Stock OrbitControls dollies by multiplying the radius to a FIXED target and clamps at minDistance, so the
// per-notch speed decays to ~0 near the target and stalls at the clamp. DollyThroughOrbitControls keeps a
// minimum speed and pushes the target forward (dolly-through) instead of stalling.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { DollyThroughOrbitControls, dollyThroughStep } from "../DollyThroughOrbitControls";

function wheel(el: HTMLElement, deltaY: number) {
	el.dispatchEvent(new WheelEvent("wheel", { deltaY, deltaMode: 0, clientX: 10, clientY: 10, cancelable: true }));
}

function makeRig(distance: number) {
	const canvas = document.createElement("canvas");
	document.body.appendChild(canvas);
	const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
	const target = new THREE.Vector3(256, 64, 256);
	const dir = new THREE.Vector3(1, 0.8, 1.1).normalize();
	camera.position.copy(target).addScaledVector(dir, distance);
	camera.lookAt(target);
	const controls = new DollyThroughOrbitControls(camera, canvas);
	controls.target.copy(target);
	// Flow/perspective preset settings.
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.minDistance = 1;
	controls.maxDistance = 1000;
	controls.zoomSpeed = 1.2;
	controls.update();
	return { canvas, camera, controls, target0: target.clone(), forward: dir.clone().negate() };
}

describe("DollyThroughOrbitControls", () => {
	it("repeated wheel-in on a large build keeps making progress and passes through the old target", () => {
		const { canvas, camera, controls, target0, forward } = makeRig(600);
		const along = () => camera.position.clone().sub(target0).dot(forward);
		let prev = along();
		for (let i = 0; i < 300; i++) {
			wheel(canvas, -100);
			controls.update();
			const now = along();
			expect(now - prev).toBeGreaterThan(0.25); // never stalls
			prev = now;
		}
		expect(prev).toBeGreaterThan(10); // the eye went past the original orbit target
		expect(controls.getDistance()).toBeGreaterThanOrEqual(controls.minDistance - 1e-9);
		controls.dispose();
	});

	it("far from the target, wheel zoom is the unchanged multiplicative OrbitControls dolly", () => {
		const { canvas, controls, target0 } = makeRig(400);
		const d0 = controls.getDistance();
		wheel(canvas, -100);
		controls.update();
		expect(controls.getDistance()).toBeCloseTo(d0 * Math.pow(0.95, 1.2), 6);
		expect(controls.target.distanceTo(target0)).toBeLessThan(1e-9);
		wheel(canvas, 100);
		controls.update();
		expect(controls.getDistance()).toBeCloseTo(d0, 6);
		controls.dispose();
	});

	it("dollyThroughStep: zoom-in near the minimum spends the remainder on pushing the target", () => {
		// step = max(1.5, floor 8) * (1 - 0.9) = 0.8; only 0.5 fits before minDistance 1, so push 0.3.
		const r = dollyThroughStep(1.5, 0.9, 1, 1000);
		expect(r.radius).toBeCloseTo(1, 9);
		expect(r.push).toBeCloseTo(0.3, 9);
		// Far away it is plain multiplicative, no push.
		const far = dollyThroughStep(100, 0.9, 1, 1000);
		expect(far.radius).toBeCloseTo(90, 9);
		expect(far.push).toBe(0);
	});
});
