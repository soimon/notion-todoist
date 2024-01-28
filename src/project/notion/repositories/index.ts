import {Client} from '@notionhq/client';
import {NotionProjectRepository} from './projects';
import {NotionTaskRepository} from './tasks';
import {LastSyncInfo} from '@framework/sync';

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
		this.tasks = new NotionTaskRepository(api, taskDatabase, this.projects);
	}

	async fetchSyncCandidates(lastSync: LastSyncInfo) {
		const projects = await this.projects.getProjects();
		const goalIds = projects.flatMap(p => p.goals.map(g => g.syncId));
		const tasks = (
			await this.tasks.getSyncCandidates(
				typeof lastSync === 'string' ? undefined : lastSync.date
			)
		).filter(t => goalIds.includes(t.goalSyncId));
		return {projects, tasks};
	}
}
