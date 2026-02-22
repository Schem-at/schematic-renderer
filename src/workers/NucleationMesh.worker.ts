// NucleationMesh.worker.ts
// Worker that runs nucleation WASM meshing off the main thread using the global atlas workflow.

import init, { SchematicWrapper, ResourcePackWrapper, MeshConfigWrapper } from "nucleation";

let isInitialized = false;
let resourcePack: any | null = null;

// Initialize nucleation WASM
async function handleInit() {
	try {
		await init();
		isInitialized = true;
		self.postMessage({ type: "initialized" });
	} catch (error: any) {
		self.postMessage({ type: "error", message: `WASM init failed: ${error.message}` });
	}
}

// Set resource pack from merged ZIP bytes
function handleSetResourcePack(packBytes: ArrayBuffer) {
	try {
		const bytes = new Uint8Array(packBytes);
		resourcePack = new ResourcePackWrapper(bytes);
		self.postMessage({ type: "resourcePackLoaded", stats: { size: packBytes.byteLength } });
	} catch (error: any) {
		self.postMessage({ type: "error", message: `Resource pack load failed: ${error.message}` });
	}
}

// Main meshing pipeline
function handleMeshSchematic(
	schematicBytes: ArrayBuffer,
	config: any,
	chunkSize: number,
	requestId: string
) {
	try {
		if (!isInitialized) {
			self.postMessage({ type: "error", requestId, message: "WASM not initialized" });
			return;
		}
		if (!resourcePack) {
			self.postMessage({ type: "error", requestId, message: "No resource pack loaded" });
			return;
		}

		// Create schematic from bytes
		const schematic = new SchematicWrapper();
		schematic.from_data(new Uint8Array(schematicBytes));

		// Create mesh config
		const meshConfig = new MeshConfigWrapper();
		if (config.cullHiddenFaces !== undefined) meshConfig.setCullHiddenFaces(config.cullHiddenFaces);
		if (config.ambientOcclusion !== undefined)
			meshConfig.setAmbientOcclusion(config.ambientOcclusion);
		if (config.aoIntensity !== undefined) meshConfig.setAoIntensity(config.aoIntensity);
		if (config.biome !== undefined) meshConfig.setBiome(config.biome);
		if (config.atlasMaxSize !== undefined) meshConfig.setAtlasMaxSize(config.atlasMaxSize);
		if (config.cullOccludedBlocks !== undefined)
			meshConfig.setCullOccludedBlocks(config.cullOccludedBlocks);
		if (config.greedyMeshing !== undefined) meshConfig.setGreedyMeshing(config.greedyMeshing);

		// Build global atlas
		const atlas = schematic.buildGlobalAtlas(resourcePack, meshConfig);
		const atlasWidth = atlas.width;
		const atlasHeight = atlas.height;
		const atlasRgba = atlas.toBytes();

		// Post atlas data (transfer the buffer)
		const atlasBuffer = atlasRgba.buffer;
		self.postMessage(
			{
				type: "atlasReady",
				requestId,
				atlas: { width: atlasWidth, height: atlasHeight, rgba: atlasRgba },
			},
			[atlasBuffer] as any
		);

		// Create chunk mesh iterator with shared atlas
		const iter = schematic.chunkMeshIteratorWithAtlas(resourcePack, meshConfig, chunkSize, atlas);
		const totalChunks = iter.chunkCount();

		// Set progress callback
		iter.setProgressCallback((progress: any) => {
			self.postMessage({
				type: "progress",
				requestId,
				phase: progress.phase,
				chunksDone: progress.chunksDone,
				chunksTotal: progress.chunksTotal,
				verticesSoFar: progress.verticesSoFar,
				trianglesSoFar: progress.trianglesSoFar,
			});
		});

		// Iterate chunks
		let chunkIndex = 0;
		while (iter.advance()) {
			const mesh = iter.current();
			if (!mesh) continue;

			const coord = iter.currentCoord();
			const chunkCoord = coord ? `${coord[0]},${coord[1]},${coord[2]}` : `chunk_${chunkIndex}`;

			// Extract per-layer data
			const layers = extractLayers(mesh);
			const transferables: ArrayBuffer[] = [];

			// Collect transferable buffers
			for (const layer of [layers.opaque, layers.cutout, layers.transparent]) {
				if (layer) {
					transferables.push(
						layer.positions.buffer as ArrayBuffer,
						layer.normals.buffer as ArrayBuffer,
						layer.uvs.buffer as ArrayBuffer,
						layer.colors.buffer as ArrayBuffer,
						layer.indices.buffer as ArrayBuffer
					);
				}
			}

			chunkIndex++;
			self.postMessage(
				{
					type: "chunkReady",
					requestId,
					chunkCoord,
					layers,
					currentChunk: chunkIndex,
					totalChunks,
				},
				transferables as any
			);

			// Free the mesh wrapper
			mesh.free();
		}

		self.postMessage({ type: "meshComplete", requestId });

		// Cleanup
		iter.free();
		schematic.free();
		meshConfig.free();
		atlas.free();
	} catch (error: any) {
		self.postMessage({
			type: "error",
			requestId,
			message: `Meshing failed: ${error.message || error}`,
		});
	}
}

interface LayerData {
	positions: Float32Array;
	normals: Float32Array;
	uvs: Float32Array;
	colors: Float32Array;
	indices: Uint32Array;
	vertexCount: number;
	indexCount: number;
}

function extractLayer(
	positions: Float32Array,
	normals: Float32Array,
	uvs: Float32Array,
	colors: Float32Array,
	indices: Uint32Array
): LayerData | null {
	if (!positions || positions.length === 0) return null;
	return {
		positions,
		normals,
		uvs,
		colors,
		indices,
		vertexCount: positions.length / 3,
		indexCount: indices.length,
	};
}

function extractLayers(mesh: any): {
	opaque: LayerData | null;
	cutout: LayerData | null;
	transparent: LayerData | null;
} {
	return {
		opaque: extractLayer(
			mesh.opaquePositions(),
			mesh.opaqueNormals(),
			mesh.opaqueUvs(),
			mesh.opaqueColors(),
			mesh.opaqueIndices()
		),
		cutout: extractLayer(
			mesh.cutoutPositions(),
			mesh.cutoutNormals(),
			mesh.cutoutUvs(),
			mesh.cutoutColors(),
			mesh.cutoutIndices()
		),
		transparent: extractLayer(
			mesh.transparentPositions(),
			mesh.transparentNormals(),
			mesh.transparentUvs(),
			mesh.transparentColors(),
			mesh.transparentIndices()
		),
	};
}

// Message handler
self.onmessage = async (event: MessageEvent) => {
	const { type, ...data } = event.data;

	switch (type) {
		case "init":
			await handleInit();
			break;
		case "setResourcePack":
			handleSetResourcePack(data.packBytes);
			break;
		case "meshSchematic":
			handleMeshSchematic(
				data.schematicBytes,
				data.config || {},
				data.chunkSize || 16,
				data.requestId
			);
			break;
		default:
			self.postMessage({ type: "error", message: `Unknown message type: ${type}` });
	}
};
