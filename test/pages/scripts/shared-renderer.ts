import { SchematicRenderer } from "../../../src/SchematicRenderer";
import { SchematicRendererContext } from "../../../src/SchematicRendererContext";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const grid = byId("grid");
const badge = byId("badge");
const colsInput = byId<HTMLInputElement>("cols");
const rowsInput = byId<HTMLInputElement>("rows");
const applyBtn = byId<HTMLButtonElement>("apply");

// Resource pack fetched once and shared by the whole context.
let packPromise: Promise<Blob> | null = null;
const getPack = (): Promise<Blob> => {
	if (!packPromise) {
		packPromise = fetch("/pack.zip")
			.then((r) => r.arrayBuffer())
			.then((b) => new Blob([b], { type: "application/zip" }));
	}
	return packPromise;
};

let ctx: SchematicRendererContext;
interface Viewport {
	renderer: SchematicRenderer;
	ready: Promise<void>;
}
let viewports: Viewport[] = [];
let lastBuffer: ArrayBuffer | null = null;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// --- Mandelbrot-from-Julia-sets mapping ---------------------------------
// Each grid cell renders the Julia set for a constant c taken from the cell's
// position in the complex plane. c inside the Mandelbrot set → a connected
// (dense) Julia set; c outside → sparse "dust". Laid out on the grid, the dense
// cells trace the Mandelbrot set. This region frames the actual Mandelbrot.
const RE_MIN = -2.0;
const RE_MAX = 0.6;
const IM_MIN = -1.2;
const IM_MAX = 1.2;

const TILE = 24; // Julia footprint (TILE × TILE)
const MAX_IT = 32;
const MAX_H = 12; // tallest column (3D relief; height = escape count)
const JULIA_GRADIENT = [
	"minecraft:blue_concrete",
	"minecraft:cyan_concrete",
	"minecraft:light_blue_concrete",
	"minecraft:green_concrete",
	"minecraft:lime_concrete",
	"minecraft:yellow_concrete",
	"minecraft:orange_concrete",
	"minecraft:red_concrete",
	"minecraft:pink_concrete",
	"minecraft:magenta_concrete",
	"minecraft:purple_concrete",
];

/** Build a 3D colored Julia-set terrain for the constant c = (cRe, cIm): each
 * (x,z) cell's escape count sets its column height and color. */
async function makeJuliaTile(renderer: SchematicRenderer, name: string, cRe: number, cIm: number) {
	const schem = renderer.schematicManager?.createEmptySchematic(name);
	if (!schem) return;
	for (let px = 0; px < TILE; px++) {
		for (let pz = 0; pz < TILE; pz++) {
			let zx = (px / (TILE - 1)) * 3 - 1.5;
			let zy = (pz / (TILE - 1)) * 3 - 1.5;
			let it = 0;
			while (zx * zx + zy * zy <= 4 && it < MAX_IT) {
				const xt = zx * zx - zy * zy + cRe;
				zy = 2 * zx * zy + cIm;
				zx = xt;
				it++;
			}
			let block: string;
			let h: number;
			if (it >= MAX_IT) {
				block = "minecraft:black_concrete"; // inside the Julia set
				h = MAX_H;
			} else {
				const t = it / MAX_IT;
				block = JULIA_GRADIENT[Math.min(JULIA_GRADIENT.length - 1, Math.floor(t * JULIA_GRADIENT.length))];
				h = Math.max(1, Math.round(t * MAX_H));
			}
			for (let y = 0; y < h; y++) {
				schem.setBlockNoRebuild([px, y, pz], block);
			}
		}
	}
	await schem.rebuildMesh();
}

