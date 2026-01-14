// managers/OverlayManager.ts
import { EventEmitter } from "events";
import { SchematicRenderer } from "../SchematicRenderer";

export interface OverlayContent {
	title: string;
	subtitle?: string;
	sections: OverlaySection[];
}

export interface OverlaySection {
	title?: string;
	items: OverlayItem[];
}

export interface OverlayItem {
	label: string;
	value: string | number | boolean;
	color?: string;
	icon?: string;
}

export interface OverlayPosition {
	x: number;
	y: number;
}

/**
 * Manager for displaying contextual overlays on hover/click
 * Provides a unified system for showing metadata about regions, blocks, entities, etc.
 */
export class OverlayManager extends EventEmitter {
	private overlayElement: HTMLDivElement | null = null;
	private isVisible: boolean = false;
	private currentContent: OverlayContent | null = null;

	constructor(_renderer: SchematicRenderer) {
		super();
		// Renderer parameter kept for API consistency but not currently used
		this.createOverlayElement();
	}

	/**
	 * Create the overlay DOM element
	 */
	private createOverlayElement(): void {
		this.overlayElement = document.createElement("div");
		this.overlayElement.className = "schematic-overlay";
		this.overlayElement.style.cssText = `
			position: fixed;
			background: rgba(20, 20, 20, 0.95);
			border: 1px solid rgba(255, 255, 255, 0.2);
			border-radius: 8px;
			padding: 12px 16px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			font-size: 13px;
			color: #e0e0e0;
			pointer-events: none;
			z-index: 10000;
			display: none;
			max-width: 320px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
			backdrop-filter: blur(10px);
		`;

		document.body.appendChild(this.overlayElement);
	}

	/**
	 * Show overlay with content at a specific position
	 */
	public show(content: OverlayContent, position: OverlayPosition): void {
		if (!this.overlayElement) return;

		this.currentContent = content;
		this.isVisible = true;

		// Build HTML content
		let html = `
			<div style="margin-bottom: 8px;">
				<div style="font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 2px;">
					${this.escapeHtml(content.title)}
				</div>
				${
					content.subtitle
						? `<div style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">
					${this.escapeHtml(content.subtitle)}
				</div>`
						: ""
				}
			</div>
		`;

		// Add sections
		content.sections.forEach((section, idx) => {
			if (idx > 0) {
				html += `<div style="border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 8px 0;"></div>`;
			}

			if (section.title) {
				html += `<div style="font-size: 11px; color: #aaa; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
					${this.escapeHtml(section.title)}
				</div>`;
			}

			section.items.forEach((item) => {
				const valueColor = item.color || "#fff";
				const icon = item.icon ? `<span style="margin-right: 6px;">${item.icon}</span>` : "";

				html += `
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 12px;">
						<span style="color: #aaa; font-size: 12px;">${icon}${this.escapeHtml(item.label)}</span>
						<span style="color: ${valueColor}; font-weight: 600; font-size: 12px; font-family: monospace;">
							${this.formatValue(item.value)}
						</span>
					</div>
				`;
			});
		});

		this.overlayElement.innerHTML = html;
		this.overlayElement.style.display = "block";

		// Position the overlay
		this.updatePosition(position);

		this.emit("shown", content);
	}

	/**
	 * Update overlay position
	 */
	public updatePosition(position: OverlayPosition): void {
		if (!this.overlayElement || !this.isVisible) return;

		// Offset from cursor
		const offsetX = 15;
		const offsetY = 15;

		let x = position.x + offsetX;
		let y = position.y + offsetY;

		// Keep within viewport bounds
		const rect = this.overlayElement.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// Adjust if too far right
		if (x + rect.width > viewportWidth - 10) {
			x = position.x - rect.width - offsetX;
		}

		// Adjust if too far down
		if (y + rect.height > viewportHeight - 10) {
			y = position.y - rect.height - offsetY;
		}

		// Clamp to viewport
		x = Math.max(10, Math.min(x, viewportWidth - rect.width - 10));
		y = Math.max(10, Math.min(y, viewportHeight - rect.height - 10));

		this.overlayElement.style.left = `${x}px`;
		this.overlayElement.style.top = `${y}px`;
	}

	/**
	 * Hide the overlay
	 */
	public hide(): void {
		if (!this.overlayElement) return;

		this.isVisible = false;
		this.currentContent = null;
		this.overlayElement.style.display = "none";

		this.emit("hidden");
	}

	/**
	 * Check if overlay is currently visible
	 */
	public isShowing(): boolean {
		return this.isVisible;
	}

	/**
	 * Get current overlay content
	 */
	public getCurrentContent(): OverlayContent | null {
		return this.currentContent;
	}

	/**
	 * Format a value for display
	 */
	private formatValue(value: string | number | boolean): string {
		if (typeof value === "boolean") {
			return value ? "✓" : "✗";
		}
		if (typeof value === "number") {
			return value.toLocaleString();
		}
		return this.escapeHtml(String(value));
	}

	/**
	 * Escape HTML to prevent XSS
	 */
	private escapeHtml(text: string): string {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	/**
	 * Dispose and clean up
	 */
	public dispose(): void {
		this.hide();
		if (this.overlayElement && this.overlayElement.parentNode) {
			this.overlayElement.parentNode.removeChild(this.overlayElement);
		}
		this.overlayElement = null;
		this.removeAllListeners();
	}
}
