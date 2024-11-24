const EasingFunctions = {
	linear: (t: number): number => t,
	easeInQuad: (t: number): number => t * t,
	easeOutQuad: (t: number): number => t * (2 - t),
	easeInOutQuad: (t: number): number =>
		t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
	easeInCubic: (t: number): number => t * t * t,
	easeOutCubic: (t: number): number => --t * t * t + 1,
	easeInOutCubic: (t: number): number =>
		t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
};

type EasingFunction = (t: number) => number;

export { EasingFunctions };
export type { EasingFunction };
