import * as THREE from "three";

export function castToVector3(value: any): THREE.Vector3 {
	if (Array.isArray(value)) {
		return new THREE.Vector3(value[0], value[1], value[2]);
	} else if (value instanceof THREE.Vector3) {
		return value;
	} else if (typeof value === "number") {
		// Uniform value for all components
		return new THREE.Vector3(value, value, value);
	} else {
		throw new Error("Invalid value for Vector3 property");
	}
}

export function castToEuler(value: any): THREE.Euler {
	if (Array.isArray(value)) {
		return new THREE.Euler(value[0], value[1], value[2]);
	} else if (value instanceof THREE.Euler) {
		return value;
	} else {
		throw new Error("Invalid value for Euler property");
	}
}
