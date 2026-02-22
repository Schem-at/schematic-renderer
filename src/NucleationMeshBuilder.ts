// NucleationMeshBuilder.ts
// Main-thread mesh builder that manages the NucleationMesh worker and creates Three.js objects.

import * as THREE from "three";
import JSZip from "jszip";
import type { SchematicRenderer } from "./SchematicRenderer";
import type { SchematicWrapper } from "./nucleationExports";
import type { MeshConfigOptions, MeshProgress } from "./types";

// @ts-ignore - Vite worker import
import NucleationMeshWorker from "./workers/NucleationMesh.worker.ts?worker";

interface LayerData {
	positions: Float32Array;
	normals: Float32Array;
	uvs: Float32Array;
	colors: Float32Array;
	indices: Uint32Array;
	vertexCount: number;
	indexCount: number;
}

interface ChunkMessage {
	chunkCoord: string;
	layers: {
		opaque: LayerData | null;
		cutout: LayerData | null;
		transparent: LayerData | null;
	};
	currentChunk: number;
	totalChunks: number;
}

export class NucleationMeshBuilder {
	private worker: Worker | null = null;
	private pendingRequests: Map<
		string,
		{
			resolve: (value: any) => void;
			reject: (reason: any) => void;
			chunkMap: Map<string, THREE.Object3D[]>;
			atlasTexture: THREE.DataTexture | null;
			onProgress?: (progress: MeshProgress) => void;
			onChunkReady?: (coord: string, meshes: THREE.Object3D[]) => void;
		}
	> = new Map();
	private isInitialized = false;
	private initPromise: Promise<void> | null = null;

	constructor(_renderer: SchematicRenderer) {
		// Renderer reference reserved for future use (e.g., accessing scene settings)
	}

	async initialize(): Promise<void> {
		if (this.initPromise) return this.initPromise;

		this.initPromise = new Promise<void>((resolve, reject) => {
			this.worker = new NucleationMeshWorker();

			const initHandler = (event: MessageEvent) => {
				const { type, message } = event.data;
				if (type === "initialized") {
					this.isInitialized = true;
					this.worker!.removeEventListener("message", initHandler);
					this.worker!.addEventListener("message", (e) => this.handleMessage(e));
					resolve();
				} else if (type === "error") {
					reject(new Error(message));
				}
			};

			this.worker.addEventListener("message", initHandler);
			this.worker.postMessage({ type: "init" });
		});

		return this.initPromise;
	}

	async setResourcePacks(packs: Blob[]): Promise<void> {
		if (!this.worker || !this.isInitialized) {
			throw new Error("NucleationMeshBuilder not initialized");
		}

		// Merge resource packs using JSZip (later packs override earlier ones)
		const merged = new JSZip();

		for (const pack of packs) {
			const zip = await JSZip.loadAsync(pack);
			for (const [path, file] of Object.entries(zip.files)) {
				if (!file.dir) {
					merged.file(path, await file.async("arraybuffer"));
				}
			}
		}

		const mergedBytes = await merged.generateAsync({ type: "arraybuffer" });

		return new Promise<void>((resolve, reject) => {
			const handler = (event: MessageEvent) => {
				const { type, message } = event.data;
				if (type === "resourcePackLoaded") {
					this.worker!.removeEventListener("message", handler);
					resolve();
				} else if (type === "error" && !event.data.requestId) {
					this.worker!.removeEventListener("message", handler);
					reject(new Error(message));
				}
			};

			this.worker!.addEventListener("message", handler);
			this.worker!.postMessage({ type: "setResourcePack", packBytes: mergedBytes }, [mergedBytes]);
		});
	}

