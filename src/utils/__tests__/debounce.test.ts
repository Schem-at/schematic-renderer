import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("debounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires once after the trailing edge of the delay", async () => {
		const { debounce } = await import("../debounce");
		const fn = vi.fn();
		const d = debounce(fn, 100);

		d(1);
		d(2);
		d(3);

		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(99);
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenLastCalledWith(3);
	});

	it("re-arms the timer on each call", async () => {
		const { debounce } = await import("../debounce");
		const fn = vi.fn();
		const d = debounce(fn, 50);

		d("a");
		vi.advanceTimersByTime(40);
		d("b"); // resets the timer
		vi.advanceTimersByTime(40);
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(10);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenLastCalledWith("b");
	});

	it("cancel() drops the pending call", async () => {
		const { debounce } = await import("../debounce");
		const fn = vi.fn();
		const d = debounce(fn, 50);

		d("x");
		d.cancel();
		vi.advanceTimersByTime(100);
		expect(fn).not.toHaveBeenCalled();
	});

	it("flush() invokes immediately with the latest args", async () => {
		const { debounce } = await import("../debounce");
		const fn = vi.fn();
		const d = debounce(fn, 200);

		d("first");
		d("second");
		d.flush();

		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenLastCalledWith("second");

		// Subsequent timer should not double-fire.
		vi.advanceTimersByTime(300);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("treats delay <= 0 as synchronous (microtask-free)", async () => {
		const { debounce } = await import("../debounce");
		const fn = vi.fn();
		const d = debounce(fn, 0);

		d("zero");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenLastCalledWith("zero");
	});
});
