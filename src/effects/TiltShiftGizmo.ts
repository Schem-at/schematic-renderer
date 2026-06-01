// TiltShiftGizmo.ts — visual indicator of the tilt-shift focus plane.
//
// Shows three things in world space:
//   * A translucent plane at `focusPoint` oriented with `focusNormal` —
//     the sharp plane of focus.
//   * Two outline rectangles offset by ±`focusRange` along the normal — the
//     boundaries of the in-focus slab.
//   * A small sphere at the focus point to mark the anchor.
//
// The gizmo lives in the scene, so the tilt-shift effect blurs it just like
// any other geometry: the closer a slab edge is to the focus plane, the
// sharper it looks, which makes the falloff self-evident.

import * as THREE from "three";

export class TiltShiftGizmo {
	private group: THREE.Group;
	private plane: THREE.Mesh;
	private nearEdge: THREE.LineSegments;
	private farEdge: THREE.LineSegments;
	private center: THREE.Mesh;
	private parent: THREE.Object3D;
	private disposed = false;

	constructor(parent: THREE.Object3D, size = 20) {
		this.parent = parent;
		this.group = new THREE.Group();
		this.group.name = "tilt-shift-gizmo";
		this.group.renderOrder = 999; // late, but the effect still blurs it
		this.group.visible = false;

		const planeGeo = new THREE.PlaneGeometry(size, size);
		const planeMat = new THREE.MeshBasicMaterial({
			color: 0xffaa33,
			transparent: true,
			opacity: 0.18,
			side: THREE.DoubleSide,
			depthWrite: false,
		});
		this.plane = new THREE.Mesh(planeGeo, planeMat);
		this.group.add(this.plane);

		// Outline edges for the near and far focus-slab boundaries. Made of a
		// PlaneGeometry → EdgesGeometry so we get a clean rectangle wireframe.
		const edgeGeo = new THREE.EdgesGeometry(planeGeo);
		const edgeMat = new THREE.LineBasicMaterial({
			color: 0xff8800,
			transparent: true,
			opacity: 0.55,
			depthWrite: false,
		});
		this.nearEdge = new THREE.LineSegments(edgeGeo, edgeMat);
		this.farEdge = new THREE.LineSegments(edgeGeo, edgeMat);
		this.group.add(this.nearEdge);
		this.group.add(this.farEdge);

		const sphereGeo = new THREE.SphereGeometry(0.25, 16, 12);
		const sphereMat = new THREE.MeshBasicMaterial({
			color: 0xffaa33,
			depthWrite: false,
		});
		this.center = new THREE.Mesh(sphereGeo, sphereMat);
		this.group.add(this.center);

		parent.add(this.group);
	}

	/**
	 * Sync the gizmo to the current focus parameters.
	 * @param focusPoint world-space anchor of the focus plane
	 * @param focusNormal unit vector orienting the plane
	 * @param focusRange half-width of the in-focus slab (world units)
	 */
	update(focusPoint: THREE.Vector3, focusNormal: THREE.Vector3, focusRange: number): void {
		if (this.disposed) return;
		this.group.position.copy(focusPoint);

		// Rotate the planes so their local +Z aligns with the focus normal.
		// PlaneGeometry's default normal points along +Z.
		const q = new THREE.Quaternion().setFromUnitVectors(
			new THREE.Vector3(0, 0, 1),
			focusNormal.clone().normalize()
		);
		this.plane.quaternion.copy(q);
		this.nearEdge.quaternion.copy(q);
		this.farEdge.quaternion.copy(q);

		// Position the slab edges ±focusRange along the normal, in world units,
		// transformed back into the gizmo group's local frame (which sits at
		// focusPoint with no rotation).
		const offset = focusNormal.clone().normalize().multiplyScalar(focusRange);
		this.nearEdge.position.copy(offset).negate();
		this.farEdge.position.copy(offset);
	}

	setVisible(visible: boolean): void {
		this.group.visible = visible;
	}

	isVisible(): boolean {
		return this.group.visible;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.parent.remove(this.group);
		this.plane.geometry.dispose();
		(this.plane.material as THREE.Material).dispose();
		this.nearEdge.geometry.dispose();
		(this.nearEdge.material as THREE.Material).dispose();
		// farEdge shares geometry/material with nearEdge — already disposed.
		this.center.geometry.dispose();
		(this.center.material as THREE.Material).dispose();
	}
}
