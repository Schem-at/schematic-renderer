import { unzip } from "gzip-js";
import { decode, TagMap } from "@enginehub/nbt-ts";
import type { Faces, Vector } from "./types";
import NonOccludingBlocks from "./nonOccluding.json";
import TransparentBlocks from "./transparent.json";
import { Buffer } from "buffer/";

import * as THREE from "three";
import { Block } from "@enginehub/schematicjs";

export const POSSIBLE_FACES = [
	"south",
	"north",
	"east",
	"west",
	"up",
	"down",
] as const;
export const DEFAULT_UV = [0, 0, 16, 16];
export const REVERSED_POSSIBLE_FACES = POSSIBLE_FACES.slice().reverse();

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

export const CORNER_DICTIONARY = {
	east: {
		normal: [1, 0, 0],
		corners: [
			{ pos: [1, 0, 0], uv: [0, 1] },
			{ pos: [1, 1, 0], uv: [0, 0] },
			{ pos: [1, 0, 1], uv: [1, 1] },
			{ pos: [1, 1, 1], uv: [1, 0] },
		],
	},
	west: {
		normal: [-1, 0, 0],
		corners: [
			{ pos: [0, 0, 1], uv: [0, 1] },
			{ pos: [0, 1, 1], uv: [0, 0] },
			{ pos: [0, 0, 0], uv: [1, 1] },
			{ pos: [0, 1, 0], uv: [1, 0] },
		],
	},
	up: {
		normal: [0, 1, 0],
		corners: [
			{ pos: [0, 1, 1], uv: [0, 1] },
			{ pos: [1, 1, 1], uv: [1, 1] },
			{ pos: [0, 1, 0], uv: [0, 0] },
			{ pos: [1, 1, 0], uv: [1, 0] },
		],
	},
	down: {
		normal: [0, -1, 0],
		corners: [
			{ pos: [1, 0, 1], uv: [0, 0] },
			{ pos: [0, 0, 1], uv: [1, 0] },
			{ pos: [1, 0, 0], uv: [0, 1] },
			{ pos: [0, 0, 0], uv: [1, 1] },
		],
	},
	south: {
		normal: [0, 0, 1],
		corners: [
			{ pos: [1, 1, 1], uv: [1, 0] },
			{ pos: [0, 1, 1], uv: [0, 0] },
			{ pos: [1, 0, 1], uv: [1, 1] },
			{ pos: [0, 0, 1], uv: [0, 1] },
		],
	},
	north: {
		normal: [0, 0, -1],
		corners: [
			{ pos: [1, 0, 0], uv: [1, 1] },
			{ pos: [0, 0, 0], uv: [0, 1] },
			{ pos: [1, 1, 0], uv: [1, 0] },
			{ pos: [0, 1, 0], uv: [0, 0] },
		],
	},
};

