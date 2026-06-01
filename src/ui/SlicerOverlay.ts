// SlicerOverlay.ts — minimal floating rendering-bounds slicer.
//
// Per-axis dual-thumb range sliders (X/Y/Z min/max) styled like an RGB picker
// (X=red, Y=green, Z=blue) that drive `SchematicObject.renderingBounds` +
// `rebuildMesh()`. Rebuilds are debounced and serialized so scrubbing stays
// smooth on big schematics. Hidden by default — opt in via
// `showSlicerOverlay: true` in SchematicRendererOptions or by calling
// `renderer.showSlicerOverlay()`.

import type { SchematicRenderer } from "../SchematicRenderer";
import type { SchematicObject } from "../managers/SchematicObject";
import { createSelect } from "./UIComponents";
import { debounce, type DebouncedFunction } from "../utils/debounce";

export type SlicerOverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface SlicerOverlayOptions {
	visible?: boolean;
	debounceMs?: number;
	corner?: SlicerOverlayCorner;
	offset?: { x: number; y: number };
	showHelperByDefault?: boolean;
}

const DEFAULTS: Required<SlicerOverlayOptions> = {
	visible: true,
	debounceMs: 80,
	corner: "top-right",
	offset: { x: 16, y: 16 },
	showHelperByDefault: true,
};

// Per-axis accent colors, RGB convention used in every 3D tool worth using.
const AXIS_COLORS = {
	x: "#ff4d5e",
	y: "#3ecf6f",
	z: "#4d9eff",
} as const;

interface AxisRow {
	minInput: HTMLInputElement;
	maxInput: HTMLInputElement;
	fillEl: HTMLDivElement;
	readout: HTMLElement;
	size: number;
}

const STYLE_ID = "schematic-slicer-overlay-styles";
// Thumb diameter (box-sizing: border-box, so this is the rendered total).
// Track is inset by half this so thumb centers line up with the fill ends.
const THUMB_SIZE = 14;

