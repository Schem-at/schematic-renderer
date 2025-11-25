/**
 * GPUMeshFactory
 * 
 * Creates THREE.js meshes from GPU compute output buffers.
 * Supports both zero-copy GPU path (when using WebGPU renderer)
 * and traditional CPU readback path (for WebGL compatibility).
 */

import * as THREE from 'three';
import type { ChunkGeometryData } from '../types';

// Constants matching compute output format
const POSITION_SCALE = 1024;

/**
 * Convert Int8 normals to Float32 for WebGPU compatibility.
 * WebGPU requires vertex buffer strides to be multiples of 4 bytes.
 */
function convertInt8NormalsToFloat32(int8Normals: Int8Array): Float32Array {
	const float32Normals = new Float32Array(int8Normals.length);
	for (let i = 0; i < int8Normals.length; i++) {
		float32Normals[i] = int8Normals[i] / 127.0;
	}
	return float32Normals;
}

export interface GPUMeshOptions {
	/** Category for render ordering and material setup */
	category: string;
	/** Chunk world position offset */
	origin: [number, number, number];
	/** Array of materials to use */
	materials: THREE.Material[];
	/** Name prefix for the mesh */
	namePrefix?: string;
	/** Whether to enable frustum culling */
	frustumCulled?: boolean;
}

/**
 * Factory for creating meshes from GPU compute output
 */
export class GPUMeshFactory {

	/**
	 * Create a mesh from ChunkGeometryData (CPU readback path)
	 * This is the standard path that works with both WebGL and WebGPU renderers
	 */
	public static createMeshFromGeometryData(
		geoData: ChunkGeometryData,
		options: GPUMeshOptions
	): THREE.Mesh {
		const geometry = new THREE.BufferGeometry();

		// Handle quantized positions (Int16Array)
		if (geoData.positions) {
			if (geoData.positions instanceof Int16Array) {
				const posAttr = new THREE.BufferAttribute(geoData.positions, 3, false);
				geometry.setAttribute('position', posAttr);
			} else {
				// Float32Array path
				const posAttr = new THREE.BufferAttribute(geoData.positions, 3);
				geometry.setAttribute('position', posAttr);
			}
		}

		// Handle normals - convert Int8 to Float32 for WebGPU compatibility
		if (geoData.normals) {
			if (geoData.normals instanceof Int8Array) {
				const float32Normals = convertInt8NormalsToFloat32(geoData.normals);
				const normAttr = new THREE.BufferAttribute(float32Normals, 3);
				geometry.setAttribute('normal', normAttr);
			} else {
				// Already Float32Array
				const normAttr = new THREE.BufferAttribute(geoData.normals as Float32Array, 3);
				geometry.setAttribute('normal', normAttr);
			}
		}

		// UVs are always Float32Array
		if (geoData.uvs) {
			const uvAttr = new THREE.BufferAttribute(geoData.uvs, 2);
			geometry.setAttribute('uv', uvAttr);
		}

		// Indices
		if (geoData.indices) {
			geometry.setIndex(new THREE.BufferAttribute(geoData.indices, 1));
		}

		// Material groups
		if (geoData.groups) {
			for (const group of geoData.groups) {
				geometry.addGroup(group.start, group.count, group.materialIndex);
			}
		}

		// Create mesh
		const mesh = new THREE.Mesh(geometry, options.materials);
		mesh.name = `${options.namePrefix || geoData.category}_chunk`;

		// Apply de-quantization scale for Int16 positions
		if (geoData.positions instanceof Int16Array) {
			const scale = 1.0 / POSITION_SCALE;
			mesh.scale.setScalar(scale);
		}

		// Apply chunk origin offset
		mesh.position.set(options.origin[0], options.origin[1], options.origin[2]);

		// Configure rendering properties
		GPUMeshFactory.configureMeshForCategory(mesh, options.category);

		// Set frustum culling
		mesh.frustumCulled = options.frustumCulled ?? true;

		return mesh;
	}

