export type KeyValue<D extends string | number | symbol, T> = {
	[key in D]: T;
};
export type ExclusiveKeys<T1 extends object, T2 extends object> = Exclude<
	keyof T1,
	keyof T2
>;
