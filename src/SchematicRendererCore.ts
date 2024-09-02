import * as THREE from "three";
import { Renderer } from "./renderer";
import { WorldMeshBuilder } from "./world_mesh_builder";

import { AnimationScheduler } from "./AnimationSchedueler";
import { EasingFunction, EasingFunctions } from "./EasingFunctions";
export class SchematicRendererCore {
	cameraDistance = 4;
	defaultCenter = new THREE.Vector3(0, 0, 0);
	schematicMeshes: { [key: string]: THREE.Mesh[] } = {};
	private scheduler: AnimationScheduler;

	constructor(
		private renderer: Renderer,
		private worldMeshBuilder: WorldMeshBuilder
	) {
		this.renderer.camera.position.set(
			this.cameraDistance,
			this.cameraDistance,
			this.cameraDistance
		);
		const center = new THREE.Vector3(0, 0, 0);
		this.renderer.camera.lookAt(center);
		this.scheduler = new AnimationScheduler(this);
	}

	async render() {
		const loadedSchematics = this.renderer.schematics;
		let maxDistance = this.cameraDistance;
		for (const key in loadedSchematics) {
			if (loadedSchematics.hasOwnProperty(key)) {
				const loadedSchematic = loadedSchematics[key];
				maxDistance = Math.max(
					loadedSchematic.width,
					loadedSchematic.height,
					loadedSchematic.length,
					maxDistance
				);
			}
		}
		if (maxDistance > this.cameraDistance) {
			this.renderer.camera.position.set(maxDistance, maxDistance, maxDistance);
			const center = new THREE.Vector3(
				maxDistance / 2,
				maxDistance / 2,
				maxDistance / 2
			);
			this.renderer.camera.lookAt(center);
		}
		this.renderer.animate();
		const startPerformance = performance.now();

		// Create a property to store schematic meshes if it doesn't exist
		if (!this.schematicMeshes) {
			this.schematicMeshes = {};
		}

		for (const key in loadedSchematics) {
			console.log("Rendering ", key);
			this.renderSchematic(key);
		}
		console.log(
			"Schematics rendered in",
			performance.now() - startPerformance,
			"ms"
		);
	}

	renderSchematic(schematicKey: string) {
		if (this.renderer.schematics[schematicKey]) {
			this.worldMeshBuilder
				.getSchematicMeshes(this.renderer.schematics[schematicKey])
				.then((schematicMeshes) => {
					this.schematicMeshes[schematicKey] = schematicMeshes;
				});
		}
	}

	changeSchematicTransparency(schematicKey: string, opacity: number) {
		if (this.schematicMeshes[schematicKey]) {
			this.schematicMeshes[schematicKey].forEach((mesh) => {
				if (mesh.material) {
					if (Array.isArray(mesh.material)) {
						mesh.material.forEach((mat) => {
							mat.opacity = opacity;
							mat.transparent = opacity < 1;
							mat.needsUpdate = true;
						});
					} else {
						mesh.material.opacity = opacity;
						mesh.material.transparent = opacity < 1;
						mesh.material.needsUpdate = true;
					}
				}
			});
		}
	}

	moveSchematic(schematicKey: string, x: number, y: number, z: number) {
		if (this.schematicMeshes[schematicKey]) {
			const movement = new THREE.Vector3(x, y, z);
			this.schematicMeshes[schematicKey].forEach((mesh) => {
				mesh.position.add(movement);
			});
		}
	}

	removeSchematic(schematicKey: string) {
		if (this.schematicMeshes[schematicKey]) {
			this.schematicMeshes[schematicKey].forEach((mesh) => {
				this.renderer.scene.remove(mesh);
				// Dispose of geometries and materials to free up memory
				if (mesh.geometry) mesh.geometry.dispose();
				if (mesh.material) {
					if (Array.isArray(mesh.material)) {
						mesh.material.forEach((mat) => mat.dispose());
					} else {
						mesh.material.dispose();
					}
				}
			});
			delete this.schematicMeshes[schematicKey];
		}
	}

