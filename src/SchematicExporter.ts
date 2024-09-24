import { Renderer } from "./schematicRendererWorld";

export class SchematicExporter {
	constructor(private renderer: Renderer) {}

	async exportUsdz() {
		const obj = this.renderer.exportUsdz();
		return obj;
	}
}