function ensureStyles(): void {
	if (typeof document === "undefined") return;
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	const half = THUMB_SIZE / 2;
	style.textContent = `
.slicer-overlay {
	position: absolute;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px 14px;
	width: 240px;
	background: rgba(18, 20, 24, 0.72);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border: 1px solid rgba(255, 255, 255, 0.06);
	border-radius: 10px;
	color: rgba(255, 255, 255, 0.92);
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.02em;
	z-index: 10000;
	user-select: none;
	transition: left 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
		right 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.slicer-overlay .slicer-axis {
	display: grid;
	grid-template-columns: 18px 1fr 52px;
	align-items: center;
	gap: 10px;
}
.slicer-overlay .slicer-axis-label {
	font-weight: 700;
	font-size: 11px;
	letter-spacing: 0.05em;
	text-align: center;
}
.slicer-overlay .slicer-readout {
	font-size: 10px;
	font-variant-numeric: tabular-nums;
	color: rgba(255, 255, 255, 0.55);
	text-align: right;
}
.slicer-dual-range {
	position: relative;
	height: ${THUMB_SIZE + 6}px;
	width: 100%;
}
.slicer-dual-range .slicer-track {
	position: absolute;
	left: ${half}px;
	right: ${half}px;
	top: 50%;
	transform: translateY(-50%);
	height: 4px;
	background: rgba(255, 255, 255, 0.09);
	border-radius: 999px;
}
.slicer-dual-range .slicer-fill {
	position: absolute;
	top: 50%;
	transform: translateY(-50%);
	height: 4px;
	border-radius: 999px;
	pointer-events: none;
	left: calc(${half}px + var(--lo, 0) * (100% - ${THUMB_SIZE}px));
	width: calc((var(--hi, 1) - var(--lo, 0)) * (100% - ${THUMB_SIZE}px));
	background: var(--axis-color, #4a9eff);
}
.slicer-dual-range input[type=range] {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	width: 100%;
	height: ${THUMB_SIZE + 6}px;
	-webkit-appearance: none;
	appearance: none;
	background: transparent;
	pointer-events: none;
	margin: 0;
	padding: 0;
	outline: none;
}
.slicer-dual-range input[type=range]::-webkit-slider-runnable-track {
	background: transparent;
	height: 4px;
	border: none;
}
.slicer-dual-range input[type=range]::-moz-range-track {
	background: transparent;
	height: 4px;
	border: none;
}
.slicer-dual-range input[type=range]::-webkit-slider-thumb {
	-webkit-appearance: none;
	box-sizing: border-box;
	pointer-events: auto;
	width: ${THUMB_SIZE}px;
	height: ${THUMB_SIZE}px;
	border-radius: 50%;
	background: #fff;
	border: 2px solid var(--axis-color, #4a9eff);
	cursor: grab;
	/* Webkit anchors the thumb's top to the runnable track's top; offset up
	   by (thumb-track)/2 so its center sits on the track centerline. */
	margin-top: -5px;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	transition: transform 0.1s ease;
}
.slicer-dual-range input[type=range]::-moz-range-thumb {
	box-sizing: border-box;
	pointer-events: auto;
	width: ${THUMB_SIZE}px;
	height: ${THUMB_SIZE}px;
	border-radius: 50%;
	background: #fff;
	border: 2px solid var(--axis-color, #4a9eff);
	cursor: grab;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	transition: transform 0.1s ease;
}
.slicer-dual-range input[type=range]:active::-webkit-slider-thumb {
	transform: scale(1.15);
	cursor: grabbing;
}
.slicer-dual-range input[type=range]:active::-moz-range-thumb {
	transform: scale(1.15);
	cursor: grabbing;
}
.slicer-overlay .slicer-picker {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-bottom: 6px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.slicer-overlay .slicer-picker-label {
	font-size: 9px;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: rgba(255, 255, 255, 0.45);
}
.slicer-overlay .slicer-reset {
	align-self: flex-end;
	padding: 2px 0;
	background: transparent;
	border: none;
	color: rgba(255, 255, 255, 0.35);
	font-size: 10px;
	font-weight: 500;
	letter-spacing: 0.04em;
	cursor: pointer;
	transition: color 0.12s ease;
}
.slicer-overlay .slicer-reset:hover {
	color: rgba(255, 255, 255, 0.8);
}
.slicer-overlay .slicer-toggle-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	font-size: 10px;
	color: rgba(255, 255, 255, 0.6);
}
.slicer-overlay .slicer-toggle {
	position: relative;
	width: 26px;
	height: 14px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 999px;
	cursor: pointer;
	transition: background 0.18s ease;
}
.slicer-overlay .slicer-toggle::after {
	content: "";
	position: absolute;
	top: 2px;
	left: 2px;
	width: 10px;
	height: 10px;
	background: #fff;
	border-radius: 50%;
	transition: transform 0.18s ease;
}
.slicer-overlay .slicer-toggle.on {
	background: rgba(74, 158, 255, 0.6);
}
.slicer-overlay .slicer-toggle.on::after {
	transform: translateX(12px);
}
`;
	document.head.appendChild(style);
}

export class SlicerOverlay {
	private renderer: SchematicRenderer;
	private opts: Required<SlicerOverlayOptions>;
	private container: HTMLDivElement;
	private destroyed = false;
	private currentSchematic: SchematicObject | null = null;
	private rebuildDebounced: DebouncedFunction<[]>;
	private axisRows: Record<"x" | "y" | "z", AxisRow | null> = { x: null, y: null, z: null };
	private liveDelay: number;
	private helperVisible: boolean;
	private rebuildInFlight = false;
	private rebuildDirty = false;
	private schematicSelect: HTMLSelectElement | null = null;
	private schematicPickerRow: HTMLDivElement | null = null;
	private helperToggleEl: HTMLDivElement | null = null;
	// Tracks how much the sidebar is pushing us aside, in pixels. Added to
	// the configured horizontal offset so the slicer stays clear of the
	// sidebar when both occupy the same screen edge.
	private sidebarShift = 0;

