import * as THREE from "three";

export type InterpolationMode =
	| "linear"
	| "smoothstep"
	| "ease-in"
	| "ease-out"
	| "ease-in-out"
	| "catmull-rom";

export interface CameraKeyframe {
	/** Position on the timeline (0-100) */
	position: number;
	/** Camera position */
	cameraPos: THREE.Vector3;
	/** Camera look-at target */
	cameraTarget: THREE.Vector3;
	/** Optional label */
	label?: string;
}

export interface KeyframeResult {
	position: THREE.Vector3;
	target: THREE.Vector3;
}

/**
 * KeyframeTrack provides camera interpolation through a sequence of keyframes.
 * Supports multiple interpolation modes including Catmull-Rom splines.
 *
 * Usage:
 * ```ts
 * const track = new KeyframeTrack("catmull-rom");
 * track.addKeyframe(0, cameraPos1, target1);
 * track.addKeyframe(50, cameraPos2, target2);
 * track.addKeyframe(100, cameraPos3, target3);
 *
 * const { position, target } = track.getAt(25); // interpolated at 25%
 * ```
 */
export class KeyframeTrack {
	private keyframes: CameraKeyframe[] = [];
	private _interpolation: InterpolationMode;

	constructor(interpolation: InterpolationMode = "catmull-rom") {
		this._interpolation = interpolation;
	}

	/** Get/set interpolation mode */
	get interpolation(): InterpolationMode {
		return this._interpolation;
	}
	set interpolation(mode: InterpolationMode) {
		this._interpolation = mode;
	}

	/** Number of keyframes */
	get length(): number {
		return this.keyframes.length;
	}

	/** Add a keyframe. Automatically sorts by position. */
	public addKeyframe(
		position: number,
		cameraPos: THREE.Vector3,
		cameraTarget: THREE.Vector3,
		label?: string
	): void {
		this.keyframes.push({
			position,
			cameraPos: cameraPos.clone(),
			cameraTarget: cameraTarget.clone(),
			label,
		});
		this.keyframes.sort((a, b) => a.position - b.position);
	}

	/** Remove keyframe at index */
	public removeKeyframe(index: number): void {
		this.keyframes.splice(index, 1);
	}

	/** Clear all keyframes */
	public clear(): void {
		this.keyframes = [];
	}

	/** Get all keyframes (read-only copy) */
	public getKeyframes(): readonly CameraKeyframe[] {
		return this.keyframes;
	}

	/** Get a keyframe by index */
	public getKeyframe(index: number): CameraKeyframe | undefined {
		return this.keyframes[index];
	}

	/** Update a keyframe's camera data without changing its position */
	public updateKeyframe(
		index: number,
		cameraPos: THREE.Vector3,
		cameraTarget: THREE.Vector3
	): void {
		const kf = this.keyframes[index];
		if (!kf) return;
		kf.cameraPos = cameraPos.clone();
		kf.cameraTarget = cameraTarget.clone();
	}

	/** Move a keyframe to a new timeline position */
	public setKeyframePosition(index: number, position: number): void {
		const kf = this.keyframes[index];
		if (!kf) return;
		kf.position = position;
		this.keyframes.sort((a, b) => a.position - b.position);
	}

	/** Lock first keyframe to 0 and last to 100 */
	public enforceFirstLast(): void {
		if (this.keyframes.length >= 1) {
			this.keyframes[0].position = 0;
		}
		if (this.keyframes.length >= 2) {
			this.keyframes[this.keyframes.length - 1].position = 100;
		}
	}

	/**
	 * Interpolate camera state at a given percentage (0-100).
	 * Returns null if fewer than 2 keyframes exist.
	 */
	public getAt(pct: number): KeyframeResult | null {
		if (this.keyframes.length < 2) return null;

		const first = this.keyframes[0].position;
		const last = this.keyframes[this.keyframes.length - 1].position;
		pct = Math.max(first, Math.min(last, pct));

		if (this._interpolation === "catmull-rom") {
			return this.catmullRomAt(pct);
		}

		return this.segmentInterpolateAt(pct);
	}

