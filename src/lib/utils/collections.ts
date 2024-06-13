import _groupBy from 'object.groupby';

export const isDefined = <T>(v: T): v is Exclude<typeof v, undefined> =>
	v !== undefined;

export const mapRecord = <T, K extends keyof any, R>(
	input: Record<K, T>,
	mapper: (value: T, key: string) => R
) =>
	Object.fromEntries<R>(
		Object.entries<T>(input).map(([key, value]) => [key, mapper(value, key)])
	);

export const sortRecord = <T>(
	sorter: (a: [string, T], b: [string, T]) => number,
	input: Record<string, T>
) => Object.fromEntries(Object.entries<T>(input).sort(sorter));

export const forEachRecord = <T, K extends keyof any>(
	input: Record<K, T>,
	callback: (key: string, value: T) => void
) => Object.entries<T>(input).forEach(([k, v]) => callback(k, v));

export const groupBy = <const T extends object>(
	discriminator:
		| ((value: T, index: number) => PropertyKey)
		| KeysMatching<T, PropertyKey>,
	iterable: Iterable<T>
) =>
	_groupBy(
		iterable,
		typeof discriminator === 'function'
			? discriminator
			: v => v[discriminator] as PropertyKey
	);

type KeysMatching<T extends object, V> = {
	[K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

export const flipMap = <K extends PropertyKey, V extends PropertyKey>(
	input: Map<K, V>
): Map<V, K> =>
	new Map<V, K>(
		Array.from(input.entries()).map<[V, K]>(([k, v]) => [v, k as K])
	);