	rotateSchematic(schematicKey: string, x: number, y: number, z: number) {
		if (this.schematicMeshes[schematicKey]) {
			const rotation = new THREE.Euler(
				THREE.MathUtils.degToRad(x),
				THREE.MathUtils.degToRad(y),
				THREE.MathUtils.degToRad(z)
			);
			this.schematicMeshes[schematicKey].forEach((mesh) => {
				mesh.quaternion.setFromEuler(rotation);
			});
		}
	}

	scaleSchematic(schematicKey: string, x: number, y: number, z: number) {
		if (this.schematicMeshes[schematicKey]) {
			const scale = new THREE.Vector3(x, y, z);
			this.schematicMeshes[schematicKey].forEach((mesh) => {
				mesh.scale.copy(scale);
			});
		}
	}

	resetSchematic(schematicKey: string) {
		if (this.schematicMeshes[schematicKey]) {
			this.schematicMeshes[schematicKey].forEach((mesh) => {
				mesh.position.set(0, 0, 0);
				mesh.rotation.set(0, 0, 0);
				mesh.scale.set(1, 1, 1);
				mesh.visible = true;
				if (mesh.material) {
					if (Array.isArray(mesh.material)) {
						mesh.material.forEach((mat) => {
							mat.opacity = 1;
							mat.transparent = false;
							mat.needsUpdate = true;
						});
					} else {
						mesh.material.opacity = 1;
						mesh.material.transparent = false;
						mesh.material.needsUpdate = true;
					}
				}
			});
		}
	}

	private animate(
		duration: number,
		easing: EasingFunction,
		updateFn: (progress: number) => void,
		completeFn?: () => void
	) {
		const startTime = performance.now();

		const update = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const easedProgress = easing(progress);

			updateFn(easedProgress);
			this.renderer.render();

			if (progress < 1) {
				requestAnimationFrame(update);
			} else {
				completeFn?.();
			}
		};

