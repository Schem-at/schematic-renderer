// Highlight.ts
export interface Highlight {
	activate(): void;
	deactivate(): void;
	update(deltaTime: number): void;
}
