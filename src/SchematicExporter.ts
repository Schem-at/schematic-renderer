import { Renderer } from "./renderer";

export class SchematicExporter {
	constructor(private renderer: Renderer) {}

	async exportUsdz() {
		const obj = this.renderer.exportUsdz();
		return obj;
	}
}
