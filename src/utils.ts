import type { Faces, Vector } from "./types";
import NonOccludingBlocks from "./nonOccluding.json";
import TransparentBlocks from "./transparent.json";

import * as THREE from "three";
interface Block {
	name: string;
	properties: Record<string, string>;
}
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

export function facingvectorToFace([x, y, z]: Vector) {
	const x_ = Math.abs(x);
	const y_ = Math.abs(y);
	const z_ = Math.abs(z);

	if (x_ > y_ && x_ > z_) {
		return x > 0 ? "east" : "west";
	}
	if (y_ > x_ && y_ > z_) {
		return y > 0 ? "up" : "down";
	}
	if (z_ > x_ && z_ > y_) {
		return z > 0 ? "south" : "north";
	}
	throw new Error(`Invalid normal vector ${[x, y, z]}`);
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

// export function getDirectionData(faceUVs) {
// 	const directions = ["east", "west", "up", "down", "south", "north"];
// 	const cornerOrder = ["north", "east", "south", "west"];
// 	const result = {};

// 	directions.forEach((dir) => {
// 		const rotation = faceToRotation(dir);
// 		result[dir] = {
// 			// normal: rotation[2], // Assuming the normal is the third vector in the rotation matrix
// 			normal: [-rotation[2][0], -rotation[2][1], -rotation[2][2]],
// 			corners: [
// 				{
// 					// corner 1
// 					pos: rotateVectorMatrix([0, 0, 0], rotation),
// 					uv: [faceUVs[dir][0], faceUVs[dir][1]],
// 				},
// 				{
// 					// corner 2
// 					pos: rotateVectorMatrix([1, 0, 0], rotation),
// 					uv: [faceUVs[dir][2], faceUVs[dir][1]],
// 				},
// 				{
// 					// corner 3
// 					pos: rotateVectorMatrix([0, 1, 0], rotation),
// 					uv: [faceUVs[dir][0], faceUVs[dir][3]],
// 				},
// 				{
// 					// corner 4
// 					pos: rotateVectorMatrix([1, 1, 0], rotation),
// 					uv: [faceUVs[dir][2], faceUVs[dir][3]],
// 				},
// 			],
// 		};
// 	});

// 	return result;
// }

export function getDirectionData(faceUVs: { [key: string]: number[] }): any {
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

export function faceToRotation(face: string) {
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

export function rotateVectorMatrix(vector: number[], matrix: number[][]) {
	const result = [0, 0, 0];
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			result[i] += matrix[i][j] * vector[j];
		}
	}
	return result;
}

export function rotateVectorMatrixWithOffset(
	vector: number[],
	matrix: number[][],
	offset: number = 0.5
) {
	const offsetVector = vector.map((v, _i) => v - offset);
	const result = rotateVectorMatrix(offsetVector, matrix);
	const offsetResult = result.map((v, _i) => v + offset);
	return offsetResult;
}

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
			const rotatedPosition = rotateVectorMatrixWithOffset(position, rotation);
			const rotatedNormal = rotateVectorMatrixWithOffset(normal, rotation);
			const rotatedUV = rotateVectorMatrixWithOffset(uv, rotation);
			rotatedPositions.push(...rotatedPosition);
			rotatedNormals.push(...rotatedNormal);
			rotatedUVs.push(...rotatedUV);
		}

		blockComponent.positions = rotatedPositions;
		blockComponent.normals = rotatedNormals;
	}
	return blockComponents;
}

export function getDegreeRotationMatrix(x: number, y: number, z: number) {
	x *= Math.PI / 180;
	y *= Math.PI / 180;
	z *= Math.PI / 180;
	const factor = 10 ** 6;
	const round = (n: number) => Math.round(n * factor) / factor;
	return [
		[
			round(Math.cos(y) * Math.cos(z)),
			round(
				Math.sin(x) * Math.sin(y) * Math.cos(z) - Math.cos(x) * Math.sin(z)
			),
			round(
				Math.cos(x) * Math.sin(y) * Math.cos(z) + Math.sin(x) * Math.sin(z)
			),
		],
		[
			round(Math.cos(y) * Math.sin(z)),
			round(
				Math.sin(x) * Math.sin(y) * Math.sin(z) + Math.cos(x) * Math.cos(z)
			),
			round(
				Math.cos(x) * Math.sin(y) * Math.sin(z) - Math.sin(x) * Math.cos(z)
			),
		],
		[
			round(-Math.sin(y)),
			round(Math.sin(x) * Math.cos(y)),
			round(Math.cos(x) * Math.cos(y)),
		],
	];
}

export function isExtendedPiston(block: Block) {
	return (
		(block.name === "minecraft:sticky_piston" ||
			block.name === "minecraft:piston") &&
		block.properties?.["extended"] === "true"
	);
}

export const INVISIBLE_BLOCKS = new Set([
	"minecraft:air",
	"minecraft:cave_air",
	"minecraft:void_air",
	"minecraft:structure_void",
	"minecraft:barrier",
	"minecraft:light",
]);

export const TRANSPARENT_BLOCKS = new Set([
	...INVISIBLE_BLOCKS,
	...TransparentBlocks,
]);

export const NON_OCCLUDING_BLOCKS = new Set([
	...INVISIBLE_BLOCKS,
	...NonOccludingBlocks,
]);

export function hashBlockForMap(block: Block) {
	// make the md5 hash of the block
	let hash = block.name;
	if (block.properties) {
		for (const key in block.properties) {
			hash += block.properties[key];
		}
	}
	return hash;
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
