// ResourcePackNotice.ts — a small in-viewport notice shown when no resource
// pack is loaded, so users understand why blocks render with placeholder
// (purple/black) textures and how to fix it.
//
// Designed to be explicit but NOT overwhelming: a one-line summary with a
// "How to fix" expander (progressive disclosure), an actionable "Load a pack"
// button, and a dismiss button. Gated by
// `resourcePackOptions.showMissingPackNotice` (default true) and toggled by the
// renderer based on the loaded pack count.

import type { SchematicRenderer } from "../SchematicRenderer";

export type ResourcePackNoticeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface ResourcePackNoticeOptions {
	corner?: ResourcePackNoticeCorner;
	offset?: { x: number; y: number };
	/** Link shown in the expanded details. Empty hides the link. */
	docsUrl?: string;
}

const STYLE_ID = "schematic-resource-pack-notice-styles";

function ensureStyles(): void {
	if (typeof document === "undefined") return;
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
.srp-notice {
	position: absolute;
	box-sizing: border-box;
	max-width: 300px;
	padding: 12px 14px;
	font: 13px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
	color: #e7e9ee;
	background: rgba(18, 20, 24, 0.78);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 10px;
	box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
	z-index: 30;
	user-select: none;
}
.srp-notice__row { display: flex; align-items: flex-start; gap: 9px; }
.srp-notice__icon { flex: 0 0 auto; font-size: 15px; line-height: 1.3; }
.srp-notice__text { flex: 1 1 auto; min-width: 0; }
.srp-notice__title { font-weight: 600; display: block; }
.srp-notice__sub { color: #aab1bd; }
.srp-notice__close {
	flex: 0 0 auto; cursor: pointer; background: none; border: none;
	color: #aab1bd; font-size: 16px; line-height: 1; padding: 0 2px;
}
.srp-notice__close:hover { color: #fff; }
.srp-notice__toggle {
	margin-top: 8px; cursor: pointer; background: none; border: none; padding: 0;
	color: #6db1ff; font: inherit; font-size: 12px;
}
.srp-notice__toggle:hover { text-decoration: underline; }
.srp-notice__details { margin-top: 8px; font-size: 12px; color: #c3c9d4; }
.srp-notice__details p { margin: 0 0 8px; }
.srp-notice__details code,
.srp-notice__details pre {
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	background: rgba(255, 255, 255, 0.06); border-radius: 5px;
}
.srp-notice__details code { padding: 1px 5px; }
.srp-notice__details pre { padding: 7px 9px; overflow-x: auto; margin: 0 0 8px; }
.srp-notice__actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.srp-notice__load {
	cursor: pointer; background: #3a7afe; border: none; border-radius: 6px;
	color: #fff; font: inherit; font-size: 12px; font-weight: 600; padding: 6px 11px;
}
.srp-notice__load:hover { background: #2f6ae0; }
.srp-notice__link { color: #6db1ff; text-decoration: none; font-size: 12px; }
.srp-notice__link:hover { text-decoration: underline; }
`;
	document.head.appendChild(style);
}

export class ResourcePackNotice {
	private renderer: SchematicRenderer;
	private opts: Required<ResourcePackNoticeOptions>;
	private container: HTMLDivElement;
	private detailsEl!: HTMLDivElement;
	private toggleEl!: HTMLButtonElement;
	private fileInput: HTMLInputElement;
	private dismissed = false;
	private destroyed = false;
	private expanded = false;

	constructor(renderer: SchematicRenderer, options: ResourcePackNoticeOptions = {}) {
		this.renderer = renderer;
		this.opts = {
			corner: options.corner ?? "bottom-left",
			offset: options.offset ?? { x: 16, y: 16 },
			docsUrl: options.docsUrl ?? "",
		};
		ensureStyles();

		this.fileInput = document.createElement("input");
		this.fileInput.type = "file";
		this.fileInput.accept = ".zip";
		this.fileInput.style.display = "none";
		this.fileInput.addEventListener("change", () => this.onFileChosen());
		document.body.appendChild(this.fileInput);

		this.container = this.build();
		this.attachToCanvas();
		// Start hidden; the renderer shows it once it knows no pack is loaded.
		this.container.style.display = "none";
	}

	// ---------- public API ----------

	public show(): void {
		if (this.destroyed || this.dismissed) return;
		this.container.style.display = "block";
	}

	public hide(): void {
		this.container.style.display = "none";
	}

	public dismiss(): void {
		this.dismissed = true;
		this.hide();
	}

	public isDismissed(): boolean {
		return this.dismissed;
	}

	public dispose(): void {
		this.destroyed = true;
		this.container.remove();
		this.fileInput.remove();
	}

	// ---------- internals ----------

	private build(): HTMLDivElement {
		const el = document.createElement("div");
		el.className = "srp-notice";
		this.applyCorner(el);

		const row = document.createElement("div");
		row.className = "srp-notice__row";

		const icon = document.createElement("span");
		icon.className = "srp-notice__icon";
		icon.textContent = "⚠";

		const text = document.createElement("div");
		text.className = "srp-notice__text";
		const title = document.createElement("span");
		title.className = "srp-notice__title";
		title.textContent = "No resource pack loaded";
		const sub = document.createElement("span");
		sub.className = "srp-notice__sub";
		sub.textContent = "Blocks are showing placeholder textures.";
		text.append(title, sub);

		const close = document.createElement("button");
		close.className = "srp-notice__close";
		close.type = "button";
		close.setAttribute("aria-label", "Dismiss");
		close.textContent = "×";
		close.addEventListener("click", () => this.dismiss());

		row.append(icon, text, close);

		this.toggleEl = document.createElement("button");
		this.toggleEl.className = "srp-notice__toggle";
		this.toggleEl.type = "button";
		this.toggleEl.textContent = "How to fix ▾";
		this.toggleEl.addEventListener("click", () => this.setExpanded(!this.expanded));

		this.detailsEl = this.buildDetails();
		this.detailsEl.style.display = "none";

		el.append(row, this.toggleEl, this.detailsEl);
		return el;
	}

	private buildDetails(): HTMLDivElement {
		const details = document.createElement("div");
		details.className = "srp-notice__details";

		const p = document.createElement("p");
		p.append(
			document.createTextNode("Drag a Minecraft resource pack ("),
			Object.assign(document.createElement("code"), { textContent: ".zip" }),
			document.createTextNode(") onto the view, or load one in code:")
		);

		const pre = document.createElement("pre");
		pre.textContent = "renderer.addResourcePack(file)";

		const actions = document.createElement("div");
		actions.className = "srp-notice__actions";

		const load = document.createElement("button");
		load.className = "srp-notice__load";
		load.type = "button";
		load.textContent = "Load a pack…";
		load.addEventListener("click", () => this.fileInput.click());
		actions.appendChild(load);

		if (this.opts.docsUrl) {
			const link = document.createElement("a");
			link.className = "srp-notice__link";
			link.href = this.opts.docsUrl;
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			link.textContent = "Resource pack guide ↗";
			actions.appendChild(link);
		}

		details.append(p, pre, actions);
		return details;
	}

	private setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		this.detailsEl.style.display = expanded ? "block" : "none";
		this.toggleEl.textContent = expanded ? "How to fix ▴" : "How to fix ▾";
	}

	private async onFileChosen(): Promise<void> {
		const file = this.fileInput.files?.[0];
		this.fileInput.value = "";
		if (!file) return;
		try {
			await this.renderer.addResourcePack(file);
		} catch (error) {
			console.error("[SchematicRenderer] Failed to load resource pack:", error);
		}
	}

	private applyCorner(el: HTMLElement): void {
		const { x, y } = this.opts.offset;
		el.style.top = el.style.right = el.style.bottom = el.style.left = "";
		const vertical = this.opts.corner.startsWith("top") ? "top" : "bottom";
		const horizontal = this.opts.corner.endsWith("left") ? "left" : "right";
		el.style[vertical] = `${y}px`;
		el.style[horizontal] = `${x}px`;
	}

	/** Park the notice on the canvas's parent so it positions over the viewport. */
	private attachToCanvas(): void {
		const canvas = (this.renderer as unknown as { canvas?: HTMLElement }).canvas;
		const parent = canvas?.parentElement ?? document.body;
		if (parent !== document.body) {
			const cs = getComputedStyle(parent);
			if (cs.position === "static") parent.style.position = "relative";
		}
		parent.appendChild(this.container);
	}
}
