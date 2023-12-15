import {Client} from '@notionhq/client';
import {NotionProjectRepository} from './projects';
import {NotionTaskRepository} from './tasks';

export class NotionRepository {
	readonly projects: NotionProjectRepository;
	readonly tasks: NotionTaskRepository;

	constructor(
		api: Client,
		projectDatabase: string,
		goalDatabase: string,
		taskDatabase: string
	) {
		this.projects = new NotionProjectRepository(
			api,
			projectDatabase,
			goalDatabase
		);
		this.tasks = new NotionTaskRepository(api, taskDatabase);
	}

	async fetchSyncCandidates(since: Date) {
		const projects = await this.projects.getProjects();
		const tasks = await this.tasks.getSyncCandidates(since);
		return {projects, tasks};
	}
}
