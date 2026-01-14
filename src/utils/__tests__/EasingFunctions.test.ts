import { describe, it, expect } from "vitest";
import { EasingFunctions } from "../EasingFunctions";

describe("EasingFunctions", () => {
	describe("linear", () => {
		it("should return input unchanged", () => {
			expect(EasingFunctions.linear(0)).toBe(0);
			expect(EasingFunctions.linear(0.5)).toBe(0.5);
			expect(EasingFunctions.linear(1)).toBe(1);
		});
	});

	describe("easeInQuad", () => {
		it("should start slow and end fast", () => {
			expect(EasingFunctions.easeInQuad(0)).toBe(0);
			expect(EasingFunctions.easeInQuad(0.5)).toBe(0.25);
			expect(EasingFunctions.easeInQuad(1)).toBe(1);
		});

		it("should be slower than linear at midpoint", () => {
			expect(EasingFunctions.easeInQuad(0.5)).toBeLessThan(0.5);
		});
	});

	describe("easeOutQuad", () => {
		it("should start fast and end slow", () => {
			expect(EasingFunctions.easeOutQuad(0)).toBe(0);
			expect(EasingFunctions.easeOutQuad(0.5)).toBe(0.75);
			expect(EasingFunctions.easeOutQuad(1)).toBe(1);
		});

		it("should be faster than linear at midpoint", () => {
			expect(EasingFunctions.easeOutQuad(0.5)).toBeGreaterThan(0.5);
		});
	});

	describe("easeInOutQuad", () => {
		it("should start slow, speed up, then slow down", () => {
			expect(EasingFunctions.easeInOutQuad(0)).toBe(0);
			expect(EasingFunctions.easeInOutQuad(0.5)).toBe(0.5);
			expect(EasingFunctions.easeInOutQuad(1)).toBe(1);
		});

		it("should be symmetric around midpoint", () => {
			const atQuarter = EasingFunctions.easeInOutQuad(0.25);
			const atThreeQuarter = EasingFunctions.easeInOutQuad(0.75);
			expect(atQuarter + atThreeQuarter).toBeCloseTo(1);
		});
	});

	describe("easeInCubic", () => {
		it("should start very slow and accelerate", () => {
			expect(EasingFunctions.easeInCubic(0)).toBe(0);
			expect(EasingFunctions.easeInCubic(0.5)).toBe(0.125);
			expect(EasingFunctions.easeInCubic(1)).toBe(1);
		});

		it("should be slower than easeInQuad at midpoint", () => {
			expect(EasingFunctions.easeInCubic(0.5)).toBeLessThan(EasingFunctions.easeInQuad(0.5));
		});
	});

	describe("easeOutCubic", () => {
		it("should start fast and decelerate", () => {
			expect(EasingFunctions.easeOutCubic(0)).toBe(0);
			expect(EasingFunctions.easeOutCubic(0.5)).toBe(0.875);
			expect(EasingFunctions.easeOutCubic(1)).toBe(1);
		});

		it("should be faster than easeOutQuad at midpoint", () => {
			expect(EasingFunctions.easeOutCubic(0.5)).toBeGreaterThan(EasingFunctions.easeOutQuad(0.5));
		});
	});

	describe("easeInOutCubic", () => {
		it("should have smooth ease in and out", () => {
			expect(EasingFunctions.easeInOutCubic(0)).toBe(0);
			expect(EasingFunctions.easeInOutCubic(0.5)).toBe(0.5);
			expect(EasingFunctions.easeInOutCubic(1)).toBe(1);
		});

		it("should be more pronounced than easeInOutQuad", () => {
			// At 0.25, cubic should be slower (smaller value)
			expect(EasingFunctions.easeInOutCubic(0.25)).toBeLessThan(
				EasingFunctions.easeInOutQuad(0.25)
			);
		});
	});

	describe("all functions", () => {
		it("should return 0 for input 0", () => {
			Object.values(EasingFunctions).forEach((fn) => {
				expect(fn(0)).toBe(0);
			});
		});

		it("should return 1 for input 1", () => {
			Object.values(EasingFunctions).forEach((fn) => {
				expect(fn(1)).toBe(1);
			});
		});

		it("should return values between 0 and 1 for inputs between 0 and 1", () => {
			const testValues = [0.1, 0.25, 0.5, 0.75, 0.9];
			Object.values(EasingFunctions).forEach((fn) => {
				testValues.forEach((t) => {
					const result = fn(t);
					expect(result).toBeGreaterThanOrEqual(0);
					expect(result).toBeLessThanOrEqual(1);
				});
			});
		});
	});
});
