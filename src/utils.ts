import { unzip } from "gzip-js";
import type { TagMap } from "nbt-ts";
import { decode } from "nbt-ts";
import type { Faces, Vector } from "./types";
import NonOccludingBlocks from "./nonOccluding.json";
import TransparentBlocks from "./transparent.json";
import { inflate } from "pako";

export function faceToFacingVector(face: Faces): Vector {
	switch (face) {
		case "up":
			return [0, 1, 0];
		case "down":
		case "bottom":
			return [0, -1, 0];
		case "north":
			return [0, 0, -1];
		case "south":
			return [0, 0, 1];
		case "east":
			return [1, 0, 0];
		case "west":
			return [-1, 0, 0];
		default:
			throw new Error(`Unknown face: ${face}`);
	}
}

export const INVISIBLE_BLOCKS = new Set([
	"air",
	"cave_air",
	"void_air",
	"structure_void",
	"barrier",
	"light",
]);

export const TRANSPARENT_BLOCKS = new Set([
	...INVISIBLE_BLOCKS,
	...TransparentBlocks,
]);

export const NON_OCCLUDING_BLOCKS = new Set([
	...INVISIBLE_BLOCKS,
	...NonOccludingBlocks,
]);

//export function parseNbt(nbt: string): TagMap {
//	const buff = Buffer.from(nbt, "base64");
//	const deflated = Buffer.from(unzip(buff));
//	const data = decode(deflated, {
//		unnamed: false,
//		useMaps: true,
//	});
//	return data.value as TagMap;
//}

function createBufferLikeObject(array: Uint8Array): Buffer {
	return new Uint8Array(array) as unknown as Buffer;
}

export function parseNbt(nbt: string): TagMap {
	// Decode base64
	const decodedData = atob(nbt);

	// Convert decoded string to Uint8Array
	const charData = decodedData.split("").map((c) => c.charCodeAt(0));
	const binData = new Uint8Array(charData);

	// Inflate (unzip) data
	const deflated = inflate(binData);

	// Convert Uint8Array to Buffer-like object
	const bufferLikeObject = createBufferLikeObject(deflated);

	// Decode NBT data
	const data = decode(bufferLikeObject, {
		unnamed: false,
		useMaps: true,
	});

	return data.value as TagMap;
}
