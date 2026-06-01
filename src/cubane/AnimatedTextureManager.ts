import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";
import { TextureAnimationMetadata } from "./types";
/**
 * Animation metadata structure that matches Minecraft's mcmeta format
 */

/**
 * Extended class to handle animated textures
 */
export class AnimatedTextureManager {
	private animatedTextures: Map<
		string,
		{
			texture: THREE.Texture;
			metadata: TextureAnimationMetadata;
			currentFrame: number;
			frameCount: number;
			frameTime: number;
			lastFrameTime: number;
		}
	> = new Map();

	constructor(private assetLoader: AssetLoader) {}

	/**
	 * Check if a texture has animation metadata
	 */
	public async isAnimated(texturePath: string): Promise<boolean> {
		// Check if a .mcmeta file exists for this texture
		const metadataPath = `${texturePath}.png.mcmeta`;
		const metadata = await this.assetLoader.getResourceString(metadataPath);
		return !!metadata;
	}

	/**
	 * Load animation metadata for a texture
	 */
	public async loadAnimationMetadata(
		texturePath: string
	): Promise<TextureAnimationMetadata | null> {
		const metadataPath = `textures/${texturePath}.png.mcmeta`;
		const metadataString = await this.assetLoader.getResourceString(metadataPath);

		if (!metadataString) {
			return null;
		}

		try {
			return JSON.parse(metadataString) as TextureAnimationMetadata;
		} catch (error) {
			console.error(`Failed to parse animation metadata for ${texturePath}:`, error);
			return null;
		}
	}

	/**
	 * Create an animated texture
	 */
	public async createAnimatedTexture(texturePath: string): Promise<THREE.Texture | null> {
		// Reuse an already-registered animated texture. Without this, a block whose
		// faces share one texture (e.g. kelp's 4 cross faces) creates a new texture
		// per face, but only the last one is tracked in `animatedTextures` and gets
		// advanced by update() — so only some faces animate. Returning the shared
		// instance makes every face animate together.
		const existing = this.animatedTextures.get(texturePath);
		if (existing) {
			return existing.texture;
		}

		// Load the metadata
		const metadata = await this.loadAnimationMetadata(texturePath);
		if (!metadata) {
			return null;
		}

		// Load the texture image
		const textureBlob = await this.assetLoader.getResourceBlob(`textures/${texturePath}.png`);
		if (!textureBlob) {
			return null;
		}

		// Create image to determine frame count
		const image = new Image();
		const objectUrl = URL.createObjectURL(textureBlob);

		return new Promise<THREE.Texture | null>((resolve) => {
			image.onload = () => {
				URL.revokeObjectURL(objectUrl);

				// Calculate frame count based on image dimensions
				// Typically, animated textures in Minecraft have frames stacked vertically
				const frameCount = Math.floor(image.height / image.width);

				// Create texture
				const texture = new THREE.Texture(image);
				texture.minFilter = THREE.NearestFilter;
				texture.magFilter = THREE.NearestFilter;
				texture.wrapS = THREE.RepeatWrapping;
				texture.wrapT = THREE.RepeatWrapping;

				// Ensure animation property exists (some mcmeta files may have different structure)
				if (!metadata.animation) {
					metadata.animation = {};
				}

				// Set up animation parameters
				const frameTime = metadata.animation.frametime || 1;
				// Ensure frames are set for later use in the update method
				if (!metadata.animation.frames) {
					metadata.animation.frames = [...Array(frameCount).keys()]; // Default to sequential frames
				}

				// Configure texture repeat and offset for animation
				texture.repeat.set(1, 1 / frameCount);
				texture.offset.set(0, 0);
				texture.needsUpdate = true;

				// Store in animated textures map
				this.animatedTextures.set(texturePath, {
					texture,
					metadata,
					currentFrame: 0,
					frameCount,
					frameTime,
					lastFrameTime: Date.now(),
				});

				resolve(texture);
			};

			image.onerror = () => {
				URL.revokeObjectURL(objectUrl);
				resolve(null);
			};

			image.src = objectUrl;
		});
	}

	/**
	 * Update all animated textures
	 * Call this in your render loop
	 */
	public update(): void {
		const now = Date.now();

		this.animatedTextures.forEach((data, _texturePath) => {
			const { texture, metadata, frameCount, frameTime } = data;

			// Calculate elapsed time since last frame update (in game ticks)
			// Minecraft runs at 20 ticks per second, so 50ms per tick
			const elapsedTicks = Math.floor((now - data.lastFrameTime) / 50);

			if (elapsedTicks >= frameTime) {
				// Time to advance to next frame
				data.lastFrameTime = now;

				// Get the frame index to display
				const frames = metadata.animation.frames || [...Array(frameCount).keys()];
				data.currentFrame = (data.currentFrame + 1) % frames.length;
				const frameIndex = frames[data.currentFrame];

				// Update texture offset to show the correct frame
				// Minecraft textures stack frames vertically from top to bottom
				texture.offset.set(0, 1 - (frameIndex + 1) / frameCount);
				texture.needsUpdate = true;
			}
		});
	}
}
