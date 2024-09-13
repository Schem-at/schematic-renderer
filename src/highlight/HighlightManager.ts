// HighlightManager.ts
import * as THREE from "three";
import { Highlight } from "./Highlight";
import { HoverHighlight } from "./HoverHighlight";
import { AnnotationHighlight } from "./AnnotationHighlight";
import { EventEmitter } from "./EventEmitter";
import { InteractionManager } from "./InteractionManager";
import { BlockEntityHighlight } from "./BlockEntityHighlight";
import { BlockPlacementHandler } from "./BlockPlacementHandler";

export class HighlightManager {
	private highlights: Highlight[] = [];
	private schematicRenderer: any;
	private scene: THREE.Scene;
	private camera: THREE.Camera;
	private renderer: THREE.WebGLRenderer;
	private eventEmitter: EventEmitter;
	private interactionManager: InteractionManager;
	private blockPlacementHandler: BlockPlacementHandler;

	constructor(
		schematicRenderer: any,
		scene: THREE.Scene,
		camera: THREE.Camera,
		renderer: THREE.WebGLRenderer
	) {
		this.schematicRenderer = schematicRenderer;
		this.scene = scene;
		this.camera = camera;
		this.renderer = renderer;

		this.eventEmitter = new EventEmitter();

		this.loadHighlights();

		this.interactionManager = new InteractionManager(
			renderer,
			this.eventEmitter
		);
		this.blockPlacementHandler = new BlockPlacementHandler(
			this.eventEmitter,
			schematicRenderer,
			renderer,
			scene
		);
	}

	private loadHighlights() {
		// Instantiate and add all highlight types here
		const hoverHighlight = new HoverHighlight(
			this.schematicRenderer,
			this.scene,
			this.camera,
			this.renderer,
			this.eventEmitter
		);
		this.addHighlight(hoverHighlight);

		const annotationHighlight = new AnnotationHighlight(
			this.schematicRenderer,
			this.scene,
			this.camera,
			this.renderer,
			this.eventEmitter
		);
		this.addHighlight(annotationHighlight);

		const blockEntityHighlight = new BlockEntityHighlight(
			this.schematicRenderer,
			this.scene,
			this.camera,
			this.renderer,
			this.eventEmitter
		);
		this.addHighlight(blockEntityHighlight);
	}

	addHighlight(highlight: Highlight) {
		this.highlights.push(highlight);
		highlight.activate();
	}

	removeHighlight(highlight: Highlight) {
		highlight.deactivate();
		this.highlights = this.highlights.filter((h) => h !== highlight);
	}

	dispose() {
		this.interactionManager.dispose();
		this.blockPlacementHandler.dispose();
	}

	update(deltaTime: number) {
		this.highlights.forEach((highlight) => highlight.update(deltaTime));
	}
}
