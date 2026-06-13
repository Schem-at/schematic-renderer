import * as THREE from "three";
import { SchematicRenderer } from "../SchematicRenderer";
import { SchematicWrapper, initializeNucleationWasm } from "../nucleationExports";

/**
 * DiffViewer shows the difference between two schematics on the REAL textured
 * build, not abstract cubes: it renders the "after" schematic with full block
 * textures via an internal SchematicRenderer, then lays a translucent colour
 * tint over the blocks that changed (added / removed / changed / swapped) and
 * lets you peel the build open with clipping planes to reach edits buried inside.
 *
 * Two viewing modes:
 *   - "cutaway": textured build + tint overlay + single-plane / two-plane-slab
 *     clipping to expose the interior.
 *   - "beforeafter": fade the tint between the before state (removed highlighted)
 *     and the after state (added highlighted) on the same camera.
 *
 * Construct one per canvas; pass a resource pack so the internal renderer can
 * texture blocks. Call dispose() when done.
 */

export type DiffState = "added" | "removed" | "changed" | "swapped" | "unchanged";
export type DiffMode = "single" | "slab";
/** Top-level viewing mode: peel the textured build open, or crossfade the tint. */
export type DiffViewMode = "cutaway" | "beforeafter";

export interface DiffStats {
	distance: number;
	support: number;
	added: number;
	removed: number;
	changed: number;
	swapped: number;
	unchanged: number;
	/** True when the overlay exceeded maxOverlay and some highlights were dropped. */
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
	/** Resource packs for the internal renderer, e.g. { vanilla: () => fetch(...).then(r => r.blob()) }. */
	resourcePacks?: Record<string, () => Promise<Blob>>;
	/** Optional HDRI environment URL passed to the internal renderer. */
	hdri?: string;
	/** Opacity of the change tint laid over textured blocks (0..1). Default 0.55. */
	tintOpacity?: number;
	/** Auto-orbit until the user interacts. Default true. */
	autoRotate?: boolean;
	/** Hard cap on tint-overlay cubes. Default 200_000. */
	maxOverlay?: number;
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

// Air-like / non-solid blocks that are never tinted.
const INVISIBLE = new Set([
	"minecraft:air",
	"minecraft:cave_air",
	"minecraft:void_air",
	"minecraft:structure_void",
]);

// States that get a tint overlay (unchanged stays plain textured).
const OVERLAY_STATES: DiffState[] = ["removed", "swapped", "changed", "added"];

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
	private colors: DiffViewerColors;
	private tintOpacity: number;
	private maxOverlay: number;
	private onStats?: (stats: DiffStats) => void;

	private renderer: SchematicRenderer;
	private ready: Promise<void>;
	private disposed = false;

	private geometry = new THREE.BoxGeometry(1.001, 1.001, 1.001);
	private overlayMeshes = new Map<DiffState, THREE.InstancedMesh>();
	private overlayMaterials = new Map<DiffState, THREE.MeshBasicMaterial>();

	// Clipping (world space)
	private planeLo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	private planeHi = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
	private mode: DiffMode = "slab";
	private tiltRad = 0;
	private cutFrac = 0.62;
	private posFrac = 0.5;
	private thickFrac = 0.38;
	private dimUnchanged = true;
	private viewMode: DiffViewMode = "cutaway";
	private progress = 1;

	private worldBox = new THREE.Box3();
	private baseGroup: THREE.Group | null = null;

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
		this.colors = { ...DEFAULT_COLORS, ...(options.colors ?? {}) };
		this.tintOpacity = options.tintOpacity ?? 0.55;
		this.maxOverlay = options.maxOverlay ?? 200_000;
		this.onStats = options.onStats;

		// The renderer's defaultResourcePacks is a map of name -> loader callback.
		const defaultPacks: Record<string, () => Promise<Blob>> = {
			...(options.resourcePacks ?? {}),
		};

		let resolveReady!: () => void;
		this.ready = new Promise<void>((res) => (resolveReady = res));

