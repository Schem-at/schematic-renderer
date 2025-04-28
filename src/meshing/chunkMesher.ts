// meshing/chunkMesher.ts
import type { ChunkMeshRequest, MeshData, BakedBlockDef } from "../types";

type DefTable = Record<string, BakedBlockDef>;

export function generateChunkMesh(req: ChunkMeshRequest): MeshData {
	const { blocks, renderingBounds, defs } = req;
	const defMap: DefTable = Object.fromEntries(defs);

	const p: number[] = [],
		n: number[] = [],
		u: number[] = [],
		i: number[] = [],
		m: number[] = [];
	let vtx = 0;

	for (const b of blocks) {
		const def = defMap[b.stateKey];
		if (!def) continue;

		if (renderingBounds) {
			const { min, max } = renderingBounds;
			if (
				b.x < min[0] ||
				b.x >= max[0] ||
				b.y < min[1] ||
				b.y >= max[1] ||
				b.z < min[2] ||
				b.z >= max[2]
			)
				continue;
		}

		for (const f of def.faces) {
			const id = hash(f.texKey);

			for (let v = 0; v < 4; v++) {
				p.push(
					b.x + f.pos[v * 3] / 16,
					b.y + f.pos[v * 3 + 1] / 16,
					b.z + f.pos[v * 3 + 2] / 16
				);
				n.push(...f.normal);
				u.push(f.uv[v * 2], f.uv[v * 2 + 1]);
				m.push(id);
			}
			i.push(vtx, vtx + 1, vtx + 2, vtx + 2, vtx + 1, vtx + 3);
			vtx += 4;
		}
	}

	return {
		positions: new Float32Array(p),
		normals: new Float32Array(n),
		uvs: new Float32Array(u),
		indices: new Uint32Array(i),
		materialIds: new Uint16Array(m) as unknown as Uint8Array,
	};
}

function hash(s: string) {
	let h = 0;
	for (let c of s) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
	return (h & 0xffff) >>> 0;
}

// Export the hash function for use in the material system
export { hash as hashTextureKey };