	async meshSchematic(
		schematic: SchematicWrapper,
		config: MeshConfigOptions,
		chunkSize: number,
		onProgress?: (progress: MeshProgress) => void,
		onChunkReady?: (coord: string, meshes: THREE.Object3D[]) => void
	): Promise<{ chunkMap: Map<string, THREE.Object3D[]>; atlasTexture: THREE.DataTexture }> {
		if (!this.worker || !this.isInitialized) {
			throw new Error("NucleationMeshBuilder not initialized");
		}

		const requestId = `mesh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const schematicBytes = schematic.to_schematic();

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(requestId, {
				resolve,
				reject,
				chunkMap: new Map(),
				atlasTexture: null,
				onProgress,
				onChunkReady,
			});

			const buffer = schematicBytes.buffer.slice(
				schematicBytes.byteOffset,
				schematicBytes.byteOffset + schematicBytes.byteLength
			);

			this.worker!.postMessage(
				{
					type: "meshSchematic",
					schematicBytes: buffer,
					config,
					chunkSize,
					requestId,
				},
				[buffer]
			);
		});
	}

	private handleMessage(event: MessageEvent): void {
		const data = event.data;
		const { type, requestId } = data;

		if (type === "error" && requestId) {
			const request = this.pendingRequests.get(requestId);
			if (request) {
				this.pendingRequests.delete(requestId);
				request.reject(new Error(data.message));
			}
			return;
		}

		const request = requestId ? this.pendingRequests.get(requestId) : null;
		if (!request) return;

		switch (type) {
			case "progress":
				request.onProgress?.({
					phase: data.phase,
					chunksDone: data.chunksDone,
					chunksTotal: data.chunksTotal,
					verticesSoFar: data.verticesSoFar,
					trianglesSoFar: data.trianglesSoFar,
				});
				break;

			case "atlasReady":
				request.atlasTexture = this.createAtlasTexture(data.atlas);
				break;

			case "chunkReady":
				this.handleChunkReady(request, data);
				break;

			case "meshComplete":
				this.pendingRequests.delete(requestId);
				if (!request.atlasTexture) {
					request.reject(new Error("No atlas texture received"));
					return;
				}
				request.resolve({
					chunkMap: request.chunkMap,
					atlasTexture: request.atlasTexture,
				});
				break;
		}
	}

	private createAtlasTexture(atlas: {
		width: number;
		height: number;
		rgba: Uint8Array;
	}): THREE.DataTexture {
		if (!atlas.rgba || atlas.rgba.length === 0 || atlas.width === 0) {
			// Fallback white pixel
			const data = new Uint8Array([255, 255, 255, 255]);
			const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
			tex.needsUpdate = true;
			return tex;
		}

		const pixels = new Uint8Array(atlas.rgba);
		const tex = new THREE.DataTexture(pixels, atlas.width, atlas.height, THREE.RGBAFormat);
		tex.magFilter = THREE.NearestFilter;
		tex.minFilter = THREE.NearestFilter;
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.flipY = false;
		tex.needsUpdate = true;
		return tex;
	}

	private handleChunkReady(
		request: {
			chunkMap: Map<string, THREE.Object3D[]>;
			atlasTexture: THREE.DataTexture | null;
			onChunkReady?: (coord: string, meshes: THREE.Object3D[]) => void;
		},
		data: ChunkMessage
	): void {
		const atlasTexture = request.atlasTexture;
		if (!atlasTexture) return;

		const meshes: THREE.Object3D[] = [];

		const layerEntries = [
			{ layer: data.layers.opaque, name: "opaque" },
			{ layer: data.layers.cutout, name: "cutout" },
			{ layer: data.layers.transparent, name: "transparent" },
		] as const;

		for (const { layer, name } of layerEntries) {
			if (!layer || layer.vertexCount === 0) continue;

			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute("position", new THREE.BufferAttribute(layer.positions, 3));
			geometry.setAttribute("normal", new THREE.BufferAttribute(layer.normals, 3));
			geometry.setAttribute("uv", new THREE.BufferAttribute(layer.uvs, 2));

			// Convert RGBA (4 components) vertex colors to RGB (3 components) for Three.js
			const rgb = new Float32Array(layer.vertexCount * 3);
			for (let v = 0; v < layer.vertexCount; v++) {
				rgb[v * 3] = layer.colors[v * 4];
				rgb[v * 3 + 1] = layer.colors[v * 4 + 1];
				rgb[v * 3 + 2] = layer.colors[v * 4 + 2];
			}
			geometry.setAttribute("color", new THREE.BufferAttribute(rgb, 3));

			geometry.setIndex(new THREE.BufferAttribute(layer.indices, 1));

			let material: THREE.MeshBasicMaterial;
			if (name === "opaque") {
				material = new THREE.MeshBasicMaterial({
					map: atlasTexture,
					vertexColors: true,
				});
			} else if (name === "cutout") {
				material = new THREE.MeshBasicMaterial({
					map: atlasTexture,
					vertexColors: true,
					alphaTest: 0.5,
					side: THREE.DoubleSide,
				});
			} else {
				material = new THREE.MeshBasicMaterial({
					map: atlasTexture,
					vertexColors: true,
					transparent: true,
					depthWrite: false,
					side: THREE.DoubleSide,
				});
			}

			const mesh = new THREE.Mesh(geometry, material);
			mesh.name = `${data.chunkCoord}_${name}`;
			meshes.push(mesh);
		}

		request.chunkMap.set(data.chunkCoord, meshes);
		request.onChunkReady?.(data.chunkCoord, meshes);
	}

	dispose(): void {
		// Reject all pending requests
		for (const [, request] of this.pendingRequests) {
			request.reject(new Error("NucleationMeshBuilder disposed"));
		}
		this.pendingRequests.clear();

		// Terminate worker
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}

		this.isInitialized = false;
		this.initPromise = null;
	}
}
