import * as THREE from "three";
import { AssetLoader } from "./AssetLoader";

/**
 * Vanilla-accurate sign rendering for cubane.
 *
 * Ported (as a reference, not a dependency) from Schematic-Mesher's Rust entity
 * mesher (`sign.rs`, `hanging_sign.rs`, `sign_text.rs`). Signs are *block entities*:
 * Minecraft renders them with a dedicated model (a board ± stick / plank / chains)
 * built from cube primitives with box-unwrapped UVs into the `entity/signs/*`
 * texture, then draws the text with the bitmap font. We reproduce that here:
 *
 *  - Geometry is built from the exact MC entity-model cubes and poses (position in
 *    1/16-block units, RotX(π) to flip Java's Y-down model into Y-up, 2/3 scale for
 *    regular signs, 1.0 for hanging), rotated about the block centre by the sign's
 *    `rotation` (standing, 16 steps) or `facing` (wall) property.
 *  - Text is baked into a 4× upscaled copy of the sign texture by compositing glyphs
 *    from `font/ascii`, so it shares the board's UVs (no separate overlay quad to
 *    keep aligned, which is what made the old approach drift / vanish).
 *
 * Output geometry is in cubane's block-local [0,1] space (Y-up); the caller places
 * it at the block's integer coordinate, so vertices fill the cell exactly.
 */

const SIGN_WOODS = [
	"oak",
	"spruce",
	"birch",
	"jungle",
	"acacia",
	"dark_oak",
	"crimson",
	"warped",
	"mangrove",
	"cherry",
	"bamboo",
	"pale_oak",
];

interface SignInfo {
	isHanging: boolean;
	isWall: boolean;
	wood: string;
	texturePath: string; // entity/signs/<wood> or entity/signs/hanging/<wood>
	facingAngle: number; // Y rotation (radians) about the block centre
}

interface EntityCube {
	origin: [number, number, number];
	dimensions: [number, number, number];
	texOffset: [number, number];
	mirror: boolean;
}

interface EntityPart {
	cubes: EntityCube[];
	position: [number, number, number];
	rotation: [number, number, number];
	scale: number;
}

type Face = "down" | "up" | "north" | "south" | "west" | "east";

const FACE_NORMALS: Record<Face, [number, number, number]> = {
	down: [0, -1, 0],
	up: [0, 1, 0],
	north: [0, 0, -1],
	south: [0, 0, 1],
	west: [-1, 0, 0],
	east: [1, 0, 0],
};

// 6 faces: corner indices into the 8-corner cube + the face direction. Mirrors the
// reference's `generate_cube_faces` face_defs / winding exactly.
const FACE_DEFS: { dir: Face; corners: [number, number, number, number] }[] = [
	{ dir: "down", corners: [4, 5, 1, 0] },
	{ dir: "up", corners: [3, 2, 6, 7] },
	{ dir: "north", corners: [1, 0, 3, 2] },
	{ dir: "south", corners: [4, 5, 6, 7] },
	{ dir: "west", corners: [0, 4, 7, 3] },
	{ dir: "east", corners: [5, 1, 2, 6] },
];

const SIGN_TEXTURE_SIZE: [number, number] = [64, 32];

export class SignRenderer {
	private fontData: {
		pixels: Uint8ClampedArray;
		width: number;
		height: number;
		cellW: number;
		cellH: number;
		glyphWidths: Uint8Array;
	} | null = null;
	private fontPromise: Promise<void> | null = null;
	private basePixelCache = new Map<string, ImageData | null>();
	private textureCache = new Map<string, THREE.Texture>();

	constructor(private assetLoader: AssetLoader) {}

	/** Whether a block id (e.g. "minecraft:oak_wall_sign") is any kind of sign. */
	public isSign(blockName: string): boolean {
		const name = blockName.replace("minecraft:", "");
		return name.endsWith("_sign") || name === "sign";
	}

