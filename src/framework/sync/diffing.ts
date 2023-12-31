import {ExclusiveKeys, KeyValue} from '@framework/utils/types';
import groupBy from 'object.groupby';
// eslint-disable-next-line node/no-unpublished-import
import {FixedLengthArray} from 'type-fest';

export type DiffResult<
	T1 extends object,
	T2 extends object,
	D1 extends ExclusiveKeys<T1, T2> = ExclusiveKeys<T1, T2>,
	D2 extends ExclusiveKeys<T2, T1> = ExclusiveKeys<T2, T1>,
> = {
	loners: (T1 | T2)[];
	pairs: ({differences: (keyof T1 & keyof T2)[]} & KeyValue<D1, T1> &
		KeyValue<D2, T2>)[];
};

export function diff<
	T1 extends object,
	T2 extends object,
	D1 extends ExclusiveKeys<T1, T2>,
	D2 extends ExclusiveKeys<T2, T1>,
>(
	a: T1[],
	b: T2[],
	commonIdGetter: (item: T1 | T2) => number | string
): DiffResult<T1, T2, D1, D2> {
	const {loners, pairs} = findPairs<T1 | T2>(a, b, commonIdGetter);
	return {
		loners,
		pairs:
			a.length && b.length
				? diffPairs<T1, T2, D1, D2>(
						pairs,
						...findDiscriminators<T1, T2, D1, D2>(a[0]!, b[0]!)
				  )
				: [],
	};
}

function findDiscriminators<
	T1 extends object,
	T2 extends object,
	D1 extends ExclusiveKeys<T1, T2>,
	D2 extends ExclusiveKeys<T2, T1>,
>(a: T1, b: T2): [D1, D2] {
	const aKeys = Object.keys(a) as (keyof T1)[];
	const bKeys = Object.keys(b) as (keyof T2)[];
	const aDiscriminator = aKeys.find(key => !(key in b)) as D1;
	const bDiscriminator = bKeys.find(key => !(key in a)) as D2;
	return [aDiscriminator, bDiscriminator];
}

function diffPairs<
	T1 extends object,
	T2 extends object,
	D1 extends ExclusiveKeys<T1, T2>,
	D2 extends ExclusiveKeys<T2, T1>,
>(pairs: [T1 | T2, T1 | T2][], discriminatorA: D1, discriminatorB: D2) {
	return pairs.map(([a, b]) => {
		const differences = [] as (keyof (T1 | T2))[];
		for (const key of Object.keys(a) as (keyof (T1 | T2))[])
			if (testForDifference<T1, T2>(a, b, key)) differences.push(key);
		const d1 = discriminatorA in a ? a : discriminatorA in b ? b : undefined;
		const d2 = discriminatorB in a ? a : discriminatorB in b ? b : undefined;
		if (!d1 || !d2)
			throw new Error(
				'Pair does not have two differently discriminated entries'
			);
		return {
			differences,
			[discriminatorA]: d1 as T1,
			[discriminatorB]: d2 as T2,
		} as {differences: (keyof (T1 | T2))[]} & KeyValue<D1, T1> &
			KeyValue<D2, T2>;
	});
}

function testForDifference<T1 extends object, T2 extends object>(
	a: T1 | T2,
	b: T1 | T2,
	key: keyof T1 & keyof T2
) {
	const va = a[key];
	const vb = b[key];
	if (typeof va === 'object' || typeof vb === 'object') {
		if (
			va &&
			vb &&
			typeof va === 'object' &&
			typeof vb === 'object' &&
			'getTime' in va &&
			'getTime' in vb &&
			typeof va.getTime === 'function' &&
			typeof vb.getTime === 'function'
		)
			return va.getTime() !== vb.getTime();
		else return false;
	} else return va !== vb;
}

function findPairs<T>(
	a: T[],
	b: T[],
	commonIdGetter: (item: T) => number | string
) {
	const all = [...a, ...b];
	const byId = groupBy(all, commonIdGetter);
	const empty = byId[''] ?? [];
	delete byId[''];
	const pairs = Object.values(byId);
	const loners = [...empty, ...pairs.filter(byLength(1)).flat()];
	const linked = pairs.filter(byLength(2)) as [T, T][];
	return {
		loners,
		pairs: linked,
	};
}

const byLength =
	<T, N extends number>(length: N) =>
	(arr: ReadonlyArray<T>): arr is FixedLengthArray<T, N> =>
		arr.length === length;
