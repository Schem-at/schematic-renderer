/**
 * Trailing-edge debounce with cancel/flush. Used by the slicer overlay so
 * scrubbing a slider doesn't trigger a `rebuildMesh()` on every pointer move.
 *
 * - `delay <= 0` runs synchronously (no setTimeout).
 * - Calls during the delay window re-arm the timer and overwrite the args.
 * - `cancel()` drops any pending call. `flush()` invokes it immediately.
 */
export interface DebouncedFunction<TArgs extends unknown[]> {
	(...args: TArgs): void;
	cancel(): void;
	flush(): void;
}

export function debounce<TArgs extends unknown[]>(
	fn: (...args: TArgs) => void,
	delay: number
): DebouncedFunction<TArgs> {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pendingArgs: TArgs | null = null;

	const invoke = () => {
		if (pendingArgs) {
			const args = pendingArgs;
			pendingArgs = null;
			fn(...args);
		}
	};

	const debounced = ((...args: TArgs) => {
		if (delay <= 0) {
			fn(...args);
			return;
		}
		pendingArgs = args;
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			invoke();
		}, delay);
	}) as DebouncedFunction<TArgs>;

	debounced.cancel = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
		pendingArgs = null;
	};

	debounced.flush = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
		invoke();
	};

	return debounced;
}