export function getDirectionData(faceUVs: any) {
	const cornerDictionary = CORNER_DICTIONARY;
	return {
		east: {
			normal: cornerDictionary["east"]["normal"],
			corners: [
				{
					pos: cornerDictionary["east"]["corners"][0]["pos"],
					uv: [faceUVs["east"][0], faceUVs["east"][3]],
				},
				{
					pos: cornerDictionary["east"]["corners"][1]["pos"],
					uv: [faceUVs["east"][0], faceUVs["east"][1]],
				},
				{
					pos: cornerDictionary["east"]["corners"][2]["pos"],
					uv: [faceUVs["east"][2], faceUVs["east"][3]],
				},
				{
					pos: cornerDictionary["east"]["corners"][3]["pos"],
					uv: [faceUVs["east"][2], faceUVs["east"][1]],
				},
			],
		},
		west: {
			normal: cornerDictionary["west"]["normal"],
			corners: [
				{
					pos: cornerDictionary["west"]["corners"][0]["pos"],
					uv: [faceUVs["west"][0], faceUVs["west"][3]],
				},
				{
					pos: cornerDictionary["west"]["corners"][1]["pos"],
					uv: [faceUVs["west"][0], faceUVs["west"][1]],
				},
				{
					pos: cornerDictionary["west"]["corners"][2]["pos"],
					uv: [faceUVs["west"][2], faceUVs["west"][3]],
				},
				{
					pos: cornerDictionary["west"]["corners"][3]["pos"],
					uv: [faceUVs["west"][2], faceUVs["west"][1]],
				},
			],
		},
		up: {
			normal: cornerDictionary["up"]["normal"],
			corners: [
				{
					pos: cornerDictionary["up"]["corners"][0]["pos"],
					uv: [faceUVs["up"][0], faceUVs["up"][3]],
				},
				{
					pos: cornerDictionary["up"]["corners"][1]["pos"],
					uv: [faceUVs["up"][2], faceUVs["up"][3]],
				},
				{
					pos: cornerDictionary["up"]["corners"][2]["pos"],
					uv: [faceUVs["up"][0], faceUVs["up"][1]],
				},
				{
					pos: cornerDictionary["up"]["corners"][3]["pos"],
					uv: [faceUVs["up"][2], faceUVs["up"][1]],
				},
			],
		},
		down: {
			normal: cornerDictionary["down"]["normal"],
			corners: [
				{
					pos: cornerDictionary["down"]["corners"][0]["pos"],
					uv: [faceUVs["down"][0], faceUVs["down"][1]],
				},
				{
					pos: cornerDictionary["down"]["corners"][1]["pos"],
					uv: [faceUVs["down"][2], faceUVs["down"][1]],
				},
				{
					pos: cornerDictionary["down"]["corners"][2]["pos"],
					uv: [faceUVs["down"][0], faceUVs["down"][3]],
				},
				{
					pos: cornerDictionary["down"]["corners"][3]["pos"],
					uv: [faceUVs["down"][2], faceUVs["down"][3]],
				},
			],
		},
		south: {
			normal: cornerDictionary["south"]["normal"],
			corners: [
				{
					pos: cornerDictionary["south"]["corners"][0]["pos"],
					uv: [faceUVs["south"][2], faceUVs["south"][1]],
				},
				{
					pos: cornerDictionary["south"]["corners"][1]["pos"],
					uv: [faceUVs["south"][0], faceUVs["south"][1]],
				},
				{
					pos: cornerDictionary["south"]["corners"][2]["pos"],
					uv: [faceUVs["south"][2], faceUVs["south"][3]],
				},
				{
					pos: cornerDictionary["south"]["corners"][3]["pos"],
					uv: [faceUVs["south"][0], faceUVs["south"][3]],
				},
			],
		},
		north: {
			normal: cornerDictionary["north"]["normal"],
			corners: [
				{
					pos: cornerDictionary["north"]["corners"][0]["pos"],
					uv: [faceUVs["north"][2], faceUVs["north"][3]],
				},
				{
					pos: cornerDictionary["north"]["corners"][1]["pos"],
					uv: [faceUVs["north"][0], faceUVs["north"][3]],
				},
				{
					pos: cornerDictionary["north"]["corners"][2]["pos"],
					uv: [faceUVs["north"][2], faceUVs["north"][1]],
				},
				{
					pos: cornerDictionary["north"]["corners"][3]["pos"],
					uv: [faceUVs["north"][0], faceUVs["north"][1]],
				},
			],
		},
	};
}

export const REDSTONE_COLORS = [
	new THREE.Color(75 / 255, 0, 0),
	new THREE.Color(110 / 255, 0, 0),
	new THREE.Color(120 / 255, 0, 0),
	new THREE.Color(130 / 255, 0, 0),
	new THREE.Color(140 / 255, 0, 0),
	new THREE.Color(151 / 255, 0, 0),
	new THREE.Color(160 / 255, 0, 0),
	new THREE.Color(170 / 255, 0, 0),
	new THREE.Color(180 / 255, 0, 0),
	new THREE.Color(190 / 255, 0, 0),
	new THREE.Color(201 / 255, 0, 0),
	new THREE.Color(211 / 255, 0, 0),
	new THREE.Color(214 / 255, 0, 0),
	new THREE.Color(224 / 255, 6 / 255, 0),
	new THREE.Color(233 / 255, 26 / 255, 0),
	new THREE.Color(244 / 255, 48 / 255, 0),
];

export function normalize(input: number): number {
	return input / 16;
}

export function rotateVector(
	position: number[],
	rotation: { angle: number; axis: number[] },
	center: number[] = [0, 0, 0]
): number[] {
	const DEG2RAD = Math.PI / 180;
	const angle = rotation.angle * DEG2RAD;
	const [x, y, z] = position;
	const [cx, cy, cz] = center;
	const [xAxis, yAxis, zAxis] = rotation.axis;

	const cosAngle = Math.cos(angle);
	const sinAngle = Math.sin(angle);
	const oneMinusCos = 1 - cosAngle;

	const xx = xAxis * xAxis;
	const yy = yAxis * yAxis;
	const zz = zAxis * zAxis;
	const xy = xAxis * yAxis;
	const xz = xAxis * zAxis;
	const yz = yAxis * zAxis;

	const mat00 = xx * oneMinusCos + cosAngle;
	const mat01 = xy * oneMinusCos - zAxis * sinAngle;
	const mat02 = xz * oneMinusCos + yAxis * sinAngle;
	const mat10 = xy * oneMinusCos + zAxis * sinAngle;
	const mat11 = yy * oneMinusCos + cosAngle;
	const mat12 = yz * oneMinusCos - xAxis * sinAngle;
	const mat20 = xz * oneMinusCos - yAxis * sinAngle;
	const mat21 = yz * oneMinusCos + xAxis * sinAngle;
	const mat22 = zz * oneMinusCos + cosAngle;

	const translatedX = x - cx;
	const translatedY = y - cy;
	const translatedZ = z - cz;

	const rotatedX =
		translatedX * mat00 + translatedY * mat01 + translatedZ * mat02;
	const rotatedY =
		translatedX * mat10 + translatedY * mat11 + translatedZ * mat12;
	const rotatedZ =
		translatedX * mat20 + translatedY * mat21 + translatedZ * mat22;

	return [rotatedX + cx, rotatedY + cy, rotatedZ + cz];
}

