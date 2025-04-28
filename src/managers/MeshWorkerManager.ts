// manager/MeshWorkerManager.ts
import * as THREE from "three";
import type {
	ChunkMeshRequest,
	MeshData,
	BakedBlockDef, // Assuming BakedBlockDef is imported if needed here
} from "../types"; // Make sure types are imported correctly
import { BaseWorkerManager, WorkerManagerOptions } from "./BaseWorkerManager";
import MeshWorker from "../workers/mesh.worker.ts?worker&inline";
import { generateChunkMesh as generateChunkMeshOnMainThread } from "../meshing/chunkMesher"; // Import directly for main thread

export class MeshWorkerManager extends BaseWorkerManager {
	constructor(opts: WorkerManagerOptions = {}) {
		super(opts);
	}

	// --- FIX: Add the definitions to the request ---
	/**
	 * BaseWorkerManager will call this if the user did not provide a custom
	 * createWorker option. We simply instantiate Vite’s wrapper.
	 */
	protected createInlineWorker(): Worker {
		// Ensure MeshWorker is correctly processed by Vite/your bundler
		return new MeshWorker();
	}

	/**
	 * Generates chunk geometry, attempting to use a worker first.
	 * IMPORTANT: The caller of this function is responsible for ensuring the
	 * input `req` object contains the `defs` property (an array of
	 * [string, BakedBlockDef] pairs). The error "undefined is not iterable"
	 * likely originates from the caller not providing `req.defs`.
	 * @param req The complete chunk mesh request, including block definitions.
	 * @returns A promise resolving to THREE.BufferGeometry.
	 */
	async generateChunkMesh(
		req: ChunkMeshRequest
	): Promise<THREE.BufferGeometry> {
		// --- Worker Path ---
		if (this.usingWorkers && this.worker) {
			try {
				const messagePayload = { data: req };

				const transferables: Transferable[] = [];

				const meshData = await this.sendWorkerMessage<MeshData>(
					"generateChunkMesh",
					messagePayload, // Send the wrapped payload
					transferables
				);
				return this.toGeometry(meshData);
			} catch (err) {
				console.warn(
					"[MeshWorkerManager] Worker execution failed, falling back to main thread.",
					err
				);
				// Prevent future attempts to use the worker for this instance
				this.usingWorkers = false;
				this.worker?.terminate(); // Terminate the potentially broken worker
				this.worker = null;
			}
		}

		// --- Main Thread Fallback Path ---
		// If workers are disabled or failed, run on the main thread.
		// This directly calls the imported mesher function.
		// If 'req.defs' is undefined here, it's because the input 'req'
		// passed to *this* function was missing 'defs'.
		console.log(
			`[MeshWorkerManager] Generating chunk ${req.chunkX},${req.chunkY},${req.chunkZ} on main thread.`
		);
		try {
			// Directly use the imported mesher function
			const meshData = generateChunkMeshOnMainThread(req);
			return this.toGeometry(meshData);
		} catch (mainThreadError) {
			console.error(
				`[MeshWorkerManager] Error generating chunk mesh on main thread:`,
				mainThreadError
			);
			// Depending on requirements, you might return an empty geometry
			// or re-throw the error.
			// return new THREE.BufferGeometry(); // Option: return empty
			throw mainThreadError; // Option: re-throw
		}
	}

	/**
	 * Converts the raw MeshData (positions, normals, etc.) into a
	 * THREE.BufferGeometry object.
	 * Assumes m.materialIds is Uint16Array.
	 */
	private toGeometry(m: MeshData): THREE.BufferGeometry {
		const g = new THREE.BufferGeometry();

		// Validate data presence (optional but good practice)
		if (
			!m ||
			!m.positions ||
			!m.normals ||
			!m.uvs ||
			!m.indices ||
			!m.materialIds
		) {
			console.error(
				"[MeshWorkerManager] Invalid MeshData received for toGeometry",
				m
			);
			return g; // Return empty geometry
		}

		g.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(m.positions, 3)
		);
		g.setAttribute("normal", new THREE.Float32BufferAttribute(m.normals, 3));
		g.setAttribute("uv", new THREE.Float32BufferAttribute(m.uvs, 2));

		// Ensure materialIds is treated as Uint16, sending 1 value per vertex
		g.setAttribute(
			"materialIndex",
			new THREE.Uint16BufferAttribute(m.materialIds, 1) // Use Uint16BufferAttribute
		);

		// Indices should be Uint32 or Uint16 depending on vertex count
		// Assuming Uint32 based on original code
		g.setIndex(new THREE.Uint32BufferAttribute(m.indices, 1));

		g.computeBoundingSphere(); // Optional: compute bounds

		return g;
	}

	// Removed generateChunkMeshMainThread as it's now inlined in generateChunkMesh
}
