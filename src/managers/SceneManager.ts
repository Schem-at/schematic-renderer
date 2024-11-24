// managers/SceneManager.ts
import * as THREE from "three";
import { EventEmitter } from "events";
import { Grid } from "./helpers/Grid";
import { Axes } from "./helpers/Axes";
import { SchematicRenderer } from "../SchematicRenderer";
import { SchematicObject } from "./SchematicObject";

export class SceneManager extends EventEmitter {
	public schematicRenderer: SchematicRenderer;
	public scene: THREE.Scene;
	private gridHelper: Grid | null = null;
	private axesHelper: Axes | null = null;
	private _showGrid: boolean = true;
	private _showAxes: boolean = true;
	private lights: Map<string, THREE.Light> = new Map();

	constructor(schematicRenderer: SchematicRenderer) {
		super();
		this.schematicRenderer = schematicRenderer;
		this.scene = new THREE.Scene();


		// Add ambient light
		const ambientLight = new THREE.AmbientLight(0xffffff, 2.2);
		this.scene.add(ambientLight);
		this.lights.set("ambientLight", ambientLight);

		// Add directional light
		const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
		directionalLight.position.set(20, 20, -20);
		this.scene.add(directionalLight);
		this.lights.set("directionalLight", directionalLight);
	}

	get showGrid(): boolean {
		return this._showGrid;
	}

	set showGrid(value: boolean) {
		this._showGrid = value;
		this.updateHelpers();
	}

	get showAxes(): boolean {
		return this._showAxes;
	}

	set showAxes(value: boolean) {
		this._showAxes = value;
		this.updateHelpers();
	}

	public updateHelpers() {
		this.toggleGrid(this._showGrid);
		this.toggleAxes(this._showAxes);
	}

	public addCameraHelper(camera: THREE.Camera, name: string): void {
		const helper = new THREE.CameraHelper(camera);
		helper.name = name;
		this.scene.add(helper);
	  }
	  
	  public removeCameraHelper(name: string): void {
		const helper = this.scene.getObjectByName(name);
		if (helper) {
		  this.scene.remove(helper);
		}
	  }
	
	  // Method to add a target indicator
	  public addTargetIndicator(position: THREE.Vector3, name: string = 'targetIndicator'): void {
		// Remove existing target indicator if any
		this.removeTargetIndicator(name);
	
		// Create a visual representation of the target (e.g., a sphere)
		const geometry = new THREE.SphereGeometry(0.5, 16, 16);
		const material = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow color
		const sphere = new THREE.Mesh(geometry, material);
		sphere.position.copy(position);
		sphere.name = name;
	
		// Add the sphere to the scene
		this.scene.add(sphere);
	  }
	
	  // Method to remove the target indicator
	  public removeTargetIndicator(name: string = 'targetIndicator'): void {
		const object = this.scene.getObjectByName(name);
		if (object) {
		  this.scene.remove(object);
		}
	  }
	
	  // Optional: Method to update the target indicator position
	  public updateTargetIndicatorPosition(position: THREE.Vector3, name: string = 'targetIndicator'): void {
		const object = this.scene.getObjectByName(name);
		if (object) {
		  object.position.copy(position);
		}
	  }
	

	  public addPathVisualization(group: THREE.Group, name: string): void {
		group.name = name;
		this.scene.add(group);
	  }
	
	  public removePathVisualization(name: string): void {
		const object = this.scene.getObjectByName(name);
		if (object) {
		  this.scene.remove(object);
		}
	  }
	
	// Light Management Methods
	public addLight(name: string, light: THREE.Light): void {
		if (this.lights.has(name)) {
			console.warn(`Light with name '${name}' already exists.`);
			return;
		}
		this.scene.add(light);
		this.lights.set(name, light);
		this.emit("lightAdded", { name, light });
	}

	public removeLight(name: string): void {
		const light = this.lights.get(name);
		if (light) {
			this.scene.remove(light);
			this.lights.delete(name);
			this.emit("lightRemoved", { name });
		} else {
			console.warn(`Light with name '${name}' does not exist.`);
		}
	}

