/// <reference lib="webworker" />

import { generateChunkMesh } from "../meshing/chunkMesher";
import type { ChunkMeshRequest } from "../types";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = ({ data }) => {
	const {
		type,
		requestId,
		data: req,
	} = data as { type: string; requestId: string; data: ChunkMeshRequest };
	if (type !== "generateChunkMesh") return;

	try {
		const mesh = generateChunkMesh(req);
		const tx = Object.values(mesh).map((v) => (v as any).buffer);
		self.postMessage({ requestId, data: mesh }, tx);
	} catch (err: any) {
		self.postMessage({ requestId, error: err?.message || String(err) });
	}
};

export {};