		requestAnimationFrame(update);
	}

	rotateSchematicSmooth(
		schematicKey: string,
		x: number,
		y: number,
		z: number,
		duration: number = 1000,
		easing: EasingFunction = EasingFunctions.easeInOutQuad
	) {
		if (this.schematicMeshes[schematicKey]) {
			const startRotation = new THREE.Quaternion().setFromEuler(
				this.schematicMeshes[schematicKey][0].rotation
			);
			const endRotation = new THREE.Quaternion().setFromEuler(
				new THREE.Euler(
					THREE.MathUtils.degToRad(x),
					THREE.MathUtils.degToRad(y),
					THREE.MathUtils.degToRad(z)
				)
			);

			this.animate(duration, easing, (progress) => {
				const currentRotation = new THREE.Quaternion().slerpQuaternions(
					startRotation,
					endRotation,
					progress
				);
				this.schematicMeshes[schematicKey].forEach((mesh) => {
					mesh.quaternion.copy(currentRotation);
				});
			});
		}
	}

	scaleSchematicSmooth(
		schematicKey: string,
		x: number,
		y: number,
		z: number,
		duration: number = 1000,
		easing: EasingFunction = EasingFunctions.easeInOutQuad
	) {
		if (this.schematicMeshes[schematicKey]) {
			const startScale = this.schematicMeshes[schematicKey][0].scale.clone();
			const endScale = new THREE.Vector3(x, y, z);

			this.animate(duration, easing, (progress) => {
				const currentScale = new THREE.Vector3(
					startScale.x + (endScale.x - startScale.x) * progress,
					startScale.y + (endScale.y - startScale.y) * progress,
					startScale.z + (endScale.z - startScale.z) * progress
				);
				this.schematicMeshes[schematicKey].forEach((mesh) => {
					mesh.scale.copy(currentScale);
				});
			});
		}
	}

	changeSchematicTransparencySmooth(
		schematicKey: string,
		opacity: number,
		duration: number = 1000,
		easing: EasingFunction = EasingFunctions.easeInOutQuad
	) {
		if (this.schematicMeshes[schematicKey]) {
			// TODO: This might be inneficient we might want to clone the materials before hand
			this.schematicMeshes[schematicKey].forEach((mesh) => {
				if (mesh.material) {
					if (Array.isArray(mesh.material)) {
						mesh.material = mesh.material.map((mat) => mat.clone());
					} else {
						mesh.material = mesh.material.clone();
					}
				}
			});

			const getMaterialOpacity = (
				material: THREE.Material | THREE.Material[]
			): number => {
				if (Array.isArray(material)) {
					return material[0]?.opacity ?? 1;
				} else {
					return material.opacity ?? 1;
				}
			};

			const startOpacity = getMaterialOpacity(
				this.schematicMeshes[schematicKey][0].material
			);

			this.animate(duration, easing, (progress) => {
				const currentOpacity =
					startOpacity + (opacity - startOpacity) * progress;
				this.schematicMeshes[schematicKey].forEach((mesh) => {
					if (mesh.material) {
						if (Array.isArray(mesh.material)) {
							mesh.material.forEach((mat) => {
								mat.opacity = currentOpacity;
								mat.transparent = currentOpacity < 1;
								mat.needsUpdate = true;
							});
						} else {
							mesh.material.opacity = currentOpacity;
							mesh.material.transparent = currentOpacity < 1;
							mesh.material.needsUpdate = true;
						}
					}
				});
			});
		} else {
			console.warn(`Schematic with key ${schematicKey} not found.`);
		}
	}

	moveSchematicSmooth(
		schematicKey: string,
		x: number,
		y: number,
		z: number,
		duration: number = 1000,
		easing: EasingFunction = EasingFunctions.easeInOutQuad
	) {
		if (this.schematicMeshes[schematicKey]) {
			const startPosition =
				this.schematicMeshes[schematicKey][0].position.clone();
			const endPosition = startPosition.clone().add(new THREE.Vector3(x, y, z));

			this.animate(duration, easing, (progress) => {
				const currentPosition = new THREE.Vector3(
					startPosition.x + (endPosition.x - startPosition.x) * progress,
					startPosition.y + (endPosition.y - startPosition.y) * progress,
					startPosition.z + (endPosition.z - startPosition.z) * progress
				);
				this.schematicMeshes[schematicKey].forEach((mesh) => {
					mesh.position.copy(currentPosition);
				});
			});
		}
	}

	scheduleRotation(
		schematicKey: string,
		x: number,
		y: number,
		z: number,
		duration: number = 1000,
		delay: number = 0,
		easing: EasingFunction = EasingFunctions.easeInOutQuad
	): this {
		return this.scheduler.schedule(() => {
			this.rotateSchematicSmooth(schematicKey, x, y, z, duration, easing);
		}, delay);
	}

	scheduleScaling(
		schematicKey: string,
		x: number,
		y: number,
		z: number,
		duration: number = 1000,
		delay: number = 0,
		easing: EasingFunction = EasingFunctions.easeInOutQuad
	): this {
		return this.scheduler.schedule(() => {
			this.scaleSchematicSmooth(schematicKey, x, y, z, duration, easing);
		}, delay);
	}

	scheduleTransparencyChange(
		schematicKey: string,
		opacity: number,
		duration: number = 1000,
		delay: number = 0,
		easing: EasingFunction = EasingFunctions.easeInOutQuad
	): this {
		return this.scheduler.schedule(() => {
			this.changeSchematicTransparencySmooth(
				schematicKey,
				opacity,
				duration,
				easing
			);
		}, delay);
	}

	scheduleMovement(
		schematicKey: string,
		x: number,
		y: number,
		z: number,
		duration: number = 1000,
		delay: number = 0,
		easing: EasingFunction = EasingFunctions.easeInOutQuad
	): this {
		return this.scheduler.schedule(() => {
			this.moveSchematicSmooth(schematicKey, x, y, z, duration, easing);
		}, delay);
	}

	clearSchedule(): this {
		return this.scheduler.clear();
	}
}
