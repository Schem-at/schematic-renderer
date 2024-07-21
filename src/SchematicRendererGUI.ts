import GUI from "lil-gui";
import { SchematicRenderer } from "./SchematicRenderer";
import * as THREE from "three";
export class SchematicRendererGUI {
	private gui: GUI;
	private lightingFolder: GUI;
	private lightControllers: Map<string, GUI>;

	constructor(private schematicRenderer: SchematicRenderer) {
		this.gui = new GUI();
		this.lightingFolder = this.gui.addFolder("Lighting");
		this.lightControllers = new Map();
		this.createGUI();
	}

	createGUI() {
		const settings = {
			rotationSpeed: 0.01,
			zoom: 1,
			showGrid: false,
			backgroundColor: "#000000",
			backgroundAlpha: 1,
			gammaCorrection: 1.7,
			exportUSDZ: () => {
				this.schematicRenderer.exportUsdz();
			},
			takeScreenshot: () => {
				this.schematicRenderer.schematicMediaCapture.downloadScreenshot(
					1920,
					1080
				);
			},

			downloadRotationWebM: () => {
				this.schematicRenderer.schematicMediaCapture.downloadRotationWebM(
					1920,
					1080,
					24,
					1
				);
			},
		};

		// Add settings to the GUI
		this.gui
			.add(settings, "rotationSpeed", 0, 0.1)
			.step(0.001)
			.name("Rotation Speed");
		this.gui
			.add(settings, "zoom", 0.1, 2)
			.step(0.1)
			.name("Zoom")
			.onChange((value: any) => {
				this.schematicRenderer.updateZoom(value);
			});
		this.gui
			.add(settings, "showGrid")
			.name("Show Grid")
			.onChange((_value: any) => {
				this.schematicRenderer.renderer.toggleGrid();
			});

		this.gui
			.addColor(settings, "backgroundColor")
			.name("Background Color")
			.onChange((value: string) => {
				this.schematicRenderer.renderer.setBackgroundColor(
					value,
					settings.backgroundAlpha
				);
			});
		this.gui
			.add(settings, "backgroundAlpha", 0, 1)
			.step(0.1)
			.name("Background Alpha")
			.onChange((value: number) => {
				this.schematicRenderer.renderer.setBackgroundColor(
					settings.backgroundColor,
					value
				);
			});
		this.gui
			.add(settings, "gammaCorrection", 0.1, 3)
			.step(0.1)
			.name("Gamma Correction")
			.onChange((value: number) => {
				this.schematicRenderer.renderer.updateGammaCorrection(value);
			});
		this.gui.add(settings, "exportUSDZ").name("Export USDZ");
		this.gui.add(settings, "takeScreenshot").name("Take Screenshot");
		// this.gui.add(settings, "takeRotationWebM").name("Take Rotation WebM");

		this.createLightingControls();

		this.lightingFolder
			.add({ addLight: this.addLight.bind(this) }, "addLight")
			.name("Add Light");
	}

	createLightingControls() {
		const lights = this.schematicRenderer.renderer.getLights();
		lights.forEach((light) => {
			this.createLightControls(
				light.id,
				light.type,
				this.getLightOptions(light)
			);
		});
	}

	createLightControls(id: string, type: string, options: any) {
		const lightController = this.lightingFolder.addFolder(
			`${type.charAt(0).toUpperCase() + type.slice(1)} Light ${id}`
		);
		this.lightControllers.set(id, lightController);

		lightController.addColor(options, "color").onChange((value: string) => {
			this.schematicRenderer.renderer.updateLight(id, { color: value });
		});

		lightController
			.add(options, "intensity", 0, 2)
			.onChange((value: number) => {
				this.schematicRenderer.renderer.updateLight(id, { intensity: value });
			});

		if (type !== "ambient") {
			lightController
				.add(options.position, "x", -50, 50)
				.onChange(() => this.updateLightPosition(id, options));
			lightController
				.add(options.position, "y", -50, 50)
				.onChange(() => this.updateLightPosition(id, options));
			lightController
				.add(options.position, "z", -50, 50)
				.onChange(() => this.updateLightPosition(id, options));
		}

		if (type === "point" || type === "spot") {
			lightController
				.add(options, "distance", 0, 100)
				.onChange((value: number) => {
					this.schematicRenderer.renderer.updateLight(id, { distance: value });
				});
			lightController.add(options, "decay", 0, 2).onChange((value: number) => {
				this.schematicRenderer.renderer.updateLight(id, { decay: value });
			});
		}

		if (type === "spot") {
			lightController
				.add(options, "angle", 0, Math.PI / 2)
				.onChange((value: number) => {
					this.schematicRenderer.renderer.updateLight(id, { angle: value });
				});
			lightController
				.add(options, "penumbra", 0, 1)
				.onChange((value: number) => {
					this.schematicRenderer.renderer.updateLight(id, { penumbra: value });
				});
		}

		lightController
			.add({ remove: () => this.removeLight(id) }, "remove")
			.name("Remove Light");
	}

	updateLightPosition(id: string, options: any) {
		this.schematicRenderer.renderer.updateLight(id, {
			position: new THREE.Vector3(
				options.position.x,
				options.position.y,
				options.position.z
			),
		});
	}

	removeLight(id: string) {
		this.schematicRenderer.renderer.removeLight(id);
		const lightController = this.lightControllers.get(id);
		if (lightController) {
			lightController.destroy();
			this.lightControllers.delete(id);
		}
	}

	addLight() {
		const lightTypes = ["ambient", "directional", "point", "spot"];
		const type = lightTypes[Math.floor(Math.random() * lightTypes.length)] as
			| "ambient"
			| "directional"
			| "point"
			| "spot";
		const options = this.getDefaultLightOptions(type);
		const id = this.schematicRenderer.renderer.addLight(type, options);
		this.createLightControls(id, type, options);
	}

	getDefaultLightOptions(type: string) {
		const baseOptions = {
			color: "#ffffff",
			intensity: 1,
			position: { x: 0, y: 0, z: 0 },
		};

		switch (type) {
			case "ambient":
				return { color: "#ffffff", intensity: 0.5 };
			case "directional":
				return { ...baseOptions, position: { x: 20, y: 20, z: -20 } };
			case "point":
				return { ...baseOptions, distance: 0, decay: 1 };
			case "spot":
				return {
					...baseOptions,
					distance: 0,
					angle: Math.PI / 3,
					penumbra: 0,
					decay: 1,
				};
			default:
				return baseOptions;
		}
	}

	getLightOptions(light: any) {
		const options: any = {
			color: "#" + light.light.color.getHexString(),
			intensity: light.light.intensity,
		};

		if (light.type !== "ambient") {
			options.position = {
				x: light.light.position.x,
				y: light.light.position.y,
				z: light.light.position.z,
			};
		}

		if (light.type === "point" || light.type === "spot") {
			options.distance = light.light.distance;
			options.decay = light.light.decay;
		}

		if (light.type === "spot") {
			options.angle = light.light.angle;
			options.penumbra = light.light.penumbra;
		}

		return options;
	}
}
