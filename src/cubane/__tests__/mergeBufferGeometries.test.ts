import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { mergeBufferGeometries } from "../mergeBufferGeometries";

/** Build a deterministic indexed geometry with `vertCount` vertices. */
function makeGeo(
	vertCount: number,
	opts: { withNormals?: boolean; withUV?: boolean; posBase?: number } = {}
): THREE.BufferGeometry {
	const { withNormals = true, withUV = true, posBase = 0 } = opts;
	const g = new THREE.BufferGeometry();

	const pos = new Float32Array(vertCount * 3);
	for (let i = 0; i < pos.length; i++) pos[i] = posBase + i;
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));

	if (withNormals) {
		const n = new Float32Array(vertCount * 3).fill(1);
		g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
	}
	if (withUV) {
		const u = new Float32Array(vertCount * 2).fill(0.5);
		g.setAttribute("uv", new THREE.BufferAttribute(u, 2));
	}

	const IndexArray = vertCount > 65535 ? Uint32Array : Uint16Array;
	const idx = new IndexArray(vertCount);
	for (let i = 0; i < vertCount; i++) idx[i] = i;
	g.setIndex(new THREE.BufferAttribute(idx, 1));

	return g;
}

describe("mergeBufferGeometries", () => {
	it("returns an empty geometry for empty input", () => {
		const merged = mergeBufferGeometries([]);
		expect(merged.attributes.position).toBeUndefined();
	});

	it("clones a single geometry rather than merging", () => {
		const a = makeGeo(3);
		const merged = mergeBufferGeometries([a]);
		expect(merged.attributes.position.count).toBe(3);
		expect(merged).not.toBe(a); // a clone, not the same instance
	});

	it("concatenates attributes and offsets indices across geometries", () => {
		const a = makeGeo(3, { posBase: 0 });
		const b = makeGeo(3, { posBase: 1000 });
		const merged = mergeBufferGeometries([a, b]);

		expect(merged.attributes.position.count).toBe(6);
		expect(merged.index!.count).toBe(6);
		// indices offset by the running vertex count: [0,1,2] then [3,4,5]
		expect(Array.from(merged.index!.array)).toEqual([0, 1, 2, 3, 4, 5]);
		// b's positions appended after a's
		expect(merged.attributes.position.array[9]).toBe(1000); // first float of b
	});

	it("uses 32-bit indices when the merged vertex count exceeds 65535", () => {
		const parts = [makeGeo(30000), makeGeo(30000), makeGeo(30000)]; // 90000 verts
		const merged = mergeBufferGeometries(parts);
		expect(merged.attributes.position.count).toBe(90000);
		expect(merged.index!.array).toBeInstanceOf(Uint32Array);
	});

	it("computes normals when the inputs lack them", () => {
		const a = makeGeo(3, { withNormals: false });
		const b = makeGeo(3, { withNormals: false });
		const merged = mergeBufferGeometries([a, b]);
		expect(merged.attributes.normal).toBeDefined();
		expect(merged.attributes.normal.count).toBe(6);
	});

	// Regression: the old implementation did `array.push(...Array.from(typedArray))`,
	// which spreads every float as a call argument and throws RangeError: Maximum call
	// stack size exceeded once a geometry is large enough. This must merge without
	// throwing and with the correct vertex count.
	it("does not overflow the stack on large attribute arrays", () => {
		const big = [makeGeo(60000), makeGeo(60000)]; // 180000 floats per position attr
		let merged: THREE.BufferGeometry | undefined;
		expect(() => {
			merged = mergeBufferGeometries(big);
		}).not.toThrow();
		expect(merged!.attributes.position.count).toBe(120000);
		expect(merged!.index!.array).toBeInstanceOf(Uint32Array);
	});
});
