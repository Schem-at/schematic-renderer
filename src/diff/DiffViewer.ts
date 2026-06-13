import * as THREE from "three";
// @ts-ignore - three ships these addons without type decls under bundler resolution
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { SchematicWrapper, initializeNucleationWasm } from "../nucleationExports";

/**
 * DiffViewer renders the difference between two schematics as a single,
 * colour-coded voxel model you can peel open to see buried changes.
 *
 * Every block is classified into one of five states (added, removed, changed,
 * swapped, unchanged) and drawn as a flat-coloured cube via one InstancedMesh
 * per state. Two cutting modes expose the interior:
 *
 *   - "single": one tilted clipping plane sweeps the build away from a depth.
 *   - "slab":   two parallel planes keep only a slab of the build.
 *
 * Unlike the textured block renderer this is a deliberately abstract view: the
 * colour encodes the change, not the material, so edits read at a glance.
 *
 * It owns its own Three.js scene/camera/renderer/controls and is independent of
 * SchematicRenderer; construct one per canvas and call dispose() when done.
 */

export type DiffState = "added" | "removed" | "changed" | "swapped" | "unchanged";
export type DiffMode = "single" | "slab";
/** Top-level viewing mode: peel the merged diff open, or crossfade before -> after. */
export type DiffViewMode = "cutaway" | "beforeafter";

export interface DiffStats {
	distance: number;
	support: number;
	added: number;
	removed: number;
	changed: number;
	swapped: number;
	unchanged: number;
	/** True when the model exceeded maxVoxels and unchanged blocks were dropped. */
	truncated: boolean;
}

export interface DiffViewerColors {
	added: string;
	removed: string;
	changed: string;
	swapped: string;
	unchanged: string;
}

export interface DiffViewerOptions {
	colors?: Partial<DiffViewerColors>;
	/** Background clear colour, or null/transparent for a see-through canvas. */
	background?: string | null;
	/** Auto-orbit until the user interacts. Default true. */
	autoRotate?: boolean;
	/** Hard cap on rendered voxels; unchanged blocks are dropped first. Default 250_000. */
	maxVoxels?: number;
	onStats?: (stats: DiffStats) => void;
	onReady?: () => void;
}

const DEFAULT_COLORS: DiffViewerColors = {
	added: "#5aa12a",
	removed: "#d8453f",
	changed: "#e0992a",
	swapped: "#3f7fbf",
	unchanged: "#8b8e95",
};

// Air-like / non-solid blocks that should never be drawn as a voxel.
const INVISIBLE = new Set([
	"minecraft:air",
	"minecraft:cave_air",
	"minecraft:void_air",
	"minecraft:structure_void",
]);

const ORDER: DiffState[] = ["unchanged", "removed", "swapped", "changed", "added"];

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
	if (!wasmReady) {
		wasmReady = initializeNucleationWasm().then(() => undefined);
	}
	return wasmReady;
}

interface Voxel {
	x: number;
	y: number;
	z: number;
}

export class DiffViewer {
	private canvas: HTMLCanvasElement;
	private opts: Required<Omit<DiffViewerOptions, "colors" | "onStats" | "onReady">> & {
		colors: DiffViewerColors;
		onStats?: (stats: DiffStats) => void;
		onReady?: () => void;
	};

	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private controls: OrbitControls;
	private group: THREE.Group;
	private resizeObserver?: ResizeObserver;
	private rafId = 0;
	private disposed = false;

	private meshes = new Map<DiffState, THREE.InstancedMesh>();
	private materials = new Map<DiffState, THREE.MeshStandardMaterial>();
	private geometry: THREE.BoxGeometry;

	// Clipping
	private planeLo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	private planeHi = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
	private mode: DiffMode = "slab";
	private tiltRad = 0;
	private cutFrac = 0.62;
	private posFrac = 0.5;
	private thickFrac = 0.38;
	private dimUnchanged = true;

