// OrbitControls with a "dolly-through" zoom for perspective cameras.
//
// Stock OrbitControls dollies by multiplying the orbit radius toward a FIXED target and clamps at
// minDistance. The per-notch speed is proportional to the radius, so on a big build (target at the build
// center, deep inside it) zooming in decays to ~0 speed and finally stalls at minDistance: "zoom speed set
// to 0 after zooming in on big builds; eventually can't zoom anymore".
//
// Here the step is computed from max(radius, DOLLY_SPEED_FLOOR) so it never drops below a floor, and when a
// zoom-in step would cross minDistance the remainder is spent pushing the target (and camera) forward along
// the view direction, so the eye keeps moving and can pass through the old target. Far from the target
// (radius >= floor) the behaviour is exactly the stock multiplicative dolly. Orthographic cameras (zoom,
// not radius) and zoomToCursor keep the stock behaviour.

import * as THREE from "three";
// @ts-ignore
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

/** Below this radius the zoom speed stops shrinking (one 0.94 wheel notch then moves ~0.5 blocks). */
export const DOLLY_SPEED_FLOOR = 8;

/**
 * One dolly step. `ratio` is the radius multiplier (<1 zooms in, >1 zooms out). Returns the new radius and
 * how far the target must be pushed forward along the view direction (dolly-through; 0 when it fits).
 */
export function dollyThroughStep(
	radius: number,
	ratio: number,
	minDistance: number,
	maxDistance: number,
	speedFloor: number = DOLLY_SPEED_FLOOR
): { radius: number; push: number } {
	if (!(ratio > 0) || ratio === 1) return { radius, push: 0 };
	const step = Math.max(radius, speedFloor) * Math.abs(1 - ratio);
	if (ratio > 1) return { radius: Math.min(maxDistance, radius + step), push: 0 };
	const newRadius = Math.max(minDistance, radius - step);
	const push = step - Math.max(0, radius - newRadius);
	return { radius: newRadius, push: push > 0 ? push : 0 };
}

const _forward = new THREE.Vector3();

export class DollyThroughOrbitControls extends OrbitControls {
	/** Set false to restore the stock (stalling) multiplicative dolly. */
	dollyThrough = true;

	constructor(object: THREE.Camera, domElement?: HTMLElement | null) {
		super(object, domElement);
	}

	_dollyIn(dollyScale: number): void {
		if (!this._applyDollyThrough(dollyScale)) super._dollyIn(dollyScale);
	}

	_dollyOut(dollyScale: number): void {
		if (!this._applyDollyThrough(1 / dollyScale)) super._dollyOut(dollyScale);
	}

	/** Apply a radius multiplier `ratio` with dolly-through. Returns false to fall back to the stock path. */
	private _applyDollyThrough(ratio: number): boolean {
		const self = this as any;
		if (!this.dollyThrough || !self.object?.isPerspectiveCamera || self.zoomToCursor) return false;
		// Radius as of the next update(): current distance times the scale already queued this frame.
		const current = self.object.position.distanceTo(self.target);
		const radius = current * self._scale;
		if (!(radius > 0)) return false;
		const { radius: next, push } = dollyThroughStep(radius, ratio, self.minDistance, self.maxDistance);
		self._scale *= next / radius;
		if (push > 0) {
			_forward.subVectors(self.target, self.object.position).normalize();
			self.target.addScaledVector(_forward, push);
			self.object.position.addScaledVector(_forward, push);
		}
		return true;
	}
}
