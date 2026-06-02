import { SchematicRenderer } from "../../../src/SchematicRenderer";
import { SchematicRendererContext } from "../../../src/SchematicRendererContext";
import { SchematicWrapper } from "nucleation";

// --- DOM helpers ---------------------------------------------------------
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const escapeHtml = (s: string) =>
	s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const presetSelect = byId<HTMLSelectElement>("preset-select");
const recomputeBtn = byId<HTMLButtonElement>("recompute-btn");
const errorEl = byId("error");

const setError = (msg: string) => {
	errorEl.textContent = msg;
};

// --- Resource pack (fetched once, shared by every renderer) --------------
let packPromise: Promise<Blob> | null = null;
const getPack = (): Promise<Blob> => {
	if (!packPromise) {
		packPromise = fetch("/pack.zip")
			.then((r) => r.arrayBuffer())
			.then((b) => new Blob([b], { type: "application/zip" }));
	}
	return packPromise;
};

// --- Renderer factory ----------------------------------------------------
interface Viewport {
	renderer: SchematicRenderer;
	ready: Promise<void>;
}

// One shared asset context for all six viewports: the resource pack is parsed and
// the texture atlas is built ONCE, then shared (instead of once per renderer).
let sharedContext: SchematicRendererContext;

function makeViewport(canvasId: string): Viewport {
	let resolveReady!: () => void;
	const ready = new Promise<void>((res) => (resolveReady = res));
	const renderer = new SchematicRenderer(
		byId<HTMLCanvasElement>(canvasId),
		{},
		{}, // packs are loaded once by the shared context, not per-renderer
		{
			context: sharedContext,
			cameraOptions: { enableZoomInOnLoad: true },
			gamma: 0.45,
			singleSchematicMode: true,
			enableDragAndDrop: false,
			// Post-processing must stay on: the gamma-correction pass lives in the
			// post pipeline, so disabling it renders washed-out, uncorrected color.
			postProcessingOptions: { enabled: true },
			hdri: "/minecraft_day.hdr",
			callbacks: { onRendererInitialized: () => resolveReady() },
		}
	);
	return { renderer, ready };
}

// Assigned in init() once the shared context is ready.
let beforeVp: Viewport;
let afterVp: Viewport;
let addedVp: Viewport;
let removedVp: Viewport;
let changedVp: Viewport;
let swappedVp: Viewport;

// Replace whatever a viewport is showing with `wrapper` (or clear it).
async function showSchematic(vp: Viewport, wrapper: SchematicWrapper | null, name: string) {
	await vp.ready;
	await vp.renderer.schematicManager?.removeAllSchematics();
	if (wrapper) {
		await vp.renderer.schematicManager?.loadSchematic(name, wrapper);
	}
}

// --- State ---------------------------------------------------------------
const state: {
	before: SchematicWrapper | null;
	after: SchematicWrapper | null;
	beforeName: string;
	afterName: string;
} = { before: null, after: null, beforeName: "", afterName: "" };

// --- Before / After panels ----------------------------------------------
function updateMeta(side: "before" | "after") {
	const wrapper = side === "before" ? state.before : state.after;
	const metaEl = byId(side === "before" ? "before-meta" : "after-meta");
	const name = side === "before" ? state.beforeName : state.afterName;
	if (!wrapper) {
		metaEl.style.display = "none";
		return;
	}
	const dims = wrapper.get_dimensions();
	const count = wrapper.get_block_count();
	let fp = "";
	try {
		fp = wrapper.fingerprint(presetSelect.value);
	} catch {
		fp = "(n/a)";
	}
	metaEl.style.display = "flex";
	metaEl.innerHTML =
		`<span>${escapeHtml(name)}</span>` +
		`<span>${dims[0]}×${dims[1]}×${dims[2]}</span>` +
		`<span>${count} blocks</span>` +
		`<span class="fp" title="${fp}">${fp.slice(0, 16)}…</span>`;
}

