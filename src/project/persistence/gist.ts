import {LastSyncInfo, LastSyncInfoStore} from '@framework/sync';
import {GithubGist} from '@vighnesh153/github-gist';

export class GistLastSyncInfoStore implements LastSyncInfoStore {
	constructor(
		private gistId: string,
		private fileName: string,
		private accessToken: string
	) {}

	async getLastSyncInfo(forceFull: boolean): Promise<LastSyncInfo> {
		console.log('Getting last sync info from gist');
		if (forceFull) return 'no-last-sync';
		try {
			const file = await this.getFile();
			const config = JSON.parse(file.content);
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

	private async getFile() {
		const gist = await GithubGist.initializeUsingGistId({
			gistId: this.gistId,
			personalAccessToken: this.accessToken,
			corsConfig: {type: 'none'},
		});
		const file =
			gist.getFileByName(this.fileName) ?? gist.createNewFile(this.fileName);
		return file;
	}

	async setLastSyncInfo(token: string): Promise<void> {
		const date = new Date();
		const config: LastSyncInfo = {token, date};
		const file = await this.getFile();
		file.content = JSON.stringify(config);
		await file.save();
	}
}
