import {LastSyncInfo, LastSyncInfoStore} from '@framework/sync';
import {readFile, writeFile} from 'fs/promises';

export class ConfigFileLastSyncInfoStore implements LastSyncInfoStore {
	constructor(private configFilePath: string) {}

	async getLastSyncInfo(forceFull: boolean): Promise<LastSyncInfo> {
		console.log('Getting last sync info from a local config file');
		if (forceFull) return 'no-last-sync';
		try {
			const configFileContent = await readFile(this.configFilePath, 'utf-8');
			const config = JSON.parse(configFileContent);
			const token = config?.token;
			const date = new Date(config?.date);
			if (
				token &&
				date &&
				date instanceof Date &&
				!isNaN(date.getTime()) &&
				typeof token === 'string'
			)
				return {token, date};
			return 'no-last-sync';
		} catch (e) {
			return 'no-last-sync';
		}
	}

	async setLastSyncInfo(token: string): Promise<void> {
		const date = new Date();
		const config: LastSyncInfo = {token, date};
		await writeFile(this.configFilePath, JSON.stringify(config));
	}
}
