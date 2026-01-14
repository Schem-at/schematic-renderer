import * as THREE from "three";
import { INVISIBLE_BLOCKS } from "./WorldMeshBuilder";
// Fixed instanced rendering with proper geometry merging and block variants

export class InstancedBlockRenderer {
	private instancedMeshes: Map<string, THREE.InstancedMesh[]> = new Map();
	private instanceCounts: Map<string, number> = new Map();
	private maxInstancesPerType: number = 50000; // Increased limit
	private overflowInstances: Map<string, THREE.Object3D[]> = new Map(); // For overflow blocks

	constructor(
		private group: THREE.Group,
		private paletteCache: any
	) {}

	private createBlockTypeKey(blockData: any, paletteIndex: number): string {
		const blockState = this.paletteCache?.blockData?.[paletteIndex];
		if (!blockState) return `unknown_${paletteIndex}`;

		const properties = blockState.properties || {};
		const propertyString =
			Object.keys(properties).length > 0
				? `[${Object.entries(properties)
						.map(([k, v]) => `${k}=${v}`)
						.join(",")}]`
				: "";

		return `${blockData.blockName}${propertyString}`;
	}

	private mergeGeometriesManual(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
		if (!geometries || geometries.length === 0) return null;
		if (geometries.length === 1) return geometries[0].clone();

		const validGeometries = geometries.filter(
			(geo) => geo && geo.attributes.position && geo.attributes.position.count > 0
		);

		if (validGeometries.length === 0) return null;
		if (validGeometries.length === 1) return validGeometries[0].clone();

		let totalVertices = 0;
		let totalIndices = 0;
		let hasNormals = false;
		let hasUVs = false;

		validGeometries.forEach((geo) => {
			totalVertices += geo.attributes.position.count;
			hasNormals = hasNormals || !!geo.attributes.normal;
			hasUVs = hasUVs || !!geo.attributes.uv;

			if (geo.index) {
				totalIndices += geo.index.count;
			} else {
				totalIndices += geo.attributes.position.count;
			}
		});

		const mergedPositions = new Float32Array(totalVertices * 3);
		const mergedNormals = hasNormals ? new Float32Array(totalVertices * 3) : null;
		const mergedUVs = hasUVs ? new Float32Array(totalVertices * 2) : null;
		const mergedIndices = new Uint32Array(totalIndices);

		let positionOffset = 0;
		let indexOffset = 0;
		let vertexOffset = 0;

		validGeometries.forEach((geo) => {
			const positions = geo.attributes.position.array as Float32Array;
			const normals = geo.attributes.normal?.array as Float32Array;
			const uvs = geo.attributes.uv?.array as Float32Array;
			const indices = geo.index?.array;

			mergedPositions.set(positions, positionOffset);

			if (normals && mergedNormals) {
				mergedNormals.set(normals, positionOffset);
			}

			if (uvs && mergedUVs) {
				mergedUVs.set(uvs, (positionOffset / 3) * 2);
			}

			const vertexCount = geo.attributes.position.count;
			let indexCount = 0;

			if (indices) {
				for (let i = 0; i < indices.length; i++) {
					mergedIndices[indexOffset + i] = indices[i] + vertexOffset;
				}
				indexCount = indices.length;
			} else {
				for (let i = 0; i < vertexCount; i++) {
					mergedIndices[indexOffset + i] = vertexOffset + i;
				}
				indexCount = vertexCount;
			}

			positionOffset += positions.length;
			indexOffset += indexCount;
			vertexOffset += vertexCount;
		});

		const mergedGeometry = new THREE.BufferGeometry();
		mergedGeometry.setAttribute("position", new THREE.BufferAttribute(mergedPositions, 3));

		if (mergedNormals) {
			mergedGeometry.setAttribute("normal", new THREE.BufferAttribute(mergedNormals, 3));
		}

		if (mergedUVs) {
			mergedGeometry.setAttribute("uv", new THREE.BufferAttribute(mergedUVs, 2));
		}

		mergedGeometry.setIndex(new THREE.BufferAttribute(mergedIndices, 1));

		return mergedGeometry;
	}