	/**
	 * Build a full sign mesh (geometry + baked-text material) for a block.
	 * Returns null if the block isn't a sign or the textures can't be loaded.
	 */
	public async buildSignMesh(
		blockName: string,
		properties: Record<string, string>,
		nbtData?: Record<string, any>
	): Promise<THREE.Object3D | null> {
		const info = this.detectSign(blockName, properties);
		if (!info) return null;

		const parts = this.buildParts(info);
		const geometry = this.buildGeometry(parts, info.facingAngle);

		const { lines, color, glowing } = this.extractSignText(nbtData ?? {});
		const texture = await this.getSignTexture(info, lines, color, glowing);
		if (!texture) return null;

		const material = new THREE.MeshStandardMaterial({
			map: texture,
			transparent: false,
			alphaTest: 0.5,
			roughness: 1.0,
			metalness: 0.0,
		});

		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = `sign_${info.wood}${info.isWall ? "_wall" : ""}${info.isHanging ? "_hanging" : ""}`;

		// Geometry is already in block-local [0,1]; the caller adds it at the block
		// coordinate, so no positional offset is needed.
		const group = new THREE.Group();
		group.add(mesh);
		return group;
	}

	// ── Detection ─────────────────────────────────────────────────────────────

	private detectSign(blockName: string, properties: Record<string, string>): SignInfo | null {
		const name = blockName.replace("minecraft:", "");
		if (!this.isSign(blockName)) return null;

		const isHanging = name.includes("hanging");
		const isWall = name.includes("wall");

		// Strip the suffixes to recover the wood prefix.
		const wood = SIGN_WOODS.find((w) => name.startsWith(`${w}_`)) ?? "oak";

		const texturePath = isHanging ? `entity/signs/hanging/${wood}` : `entity/signs/${wood}`;

		// Standing signs (and ceiling hanging signs) rotate by the 16-step `rotation`
		// property; wall variants rotate by `facing`.
		const facingAngle = isWall
			? this.facingRotationRad(properties.facing ?? "north")
			: this.standingRotationRad(properties.rotation);

		return { isHanging, isWall, wood, texturePath, facingAngle };
	}

	/**
	 * Y rotation for a wall sign's board. A wall sign mounts on the block opposite its
	 * `facing`, so the board sits on that face (a half-turn from the entity model's
	 * default orientation in this renderer): north→0, south→180°, east→90°, west→-90°.
	 */
	private facingRotationRad(facing: string): number {
		switch (facing) {
			case "south":
				return Math.PI;
			case "east":
				return Math.PI / 2;
			case "west":
				return -Math.PI / 2;
			case "north":
			default:
				return 0;
		}
	}

	/** `rotation` 0-15, each step = 22.5° clockwise from south. */
	private standingRotationRad(rotation: string | undefined): number {
		const rot = parseInt(rotation ?? "0", 10);
		return (Number.isFinite(rot) ? rot : 0) * (Math.PI / 8);
	}

	// ── Model definitions (exact MC entity-model cubes/poses) ───────────────────

	private buildParts(info: SignInfo): EntityPart[] {
		if (info.isHanging) {
			const pos: [number, number, number] = info.isWall ? [8, 10, 15] : [8, 10, 8];
			const scale = 1.0;
			const rotation: [number, number, number] = [Math.PI, 0, 0];
			const parts: EntityPart[] = [
				{
					cubes: [
						{ origin: [-7, 0, -1], dimensions: [14, 10, 2], texOffset: [0, 12], mirror: false },
					],
					position: pos,
					rotation,
					scale,
				},
			];
			if (!info.isWall) {
				parts.push({
					cubes: [
						{ origin: [-8, -6, -2], dimensions: [16, 2, 4], texOffset: [0, 0], mirror: false },
					],
					position: pos,
					rotation,
					scale,
				});
				parts.push({
					cubes: [
						{ origin: [-6, -6, -1], dimensions: [2, 6, 2], texOffset: [0, 6], mirror: false },
					],
					position: pos,
					rotation,
					scale,
				});
				parts.push({
					cubes: [{ origin: [4, -6, -1], dimensions: [2, 6, 2], texOffset: [0, 6], mirror: true }],
					position: pos,
					rotation,
					scale,
				});
			}
			return parts;
		}

		const pos: [number, number, number] = info.isWall ? [8, 3, 15] : [8, 8, 8];
		const scale = 2 / 3;
		const rotation: [number, number, number] = [Math.PI, 0, 0];
		const parts: EntityPart[] = [
			{
				cubes: [
					{ origin: [-12, -14, -1], dimensions: [24, 12, 2], texOffset: [0, 0], mirror: false },
				],
				position: pos,
				rotation,
				scale,
			},
		];
		// Standing signs have a stick; wall signs don't.
		if (!info.isWall) {
			parts.push({
				cubes: [
					{ origin: [-1, -2, -1], dimensions: [2, 14, 2], texOffset: [0, 14], mirror: false },
				],
				position: pos,
				rotation,
				scale,
			});
		}
		return parts;
	}

