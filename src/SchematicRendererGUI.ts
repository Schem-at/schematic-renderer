import GUI from "lil-gui";
import { SchematicRenderer } from "./SchematicRenderer";

export class SchematicRendererGUI {
	constructor(private schematicRenderer: SchematicRenderer) {
		this.createGUI();
	}

	createGUI() {
		const gui = new GUI();

		// Create settings
		const settings = {
			rotationSpeed: 0.01,
			zoom: 1,
			showGrid: true,
			backgroundColor: "#000000",
			exportUSDZ: () => {
				this.schematicRenderer.exportUsdz();
			},
			takeScreenshot: () => {
				this.schematicRenderer.schematicMediaCapture.downloadScreenshot(
					1920,
					1080
				);
			},
			takeRotationGif: () => {
				this.schematicRenderer.schematicMediaCapture.downloadRotationGif(
					1920,
					1080,
					30,
					10
				);
			},
			takeRotationWebM: () => {
				this.schematicRenderer.schematicMediaCapture.downloadRotationWebM(
					1920,
					1080,
					30,
					1
				);
			},
		};

		// Add settings to the GUI
		gui
			.add(settings, "rotationSpeed", 0, 0.1)
			.step(0.001)
			.name("Rotation Speed");
		gui
			.add(settings, "zoom", 0.1, 2)
			.step(0.1)
			.name("Zoom")
			.onChange((value: any) => {
				this.schematicRenderer.updateZoom(value);
			});
		gui
			.add(settings, "showGrid")
			.name("Show Grid")
			.onChange((_value: any) => {
				this.schematicRenderer.renderer.toggleGrid();
			});

		gui
			.addColor(settings, "backgroundColor")
			.name("Background Color")
			.onChange((value: string) => {
				this.schematicRenderer.renderer.setBackgroundColor(value);
			});
		gui.add(settings, "exportUSDZ").name("Export USDZ");
		gui.add(settings, "takeScreenshot").name("Take Screenshot");
		gui.add(settings, "takeRotationGif").name("Take Rotation GIF");
		gui.add(settings, "takeRotationWebM").name("Take Rotation WebM");
	}
}
