import * as THREE from "three";

const TRANSPARENT_BLOCKS = ["air"];
class ElementFace {
	public face: string;
	public uv: number[];
	public textureRef: string;
	constructor(face: string, uv: number[], textureRef: string) {
		this.face = face;
		this.uv = uv;
		this.textureRef = textureRef;
	}
}

class Element {
	public faces: ElementFace[];
	public from: THREE.Vector3;
	public to: THREE.Vector3;
	constructor(faces: any, from: THREE.Vector3, to: THREE.Vector3) {
		this.faces = [];
		for (const faceName in faces) {
			const faceData = faces[faceName];
			const uv = faceData.uv;
			const textureRef = faceData.texture;
			const face = new ElementFace(faceName, uv, textureRef);
			this.faces.push(face);
		}
		this.from = from;
		this.to = to;
	}
}

class Model {
	public elements: Element[];
	public textures: any[];
	public ambientocclusion: boolean;

	constructor(elements, textures, ambientocclusion) {
		this.elements = [];
		for (const elementData of elements) {
			const from = new THREE.Vector3(
				elementData.from[0],
				elementData.from[1],
				elementData.from[2]
			);
			const to = new THREE.Vector3(
				elementData.to[0],
				elementData.to[1],
				elementData.to[2]
			);
			const element = new Element(elementData.faces, from, to);
			this.elements.push(element);
		}
		this.textures = textures;
		this.ambientocclusion = ambientocclusion;
	}
}

class Block {
	public blockDescriptor: any;
	public blockStateDefinition: any;
	public blockModelData: any;
	public blockModelOption: any;
	public ressourceLoader: any;
	public type: string;
	public models: Model[] = [];
	constructor(blockDescriptor: any, ressourceLoader: any) {
		this.blockDescriptor = blockDescriptor;
		this.type = blockDescriptor.type;
		this.ressourceLoader = ressourceLoader;
		this.initialize();
	}

	async initialize() {
		await this.computeBlockStateDefinition();
		this.blockModelData = this.ressourceLoader.getBlockModelData(
			this.blockDescriptor,
			this.blockStateDefinition
		);
		this.blockModelOption = this.ressourceLoader.getModelOption(
			this.blockModelData
		);
		await this.computeBlockModels();
	}

	async computeBlockStateDefinition() {
		const blockStateDefinition =
			await this.ressourceLoader.getBlockStateDefinition(this.type);
		this.blockStateDefinition = blockStateDefinition;
	}

	async computeBlockModels() {
		for (const holder of this.blockModelOption.holders) {
			const modelData = await this.ressourceLoader.loadModel(holder.model);
			const model = new Model(
				modelData.elements,
				modelData.textures,
				modelData.ambientocclusion
			);
			this.models.push(model);
		}
	}
}

export class World {
	public schematic: any;
	public ressourceLoader: any;
	public worldWidth: number;
	public worldHeight: number;
	public worldLength: number;
	public blocks: Block[] = [];
	constructor(schematic: any, ressourceLoader: any) {
		this.schematic = schematic;
		this.ressourceLoader = ressourceLoader;
		this.worldWidth = schematic.width;
		this.worldHeight = schematic.height;
		this.worldLength = schematic.length;
		this.computeBlocks();
	}

	public computeBlocks() {
		for (const pos of this.schematic) {
			const { x, y, z } = pos;
			const blockData = this.schematic.getBlock(pos);
			if (TRANSPARENT_BLOCKS.includes(blockData.type)) {
				continue;
			}
			const block = new Block(blockData, this.ressourceLoader);
		}
	}
}