/** Reorient a viewport's camera to look exactly straight down. */
function setTopDown(renderer: SchematicRenderer) {
	const cm = renderer.cameraManager as any;
	if (!cm) return;
	const controls = cm.controls?.get(cm.activeControlKey);
	const cam = cm.activeCamera?.camera;
	if (!controls || !cam) return;
	const center = controls.target; // Vector3 set by focusOnSchematics
	const dist = cam.position.distanceTo(center) || 50;
	// The isometric preset clamps the orbit polar angle to [22.5°, 86°], which would
	// force the camera back up to a tilt. Open the clamp so straight-down is allowed.
	controls.minPolarAngle = 0;
	controls.maxPolarAngle = Math.PI;
	// Place the camera directly overhead. A minuscule horizontal offset (~0.1°) keeps
	// OrbitControls out of its exact-straight-down singularity while reading as a true
	// top-down view; offsetting one axis only keeps the square tile axis-aligned.
	const off = dist * 0.0015;
	cam.position.set(center.x, center.y + dist, center.z + off);
	cam.lookAt(center);
	controls.update();
}

/** Resize a viewport's canvas to its (changed) cell. Keeps the current camera —
 * `preserveCameraOnUpdate` means updateCanvasSize only fixes the aspect, so any
 * orbit the user did while expanded is preserved when it collapses.
 * Re-renders synchronously so the freshly-resized (and thus cleared) canvas is
 * re-blitted in the same JS turn — no blank frame / blink after the transition. */
function reframe(renderer: SchematicRenderer) {
	renderer.renderManager?.updateCanvasSize();
	renderer.renderManager?.render();
}

// --- Expand a single viewport with the View Transition API --------------
let expandedCell: HTMLElement | null = null;
let expandedRenderer: SchematicRenderer | null = null;

function withTransition(mutate: () => void): Promise<void> {
	const doc = document as any;
	if (typeof doc.startViewTransition !== "function") {
		mutate();
		return Promise.resolve();
	}
	return doc.startViewTransition(mutate).finished.catch(() => undefined);
}

async function expandCell(cell: HTMLElement, renderer: SchematicRenderer) {
	if (expandedCell) await collapseCell();
	cell.style.viewTransitionName = "zoom"; // morph this element between layouts
	// Resize + re-render INSIDE the mutation so the View Transition captures the
	// canvas already re-blitted at the new (large) size — crisp at both ends of the
	// morph, with no blank frame to blink.
	await withTransition(() => {
		cell.classList.add("expanded");
		reframe(renderer);
	});
	cell.style.viewTransitionName = "";
	expandedCell = cell;
	expandedRenderer = renderer;
	(cell.querySelector(".expand-btn") as HTMLElement).textContent = "✕";
}

async function collapseCell() {
	const cell = expandedCell;
	const renderer = expandedRenderer;
	if (!cell || !renderer) return;
	expandedCell = null;
	expandedRenderer = null;
	cell.style.viewTransitionName = "zoom";
	await withTransition(() => {
		cell.classList.remove("expanded");
		reframe(renderer);
	});
	cell.style.viewTransitionName = "";
	(cell.querySelector(".expand-btn") as HTMLElement).textContent = "⤢";
}

window.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && expandedCell) void collapseCell();
});

async function populate(vp: Viewport, i: number, cols: number, rows: number) {
	await vp.ready;
	await nextFrame(); // let the grid lay out so the aspect is correct before framing
	vp.renderer.renderManager?.updateCanvasSize();

	if (lastBuffer) {
		await vp.renderer.schematicManager?.loadSchematic("schematic", lastBuffer.slice(0));
	} else {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const cRe = RE_MIN + (cols > 1 ? col / (cols - 1) : 0.5) * (RE_MAX - RE_MIN);
		const cIm = IM_MAX - (rows > 1 ? row / (rows - 1) : 0.5) * (IM_MAX - IM_MIN); // row 0 = top = +im
		await makeJuliaTile(vp.renderer, `julia-${i}`, cRe, cIm);
	}

	await vp.renderer.cameraManager?.focusOnSchematics?.({ animationDuration: 0, useTightBounds: true, preserveCamera: false });
	setTopDown(vp.renderer);
	document.body.classList.add("has-schematic");
}