	public initializeInstancedMeshes(): void {
		console.log("🔥 Initializing VARIANT-AWARE instanced rendering system...");

		if (!this.paletteCache?.isReady) {
			throw new Error("Palette cache not ready for instanced rendering");
		}

		this.disposeInstancedMeshes();

		const uniqueBlockTypes = new Set<string>();

		this.paletteCache.blockData.forEach((blockData: any, paletteIndex: number) => {
			const blockName = blockData.blockName;

			if (INVISIBLE_BLOCKS.has(blockName)) {
				return;
			}

			const blockTypeKey = this.createBlockTypeKey(blockData, paletteIndex);

			if (uniqueBlockTypes.has(blockTypeKey)) {
				return;
			}
			uniqueBlockTypes.add(blockTypeKey);

			const instancedMeshesForBlock: THREE.InstancedMesh[] = [];

			blockData.materialGroups.forEach((materialGroup: any, groupIndex: number) => {
				const geometry = materialGroup.baseGeometry;
				const material = materialGroup.material;

				if (!geometry || geometry.attributes.position.count === 0) {
					return;
				}

				const instancedMesh = new THREE.InstancedMesh(geometry, material, this.maxInstancesPerType);

				instancedMesh.name = `instanced_${blockTypeKey}_part${groupIndex}`;
				instancedMesh.userData.paletteIndex = paletteIndex;
				instancedMesh.userData.blockTypeKey = blockTypeKey;
				instancedMesh.userData.materialGroupIndex = groupIndex;

				this.configureMeshForCategory(instancedMesh, blockData.category);

				instancedMesh.visible = false;
				instancedMesh.count = 0;

				instancedMeshesForBlock.push(instancedMesh);
				this.group.add(instancedMesh);
			});

			this.instancedMeshes.set(blockTypeKey, instancedMeshesForBlock);
			this.instanceCounts.set(blockTypeKey, 0);
		});

		console.log(`🎯 Created instanced meshes for ${uniqueBlockTypes.size} unique block variants`);
	}

	public initializeInstancedMeshesMerged(): void {
		console.log("🔥 Initializing MERGED variant-aware instanced rendering...");

		if (!this.paletteCache?.isReady) {
			throw new Error("Palette cache not ready for instanced rendering");
		}

		this.disposeInstancedMeshes();

		const uniqueBlockTypes = new Set<string>();

		this.paletteCache.blockData.forEach((blockData: any, paletteIndex: number) => {
			const blockName = blockData.blockName;

			if (INVISIBLE_BLOCKS.has(blockName)) {
				return;
			}

			const blockTypeKey = this.createBlockTypeKey(blockData, paletteIndex);

			if (uniqueBlockTypes.has(blockTypeKey)) {
				return;
			}
			uniqueBlockTypes.add(blockTypeKey);

			const geometriesToMerge = blockData.materialGroups
				.map((group: any) => group.baseGeometry)
				.filter(
					(geo: THREE.BufferGeometry) =>
						geo && geo.attributes.position && geo.attributes.position.count > 0
				);

			if (geometriesToMerge.length === 0) {
				console.warn(`No valid geometries for ${blockTypeKey}`);
				return;
			}

			const mergedGeometry = this.mergeGeometriesManual(geometriesToMerge);

			if (!mergedGeometry || mergedGeometry.attributes.position.count === 0) {
				console.warn(`Failed to merge geometries for ${blockTypeKey}`);
				return;
			}

			const materials = blockData.materialGroups
				.map((group: any) => group.material)
				.filter((mat: THREE.Material) => mat);

			const material = materials[0];

			const instancedMesh = new THREE.InstancedMesh(
				mergedGeometry,
				material,
				this.maxInstancesPerType
			);

			instancedMesh.name = `instanced_${blockTypeKey}_merged`;
			instancedMesh.userData.paletteIndex = paletteIndex;
			instancedMesh.userData.blockTypeKey = blockTypeKey;

			this.configureMeshForCategory(instancedMesh, blockData.category);

			instancedMesh.visible = false;
			instancedMesh.count = 0;

			this.instancedMeshes.set(blockTypeKey, [instancedMesh]);
			this.instanceCounts.set(blockTypeKey, 0);
			this.group.add(instancedMesh);

			console.log(
				`✅ Created merged instanced mesh for ${blockTypeKey} with ${mergedGeometry.attributes.position.count} vertices`
			);
		});

		console.log(
			`🎯 Created merged instanced meshes for ${uniqueBlockTypes.size} unique block variants`
		);
	}

	public renderBlocksInstanced(
		allBlocks: Array<{ x: number; y: number; z: number; paletteIndex: number }>
	): void {
		console.log(`🚀 Rendering ${allBlocks.length} blocks with overflow handling...`);
		const startTime = performance.now();

		this.instanceCounts.forEach((_, blockTypeKey) => {
			this.instanceCounts.set(blockTypeKey, 0);
		});
		this.clearOverflowInstances();

		const blocksByType = new Map<string, Array<{ x: number; y: number; z: number }>>();

		for (const block of allBlocks) {
			const blockData = this.paletteCache.blockData[block.paletteIndex];
			if (!blockData) continue;

			if (INVISIBLE_BLOCKS.has(blockData.blockName)) continue;

			const blockTypeKey = this.createBlockTypeKey(blockData, block.paletteIndex);

			if (!blocksByType.has(blockTypeKey)) {
				blocksByType.set(blockTypeKey, []);
			}
			blocksByType.get(blockTypeKey)!.push({ x: block.x, y: block.y, z: block.z });
		}

		blocksByType.forEach((positions, blockTypeKey) => {
			this.setInstancesWithOverflow(blockTypeKey, positions);
		});

		this.instancedMeshes.forEach((meshes, blockTypeKey) => {
			const count = this.instanceCounts.get(blockTypeKey) || 0;

			meshes.forEach((mesh) => {
				mesh.visible = count > 0;
				mesh.count = Math.min(count, this.maxInstancesPerType);
			});
		});

		const duration = performance.now() - startTime;
		console.log(`⚡ Instanced rendering with overflow completed in ${duration.toFixed(2)}ms`);

		this.logInstancedStats();
	}

