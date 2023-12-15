import {TodoistSyncApi} from '@lib/todoist';
import {TodoistProjectRepository} from './projects';
import {TodoistTaskRepository} from './tasks';
import {LastSyncInfo} from '@framework/sync';

export class TodoistRepository {
	readonly projects: TodoistProjectRepository;
	readonly tasks: TodoistTaskRepository;

	constructor(
		private api: TodoistSyncApi,
		rootProject: string
	) {
		this.projects = new TodoistProjectRepository(api, rootProject);
		this.tasks = new TodoistTaskRepository(api);
	}

	async fetchSyncCandidates(lastSync: LastSyncInfo) {
		if (lastSync !== 'no-last-sync') await this.api.loadDiff(lastSync.token);
		const projects = await this.projects.getProjects();
		const tasks = await this.tasks.getSyncCandidates(projects);
		return {projects, tasks};
	}

	async getLastSyncToken(): Promise<string | undefined> {
		const lastSyncToken = this.api.getLatestSyncToken();
		if (!lastSyncToken) return undefined;
		// Get a new sync token, otherwise the changes made in this sync operation show up in the diff the next time it is scheduled.
		return await this.api.loadDiff(lastSyncToken);
	}

	getLatestSnapshot() {
		return this.api.getLatestSnapshot();
	}

	async commit() {
		return this.api.commit();
	}
}
