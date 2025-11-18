// managers/HighlightManager.ts
import { Highlight } from "./highlight/Highlight";
import { HoverHighlight } from "./highlight/HoverHighlight";
import { AnnotationHighlight } from "./highlight/AnnotationHighlight";
import { ClickInteractionHandler } from "./highlight/ClickInteractionHandler";
import { CustomIoHighlight } from "./highlight/CustomIoHighlight";
import { InsignIoHoverHandler } from "./highlight/InsignIoHoverHandler";
import { SchematicRenderer } from "../SchematicRenderer";

export class HighlightManager {
	private highlights: Highlight[] = [];
	private schematicRenderer: SchematicRenderer;
	public customIoHighlight: CustomIoHighlight | null = null;
	public insignIoHoverHandler: InsignIoHoverHandler | null = null;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.loadHighlights();
	}

	private loadHighlights() {
		// Instantiate and add all highlight types here
		const hoverHighlight = new HoverHighlight(this.schematicRenderer);
		this.addHighlight(hoverHighlight);

		const annotationHighlight = new AnnotationHighlight(this.schematicRenderer);
		this.addHighlight(annotationHighlight);

		// Add click interaction handler for block interactions
		const clickHandler = new ClickInteractionHandler(this.schematicRenderer);
		this.addHighlight(clickHandler);

		// Add custom IO highlight for simulation custom IO nodes
		this.customIoHighlight = new CustomIoHighlight(this.schematicRenderer);
		this.addHighlight(this.customIoHighlight);

		// Add Insign IO hover handler for showing IO metadata overlays
		this.insignIoHoverHandler = new InsignIoHoverHandler(this.schematicRenderer);
		this.addHighlight(this.insignIoHoverHandler);

		// Add other highlights as needed
	}

	public addHighlight(highlight: Highlight) {
		this.highlights.push(highlight);
		highlight.activate();
	}

	public removeHighlight(highlight: Highlight) {
		highlight.deactivate();
		this.highlights = this.highlights.filter((h) => h !== highlight);
	}

	public dispose() {
		this.highlights.forEach((highlight) => highlight.deactivate());
	}

	public update(deltaTime: number) {
		this.highlights.forEach((highlight) => highlight.update(deltaTime));
	}
}