		this.renderer = new SchematicRenderer(canvas, {}, defaultPacks, {
			hdri: options.hdri,
			gamma: 0.45,
			singleSchematicMode: true,
			enableInteraction: false,
			enableDragAndDrop: false,
			enableGizmos: false,
			showGrid: false,
			cameraOptions: { enableZoomInOnLoad: true },
			postProcessingOptions: { enabled: true },
			sidebarOptions: { enabled: false },
			callbacks: {
				onRendererInitialized: () => {
					this.afterInit();
					options.onReady?.();
					resolveReady();
				},
			},
		} as any);
	}

	private afterInit(): void {
		// Real WebGL clipping needs to be switched on at the renderer level.
		const gl = this.renderer.renderManager?.renderer;
		if (gl && "localClippingEnabled" in gl) {
			(gl as THREE.WebGLRenderer).localClippingEnabled = true;
		}
		const controls = (this.renderer.cameraManager as any)?.controls;
		if (controls) {
			controls.autoRotate = true;
			controls.autoRotateSpeed = 1.0;
			controls.addEventListener?.("start", () => {
				controls.autoRotate = false;
			});
		}
	}

	/** Render the textured "after" build and tint the blocks that changed. */
	async loadDiff(
		beforeBytes: Uint8Array,
		afterBytes: Uint8Array,
		preset = "exact"
	): Promise<DiffStats> {
		await ensureWasm();
		await this.ready;
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

		// Classify every solid block in "after".
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

		const distance = Number((diff as any).distance ?? 0);
		const support = Number((diff as any).support ?? 0);

		// Render the textured after build, then keep a clone of its wrapper alive
		// for the renderer (loadSchematic consumes it). Free our local diff wrappers.
		await this.renderer.schematicManager?.removeAllSchematics?.();
		const afterForRender = new SchematicWrapper();
		afterForRender.from_data(afterBytes);
		await this.renderer.schematicManager?.loadSchematic("after", afterForRender);

		const obj = this.renderer.schematicManager?.schematics?.get("after") as any;
		this.baseGroup = obj?.group ?? null;
		if (obj?.getMeshes) {
			try {
				await obj.getMeshes();
			} catch {
				/* meshes may already be ready */
			}
		}

		this.buildOverlay(byState);
		this.recomputeWorldBox();
		this.updateClipping();
		this.refreshOpacities();
		this.renderer.cameraManager?.focusOnSchematics?.({ animationDuration: 0 });

		[before, after, diff].forEach((w) => {
			try {
				(w as any).free?.();
			} catch {
				/* ignore */
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
		this.onStats?.(this.stats);
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

	/** Build translucent tint cubes per change-state, parented to the build group. */
	private buildOverlay(byState: Record<DiffState, Voxel[]>): void {
		this.disposeOverlay();
		if (!this.baseGroup) return;

		// Cap overlay size; trim the largest buckets first if needed.
		this.stats.truncated = false;
		let total = OVERLAY_STATES.reduce((n, s) => n + byState[s].length, 0);
		if (total > this.maxOverlay) {
			for (const s of OVERLAY_STATES) {
				if (total <= this.maxOverlay) break;
				const over = total - this.maxOverlay;
				if (byState[s].length > 0) {
					const drop = Math.min(over, byState[s].length);
					byState[s] = byState[s].slice(0, byState[s].length - drop);
					total -= drop;
					this.stats.truncated = true;
				}
			}
		}

		const dummy = new THREE.Object3D();
		for (const state of OVERLAY_STATES) {
			const list = byState[state];
			if (list.length === 0) continue;

			const material = new THREE.MeshBasicMaterial({
				color: new THREE.Color(this.colors[state]),
				transparent: true,
				opacity: this.tintOpacity,
				depthWrite: false,
				clippingPlanes: this.activePlanes(),
				clipIntersection: false,
			});

			const mesh = new THREE.InstancedMesh(this.geometry, material, list.length);
			mesh.frustumCulled = false;
			mesh.renderOrder = 2;
			for (let i = 0; i < list.length; i++) {
				const v = list[i];
				dummy.position.set(v.x + 0.5, v.y + 0.5, v.z + 0.5);
				dummy.updateMatrix();
				mesh.setMatrixAt(i, dummy.matrix);
			}
			mesh.instanceMatrix.needsUpdate = true;

			this.overlayMaterials.set(state, material);
			this.overlayMeshes.set(state, mesh);
			this.baseGroup.add(mesh);
		}
	}

	private activePlanes(): THREE.Plane[] {
		if (this.viewMode === "beforeafter") return [];
		return this.mode === "single" ? [this.planeLo] : [this.planeLo, this.planeHi];
	}

	private recomputeWorldBox(): void {
		if (this.baseGroup) {
			this.worldBox.setFromObject(this.baseGroup);
		} else {
			this.worldBox.set(new THREE.Vector3(-8, -8, -8), new THREE.Vector3(8, 8, 8));
		}
	}

	/** Recompute clip planes (world space) and apply to block + overlay materials. */
	private updateClipping(): void {
		const planes = this.activePlanes();

		if (this.viewMode !== "beforeafter") {
			const n = new THREE.Vector3(Math.sin(this.tiltRad), Math.cos(this.tiltRad), 0).normalize();
			const center = this.worldBox.getCenter(new THREE.Vector3());
			const size = this.worldBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);

			// Slice extent: project box half-extents onto n around the world center.
			let span = 0;
			for (let sx = -1; sx <= 1; sx += 2)
				for (let sy = -1; sy <= 1; sy += 2)
					for (let sz = -1; sz <= 1; sz += 2)
						span = Math.max(
							span,
							Math.abs(n.x * size.x * sx + n.y * size.y * sy + n.z * size.z * sz)
						);
			const cAtCenter = n.dot(center);
			const lo = cAtCenter - span - 0.6;
			const hi = cAtCenter + span + 0.6;
			const full = hi - lo;

			if (this.mode === "single") {
				const cut = hi - this.cutFrac * full;
				this.planeLo.normal.copy(n).multiplyScalar(-1);
				this.planeLo.constant = cut;
			} else {
				const cen = lo + this.posFrac * full;
				const half = this.thickFrac * full * 0.5;
				this.planeLo.normal.copy(n);
				this.planeLo.constant = -(cen - half);
				this.planeHi.normal.copy(n).multiplyScalar(-1);
				this.planeHi.constant = cen + half;
			}
		}

		// Block (textured) materials live in the renderer's materialMap.
		const map = (this.renderer as any).materialMap as Map<string, THREE.Material> | undefined;
		map?.forEach((m) => {
			(m as any).clippingPlanes = planes;
			(m as any).clipIntersection = false;
			m.needsUpdate = true;
		});
		for (const m of this.overlayMaterials.values()) {
			m.clippingPlanes = planes;
			m.needsUpdate = true;
		}
	}

	/** Apply view-mode + dim + progress to overlay/base opacity. */
	private refreshOpacities(): void {
		// Dim the textured base so tints pop (cutaway only).
		const obj = this.renderer.schematicManager?.schematics?.get("after") as any;
		const baseOpacity = this.viewMode === "cutaway" && this.dimUnchanged ? 0.6 : 1.0;
		if (obj) {
			try {
				obj.opacity = baseOpacity;
				obj.setOpacity?.(baseOpacity);
			} catch {
				/* ignore */
			}
		}

		const t = this.progress;
		for (const state of OVERLAY_STATES) {
			const mesh = this.overlayMeshes.get(state);
			const mat = this.overlayMaterials.get(state);
			if (!mesh || !mat) continue;
			if (this.viewMode === "beforeafter") {
				if (state === "removed") {
					mat.opacity = this.tintOpacity * (1 - t);
					mesh.visible = t < 0.999;
				} else if (state === "added") {
					mat.opacity = this.tintOpacity * t;
					mesh.visible = t > 0.001;
				} else {
					mat.opacity = this.tintOpacity;
				}
			} else {
				mat.opacity = this.tintOpacity;
			}
			mat.needsUpdate = true;
		}
	}

	// ------------------------------------------------------------------ API

	setMode(mode: DiffMode): void {
		this.mode = mode;
		this.updateClipping();
	}

	setViewMode(mode: DiffViewMode): void {
		this.viewMode = mode;
		this.updateClipping();
		this.refreshOpacities();
	}

	setProgress(t: number): void {
		this.progress = Math.max(0, Math.min(1, t));
		this.refreshOpacities();
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
		const mesh = this.overlayMeshes.get(state);
		if (mesh) mesh.visible = visible;
		// "unchanged" toggles the textured base build.
		if (state === "unchanged") {
			const obj = this.renderer.schematicManager?.schematics?.get("after") as any;
			if (obj?.group) obj.group.visible = visible;
		}
	}

	setDimUnchanged(dim: boolean): void {
		this.dimUnchanged = dim;
		this.refreshOpacities();
	}

	resetView(): void {
		this.mode = "slab";
		this.viewMode = "cutaway";
		this.progress = 1;
		this.tiltRad = 0;
		this.cutFrac = 0.62;
		this.posFrac = 0.5;
		this.thickFrac = 0.38;
		this.updateClipping();
		this.refreshOpacities();
		this.renderer.cameraManager?.focusOnSchematics?.({ animationDuration: 0 });
	}

	getStats(): DiffStats {
		return { ...this.stats };
	}

	private disposeOverlay(): void {
		for (const mesh of this.overlayMeshes.values()) {
			mesh.parent?.remove(mesh);
			mesh.dispose();
		}
		for (const mat of this.overlayMaterials.values()) {
			mat.dispose();
		}
		this.overlayMeshes.clear();
		this.overlayMaterials.clear();
	}

	dispose(): void {
		this.disposed = true;
		this.disposeOverlay();
		this.geometry.dispose();
		try {
			(this.renderer as any).dispose?.();
		} catch {
			/* ignore */
		}
	}
}
