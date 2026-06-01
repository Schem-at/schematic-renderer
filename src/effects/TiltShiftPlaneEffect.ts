// TiltShiftPlaneEffect.ts — true tilt-shift via the Scheimpflug principle.
//
// Unlike DepthOfFieldEffect (which focuses on a spherical shell around the
// camera at `worldFocusDistance`), this effect defines a *focus PLANE* in
// world space. Pitch/yaw tilt the plane relative to camera forward so the
// in-focus region runs diagonally through the scene — what real tilt-shift
// lenses produce via the Scheimpflug principle.
//
// Per-pixel cost: reconstruct world position from depth, compute
// perpendicular distance to the plane, sample 16 taps from the input buffer
// on a Vogel disk scaled by that distance.

import { Effect, EffectAttribute } from "postprocessing";
import { Uniform, Vector3, Matrix4, type Camera } from "three";

const fragmentShader = `
uniform mat4 invViewProjection;
uniform vec3 focusPoint;
uniform vec3 focusNormal;
uniform float focusRange;
uniform float blurStrength;

// Postprocessing auto-injects \`depthBuffer\` and \`DEPTH_PACKING\` when the
// effect has the DEPTH attribute; we just read from them here. The two
// branches handle the standard RGBA-packed depth and the raw float depth
// representations the framework can choose between.
float sampleDepth(vec2 uv) {
#if DEPTH_PACKING == 3201
    return unpackRGBAToDepth(texture2D(depthBuffer, uv));
#else
    return texture2D(depthBuffer, uv).r;
#endif
}

// Reconstruct the pixel's world position from screen UV + depth-buffer depth.
// The depth value is in [0,1] non-linear z-buffer space; NDC is [-1,1].
vec3 reconstructWorld(vec2 uv, float depth) {
    vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 wp = invViewProjection * ndc;
    return wp.xyz / wp.w;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float depth = sampleDepth(uv);

    // Skybox / nothing-rendered pixels stay sharp.
    if (depth >= 0.9999) {
        outputColor = inputColor;
        return;
    }

    vec3 world = reconstructWorld(uv, depth);

    // Perpendicular distance to the focus plane. CoC ramps from 0 inside
    // the in-focus slab to 1 once we're a full \`focusRange\` outside it.
    float planeDist = abs(dot(world - focusPoint, focusNormal));
    float coc = clamp((planeDist - focusRange) / max(focusRange, 0.001), 0.0, 1.0);

    if (coc < 0.01) {
        outputColor = inputColor;
        return;
    }

    // Vogel disk sampling: golden-angle spiral, gives evenly distributed taps
    // without needing a pre-baked lookup array (works in WebGL1 and WebGL2).
    float radius = coc * blurStrength;
    vec2 aspectFix = vec2(1.0 / aspect, 1.0);
    vec4 sum = vec4(0.0);
    const float GOLDEN_ANGLE = 2.39996323;
    for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 16.0);
        float theta = fi * GOLDEN_ANGLE;
        vec2 offset = vec2(cos(theta), sin(theta)) * r * radius * aspectFix;
        sum += texture2D(inputBuffer, uv + offset);
    }
    outputColor = sum * (1.0 / 16.0);
}
`;

export interface TiltShiftPlaneOptions {
	/** Focus point in world space. Defaults to the origin. */
	focusPoint?: Vector3;
	/** Plane normal in world space. Defaults to camera-forward when omitted. */
	focusNormal?: Vector3;
	/** Half-width of the in-focus slab in world units. Default 2. */
	focusRange?: number;
	/** Max sample radius in UV units (so 0.02 ≈ 2% of screen). Default 0.01. */
	blurStrength?: number;
}

export class TiltShiftPlaneEffect extends Effect {
	private camera: Camera;

	constructor(camera: Camera, options: TiltShiftPlaneOptions = {}) {
		super("TiltShiftPlaneEffect", fragmentShader, {
			// DEPTH: composer attaches the depth texture so we can read it.
			// CONVOLUTION: forces the effect into its own pass (so the merged-
			// pass varying-name collisions we hit earlier can't happen).
			attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
			uniforms: new Map<string, Uniform<any>>([
				["invViewProjection", new Uniform(new Matrix4())],
				["focusPoint", new Uniform(options.focusPoint?.clone() ?? new Vector3())],
				[
					"focusNormal",
					new Uniform((options.focusNormal?.clone() ?? new Vector3(0, 0, -1)).normalize()),
				],
				["focusRange", new Uniform(options.focusRange ?? 2)],
				["blurStrength", new Uniform(options.blurStrength ?? 0.01)],
			]),
		});
		this.camera = camera;
	}

	/**
	 * Recompute the inverse view-projection matrix each frame. The shader
	 * uses it to convert sampled depths into world positions.
	 */
	update(_renderer: unknown, _inputBuffer: unknown, _deltaTime: number): void {
		const cam = this.camera as unknown as {
			projectionMatrix: Matrix4;
			matrixWorldInverse: Matrix4;
			updateMatrixWorld: () => void;
		};
		cam.updateMatrixWorld();
		const inv = this.uniforms.get("invViewProjection")!.value as Matrix4;
		inv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
	}

	public setFocusPoint(p: Vector3): void {
		(this.uniforms.get("focusPoint")!.value as Vector3).copy(p);
	}

	public setFocusNormal(n: Vector3): void {
		(this.uniforms.get("focusNormal")!.value as Vector3).copy(n).normalize();
	}

	public setFocusRange(r: number): void {
		this.uniforms.get("focusRange")!.value = Math.max(0.001, r);
	}

	public setBlurStrength(s: number): void {
		this.uniforms.get("blurStrength")!.value = Math.max(0, s);
	}

	/**
	 * Convenience: tilt the focus plane by `pitchDeg`/`yawDeg` relative to the
	 * current camera frame. Pitch rotates around the camera's local right
	 * axis, yaw rotates around the camera's local up axis. Pitch ≠ 0 is the
	 * actual Scheimpflug "tilt" that produces the diagonal focus plane.
	 */
	public setTiltAngles(pitchDeg: number, yawDeg: number): void {
		const cam = this.camera as unknown as {
			quaternion: { x: number; y: number; z: number; w: number };
			updateMatrixWorld: () => void;
		};
		cam.updateMatrixWorld();
		const q = (cam as any).quaternion;
		const forward = new Vector3(0, 0, -1).applyQuaternion(q);
		const right = new Vector3(1, 0, 0).applyQuaternion(q);
		const up = new Vector3(0, 1, 0).applyQuaternion(q);
		const normal = forward.clone();
		normal.applyAxisAngle(right, (pitchDeg * Math.PI) / 180);
		normal.applyAxisAngle(up, (yawDeg * Math.PI) / 180);
		this.setFocusNormal(normal);
	}
}
