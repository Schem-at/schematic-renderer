import { SchematicObject } from "./SchematicObject";

export class SchematicManager {
	private schematics: Map<string, SchematicObject> = new Map();

	constructor() {}

	public addSchematic(schematicObject: SchematicObject) {
		this.schematics.set(schematicObject.name, schematicObject);
	}

	public removeSchematic(name: string) {
		const schematicObject = this.schematics.get(name);
		if (schematicObject) {
			// Dispose meshes and other resources if necessary
			schematicObject.getMeshes().forEach((mesh) => {
				mesh.geometry.dispose();
				mesh.material.dispose();
			});
			this.schematics.delete(name);
		}
	}

	public getSchematic(name: string): SchematicObject | undefined {
		return this.schematics.get(name);
	}

	public getAllSchematics(): SchematicObject[] {
		return Array.from(this.schematics.values());
	}

	public getSchematicAtPosition(
		position: THREE.Vector3
	): SchematicObject | null {
		// Iterate over schematics to find one that contains the position
		for (const schematic of this.schematics.values()) {
			// Assume schematics have a method to check if a position is within their bounds
			if (schematic.containsPosition(position)) {
				return schematic;
			}
		}
		return null;
	}

	// Additional methods as needed
}
