import {ApiAttachment} from '@lib/todoist';
import ImgurClient from 'imgur';

export class Uploader {
	private _imgur: ImgurClient | undefined;
	private get imgur(): ImgurClient {
		if (!this._imgur) this._imgur = new ImgurClient({});
		return this._imgur;
	}

	constructor() {}

	supportsFile(file: ApiAttachment) {
		return false;
		// return file.upload_state === 'completed' && file.resource_type === 'image';
	}

	async upload(file: ApiAttachment) {
		if (!this.supportsFile(file)) return;
		const response = await this.imgur.upload({
			image: file.file_url,
			type: 'url',
		});
		if (!response.success) {
			console.log(response.data);
			return;
		}
		return response.data.link;
	}
}