	private boundOnSchematicAdded = (data: { schematic: SchematicObject }) =>
		this.onSchematicLoaded(data.schematic);
	private boundOnSchematicLoaded = (data: { id: string }) => this.refreshSchematicList(data.id);
	private boundOnSchematicRemoved = () => this.refreshSchematicList();
	private boundOnSidebarVisibilityChanged = (data: {
		visible: boolean;
		position: "left" | "right";
		width: number;
	}) => this.handleSidebarVisibilityChanged(data);

	constructor(renderer: SchematicRenderer, options: SlicerOverlayOptions = {}) {
		ensureStyles();
		this.renderer = renderer;
		this.opts = {
			...DEFAULTS,
			...options,
			offset: { ...DEFAULTS.offset, ...(options.offset || {}) },
		};
		this.liveDelay = this.opts.debounceMs;
		this.helperVisible = this.opts.showHelperByDefault;

		this.rebuildDebounced = debounce(() => {
			void this.applyAllBoundsToActiveSchematic();
		}, this.liveDelay);

		this.container = this.buildContainer();
		this.attachToCanvas();

		this.refreshSchematicList();

		const ee = (
			renderer as unknown as {
				eventEmitter?: { on: (e: string, fn: (...a: unknown[]) => void) => void };
			}
		).eventEmitter;
		if (ee && typeof ee.on === "function") {
			ee.on("schematicAdded", this.boundOnSchematicAdded as (...a: unknown[]) => void);
			ee.on("schematicLoaded", this.boundOnSchematicLoaded as (...a: unknown[]) => void);
			ee.on("schematicRemoved", this.boundOnSchematicRemoved as (...a: unknown[]) => void);
			ee.on(
				"sidebarVisibilityChanged",
				this.boundOnSidebarVisibilityChanged as (...a: unknown[]) => void
			);
		}

		// Seed the current sidebar state in case it's already visible when we mount.
		this.syncToSidebarState();

		if (!this.opts.visible) this.hide();
	}

	// ---------- public API ----------

	public show(): void {
		if (this.destroyed) return;
		this.container.style.display = "flex";
		this.ensureCurrentSchematic();
		if (this.opts.showHelperByDefault && this.currentSchematic) {
			this.currentSchematic.renderingBounds.enabled = true;
			this.currentSchematic.showRenderingBoundsHelper(true);
			this.helperVisible = true;
			this.setHelperToggleUI(true);
		}
	}

	public hide(): void {
		this.container.style.display = "none";
	}

	public toggle(): void {
		if (this.container.style.display === "none") this.show();
		else this.hide();
	}

	public isVisible(): boolean {
		return this.container.style.display !== "none";
	}

	public setDebounceMs(ms: number): void {
		this.liveDelay = ms;
		this.rebuildDebounced.cancel();
		this.rebuildDebounced = debounce(() => void this.applyAllBoundsToActiveSchematic(), ms);
	}

	public dispose(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.rebuildDebounced.cancel();
		const ee = (
			this.renderer as unknown as {
				eventEmitter?: { off?: (e: string, fn: (...a: unknown[]) => void) => void };
			}
		).eventEmitter;
		if (ee && typeof ee.off === "function") {
			ee.off("schematicAdded", this.boundOnSchematicAdded as (...a: unknown[]) => void);
			ee.off("schematicLoaded", this.boundOnSchematicLoaded as (...a: unknown[]) => void);
			ee.off("schematicRemoved", this.boundOnSchematicRemoved as (...a: unknown[]) => void);
			ee.off(
				"sidebarVisibilityChanged",
				this.boundOnSidebarVisibilityChanged as (...a: unknown[]) => void
			);
		}
		this.container.remove();
	}

	// ---------- DOM construction ----------

	private buildContainer(): HTMLDivElement {
		const el = document.createElement("div");
		el.className = "slicer-overlay";
		this.applyCornerPosition(el);

		el.appendChild(this.buildSchematicPicker());
		el.appendChild(this.buildAxisRow("X", "x"));
		el.appendChild(this.buildAxisRow("Y", "y"));
		el.appendChild(this.buildAxisRow("Z", "z"));
		el.appendChild(this.buildHelperToggle());
		el.appendChild(this.buildResetLink());
		return el;
	}