	public updateLight(name: string, properties: Partial<THREE.Light>): void {
		const light = this.lights.get(name);
		if (light) {
			Object.assign(light, properties);
			this.emit("lightUpdated", { name, light });
		} else {
			console.warn(`Light with name '${name}' does not exist.`);
		}
	}

	public getLights(): Map<string, THREE.Light> {
		return this.lights;
	}
	toggleGrid(show: boolean) {
		if (show && !this.gridHelper) {
			this.gridHelper = new Grid(
				this.schematicRenderer.cameraManager.activeCamera.camera
			);
			this.scene.add(this.gridHelper);
		} else if (!show && this.gridHelper) {
			this.scene.remove(this.gridHelper);
			this.gridHelper = null;
		}
	}

	toggleAxes(show: boolean) {
		if (show && !this.axesHelper) {
			this.axesHelper = new Axes(
				5,
				this.schematicRenderer.cameraManager.activeCamera.camera
			);
			this.scene.add(this.axesHelper);
		} else if (!show && this.axesHelper) {
			this.scene.remove(this.axesHelper);
			this.axesHelper = null;
		}
	}

	addDebugCuboide(position: THREE.Vector3, size: THREE.Vector3, color: number) {
		const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
		const material = new THREE.MeshBasicMaterial({ color: color });
		const cube = new THREE.Mesh(geometry, material);
		cube.position.copy(position);
		this.scene.add(cube);
	}

	addDebugBoundingBox(
		position: THREE.Vector3,
		size: THREE.Vector3,
		color: number
	) {
		const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
		const edges = new THREE.EdgesGeometry(geometry);
		const line = new THREE.LineSegments(
			edges,
			new THREE.LineBasicMaterial({ color: color })
		);
		line.position.copy(position);
		this.scene.add(line);
	}

	addDebugText(
		text: string,
		position: THREE.Vector3,
		color: number = 0x000000,
		backgroundColor: number = 0xffffff
	) {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (context) {
			context.font = "Bold 40px Arial";
			context.fillStyle = "rgba(" + backgroundColor + ", 1)";
			context.fillRect(0, 0, context.measureText(text).width, 50);
			context.fillStyle = "rgba(" + color + ", 1)";
			context.fillText(text, 0, 40);
		}
		const texture = new THREE.CanvasTexture(canvas);
		const material = new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
		});
		const sprite = new THREE.Sprite(material);
		sprite.position.copy(position);
		sprite.scale.set(5, 2, 1);
		this.scene.add(sprite);
	}

	public removeObject(name: string): void {
		const object = this.scene.getObjectByName(name);
		if (object) {
			this.scene.remove(object);
			this.emit("objectRemoved", { name });
		} else {
			console.warn(`Object with name '${name}' does not exist.`);
		}
	}

	public getObjectByName(name: string): THREE.Object3D | undefined {
		return this.scene.getObjectByName(name);
	}

	public getAllObjects(): THREE.Object3D[] {
		const objects: THREE.Object3D[] = [];
		this.scene.traverse((child) => {
			objects.push(child);
		});
		return objects;
	}

	// Overriding the add method to set object names if provided
	public add(object: THREE.Object3D, name?: string): void {
		if (name) object.name = name;
		this.scene.add(object);
		this.emit("objectAdded", { name: object.name, object });
	}

	// Scene Settings Methods
	public setBackgroundColor(color: THREE.Color | string | number): void {
		this.scene.background = new THREE.Color(color);
		this.emit("backgroundColorChanged", { color });
	}

	public setFog(fog: THREE.Fog | THREE.FogExp2): void {
		this.scene.fog = fog;
		this.emit("fogChanged", { fog });
	}

	public setEnvironmentMap(envMap: THREE.Texture): void {
		this.scene.environment = envMap;
		this.emit("environmentMapChanged", { envMap });
	}

	addSchematic(schematic: SchematicObject): void {
		this.scene.add(schematic.group);
		this.emit("schematicAdded", schematic);
	}

	removeSchematic(schematic: SchematicObject): void {
		this.scene.remove(schematic.group);
		this.emit("schematicRemoved", schematic);
	}
	// Additional methods for managing scene components
}
