interface PerformanceMetrics {
	[key: string]: {
		totalTime: number;
		totalMemory: number;
		callCount: number;
	};
}

const performanceMetrics: PerformanceMetrics = {};

export function MonitorAsync(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
	const className = target.constructor.name;
	const originalMethod = descriptor.value;

	descriptor.value = async function (...args: any[]) {
		const memoryBefore = (window.performance as any).memory?.usedJSHeapSize || 0;
		const timeStart = performance.now();

		const result = await originalMethod.apply(this, args);

		const timeEnd = performance.now();
		const memoryAfter = (window.performance as any).memory?.usedJSHeapSize || 0;

		const timeTaken = timeEnd - timeStart;
		const memoryUsed = memoryAfter - memoryBefore;

		const key = `${className}.${propertyKey}`;

		// Aggregate metrics
		if (!performanceMetrics[key]) {
			performanceMetrics[key] = {
				totalTime: 0,
				totalMemory: 0,
				callCount: 0,
			};
		}
		performanceMetrics[key].totalTime += timeTaken;
		performanceMetrics[key].totalMemory += memoryUsed;
		performanceMetrics[key].callCount += 1;

		return result;
	};

	return descriptor;
}

export function Monitor(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
	const className = target.constructor.name;
	const originalMethod = descriptor.value;

	descriptor.value = function (...args: any[]) {
		const memoryBefore = (performance as any).memory?.usedJSHeapSize || 0;
		const timeStart = performance.now();

		const result = originalMethod.apply(this, args);

		const timeEnd = performance.now();
		const memoryAfter = (performance as any).memory?.usedJSHeapSize || 0;

		const timeTaken = timeEnd - timeStart;
		const memoryUsed = memoryAfter - memoryBefore;

		const key = `${className}.${propertyKey}`;

		// Aggregate metrics
		if (!performanceMetrics[key]) {
			performanceMetrics[key] = {
				totalTime: 0,
				totalMemory: 0,
				callCount: 0,
			};
		}
		performanceMetrics[key].totalTime += timeTaken;
		performanceMetrics[key].totalMemory += memoryUsed;
		performanceMetrics[key].callCount += 1;

		return result;
	};

	return descriptor;
}

export function displayPerformanceMetrics() {
	// for (const [funcName, metrics] of Object.entries(performanceMetrics)) {
	// 	console.log(`Function ${funcName} called ${metrics.callCount} times`);
	// 	console.log(`Total time: ${metrics.totalTime.toFixed(2)} ms`);
	// 	console.log(
	// 		`Total memory used: ${(metrics.totalMemory / 1024 / 1024).toFixed(2)} MB`
	// 	);
	// 	console.log("---");
	// }

	// order from fastest to slowest
	const sortedMetrics = Object.entries(performanceMetrics).sort(
		([, a], [, b]) => a.totalTime - b.totalTime
	);
	for (const [funcName, metrics] of sortedMetrics) {
		console.log(`Function ${funcName} called ${metrics.callCount} times`);
		console.log(`Total time: ${metrics.totalTime.toFixed(2)} ms`);
		console.log(`Total memory used: ${(metrics.totalMemory / 1024 / 1024).toFixed(2)} MB`);
		console.log("---");
	}
}

export function resetPerformanceMetrics() {
	for (const key of Object.keys(performanceMetrics)) {
		delete performanceMetrics[key];
	}
}
