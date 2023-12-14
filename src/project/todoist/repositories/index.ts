import {TodoistSyncApi} from '@lib/todoist';
import {TodoistProjectRepository} from './projects';
import {TodoistTaskRepository} from './tasks';

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

	async commit() {
		return this.api.commit();
	}
}