	/**
	 * Park the overlay on the canvas's parent so it positions relative to the
	 * canvas rather than the document viewport. If the parent is statically
	 * positioned we flip it to `relative` so `position: absolute` resolves
	 * against it instead of the page.
	 */
	private attachToCanvas(): void {
		const canvas = (this.renderer as unknown as { canvas?: HTMLElement }).canvas;
		const parent = canvas?.parentElement ?? document.body;
		if (parent !== document.body) {
			const cs = getComputedStyle(parent);
			if (cs.position === "static") parent.style.position = "relative";
		}
		parent.appendChild(this.container);
	}

	private applyCornerPosition(el: HTMLElement): void {
		const { corner, offset } = this.opts;
		el.style.top = el.style.bottom = el.style.left = el.style.right = "";
		if (corner === "top-right" || corner === "top-left") el.style.top = `${offset.y}px`;
		else el.style.bottom = `${offset.y}px`;
		// Fold in any horizontal shift requested by the sidebar listener.
		const x = offset.x + this.sidebarShift;
		if (corner === "top-right" || corner === "bottom-right") el.style.right = `${x}px`;
		else el.style.left = `${x}px`;
	}

	/**
	 * If the sidebar shares a side with the slicer (e.g. both on the right),
	 * push the slicer aside by the sidebar's width when it opens so the two
	 * stop fighting for the same corner. Left/right mismatches need no shift.
	 */
	private handleSidebarVisibilityChanged(data: {
		visible: boolean;
		position: "left" | "right";
		width: number;
	}): void {
		const slicerSide = this.opts.corner.includes("right") ? "right" : "left";
		if (data.position !== slicerSide) {
			this.sidebarShift = 0;
		} else {
			this.sidebarShift = data.visible ? data.width : 0;
		}
		this.applyCornerPosition(this.container);
	}

	/**
	 * On construction, the sidebar may already be visible (hidden-by-default
	 * is false, or a saved layout). Read its current state via the renderer
	 * so we start in the right position instead of overlapping.
	 */
	private syncToSidebarState(): void {
		const sidebar = (this.renderer as any).sidebar;
		if (!sidebar || typeof sidebar.isVisible !== "function") return;
		const visible = sidebar.isVisible();
		const opts = sidebar.options ?? sidebar.opts;
		if (!opts) return;
		this.handleSidebarVisibilityChanged({
			visible,
			position: opts.position,
			width: opts.width,
		});
	}

	private buildSchematicPicker(): HTMLDivElement {
		const row = document.createElement("div");
		row.className = "slicer-picker";

		const label = document.createElement("div");
		label.className = "slicer-picker-label";
		label.textContent = "Schematic";
		row.appendChild(label);

		this.schematicSelect = createSelect([], "", (id) =>
			this.setActiveSchematic(id)
		) as unknown as HTMLSelectElement;
		row.appendChild(this.schematicSelect);
		this.schematicPickerRow = row;
		row.style.display = "none";
		return row;
	}

	private buildAxisRow(label: string, axis: "x" | "y" | "z"): HTMLDivElement {
		const row = document.createElement("div");
		row.className = "slicer-axis";

		const axisLabel = document.createElement("div");
		axisLabel.className = "slicer-axis-label";
		axisLabel.textContent = label;
		axisLabel.style.color = AXIS_COLORS[axis];
		row.appendChild(axisLabel);

		const dual = document.createElement("div");
		dual.className = "slicer-dual-range";

		const track = document.createElement("div");
		track.className = "slicer-track";
		dual.appendChild(track);

		const fill = document.createElement("div");
		fill.className = "slicer-fill";
		fill.style.setProperty("--axis-color", AXIS_COLORS[axis]);
		dual.appendChild(fill);

		const minInput = document.createElement("input");
		minInput.type = "range";
		minInput.min = "0";
		minInput.max = "1";
		minInput.step = "1";
		minInput.value = "0";
		minInput.style.setProperty("--axis-color", AXIS_COLORS[axis]);

		const maxInput = document.createElement("input");
		maxInput.type = "range";
		maxInput.min = "0";
		maxInput.max = "1";
		maxInput.step = "1";
		maxInput.value = "1";
		maxInput.style.setProperty("--axis-color", AXIS_COLORS[axis]);

		dual.appendChild(minInput);
		dual.appendChild(maxInput);

		const onInput = () => this.onAxisInput(axis);
		minInput.addEventListener("input", onInput);
		maxInput.addEventListener("input", onInput);

		row.appendChild(dual);

		const readout = document.createElement("div");
		readout.className = "slicer-readout";
		readout.textContent = "—";
		row.appendChild(readout);

		this.axisRows[axis] = { minInput, maxInput, fillEl: fill, readout, size: 1 };
		this.updateFillVisual(axis);
		return row;
	}