async function buildGrid(cols: number, rows: number) {
	for (const vp of viewports) {
		try {
			vp.renderer.dispose();
		} catch {
			/* ignore */
		}
	}
	viewports = [];
	grid.innerHTML = "";
	grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
	grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

	const n = cols * rows;
	for (let i = 0; i < n; i++) {
		const cell = document.createElement("div");
		cell.className = "cell";
		const canvas = document.createElement("canvas");
		const idx = document.createElement("span");
		idx.className = "idx";
		idx.textContent = String(i + 1);
		cell.append(canvas, idx);
		grid.appendChild(cell);

		let resolveReady!: () => void;
		const ready = new Promise<void>((res) => (resolveReady = res));
		const renderer = new SchematicRenderer(
			canvas,
			{},
			{}, // packs loaded once by the shared context
			{
				context: ctx, // shared assets + worker pool + GL renderer (blit)
				// Orthographic camera (via the isometric preset), reoriented straight
				// down per-view. preserveCameraOnUpdate stops the on-load auto-framing
				// from overriding our top-down camera; we frame explicitly instead.
				cameraOptions: {
					defaultCameraPreset: "isometric",
					useTightBounds: true,
					preserveCameraOnUpdate: true,
				},
				gamma: 0.45,
				singleSchematicMode: true,
				enableDragAndDrop: false,
				postProcessingOptions: { enabled: true },
				callbacks: { onRendererInitialized: () => resolveReady() },
			}
		);
		viewports.push({ renderer, ready });

		const btn = document.createElement("button");
		btn.className = "expand-btn";
		btn.textContent = "⤢";
		btn.title = "Expand / collapse";
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (cell.classList.contains("expanded")) void collapseCell();
			else void expandCell(cell, renderer);
		});
		cell.appendChild(btn);
	}

	badge.textContent = `WebGL contexts: 1 · viewports: ${n} (${cols}×${rows})`;

	await Promise.all(
		viewports.map((vp, i) =>
			populate(vp, i, cols, rows).catch((err) =>
				console.error("[shared-renderer] populate failed:", err)
			)
		)
	);
}

// Drop a schematic anywhere → fill every viewport with it (replacing the Julia sets).
window.addEventListener("dragover", (e) => {
	e.preventDefault();
	document.body.classList.add("dragover");
});
window.addEventListener("dragleave", () => document.body.classList.remove("dragover"));
window.addEventListener("drop", async (e) => {
	e.preventDefault();
	document.body.classList.remove("dragover");
	const file = e.dataTransfer?.files?.[0];
	if (!file) return;
	lastBuffer = await file.arrayBuffer();
	await Promise.all(
		viewports.map(async (vp) => {
			try {
				await vp.ready;
				vp.renderer.renderManager?.updateCanvasSize();
				await vp.renderer.schematicManager?.removeAllSchematics();
				await vp.renderer.schematicManager?.loadSchematic("schematic", lastBuffer!.slice(0));
				await vp.renderer.cameraManager?.focusOnSchematics?.({ animationDuration: 0, useTightBounds: true, preserveCamera: false });
				setTopDown(vp.renderer);
			} catch (err) {
				console.error("[shared-renderer] load failed:", err);
			}
		})
	);
});

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v || lo));
applyBtn.addEventListener("click", () => {
	lastBuffer = null; // re-show Julia sets at the new grid resolution
	void buildGrid(clamp(parseInt(colsInput.value, 10), 1, 24), clamp(parseInt(rowsInput.value, 10), 1, 24));
});

async function init() {
	// sharedRenderer: true → one WebGL context for every viewport (render-and-blit).
	ctx = await SchematicRendererContext.create(
		{ vanillaPack: () => getPack() },
		{ sharedRenderer: true }
	);
	await buildGrid(clamp(parseInt(colsInput.value, 10), 1, 24), clamp(parseInt(rowsInput.value, 10), 1, 24));
}

void init();