	/**
	 * Create multiple meshes from an array of geometry data
	 */
	public static createMeshesFromResult(
		geometries: ChunkGeometryData[],
		origin: [number, number, number],
		materials: THREE.Material[]
	): THREE.Mesh[] {
		return geometries.map(geoData =>
			GPUMeshFactory.createMeshFromGeometryData(geoData, {
				category: geoData.category,
				origin,
				materials,
			})
		);
	}

	/**
	 * Configure mesh properties based on block category
	 */
	public static configureMeshForCategory(mesh: THREE.Mesh, category: string): void {
		mesh.castShadow = true;
		mesh.receiveShadow = true;

		const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

		materials.forEach((mat) => {
			if (!(mat instanceof THREE.Material)) return;

			switch (category) {
				case 'water':
					mesh.renderOrder = 3;
					mat.transparent = true;
					if ('opacity' in mat) (mat as any).opacity = 0.8;
					break;
				case 'transparent':
					mesh.renderOrder = 2;
					mat.transparent = true;
					break;
				case 'emissive':
					mesh.renderOrder = 1;
					break;
				case 'redstone':
					mesh.userData.isDynamic = true;
					break;
				default:
					// solid blocks
					mesh.renderOrder = 0;
			}
		});
	}

	/**
	 * Update an existing mesh's geometry with new data
	 * This is more efficient than creating a new mesh when updating chunks
	 */
	public static updateMeshGeometry(
		mesh: THREE.Mesh,
		geoData: ChunkGeometryData
	): void {
		const geometry = mesh.geometry;

		// Update positions
		if (geoData.positions) {
			const posAttr = geometry.getAttribute('position');
			if (posAttr && posAttr.array.length === geoData.positions.length) {
				(posAttr.array as typeof geoData.positions).set(geoData.positions);
				posAttr.needsUpdate = true;
			} else {
				// Size changed, need to recreate attribute
				if (geoData.positions instanceof Int16Array) {
					geometry.setAttribute('position', new THREE.BufferAttribute(geoData.positions, 3, false));
				} else {
					geometry.setAttribute('position', new THREE.BufferAttribute(geoData.positions, 3));
				}
			}
		}

		// Update normals - convert Int8 to Float32 for WebGPU compatibility
		if (geoData.normals) {
			const float32Normals = geoData.normals instanceof Int8Array
				? convertInt8NormalsToFloat32(geoData.normals)
				: geoData.normals as Float32Array;

			const normAttr = geometry.getAttribute('normal');
			if (normAttr && normAttr.array.length === float32Normals.length) {
				(normAttr.array as Float32Array).set(float32Normals);
				normAttr.needsUpdate = true;
			} else {
				geometry.setAttribute('normal', new THREE.BufferAttribute(float32Normals, 3));
			}
		}

		// Update UVs
		if (geoData.uvs) {
			const uvAttr = geometry.getAttribute('uv');
			if (uvAttr && uvAttr.array.length === geoData.uvs.length) {
				(uvAttr.array as Float32Array).set(geoData.uvs);
				uvAttr.needsUpdate = true;
			} else {
				geometry.setAttribute('uv', new THREE.BufferAttribute(geoData.uvs, 2));
			}
		}

		// Update indices
		if (geoData.indices) {
			const indexAttr = geometry.getIndex();
			if (indexAttr && indexAttr.array.length === geoData.indices.length) {
				(indexAttr.array as typeof geoData.indices).set(geoData.indices);
				indexAttr.needsUpdate = true;
			} else {
				geometry.setIndex(new THREE.BufferAttribute(geoData.indices, 1));
			}
		}

		// Update groups
		geometry.clearGroups();
		if (geoData.groups) {
			for (const group of geoData.groups) {
				geometry.addGroup(group.start, group.count, group.materialIndex);
			}
		}

		// Recompute bounding box/sphere
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
	}

	/**
	 * Dispose of a mesh and its geometry
	 */
	public static disposeMesh(mesh: THREE.Mesh): void {
		if (mesh.geometry) {
			mesh.geometry.dispose();
		}
		// Note: Materials are typically shared and managed separately
	}
}
