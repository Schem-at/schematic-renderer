// managers/HighlightManager.ts
import { Highlight } from "./highlight/Highlight";
import { HoverHighlight } from "./highlight/HoverHighlight";
import { AnnotationHighlight } from "./highlight/AnnotationHighlight";
import { SchematicRenderer } from "../SchematicRenderer";

export class HighlightManager {
	private highlights: Highlight[] = [];
	private schematicRenderer: SchematicRenderer;

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
