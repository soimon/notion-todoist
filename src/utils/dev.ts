import {readFile, writeFile} from 'fs/promises';

export async function cacheResult<T>(name: string, fetcher: () => Promise<T>) {
	const file = `cache/${name}.json`;
	const data = await readFile(file, 'utf-8')
		.then(v => JSON.parse(v))
		.catch(() => undefined);
	if (data) return data as T;
	else {
		const fetched = await fetcher();
		await writeFile(file, JSON.stringify(fetched));
		return fetched;
	}
}
