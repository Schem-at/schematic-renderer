export interface BlockStateModelHolder {
	model: string;
	x?: number;
	y?: number;
	uvlock?: boolean;
	weight?: number;
}

type BlockStateDefinitionModel =
	| BlockStateModelHolder
	| (BlockStateModelHolder & {
			weight?: number;
	  })[];

export interface MeshData {
	positions: Float32Array;
	normals: Float32Array;
	uvs: Float32Array;
	indices: Uint32Array;
	materialIds: Uint8Array;
}

export interface ChunkMeshRequest {
	chunkX: number;
	chunkY: number;
	chunkZ: number;
	schematicId: string;
	width: number;
	height: number;
	depth: number;
	blocks: BlockData[];
	renderingBounds?: {
		min: [number, number, number];
		max: [number, number, number];
	};
	defs: [string, BakedBlockDef][];
}

export interface BakedFace {
	// positions in model-space (0-16)
	pos: number[]; // 12 numbers (4 verts)
	uv: number[]; // 8 numbers
	normal: [number, number, number];
	texKey: string; // 'block/stone'
}

export interface BlockData {
	name: string;
	stateKey: string; // Needed by chunkMesher
	x: number; // Needed by chunkMesher
	y: number; // Needed by chunkMesher
	z: number; // Needed by chunkMesher
	chunk_x?: number; // Optional, used for request info
	chunk_y?: number; // Optional, used for request info
	chunk_z?: number; // Optional, used for request info
	properties?: Record<string, string>; // Optional, used for request info
}

export interface BakedBlockDef {
	faces: BakedFace[]; // 6 for cubes, more for stairs/rails/…
	bbox: [number, number, number, number, number, number]; // from/to
}

// This is necessary to work around a restriction that prevents index types from having non-conforming sibling types
export type BlockStateDefinitionVariant<T> = { [variant: string]: T };

// This is not technically a valid type. TS will complain if you try to instantiate an object with it.
// Luckily for our use cases, we don't need to. This just models existing data.
export interface BlockStateDefinition {
	variants?: BlockStateDefinitionVariant<BlockStateDefinitionModel>;
	multipart?: {
		apply: BlockStateDefinitionModel;
		when?: {
			OR?: BlockStateDefinitionVariant<string>[];
		} & BlockStateDefinitionVariant<string>;
	}[];
}

export type Block = {
	name: string;
	properties: Record<string, string>;
};

export type Vector = [number, number, number];

export const POSSIBLE_FACES = [
	"south",
	"north",
	"east",
	"west",
	"up",
	"down",
] as const;
export type Faces = (typeof POSSIBLE_FACES)[number] | "bottom";

export interface BlockModel {
	parent?: string;
	ambientocclusion?: boolean;
	display?: {
		Position?: {
			rotation?: Vector;
			translation?: Vector;
			scale?: Vector;
		};
	};
	textures?: {
		particle?: string;
		[texture: string]: string | undefined;
	};
	elements: {
		name: string;
		from?: Vector;
		to?: Vector;
		rotation?: {
			origin?: Vector;
			axis?: "x" | "y" | "z";
			angle?: number;
			rescale?: boolean;
		};
		shade?: boolean;
		faces?: {
			[face in Faces]: {
				uv?: [number, number, number, number];
				texture?: string;
				cullface?: Faces;
				rotation?: number;
				tintindex?: number;
			};
		};
	}[];
}

export interface BlockModelData {
	name: string;
	models: {
		options: { holder: BlockStateModelHolder; weight: number }[];
	}[];
}

export interface BlockModelOption {
	name: string;
	holders: BlockStateModelHolder[];
}
