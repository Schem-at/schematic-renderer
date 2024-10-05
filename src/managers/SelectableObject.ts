interface SelectableObject {
	id: string;
	position: THREE.Vector3;
	rotation: THREE.Euler;
	scale: THREE.Vector3;
	setPosition(position: THREE.Vector3): void;
	setRotation(rotation: THREE.Euler): void;
	setScale(scale: THREE.Vector3): void;
	getWorldPosition(): THREE.Vector3;
}
