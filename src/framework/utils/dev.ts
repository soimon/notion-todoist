import {readFile, writeFile} from 'fs/promises';

export async function cacheResult<T>(name: string, fetcher: () => Promise<T>) {
	if (!process.env.DEV) return fetcher();
	const file = `cache/${name}.json`;
	const data = await readFile(file, 'utf-8')
		.then(v => JSON.parse(v))
		.catch(() => undefined);
	if (data) return data as T;
	else return logResult(name, fetcher);
}

export async function logResult<T>(name: string, fetcher: () => Promise<T>) {
	const fetched = await fetcher();
	await log(name, fetched);
	return fetched;
}

export async function log(name: string, data: unknown) {
	if (!process.env.DEV) return;
	const file = `cache/${name}.json`;
	await writeFile(file, JSON.stringify(data));
}