	// ── Geometry generation ─────────────────────────────────────────────────────

	private buildGeometry(parts: EntityPart[], facingAngle: number): THREE.BufferGeometry {
		// facing_mat = T(0.5,0,0.5) · Ry(angle) · T(-0.5,0,-0.5) — rotate about the
		// block centre (in the ground plane).
		const facingMat = new THREE.Matrix4()
			.makeTranslation(0.5, 0, 0.5)
			.multiply(new THREE.Matrix4().makeRotationY(facingAngle))
			.multiply(new THREE.Matrix4().makeTranslation(-0.5, 0, -0.5));

		// The reference model is block-local [0,1]; cubane builds block meshes in
		// [-0.5,0.5] centered space (c/16 - 0.5) and the caller places them at the
		// block coordinate. Shift the whole sign to match, else it sits +0.5 off on
		// every axis.
		const centerMat = new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5);

		const positions: number[] = [];
		const normals: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];

		for (const part of parts) {
			// local = T(pos/16) · Rz · Ry · Rx · S(scale)
			const local = new THREE.Matrix4()
				.makeTranslation(part.position[0] / 16, part.position[1] / 16, part.position[2] / 16)
				.multiply(new THREE.Matrix4().makeRotationZ(part.rotation[2]))
				.multiply(new THREE.Matrix4().makeRotationY(part.rotation[1]))
				.multiply(new THREE.Matrix4().makeRotationX(part.rotation[0]))
				.multiply(new THREE.Matrix4().makeScale(part.scale, part.scale, part.scale));

			const full = new THREE.Matrix4().multiplyMatrices(facingMat, local).premultiply(centerMat);
			const normalMat = new THREE.Matrix3().getNormalMatrix(full);

			for (const cube of part.cubes) {
				this.emitCube(cube, full, normalMat, positions, normals, uvs, indices);
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
		geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
		geometry.setIndex(indices);
		return geometry;
	}

	private emitCube(
		cube: EntityCube,
		full: THREE.Matrix4,
		normalMat: THREE.Matrix3,
		positions: number[],
		normals: number[],
		uvs: number[],
		indices: number[]
	): void {
		const [ox, oy, oz] = cube.origin;
		const [w, h, d] = cube.dimensions;
		const x0 = ox / 16;
		const y0 = oy / 16;
		const z0 = oz / 16;
		const x1 = (ox + w) / 16;
		const y1 = (oy + h) / 16;
		const z1 = (oz + d) / 16;

		// 8 corners (---, +--, ++-, -+-, --+, +-+, +++, -++)
		const corners: [number, number, number][] = [
			[x0, y0, z0],
			[x1, y0, z0],
			[x1, y1, z0],
			[x0, y1, z0],
			[x0, y0, z1],
			[x1, y0, z1],
			[x1, y1, z1],
			[x0, y1, z1],
		];
		const transformed = corners.map((c) => {
			const v = new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(full);
			return [v.x, v.y, v.z] as [number, number, number];
		});

		for (const { dir, corners: ci } of FACE_DEFS) {
			const faceUVs = this.cubeFaceUVs(cube.texOffset, cube.dimensions, dir, cube.mirror);

			const dn = FACE_NORMALS[dir];
			const n = new THREE.Vector3(dn[0], dn[1], dn[2]).applyMatrix3(normalMat).normalize();

			const vStart = positions.length / 3;
			for (let i = 0; i < 4; i++) {
				const p = transformed[ci[i]];
				positions.push(p[0], p[1], p[2]);
				normals.push(n.x, n.y, n.z);
				uvs.push(faceUVs[i][0], faceUVs[i][1]);
			}

			// Side faces wind 0-1-2 / 0-2-3; up/down wind 0-2-1 / 0-3-2.
			const isSide = dir === "north" || dir === "south" || dir === "west" || dir === "east";
			if (isSide) {
				indices.push(vStart, vStart + 1, vStart + 2, vStart, vStart + 2, vStart + 3);
			} else {
				indices.push(vStart, vStart + 2, vStart + 1, vStart, vStart + 3, vStart + 2);
			}
		}
	}

	/**
	 * Box-unwrap UVs for one cube face (Minecraft layout). Normalized with a
	 * top-left origin; the sign texture is created with `flipY = false` so these
	 * map 1:1 onto the canvas pixels.
	 */
	private cubeFaceUVs(
		texOffset: [number, number],
		dimensions: [number, number, number],
		face: Face,
		mirror: boolean
	): [number, number][] {
		const u0 = texOffset[0];
		const v0 = texOffset[1];
		const [w, h, d] = dimensions;
		const [tw, th] = SIGN_TEXTURE_SIZE;

		let left: number, top: number, right: number, bottom: number;
		switch (face) {
			case "down":
				[left, top, right, bottom] = [u0 + d, v0, u0 + d + w, v0 + d];
				break;
			case "up":
				[left, top, right, bottom] = [u0 + d + w, v0, u0 + d + w + w, v0 + d];
				break;
			case "north":
				[left, top, right, bottom] = [u0 + d, v0 + d, u0 + d + w, v0 + d + h];
				break;
			case "south":
				[left, top, right, bottom] = [u0 + d + w + d, v0 + d, u0 + d + w + d + w, v0 + d + h];
				break;
			case "west":
				[left, top, right, bottom] = [u0, v0 + d, u0 + d, v0 + d + h];
				break;
			case "east":
				[left, top, right, bottom] = [u0 + d + w, v0 + d, u0 + d + w + d, v0 + d + h];
				break;
		}

		const nl = left / tw;
		const nt = top / th;
		const nr = right / tw;
		const nb = bottom / th;

		if (face === "up") {
			return mirror
				? [
						[nr, nb],
						[nl, nb],
						[nl, nt],
						[nr, nt],
					]
				: [
						[nl, nb],
						[nr, nb],
						[nr, nt],
						[nl, nt],
					];
		}
		return mirror
			? [
					[nl, nt],
					[nr, nt],
					[nr, nb],
					[nl, nb],
				]
			: [
					[nr, nt],
					[nl, nt],
					[nl, nb],
					[nr, nb],
				];
	}

	// ── Text extraction (modern front_text.messages + legacy Text1-4) ───────────

	private extractSignText(nbtData: Record<string, any>): {
		lines: string[];
		color: string;
		glowing: boolean;
	} {
		const lines: string[] = [];
		let color = "black";
		let glowing = false;

		const front = nbtData.front_text ?? nbtData.Text?.front_text;
		if (front?.messages) {
			color = typeof front.color === "string" ? front.color : "black";
			glowing = front.has_glowing_text === 1 || front.has_glowing_text === true;
			for (const msg of front.messages) {
				lines.push(this.messageToString(msg));
			}
		}

		if (lines.length === 0) {
			for (let i = 1; i <= 4; i++) {
				const key = `Text${i}`;
				lines.push(nbtData[key] !== undefined ? this.messageToString(nbtData[key]) : "");
			}
		}

		while (lines.length < 4) lines.push("");
		return { lines: lines.slice(0, 4), color, glowing };
	}

	/** A raw NBT message → the literal string we hand to `parse_text_component`. */
	private messageToString(msg: any): string {
		if (typeof msg === "string") return msg;
		if (typeof msg === "object" && msg !== null) {
			try {
				return JSON.stringify(msg);
			} catch {
				return "";
			}
		}
		return String(msg ?? "");
	}

	// ── Texture (base + baked text) ─────────────────────────────────────────────

	private async getSignTexture(
		info: SignInfo,
		lines: string[],
		color: string,
		glowing: boolean
	): Promise<THREE.Texture | null> {
		const hasText = lines.some((l) => l.trim() !== "");
		const cacheKey = `${info.texturePath}|${info.isHanging}|${info.isWall}|${color}|${glowing}|${hasText ? lines.join(" ") : ""}`;
		const cached = this.textureCache.get(cacheKey);
		if (cached) return cached;

		const base = await this.getBasePixels(info.texturePath);
		if (!base) return null;

		let canvas: HTMLCanvasElement | OffscreenCanvas;
		if (!hasText) {
			canvas = this.imageDataToCanvas(base);
		} else {
			canvas = await this.compositeSignWithText(base, info, lines, color, glowing);
		}

		const texture = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
		texture.flipY = false; // canvas top-left origin matches our top-left UVs
		texture.magFilter = THREE.NearestFilter;
		texture.minFilter = THREE.NearestFilter;
		texture.generateMipmaps = false;
		// Match cubane's block textures: no sRGB decode on sample (gamma is applied in
		// post-processing). SRGBColorSpace here would render signs darker than blocks.
		texture.colorSpace = THREE.NoColorSpace;
		texture.needsUpdate = true;

		this.textureCache.set(cacheKey, texture);
		return texture;
	}

	private async getBasePixels(texturePath: string): Promise<ImageData | null> {
		if (this.basePixelCache.has(texturePath)) return this.basePixelCache.get(texturePath)!;
		const data = await this.assetLoader.getTexturePixels(texturePath);
		this.basePixelCache.set(texturePath, data);
		return data;
	}

	private imageDataToCanvas(img: ImageData): HTMLCanvasElement | OffscreenCanvas {
		const canvas = this.makeCanvas(img.width, img.height);
		const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
		ctx.putImageData(img, 0, 0);
		return canvas;
	}

	private makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
		if (typeof document !== "undefined") {
			const c = document.createElement("canvas");
			c.width = w;
			c.height = h;
			return c;
		}
		return new OffscreenCanvas(w, h);
	}

	// ── Text compositing (port of sign_text.rs) ─────────────────────────────────

	private async ensureFont(): Promise<void> {
		if (this.fontData) return;
		if (!this.fontPromise) {
			this.fontPromise = (async () => {
				const tex = await this.assetLoader.getTexturePixels("font/ascii");
				if (!tex) return;
				const width = tex.width;
				const height = tex.height;
				const cellW = Math.floor(width / 16);
				const cellH = Math.floor(height / 16);
				const px = tex.data;
				const glyphWidths = new Uint8Array(256);
				for (let ch = 0; ch < 256; ch++) {
					const col = ch % 16;
					const row = Math.floor(ch / 16);
					const cx = col * cellW;
					const cy = row * cellH;
					let maxX = 0;
					let has = false;
					for (let py = 0; py < cellH; py++) {
						for (let pxx = 0; pxx < cellW; pxx++) {
							const idx = ((cy + py) * width + (cx + pxx)) * 4;
							if (idx + 3 < px.length && px[idx + 3] > 0) {
								maxX = Math.max(maxX, pxx + 1);
								has = true;
							}
						}
					}
					glyphWidths[ch] = has ? Math.min(maxX + 1, cellW) : Math.floor(cellW / 2);
				}
				this.fontData = { pixels: px, width, height, cellW, cellH, glyphWidths };
			})();
		}
		await this.fontPromise;
	}

	private async compositeSignWithText(
		base: ImageData,
		info: SignInfo,
		lines: string[],
		color: string,
		glowing: boolean
	): Promise<HTMLCanvasElement | OffscreenCanvas> {
		await this.ensureFont();
		const scale = 4;
		const outW = base.width * scale;
		const outH = base.height * scale;
		const out = new Uint8ClampedArray(outW * outH * 4);

		// Nearest-neighbour upscale of the base texture.
		for (let y = 0; y < outH; y++) {
			const srcY = Math.floor(y / scale);
			for (let x = 0; x < outW; x++) {
				const srcX = Math.floor(x / scale);
				const s = (srcY * base.width + srcX) * 4;
				const dpx = (y * outW + x) * 4;
				out[dpx] = base.data[s];
				out[dpx + 1] = base.data[s + 1];
				out[dpx + 2] = base.data[s + 2];
				out[dpx + 3] = base.data[s + 3];
			}
		}

		const font = this.fontData;
		if (font) {
			// Text regions (x,y,w,h) in base-texture pixels — board front (± back).
			const regions: [number, number, number, number][] = info.isHanging
				? [
						[2, 14, 14, 10],
						[18, 14, 14, 10],
					]
				: info.isWall
					? [
							[2, 2, 24, 12],
							[28, 2, 24, 12],
						]
					: [[2, 2, 24, 12]];

			const nonEmpty = Math.max(
				1,
				lines.slice(0, 4).filter((l) => l !== "" && l.trim() !== "").length
			);

			// Regions are in the 64×32 *layout*; the actual sign texture may be higher
			// resolution (HD packs use 128×64, 256×128, …). `px` converts layout pixels
			// to base-texture pixels so the text lands where the board's UVs sample,
			// instead of being squished into a corner (which doubled it onto one face).
			const px = base.width / SIGN_TEXTURE_SIZE[0];

			for (const [rx, ry, rw, rh] of regions) {
				const textX0 = Math.round(rx * px * scale);
				const textY0 = Math.round(ry * px * scale);
				const textW = Math.round(rw * px * scale);
				const textH = Math.round(rh * px * scale);
				const lineHeight = Math.floor(textH / 4);
				const glyphScale = Math.max(
					1,
					Math.floor(Math.min(lineHeight, Math.floor((font.cellH * scale) / 2)) / font.cellH)
				);
				const vOffset = Math.floor((Math.max(0, 4 - nonEmpty) * lineHeight) / 2);

				let visibleIdx = 0;
				for (const line of lines.slice(0, 4)) {
					if (line === "" || line.trim() === "") continue;
					const yStart = textY0 + vOffset + visibleIdx * lineHeight;
					visibleIdx++;

					const segments = this.parseTextComponent(line, color);
					if (segments.length === 0) continue;

					const totalWidth = this.segmentsWidth(segments, font, glyphScale);
					const xOffset =
						totalWidth < textW ? textX0 + Math.floor((textW - totalWidth) / 2) : textX0;

					this.renderSegments(
						out,
						outW,
						font,
						glyphScale,
						segments,
						xOffset,
						yStart,
						textX0 + textW,
						glowing
					);
				}
			}
		}

		const canvas = this.makeCanvas(outW, outH);
		const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
		ctx.putImageData(new ImageData(out, outW, outH), 0, 0);
		return canvas;
	}

	private renderSegments(
		pixels: Uint8ClampedArray,
		bufW: number,
		font: NonNullable<typeof this.fontData>,
		glyphScale: number,
		segments: { text: string; color: string }[],
		xStart: number,
		yStart: number,
		xMax: number,
		glowing: boolean
	): void {
		let cursorX = xStart;
		for (const seg of segments) {
			const rgb = this.textColorRgb(seg.color);
			const bytes = this.toBytes(seg.text);

			if (glowing) {
				const outline = [
					Math.floor(rgb[0] * 0.25),
					Math.floor(rgb[1] * 0.25),
					Math.floor(rgb[2] * 0.25),
				] as [number, number, number];
				const offsets: [number, number][] = [
					[-1, 0],
					[1, 0],
					[0, -1],
					[0, 1],
					[-1, -1],
					[-1, 1],
					[1, -1],
					[1, 1],
				];
				let outlineCursor = cursorX;
				for (const ch of bytes) {
					const glyphW = font.glyphWidths[ch] * glyphScale;
					if (outlineCursor + glyphW > xMax) break;
					for (const [dx, dy] of offsets) {
						const oxp = outlineCursor + dx;
						const oyp = yStart + dy;
						if (oxp >= 0 && oyp >= 0) {
							this.blitGlyph(pixels, bufW, font, glyphScale, ch, outline, oxp, oyp, xMax);
						}
					}
					outlineCursor += glyphW;
				}
			}

			for (const ch of bytes) {
				const glyphW = font.glyphWidths[ch] * glyphScale;
				if (cursorX + glyphW > xMax) break;
				this.blitGlyph(pixels, bufW, font, glyphScale, ch, rgb, cursorX, yStart, xMax);
				cursorX += glyphW;
			}
		}
	}

	private blitGlyph(
		pixels: Uint8ClampedArray,
		bufW: number,
		font: NonNullable<typeof this.fontData>,
		glyphScale: number,
		ch: number,
		rgb: [number, number, number],
		dstX: number,
		dstY: number,
		xMax: number
	): void {
		const scaledH = font.cellH * glyphScale;
		const glyphW = font.glyphWidths[ch] * glyphScale;
		const col = ch % 16;
		const row = Math.floor(ch / 16);
		const gx = col * font.cellW;
		const gy = row * font.cellH;

		for (let py = 0; py < scaledH; py++) {
			const srcY = Math.floor(py / glyphScale);
			for (let px = 0; px < glyphW; px++) {
				const srcX = Math.floor(px / glyphScale);
				const fontIdx = ((gy + srcY) * font.width + (gx + srcX)) * 4;
				if (fontIdx + 3 >= font.pixels.length) continue;
				const alpha = font.pixels[fontIdx + 3];
				if (alpha === 0) continue;

				const pxX = dstX + px;
				const pxY = dstY + py;
				if (pxX >= xMax) break;
				const dstIdx = (pxY * bufW + pxX) * 4;
				if (dstIdx + 3 >= pixels.length) continue;

				const a = alpha / 255;
				const inv = 1 - a;
				pixels[dstIdx] = rgb[0] * a + pixels[dstIdx] * inv;
				pixels[dstIdx + 1] = rgb[1] * a + pixels[dstIdx + 1] * inv;
				pixels[dstIdx + 2] = rgb[2] * a + pixels[dstIdx + 2] * inv;
				pixels[dstIdx + 3] = Math.max(alpha, pixels[dstIdx + 3]);
			}
		}
	}

	private segmentsWidth(
		segments: { text: string; color: string }[],
		font: NonNullable<typeof this.fontData>,
		glyphScale: number
	): number {
		let total = 0;
		for (const seg of segments) {
			for (const ch of this.toBytes(seg.text)) {
				total += font.glyphWidths[ch] * glyphScale;
			}
		}
		return total;
	}

	/** Latin-1 bytes (the ascii font sheet is indexed 0-255). */
	private toBytes(s: string): number[] {
		const out: number[] = [];
		for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
		return out;
	}

	// ── Text component parsing (port of parse_text_component) ────────────────────

	private parseTextComponent(
		input: string,
		defaultColor: string
	): { text: string; color: string }[] {
		const trimmed = input.trim();
		if (trimmed === "") return [];
		try {
			const value = JSON.parse(trimmed);
			const segments: { text: string; color: string }[] = [];
			this.parseJsonValue(value, defaultColor, segments);
			return segments;
		} catch {
			return [{ text: input, color: defaultColor }];
		}
	}

	private parseJsonValue(
		value: any,
		parentColor: string,
		segments: { text: string; color: string }[]
	): void {
		if (typeof value === "string") {
			if (value !== "") segments.push({ text: value, color: parentColor });
		} else if (Array.isArray(value)) {
			for (const item of value) this.parseJsonValue(item, parentColor, segments);
		} else if (value && typeof value === "object") {
			const color = typeof value.color === "string" ? value.color : parentColor;
			if (typeof value.text === "string" && value.text !== "") {
				segments.push({ text: value.text, color });
			}
			if (Array.isArray(value.extra)) {
				for (const item of value.extra) this.parseJsonValue(item, color, segments);
			}
		}
	}

	private textColorRgb(color: string): [number, number, number] {
		switch (color) {
			case "black":
				return [0, 0, 0];
			case "dark_blue":
				return [0, 0, 170];
			case "dark_green":
				return [0, 170, 0];
			case "dark_aqua":
				return [0, 170, 170];
			case "dark_red":
				return [170, 0, 0];
			case "dark_purple":
				return [170, 0, 170];
			case "gold":
				return [255, 170, 0];
			case "gray":
				return [170, 170, 170];
			case "dark_gray":
				return [85, 85, 85];
			case "blue":
				return [85, 85, 255];
			case "green":
				return [85, 255, 85];
			case "aqua":
				return [85, 255, 255];
			case "red":
				return [255, 85, 85];
			case "light_purple":
				return [255, 85, 255];
			case "yellow":
				return [255, 255, 85];
			case "white":
				return [255, 255, 255];
			default: {
				// Support #rrggbb hex colors.
				const m = /^#?([0-9a-fA-F]{6})$/.exec(color);
				if (m) {
					const n = parseInt(m[1], 16);
					return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
				}
				return [0, 0, 0];
			}
		}
	}
}
