import * as THREE from "three";

/**
 * Merge BufferGeometries into one — concatenating position/normal/uv and offsetting
 * each sub-geometry's indices by the running vertex count.
 *
 * Writes straight into preallocated typed arrays with `.set()` (a memcpy-style bulk
 * copy), so there is no per-element `push`, no `Array.from` intermediates, and no
 * argument spread. That makes it both fast (one allocation per attribute, no GC churn
 * from a growing `number[]`) and safe on large meshes: the previous implementation did
 * `array.push(...Array.from(typedArray))`, which spreads every float as a call argument
 * and throws `RangeError: Maximum call stack size exceeded` once a geometry is large
 * enough.
 *
 * Only geometries with a non-empty position attribute and a non-empty index are merged.
 * Empty input yields an empty geometry; a single input is cloned. Normals are computed
 * if the inputs don't supply them.
 */
export function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
	const valid = geometries.filter(
		(g) => g.attributes.position && g.attributes.position.count > 0 && g.index && g.index.count > 0
	);

	if (valid.length === 0) return new THREE.BufferGeometry();
	if (valid.length === 1) return valid[0].clone();

	let totalVertices = 0;
	let totalIndices = 0;
	let hasNormals = true;
	let hasUVs = true;
	for (const g of valid) {
		totalVertices += g.attributes.position.count;
		totalIndices += g.index ? g.index.count : g.attributes.position.count;
		if (!g.attributes.normal) hasNormals = false;
		if (!g.attributes.uv) hasUVs = false;
	}

	const posSize = valid[0].attributes.position.itemSize;
	const normSize = hasNormals ? valid[0].attributes.normal.itemSize : 3;
	const uvSize = hasUVs ? valid[0].attributes.uv.itemSize : 2;

	const positions = new Float32Array(totalVertices * posSize);
	const normals = hasNormals ? new Float32Array(totalVertices * normSize) : null;
	const uvs = hasUVs ? new Float32Array(totalVertices * uvSize) : null;
	// Index values can reach totalVertices - 1, so 16-bit indices only suffice below 65536.
	const indices =
		totalVertices > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

	let vertexOffset = 0;
	let indexWrite = 0;
	for (const g of valid) {
		const vcount = g.attributes.position.count;

		positions.set(g.attributes.position.array as ArrayLike<number>, vertexOffset * posSize);
		if (normals)
			normals.set(g.attributes.normal.array as ArrayLike<number>, vertexOffset * normSize);
		if (uvs) uvs.set(g.attributes.uv.array as ArrayLike<number>, vertexOffset * uvSize);

		const srcIndex = g.index;
		if (srcIndex) {
			const ia = srcIndex.array;
			for (let i = 0; i < ia.length; i++) indices[indexWrite++] = ia[i] + vertexOffset;
		} else {
			for (let i = 0; i < vcount; i++) indices[indexWrite++] = vertexOffset + i;
		}

		vertexOffset += vcount;
	}

	const merged = new THREE.BufferGeometry();
	merged.setAttribute("position", new THREE.BufferAttribute(positions, posSize));
	if (normals) merged.setAttribute("normal", new THREE.BufferAttribute(normals, normSize));
	if (uvs) merged.setAttribute("uv", new THREE.BufferAttribute(uvs, uvSize));
	merged.setIndex(new THREE.BufferAttribute(indices, 1));

	if (!hasNormals) merged.computeVertexNormals();

	return merged;
}