	private setInstancesWithOverflow(
		blockTypeKey: string,
		positions: Array<{ x: number; y: number; z: number }>
	): void {
		const instancedMeshes = this.instancedMeshes.get(blockTypeKey);
		if (!instancedMeshes) return;

		const instanceCount = Math.min(positions.length, this.maxInstancesPerType);
		const overflowCount = positions.length - instanceCount;

		if (instanceCount > 0) {
			const matrix = new THREE.Matrix4();

			instancedMeshes.forEach((instancedMesh) => {
				for (let i = 0; i < instanceCount; i++) {
					const pos = positions[i];
					matrix.setPosition(pos.x, pos.y, pos.z);
					instancedMesh.setMatrixAt(i, matrix);
				}
				instancedMesh.instanceMatrix.needsUpdate = true;
			});
		}

		if (overflowCount > 0) {
			console.log(
				`⚠️ ${blockTypeKey}: ${overflowCount} blocks exceed instance limit, creating individual meshes`
			);
			const overflowMeshes: THREE.Object3D[] = [];
			for (let i = instanceCount; i < positions.length; i++) {
				const pos = positions[i];
				instancedMeshes.forEach((instancedMesh, groupIndex) => {
					const overflowMesh = new THREE.Mesh(instancedMesh.geometry, instancedMesh.material);

					overflowMesh.position.set(pos.x, pos.y, pos.z);
					overflowMesh.name = `overflow_${blockTypeKey}_${i}_part${groupIndex}`;

					overflowMeshes.push(overflowMesh);
					this.group.add(overflowMesh);
				});
			}

			this.overflowInstances.set(blockTypeKey, overflowMeshes);
		}

		this.instanceCounts.set(blockTypeKey, positions.length);
	}

	private clearOverflowInstances(): void {
		this.overflowInstances.forEach((meshes) => {
			meshes.forEach((mesh) => {
				this.group.remove(mesh);
			});
		});
		this.overflowInstances.clear();
	}

	private logInstancedStats(): void {
		console.log("📊 ENHANCED INSTANCED RENDERING STATS:");
		console.log("=".repeat(60));

		let totalInstances = 0;
		let totalInstancedMeshObjects = 0;
		let totalOverflowMeshes = 0;
		let typesWithOverflow = 0;

		this.instanceCounts.forEach((count, blockTypeKey) => {
			if (count > 0) {
				const meshes = this.instancedMeshes.get(blockTypeKey) || [];
				const overflowMeshes = this.overflowInstances.get(blockTypeKey) || [];
				const instancedCount = Math.min(count, this.maxInstancesPerType);
				const overflowCount = overflowMeshes.length;

				if (overflowCount > 0) {
					console.log(
						`  ${blockTypeKey}: ${instancedCount} instanced + ${overflowCount} individual`
					);
					typesWithOverflow++;
				} else {
					console.log(`  ${blockTypeKey}: ${count} instances × ${meshes.length} parts`);
				}

				totalInstances += count;
				totalInstancedMeshObjects += meshes.length;
				totalOverflowMeshes += overflowCount;
			}
		});

		console.log("=".repeat(60));
		console.log(`Total Block Instances: ${totalInstances}`);
		console.log(`Instanced Mesh Objects: ${totalInstancedMeshObjects}`);
		console.log(`Overflow Individual Meshes: ${totalOverflowMeshes}`);
		console.log(`Block Types with Overflow: ${typesWithOverflow}`);
		console.log(`Estimated Draw Calls: ${totalInstancedMeshObjects + totalOverflowMeshes}`);
	}

	private configureMeshForCategory(mesh: THREE.InstancedMesh, category: string): void {
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.frustumCulled = false;

		const material = mesh.material as THREE.Material;

		switch (category) {
			case "water":
				mesh.renderOrder = 3;
				material.transparent = true;
				if ("opacity" in material) (material as any).opacity = 0.8;
				break;
			case "transparent":
				mesh.renderOrder = 2;
				material.transparent = true;
				break;
			case "emissive":
				mesh.renderOrder = 1;
				break;
			case "redstone":
				mesh.userData.isDynamic = true;
				break;
		}
	}

	public disposeInstancedMeshes(): void {
		this.instancedMeshes.forEach((meshes) => {
			meshes.forEach((mesh) => {
				this.group.remove(mesh);
				mesh.dispose();
			});
		});
		this.instancedMeshes.clear();
		this.instanceCounts.clear();
	}

	public getInstancedMeshes(blockName: string): THREE.InstancedMesh[] {
		return this.instancedMeshes.get(blockName) || [];
	}
}