export function faceToRotation(face: string) {
	// switch (face) {
	// 	case "north":
	// 		return { angle: 0, axis: [0, 1, 0] };
	// 	case "south":
	// 		return { angle: 180, axis: [0, 1, 0] };
	// 	case "east":
	// 		return { angle: 90, axis: [0, 1, 0] };
	// 	case "west":
	// 		return { angle: 270, axis: [0, 1, 0] };
	// 	case "up":
	// 		return { angle: 0, axis: [1, 0, 0] };
	// 	case "down":
	// 		return { angle: 180, axis: [1, 0, 0] };
	// 	default:
	// 		return { angle: 0, axis: [0, 1, 0] };
	// }

	//return a rotation matrix
	switch (face) {
		case "north":
			return [
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1],
			];
		case "south":
			return [
				[-1, 0, 0],
				[0, 1, 0],
				[0, 0, -1],
			];
		case "east":
			return [
				[0, 0, 1],
				[0, 1, 0],
				[-1, 0, 0],
			];
		case "west":
			return [
				[0, 0, -1],
				[0, 1, 0],
				[1, 0, 0],
			];
		case "up":
			return [
				[1, 0, 0],
				[0, 0, -1],
				[0, 1, 0],
			];
		case "down":
			return [
				[1, 0, 0],
				[0, 0, 1],
				[0, -1, 0],
			];
		default:
			return [
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1],
			];
	}
}

const rotateVectorMatrix = (vector: number[], matrix: number[][]) => {
	const offsetVector = vector.map((v, i) => v - 0.5);

	const result = [0, 0, 0];
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			result[i] += matrix[i][j] * offsetVector[j];
		}
	}
	//add the offset back
	result[0] += 0.5;
	result[1] += 0.5;
	result[2] += 0.5;
	return result;
};

export function rotateBlockComponents(
	blockComponents: any,
	facing: string
): any {
	const rotation = faceToRotation(facing);
	for (const key in blockComponents) {
		const blockComponent = blockComponents[key];
		const { positions, normals, uvs } = blockComponent;
		const rotatedPositions = [];
		const rotatedNormals = [];
		const rotatedUVs = [];
		for (let i = 0; i < positions.length; i += 3) {
			const position = positions.slice(i, i + 3);
			const normal = normals.slice(i, i + 3);
			const uv = uvs.slice((i / 3) * 2, (i / 3) * 2 + 2);
			const rotatedPosition = rotateVectorMatrix(position, rotation);
			const rotatedNormal = rotateVectorMatrix(normal, rotation);
			const rotatedUV = rotateVectorMatrix(uv, rotation);
			rotatedPositions.push(...rotatedPosition);
			rotatedNormals.push(...rotatedNormal);
			rotatedUVs.push(...rotatedUV);
		}

		blockComponent.positions = rotatedPositions;
		blockComponent.normals = rotatedNormals;
	}
	return blockComponents;
}

export function isExtendedPiston(block: Block) {
	return (
		(block.type === "sticky_piston" || block.type === "piston") &&
		block.properties?.["extended"] === "true"
	);
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

export function parseNbt(nbt: Buffer): TagMap {
	let uncompressed;
	try {
		uncompressed = unzip(nbt);
	} catch (e) {
		uncompressed = nbt;
	}
	const deflated = Buffer.from(uncompressed as Buffer);

	const data = decode(<import("buffer").Buffer>(<unknown>deflated), {
		unnamed: false,
		useMaps: true,
	});
	return data.value as TagMap;
}

export function parseNbtFromBase64(nbt: string): TagMap {
	const buff = Buffer.from(nbt, "base64");
	return parseNbt(buff);
}

export function hashBlockForMap(block: Block) {
	//return `${block.type}:${JSON.stringify(block.properties)}`;
	//avoid JSON.stringify since it's slow
	let key = block.type;
	if (block.properties) {
		for (const property in block.properties) {
			key += property + block.properties[property];
		}
	}
	return key;
}

export function occludedFacesIntToList(occludedFaces: number) {
	const result: { [key: string]: boolean } = {};
	for (const face of REVERSED_POSSIBLE_FACES) {
		result[face] = !!(occludedFaces & 1);
		occludedFaces = occludedFaces >> 1;
	}
	return result;
}

export function getOppositeFace(face: string): string {
	switch (face) {
		case "north":
			return "south";
		case "south":
			return "north";
		case "east":
			return "west";
		case "west":
			return "east";
		case "up":
			return "down";
		case "down":
			return "up";
		default:
			return "north";
	}
}