async function handleFile(side: "before" | "after", file: File) {
	setError("");
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const wrapper = new SchematicWrapper();
		wrapper.from_data(bytes);

		if (side === "before") {
			state.before = wrapper;
			state.beforeName = file.name;
			byId("before-hint").style.display = "none";
			await showSchematic(beforeVp, wrapper, file.name);
		} else {
			state.after = wrapper;
			state.afterName = file.name;
			byId("after-hint").style.display = "none";
			await showSchematic(afterVp, wrapper, file.name);
		}
		updateMeta(side);
		recomputeBtn.disabled = !(state.before && state.after);
		if (state.before && state.after) await runDiff();
	} catch (err) {
		setError(`Failed to load ${file.name}: ${err}`);
	}
}

function setupDropZone(panelId: string, side: "before" | "after") {
	const el = byId(panelId);
	el.addEventListener("dragover", (e) => {
		e.preventDefault();
		el.classList.add("dragover");
	});
	el.addEventListener("dragleave", () => el.classList.remove("dragover"));
	el.addEventListener("drop", (e) => {
		e.preventDefault();
		el.classList.remove("dragover");
		const file = e.dataTransfer?.files?.[0];
		if (file) void handleFile(side, file);
	});
}

// Build the shared context (pack + atlas once), then create the six viewports and
// wire up the drop zones.
async function init() {
	sharedContext = await SchematicRendererContext.create({ vanillaPack: () => getPack() }, {});

	beforeVp = makeViewport("before-canvas");
	afterVp = makeViewport("after-canvas");
	addedVp = makeViewport("added-canvas");
	removedVp = makeViewport("removed-canvas");
	changedVp = makeViewport("changed-canvas");
	swappedVp = makeViewport("swapped-canvas");

	setupDropZone("before-panel", "before");
	setupDropZone("after-panel", "after");
}

void init();

// --- Diff ----------------------------------------------------------------
async function renderDiffView(
	vp: Viewport,
	wrapper: SchematicWrapper,
	count: number,
	emptyId: string,
	name: string
) {
	const empty = byId(emptyId);
	if (count > 0) {
		empty.style.display = "none";
		await showSchematic(vp, wrapper, name);
	} else {
		empty.style.display = "flex";
		await showSchematic(vp, null, name);
	}
}

async function runDiff() {
	if (!state.before || !state.after) return;
	setError("");

	let diff;
	try {
		diff = state.before.diff(state.after, presetSelect.value, {});
	} catch (err) {
		setError(`diff failed: ${err}`);
		return;
	}

	const added = diff.added();
	const removed = diff.removed();
	const changed = diff.changed();
	const swapped = diff.swapped();
	const addedCount = added.get_block_count();
	const removedCount = removed.get_block_count();
	const changedCount = changed.get_block_count();
	const swappedCount = swapped.get_block_count();

	byId("stat-distance").textContent = String(diff.distance);
	byId("stat-support").textContent = `${(diff.support * 100).toFixed(1)}%`;
	byId("stat-added").textContent = String(addedCount);
	byId("stat-removed").textContent = String(removedCount);
	byId("stat-changed").textContent = String(changedCount);
	byId("stat-swapped").textContent = String(swappedCount);
	byId("added-count").textContent = String(addedCount);
	byId("removed-count").textContent = String(removedCount);
	byId("changed-count").textContent = String(changedCount);

	await renderDiffView(addedVp, added, addedCount, "added-empty", "added");
	await renderDiffView(removedVp, removed, removedCount, "removed-empty", "removed");
	await renderDiffView(changedVp, changed, changedCount, "changed-empty", "changed");
	await renderDiffView(swappedVp, swapped, swappedCount, "swapped-empty", "swapped");

	// DiffWrapper isn't held by any renderer — release its WASM memory.
	diff.free?.();
}

// Re-run when the preset changes (also refreshes per-panel fingerprints).
presetSelect.addEventListener("change", () => {
	if (state.before) updateMeta("before");
	if (state.after) updateMeta("after");
	if (state.before && state.after) void runDiff();
});
recomputeBtn.addEventListener("click", () => void runDiff());
