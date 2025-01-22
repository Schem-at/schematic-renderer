// reactiveProxy.ts
export interface PropertyConfig<T> {
	cast?: (value: any) => T;
	beforeSet?: (value: T, oldValue: T, obj: any) => void;
	afterSet?: (value: T, oldValue: T, obj: any) => void;
}

export function createReactiveProxy<T extends object>(
	target: T,
	propertyConfigs: Partial<Record<keyof T, PropertyConfig<any>>>
): T {
	const handler: ProxyHandler<T> = {
		get(obj, prop) {
			return obj[prop as keyof T];
		},
		set(obj, prop, value) {
			const config = propertyConfigs[prop as keyof T];
			const oldValue = obj[prop as keyof T];

			// Apply casting if defined
			if (config?.cast) {
				value = config.cast(value);
			}

			// Call beforeSet callback if defined
			if (config?.beforeSet) {
				config.beforeSet(value, oldValue, obj);
			}

			// Set the property
			obj[prop as keyof T] = value;

			// Call afterSet callback if defined
			if (config?.afterSet) {
				config.afterSet(value, oldValue, obj);
			}

			return true; // Indicate that assignment was successful
		},
	};

	return new Proxy(target, handler);
}
