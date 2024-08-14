class AnimationScheduler {
	private queue: Array<{ action: () => void; delay: number }> = [];
	private isRunning: boolean = false;
	private parent: any;

	constructor(parent: any) {
		this.parent = parent;
	}

	schedule(action: () => void, delay: number = 0): any {
		this.queue.push({ action, delay });
		if (!this.isRunning) {
			this.runNext();
		}
		return this.parent; // Return the parent object for method chaining
	}

	private runNext() {
		console.log("runNext", this.queue.length);
		if (this.queue.length === 0) {
			this.isRunning = false;
			return;
		}

		this.isRunning = true;
		const { action, delay } = this.queue.shift()!;

		setTimeout(() => {
			action();
			this.runNext();
		}, delay);
	}

	clear(): any {
		this.queue = [];
		this.isRunning = false;
		return this.parent; // Return the parent object for method chaining
	}
}

export { AnimationScheduler };