	private buildHelperToggle(): HTMLDivElement {
		const row = document.createElement("div");
		row.className = "slicer-toggle-row";

		const label = document.createElement("div");
		label.textContent = "Bounds wireframe";
		row.appendChild(label);

		const toggle = document.createElement("div");
		toggle.className = "slicer-toggle" + (this.opts.showHelperByDefault ? " on" : "");
		toggle.addEventListener("click", () => {
			const next = !toggle.classList.contains("on");
			toggle.classList.toggle("on", next);
			this.helperVisible = next;
			const target = this.ensureCurrentSchematic();
			if (!target) return;
			if (next) target.renderingBounds.enabled = true;
			target.showRenderingBoundsHelper(next);
		});
		this.helperToggleEl = toggle;
		row.appendChild(toggle);
		return row;
	}

	private setHelperToggleUI(on: boolean): void {
		if (this.helperToggleEl) this.helperToggleEl.classList.toggle("on", on);
	}

	private buildResetLink(): HTMLButtonElement {
		const b = document.createElement("button");
		b.className = "slicer-reset";
		b.textContent = "reset";
		b.addEventListener("click", () => this.resetAll());
		return b;
	}

	// ---------- schematic / state ----------

	private refreshSchematicList(preferredId?: string): void {
		if (!this.schematicSelect) return;
		const schematics = this.renderer.schematicManager?.getAllSchematics() || [];

		this.schematicSelect.innerHTML = "";
		for (const s of schematics) {
			const opt = document.createElement("option");
			opt.value = s.name;
			opt.textContent = s.name;
			this.schematicSelect.appendChild(opt);
		}

		if (this.schematicPickerRow) {
			this.schematicPickerRow.style.display = schematics.length > 1 ? "flex" : "none";
		}

		const targetId =
			preferredId ||
			(this.currentSchematic && schematics.some((s) => s.name === this.currentSchematic!.name)
				? this.currentSchematic.name
				: schematics[0]?.name);

		if (targetId) {
			this.schematicSelect.value = targetId;
			this.setActiveSchematic(targetId);
		} else {
			this.currentSchematic = null;
			this.applyAxisRanges(0, 0, 0);
		}
	}

	private onSchematicLoaded(schematic: SchematicObject): void {
		this.refreshSchematicList(schematic.name);
	}

	private setActiveSchematic(id: string): void {
		const s = this.renderer.schematicManager?.getSchematic(id);
		if (!s) return;
		this.currentSchematic = s;
		const dims = s.getDimensions();
		this.applyAxisRanges(dims[0], dims[1], dims[2]);
		this.syncSlidersFromBounds();
		if (this.isVisible() && this.helperVisible) {
			s.renderingBounds.enabled = true;
			s.showRenderingBoundsHelper(true);
		}
	}

	private ensureCurrentSchematic(): SchematicObject | null {
		if (this.currentSchematic) return this.currentSchematic;
		const first = this.renderer.schematicManager?.getFirstSchematic?.();
		if (first) {
			this.currentSchematic = first;
			const dims = first.getDimensions();
			this.applyAxisRanges(dims[0], dims[1], dims[2]);
			this.syncSlidersFromBounds();
		}
		return this.currentSchematic;
	}

	private applyAxisRanges(w: number, h: number, d: number): void {
		const setRange = (axis: "x" | "y" | "z", size: number) => {
			const row = this.axisRows[axis];
			if (!row) return;
			const safe = Math.max(1, size);
			row.size = safe;
			row.minInput.min = "0";
			row.minInput.max = String(safe);
			row.maxInput.min = "0";
			row.maxInput.max = String(safe);
			row.minInput.value = "0";
			row.maxInput.value = String(safe);
			row.readout.textContent = size > 0 ? `0 – ${size}` : "—";
			this.updateFillVisual(axis);
		};
		setRange("x", w);
		setRange("y", h);
		setRange("z", d);
	}

