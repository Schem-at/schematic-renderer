import * as THREE from "three";

export class TintManager {
	// Map of block IDs to their tint types
	private tintableBlocks: Map<string, string> = new Map();

	// Register built-in tintable blocks
	constructor() {
		// Redstone
		this.tintableBlocks.set("minecraft:redstone_wire", "redstone");

		// Foliage
		this.tintableBlocks.set("minecraft:grass_block", "foliage");
		this.tintableBlocks.set("minecraft:oak_leaves", "foliage");
		this.tintableBlocks.set("minecraft:vine", "foliage");
		this.tintableBlocks.set("minecraft:birch_leaves", "foliage");
		this.tintableBlocks.set("minecraft:spruce_leaves", "foliage");
		this.tintableBlocks.set("minecraft:jungle_leaves", "foliage");
		this.tintableBlocks.set("minecraft:acacia_leaves", "foliage");
		this.tintableBlocks.set("minecraft:dark_oak_leaves", "foliage");
		this.tintableBlocks.set("minecraft:azalea_leaves", "foliage");
		this.tintableBlocks.set("minecraft:flowering_azalea_leaves", "foliage");
		this.tintableBlocks.set("minecraft:oak_sapling", "foliage");
		this.tintableBlocks.set("minecraft:birch_sapling", "foliage");
		this.tintableBlocks.set("minecraft:spruce_sapling", "foliage");
		this.tintableBlocks.set("minecraft:jungle_sapling", "foliage");
		this.tintableBlocks.set("minecraft:acacia_sapling", "foliage");
		this.tintableBlocks.set("minecraft:lily_pad", "foliage");
		this.tintableBlocks.set("minecraft:grass", "foliage");
		// ...more foliage blocks

		// Water
		this.tintableBlocks.set("minecraft:water", "water");
		this.tintableBlocks.set("minecraft:flowing_water", "water");

		// Stems
		this.tintableBlocks.set("minecraft:pumpkin_stem", "stem");
		this.tintableBlocks.set("minecraft:melon_stem", "stem");
	}

	isTintable(blockId: string): boolean {
		return this.tintableBlocks.has(blockId);
	}

	getTintType(blockId: string): string | null {
		return this.tintableBlocks.get(blockId) || null;
	}

	// Calculate tint color based on block type and properties
	getTint(
		blockId: string,
		properties: Record<string, string>,
		biome: string = "plains",
		_position?: THREE.Vector3
	): THREE.Color {
		const tintType = this.getTintType(blockId);

		switch (tintType) {
			case "redstone":
				return this.getRedstoneTint(properties.power || "0");
			case "foliage":
				return this.getFoliageTint(blockId, biome);
			case "water":
				return this.getWaterTint(biome);
			case "stem":
				return this.getStemTint(properties.age || "0");
			default:
				return new THREE.Color(0xffffff); // Default: no tint
		}
	}

	// Specific tint calculators
	private getRedstoneTint(power: string): THREE.Color {
		const powerLevel = parseInt(power, 10);
		// Calculate brightness based on power level (0-15)
		// Minimum brightness at power 0 (darker red)
		const brightness = 0.3 + (powerLevel / 15) * 0.7;
		return new THREE.Color(brightness, 0.0, 0.0);
	}

	private getFoliageTint(blockId: string, _biome: string = "plains"): THREE.Color {
		// In a real implementation, this would use biome data
		// For now, use a default grass/leaves color
		if (blockId.includes("birch")) {
			return new THREE.Color(0.8, 0.9, 0.45); // Yellowish green for birch
		}
		return new THREE.Color(0.4, 0.7, 0.2); // Default foliage green
	}

	private getWaterTint(_biome: string = "plains"): THREE.Color {
		// In a real implementation, this would use biome data
		// Default water color (slightly blue)
		return new THREE.Color(0.2, 0.3, 0.9);
	}

	private getStemTint(age: string): THREE.Color {
		const ageLevel = parseInt(age, 10);
		// Stems gradually change from green to yellow/orange as they grow
		const green = 0.8 - (ageLevel / 7) * 0.6;
		const red = 0.2 + (ageLevel / 7) * 0.6;
		return new THREE.Color(red, green, 0.0);
	}
}