	/** Apply easing to a 0-1 value */
	private applyEasing(t: number): number {
		switch (this._interpolation) {
			case "linear":
				return t;
			case "smoothstep":
				return t * t * (3 - 2 * t);
			case "ease-in":
				return t * t * t;
			case "ease-out": {
				const u = 1 - t;
				return 1 - u * u * u;
			}
			case "ease-in-out":
				return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
			default:
				return t;
		}
	}

	/** Segment-based interpolation with easing */
	private segmentInterpolateAt(pct: number): KeyframeResult {
		let kfA = this.keyframes[0];
		let kfB = this.keyframes[this.keyframes.length - 1];

		for (let i = 0; i < this.keyframes.length - 1; i++) {
			if (pct >= this.keyframes[i].position && pct <= this.keyframes[i + 1].position) {
				kfA = this.keyframes[i];
				kfB = this.keyframes[i + 1];
				break;
			}
		}

		const range = kfB.position - kfA.position;
		const segT = range > 0 ? (pct - kfA.position) / range : 0;
		const easedT = this.applyEasing(segT);

		return {
			position: new THREE.Vector3().lerpVectors(kfA.cameraPos, kfB.cameraPos, easedT),
			target: new THREE.Vector3().lerpVectors(kfA.cameraTarget, kfB.cameraTarget, easedT),
		};
	}

	/** Catmull-Rom spline interpolation through all keyframes */
	private catmullRomAt(pct: number): KeyframeResult {
		const kfs = this.keyframes;
		const positions = kfs.map((k) => k.position);
		const first = positions[0];
		const last = positions[positions.length - 1];
		const globalT = last > first ? (pct - first) / (last - first) : 0;

		const posCurve = new THREE.CatmullRomCurve3(
			kfs.map((k) => k.cameraPos.clone()),
			false,
			"catmullrom",
			0.5
		);
		const tgtCurve = new THREE.CatmullRomCurve3(
			kfs.map((k) => k.cameraTarget.clone()),
			false,
			"catmullrom",
			0.5
		);

		return {
			position: posCurve.getPoint(globalT),
			target: tgtCurve.getPoint(globalT),
		};
	}

	/**
	 * Sample the track at regular intervals.
	 * Useful for building path visualizations.
	 * @param samples - Number of sample points
	 * @returns Array of interpolated positions
	 */
	public sample(samples: number = 64): KeyframeResult[] {
		const results: KeyframeResult[] = [];
		for (let i = 0; i <= samples; i++) {
			const pct = (i / samples) * 100;
			const result = this.getAt(pct);
			if (result) results.push(result);
		}
		return results;
	}

	/**
	 * Serialize the track to a plain object for storage/transfer.
	 */
	public toJSON(): {
		interpolation: string;
		keyframes: Array<{
			position: number;
			cameraPos: number[];
			cameraTarget: number[];
			label?: string;
		}>;
	} {
		return {
			interpolation: this._interpolation,
			keyframes: this.keyframes.map((kf) => ({
				position: kf.position,
				cameraPos: [kf.cameraPos.x, kf.cameraPos.y, kf.cameraPos.z],
				cameraTarget: [kf.cameraTarget.x, kf.cameraTarget.y, kf.cameraTarget.z],
				label: kf.label,
			})),
		};
	}

	/**
	 * Load from a serialized object.
	 */
	public static fromJSON(data: {
		interpolation?: string;
		keyframes: Array<{
			position: number;
			cameraPos: number[];
			cameraTarget: number[];
			label?: string;
		}>;
	}): KeyframeTrack {
		const track = new KeyframeTrack((data.interpolation || "catmull-rom") as InterpolationMode);
		for (const kf of data.keyframes) {
			track.addKeyframe(
				kf.position,
				new THREE.Vector3(kf.cameraPos[0], kf.cameraPos[1], kf.cameraPos[2]),
				new THREE.Vector3(kf.cameraTarget[0], kf.cameraTarget[1], kf.cameraTarget[2]),
				kf.label
			);
		}
		return track;
	}
}