	// Before/after morph
	private viewMode: DiffViewMode = "cutaway";
	private progress = 1; // 0 = before, 1 = after

	// Model framing
	private center = new THREE.Vector3();
	private bboxMin = new THREE.Vector3();
	private bboxMax = new THREE.Vector3();
	private modelRadius = 8;

	private stats: DiffStats = {
		distance: 0,
		support: 0,
		added: 0,
		removed: 0,
		changed: 0,
		swapped: 0,
		unchanged: 0,
		truncated: false,
	};

	constructor(canvas: HTMLCanvasElement, options: DiffViewerOptions = {}) {
		this.canvas = canvas;
		this.opts = {
			background: options.background ?? null,
			autoRotate: options.autoRotate ?? true,
			maxVoxels: options.maxVoxels ?? 250_000,
			colors: { ...DEFAULT_COLORS, ...(options.colors ?? {}) },
			onStats: options.onStats,
			onReady: options.onReady,
		};

		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: this.opts.background === null,
			preserveDrawingBuffer: true,
		});
		this.renderer.localClippingEnabled = true;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

		this.scene = new THREE.Scene();
		if (this.opts.background !== null) {
			this.scene.background = new THREE.Color(this.opts.background);
		}

		this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000);
		this.camera.position.set(24, 20, 24);

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;
		this.controls.autoRotate = this.opts.autoRotate;
		this.controls.autoRotateSpeed = 1.0;
		this.controls.addEventListener("start", () => {
			this.controls.autoRotate = false;
		});

		// Lighting: soft ambient + a key light so cube faces read distinctly.
		this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
		const key = new THREE.DirectionalLight(0xffffff, 1.1);
		key.position.set(0.45, 0.82, 0.36);
		this.scene.add(key);
		const fill = new THREE.DirectionalLight(0xffffff, 0.35);
		fill.position.set(-0.5, 0.4, -0.6);
		this.scene.add(fill);

		this.group = new THREE.Group();
		this.scene.add(this.group);

		this.geometry = new THREE.BoxGeometry(1, 1, 1);

		this.resize();
		if (typeof ResizeObserver !== "undefined") {
			this.resizeObserver = new ResizeObserver(() => this.resize());
			this.resizeObserver.observe(canvas);
		}

		this.animate();
		this.opts.onReady?.();
	}

	/** Compute the diff between two schematics and (re)build the voxel scene. */
	async loadDiff(
		beforeBytes: Uint8Array,
		afterBytes: Uint8Array,
		preset = "exact"
	): Promise<DiffStats> {
		await ensureWasm();
		if (this.disposed) return this.stats;

		const before = new SchematicWrapper();
		before.from_data(beforeBytes);
		const after = new SchematicWrapper();
		after.from_data(afterBytes);

		const diff = (before as any).diff(after, preset, {});

		const addedSet = this.positionSet(diff.added());
		const changedSet = this.positionSet(diff.changed());
		const swappedSet = this.positionSet(diff.swapped());
		const removedVox = this.voxels(diff.removed());

		// Classify every solid block in "after" by which change bucket it falls in.
		const byState: Record<DiffState, Voxel[]> = {
			added: [],
			removed: removedVox,
			changed: [],
			swapped: [],
			unchanged: [],
		};

		const afterPalette = after.get_palette();
		for (const entry of after.blocks_indices()) {
			const x = entry[0];
			const y = entry[1];
			const z = entry[2];
			const name = this.paletteName(afterPalette, entry[3]);
			if (name === null || INVISIBLE.has(name)) continue;
			const key = x + "," + y + "," + z;
			if (addedSet.has(key)) byState.added.push({ x, y, z });
			else if (changedSet.has(key)) byState.changed.push({ x, y, z });
			else if (swappedSet.has(key)) byState.swapped.push({ x, y, z });
			else byState.unchanged.push({ x, y, z });
		}

		this.buildMeshes(byState);
		this.frameCamera();

		// Read scalar stats off the diff BEFORE freeing it - the getters call into
		// WASM, so touching them post-free throws "null pointer passed to rust".
		const distance = Number((diff as any).distance ?? 0);
		const support = Number((diff as any).support ?? 0);

		// Free WASM wrappers we no longer need.
		[before, after, diff].forEach((w) => {
			try {
				(w as any).free?.();
			} catch {
				/* ignore double-free */
			}
		});

		this.stats = {
			distance,
			support,
			added: byState.added.length,
			removed: byState.removed.length,
			changed: byState.changed.length,
			swapped: byState.swapped.length,
			unchanged: byState.unchanged.length,
			truncated: this.stats.truncated,
		};
		this.opts.onStats?.(this.stats);
		return this.stats;
	}

	private positionSet(wrapper: SchematicWrapper): Set<string> {
		const set = new Set<string>();
		const palette = wrapper.get_palette();
		for (const entry of wrapper.blocks_indices()) {
			const name = this.paletteName(palette, entry[3]);
			if (name === null || INVISIBLE.has(name)) continue;
			set.add(entry[0] + "," + entry[1] + "," + entry[2]);
		}
		try {
			(wrapper as any).free?.();
		} catch {
			/* ignore */
		}
		return set;
	}

	private voxels(wrapper: SchematicWrapper): Voxel[] {
		const out: Voxel[] = [];
		const palette = wrapper.get_palette();
		for (const entry of wrapper.blocks_indices()) {
			const name = this.paletteName(palette, entry[3]);
			if (name === null || INVISIBLE.has(name)) continue;
			out.push({ x: entry[0], y: entry[1], z: entry[2] });
		}
		try {
			(wrapper as any).free?.();
		} catch {
			/* ignore */
		}
		return out;
	}

	private paletteName(palette: any, index: number): string | null {
		const entry = Array.isArray(palette) ? palette[index] : palette?.[index];
		if (!entry) return null;
		if (typeof entry === "string") return entry;
		return entry.name ?? null;
	}

	private buildMeshes(byState: Record<DiffState, Voxel[]>): void {
		this.disposeMeshes();

		// Establish the bounding box over every voxel we might draw.
		const min = new THREE.Vector3(Infinity, Infinity, Infinity);
		const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
		let total = 0;
		for (const state of ORDER) {
			for (const v of byState[state]) {
				min.min(new THREE.Vector3(v.x, v.y, v.z));
				max.max(new THREE.Vector3(v.x + 1, v.y + 1, v.z + 1));
				total++;
			}
		}
		if (total === 0) {
			min.set(0, 0, 0);
			max.set(1, 1, 1);
		}
		this.bboxMin.copy(min);
		this.bboxMax.copy(max);
		this.center.copy(min).add(max).multiplyScalar(0.5);
		this.modelRadius = Math.max(4, min.distanceTo(max) * 0.5);

		// Enforce the voxel cap by dropping unchanged blocks first.
		this.stats.truncated = false;
		const cap = this.opts.maxVoxels;
		if (total > cap) {
			const changedTotal =
				byState.added.length +
				byState.removed.length +
				byState.changed.length +
				byState.swapped.length;
			const room = Math.max(0, cap - changedTotal);
			if (byState.unchanged.length > room) {
				byState.unchanged = byState.unchanged.slice(0, room);
				this.stats.truncated = true;
			}
		}

		const dummy = new THREE.Object3D();
		for (const state of ORDER) {
			const list = byState[state];
			if (list.length === 0) continue;

			const material = new THREE.MeshStandardMaterial({
				color: new THREE.Color(this.opts.colors[state]),
				roughness: 0.95,
				metalness: 0.0,
				clippingPlanes: this.activePlanes(),
				clipIntersection: false,
			});
			this.applyStateOpacity(state, material);

			const mesh = new THREE.InstancedMesh(this.geometry, material, list.length);
			mesh.frustumCulled = false;
			for (let i = 0; i < list.length; i++) {
				const v = list[i];
				dummy.position.set(
					v.x + 0.5 - this.center.x,
					v.y + 0.5 - this.center.y,
					v.z + 0.5 - this.center.z
				);
				dummy.updateMatrix();
				mesh.setMatrixAt(i, dummy.matrix);
			}
			mesh.instanceMatrix.needsUpdate = true;

			this.materials.set(state, material);
			this.meshes.set(state, mesh);
			this.group.add(mesh);
		}

		this.updateClipping();
		this.refreshOpacities();
	}

	private applyStateOpacity(state: DiffState, material: THREE.MeshStandardMaterial): void {
		if (state === "removed") {
			material.transparent = true;
			material.opacity = 0.5;
		} else if (state === "unchanged") {
			material.transparent = this.dimUnchanged;
			material.opacity = this.dimUnchanged ? 0.32 : 1.0;
		} else {
			material.transparent = false;
			material.opacity = 1.0;
		}
		material.needsUpdate = true;
	}

	private activePlanes(): THREE.Plane[] {
		return this.mode === "single" ? [this.planeLo] : [this.planeLo, this.planeHi];
	}

	/** Recompute clip-plane normals/offsets from the current mode + slider state. */
	private updateClipping(): void {
		// Before/after mode shows the whole model (no peel); clear any clip planes.
		if (this.viewMode === "beforeafter") {
			for (const material of this.materials.values()) {
				material.clippingPlanes = [];
				material.needsUpdate = true;
			}
			return;
		}

		// Slicing normal: horizontal plane tilted toward +X by tiltRad.
		const n = new THREE.Vector3(Math.sin(this.tiltRad), Math.cos(this.tiltRad), 0).normalize();

		// Project the (centered) bounding-box corners onto n to get the slice extent.
		const half = new THREE.Vector3().copy(this.bboxMax).sub(this.bboxMin).multiplyScalar(0.5);
		let lo = Infinity;
		let hi = -Infinity;
		for (let sx = -1; sx <= 1; sx += 2) {
			for (let sy = -1; sy <= 1; sy += 2) {
				for (let sz = -1; sz <= 1; sz += 2) {
					const d = n.x * half.x * sx + n.y * half.y * sy + n.z * half.z * sz;
					lo = Math.min(lo, d);
					hi = Math.max(hi, d);
				}
			}
		}
		const pad = 0.6;
		lo -= pad;
		hi += pad;
		const span = hi - lo;

		if (this.mode === "single") {
			// Keep the half-space below the cut: normal -n, fragment kept when
			// dot(p,-n)+c >= 0  =>  dot(p,n) <= c. Sweep c from hi (all) to lo.
			const cut = hi - this.cutFrac * span;
			this.planeLo.normal.copy(n).multiplyScalar(-1);
			this.planeLo.constant = cut;
		} else {
			const cen = lo + this.posFrac * span;
			const halfThick = this.thickFrac * span * 0.5;
			const cLo = cen - halfThick;
			const cHi = cen + halfThick;
			// Keep dot(p,n) >= cLo : normal +n, constant -cLo.
			this.planeLo.normal.copy(n);
			this.planeLo.constant = -cLo;
			// Keep dot(p,n) <= cHi : normal -n, constant cHi.
			this.planeHi.normal.copy(n).multiplyScalar(-1);
			this.planeHi.constant = cHi;
		}

		const planes = this.activePlanes();
		for (const material of this.materials.values()) {
			material.clippingPlanes = planes;
			material.needsUpdate = true;
		}
	}

	private frameCamera(): void {
		const dist = this.modelRadius * 2.6;
		this.camera.position.set(dist, dist * 0.85, dist);
		this.camera.near = Math.max(0.1, this.modelRadius * 0.02);
		this.camera.far = this.modelRadius * 40;
		this.camera.updateProjectionMatrix();
		this.controls.target.set(0, 0, 0);
		this.controls.update();
	}

	// ------------------------------------------------------------------ API

	setMode(mode: DiffMode): void {
		this.mode = mode;
		this.updateClipping();
	}

	/** Switch between the cutaway/peel view and the before -> after crossfade. */
	setViewMode(mode: DiffViewMode): void {
		this.viewMode = mode;
		this.updateClipping();
		this.refreshOpacities();
	}

	/**
	 * Before/after position: 0 shows the "before" state (unchanged + changed +
	 * swapped + removed), 1 shows "after" (unchanged + changed + swapped + added).
	 * Removed blocks fade out and added blocks fade in across the slide; only
	 * meaningful in beforeafter view mode.
	 */
	setProgress(t: number): void {
		this.progress = Math.max(0, Math.min(1, t));
		this.refreshOpacities();
	}

	/** Re-apply per-state opacity/visibility for the current view mode + progress. */
	private refreshOpacities(): void {
		for (const [state, material] of this.materials.entries()) {
			this.applyStateOpacity(state, material);
		}
		if (this.viewMode === "beforeafter") {
			const t = this.progress;
			const removed = this.meshes.get("removed");
			const removedMat = this.materials.get("removed");
			if (removed && removedMat) {
				removed.visible = t < 0.999;
				removedMat.transparent = true;
				removedMat.opacity = 0.9 * (1 - t);
				removedMat.needsUpdate = true;
			}
			const added = this.meshes.get("added");
			const addedMat = this.materials.get("added");
			if (added && addedMat) {
				added.visible = t > 0.001;
				addedMat.transparent = t < 0.999;
				addedMat.opacity = t;
				addedMat.needsUpdate = true;
			}
		} else {
			// Cutaway: respect the legend toggles; opacity already reset above.
			const removed = this.meshes.get("removed");
			if (removed) removed.visible = true;
			const added = this.meshes.get("added");
			if (added) added.visible = true;
		}
	}

	setTilt(degrees: number): void {
		this.tiltRad = (degrees * Math.PI) / 180;
		this.updateClipping();
	}

	setCut(fraction: number): void {
		this.cutFrac = Math.max(0, Math.min(1, fraction));
		this.updateClipping();
	}

	setSlab(posFraction: number, thicknessFraction: number): void {
		this.posFrac = Math.max(0, Math.min(1, posFraction));
		this.thickFrac = Math.max(0.02, Math.min(1, thicknessFraction));
		this.updateClipping();
	}

	setStateVisible(state: DiffState, visible: boolean): void {
		const mesh = this.meshes.get(state);
		if (mesh) mesh.visible = visible;
	}

	setDimUnchanged(dim: boolean): void {
		this.dimUnchanged = dim;
		const material = this.materials.get("unchanged");
		if (material) this.applyStateOpacity("unchanged", material);
	}

	resetView(): void {
		this.mode = "slab";
		this.viewMode = "cutaway";
		this.progress = 1;
		this.tiltRad = 0;
		this.cutFrac = 0.62;
		this.posFrac = 0.5;
		this.thickFrac = 0.38;
		this.controls.autoRotate = this.opts.autoRotate;
		this.frameCamera();
		this.updateClipping();
		this.refreshOpacities();
	}

	getStats(): DiffStats {
		return { ...this.stats };
	}

	private resize(): void {
		const rect = this.canvas.getBoundingClientRect();
		const w = Math.max(1, rect.width);
		const h = Math.max(1, rect.height);
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
	}

	private animate = (): void => {
		if (this.disposed) return;
		this.rafId = requestAnimationFrame(this.animate);
		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	};

	private disposeMeshes(): void {
		for (const mesh of this.meshes.values()) {
			this.group.remove(mesh);
			mesh.dispose();
		}
		for (const material of this.materials.values()) {
			material.dispose();
		}
		this.meshes.clear();
		this.materials.clear();
	}

	dispose(): void {
		this.disposed = true;
		cancelAnimationFrame(this.rafId);
		this.resizeObserver?.disconnect();
		this.disposeMeshes();
		this.geometry.dispose();
		this.controls.dispose();
		this.renderer.dispose();
	}
}