	private syncSlidersFromBounds(): void {
		if (!this.currentSchematic) return;
		const min = this.currentSchematic.renderingBounds.min;
		const max = this.currentSchematic.renderingBounds.max;
		const set = (axis: "x" | "y" | "z", lo: number, hi: number) => {
			const row = this.axisRows[axis];
			if (!row) return;
			row.minInput.value = String(lo);
			row.maxInput.value = String(hi);
			row.readout.textContent = `${lo} – ${hi}`;
			this.updateFillVisual(axis);
		};
		set("x", min.x, max.x);
		set("y", min.y, max.y);
		set("z", min.z, max.z);
	}

	private updateFillVisual(axis: "x" | "y" | "z"): void {
		const row = this.axisRows[axis];
		if (!row) return;
		const lo = parseFloat(row.minInput.value);
		const hi = parseFloat(row.maxInput.value);
		const size = row.size || 1;
		// Fill positioning math lives in CSS — we just give it fractions 0..1
		// for lo/hi and `calc()` inset-aligns the fill with the thumb centers.
		row.fillEl.style.setProperty("--lo", `${Math.max(0, Math.min(1, lo / size))}`);
		row.fillEl.style.setProperty("--hi", `${Math.max(0, Math.min(1, hi / size))}`);
	}

	private onAxisInput(axis: "x" | "y" | "z"): void {
		const row = this.axisRows[axis];
		if (!row) return;
		let lo = parseFloat(row.minInput.value);
		let hi = parseFloat(row.maxInput.value);
		if (lo > hi) {
			// Whichever thumb the user is dragging "wins" — pin the other to it.
			if (document.activeElement === row.minInput) {
				hi = lo;
				row.maxInput.value = String(hi);
			} else {
				lo = hi;
				row.minInput.value = String(lo);
			}
		}
		row.readout.textContent = `${lo} – ${hi}`;
		this.updateFillVisual(axis);
		this.rebuildDebounced();
	}

	private async applyAllBoundsToActiveSchematic(): Promise<void> {
		const target = this.ensureCurrentSchematic();
		if (!target) return;
		const read = (axis: "x" | "y" | "z") => {
			const row = this.axisRows[axis];
			if (!row) return null;
			return [parseFloat(row.minInput.value), parseFloat(row.maxInput.value)] as const;
		};
		const x = read("x");
		const y = read("y");
		const z = read("z");
		if (!x || !y || !z) return;

		target.renderingBounds.enabled = true;
		target.renderingBounds.min.set(x[0], y[0], z[0]);
		target.renderingBounds.max.set(x[1], y[1], z[1]);

		// Serialize: concurrent rebuildMesh() calls race — each clears the
		// group at start, so a slow earlier rebuild's clear wipes a later
		// rebuild's freshly-added chunks. Coalesce queued requests instead.
		if (this.rebuildInFlight) {
			this.rebuildDirty = true;
			return;
		}
		this.rebuildInFlight = true;
		try {
			await target.rebuildMesh();
			// rebuildMesh strips every non-region child from the group, so the
			// helper has to be re-attached after the rebuild settles.
			if (this.helperVisible) target.showRenderingBoundsHelper(true);
		} catch (err) {
			console.error("[Slicer] rebuildMesh failed", err);
		} finally {
			this.rebuildInFlight = false;
			if (this.rebuildDirty) {
				this.rebuildDirty = false;
				void this.applyAllBoundsToActiveSchematic();
			}
		}
	}

	private resetAll(): void {
		const target = this.ensureCurrentSchematic();
		if (!target) return;
		this.rebuildDebounced.cancel();
		target.renderingBounds.enabled = false;
		target.showRenderingBoundsHelper(false);
		target.resetRenderingBounds();
		const dims = target.getDimensions();
		this.applyAxisRanges(dims[0], dims[1], dims[2]);
	}
}
