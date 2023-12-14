import {TodoistApi} from '@doist/todoist-api-typescript';
import {TodoistProjectRepository} from './projects';
import {TodoistTaskRepository} from './tasks';
import {TodoistSyncApi} from '@lib/todoist';

export class TodoistRepository {
	private api: TodoistSyncApi;
	readonly projects: TodoistProjectRepository;
	readonly tasks: TodoistTaskRepository;

	constructor(api: TodoistApi, syncApi: TodoistSyncApi, rootProject: string) {
		this.api = syncApi;
		this.projects = new TodoistProjectRepository(api, syncApi, rootProject);
		this.tasks = new TodoistTaskRepository(api, syncApi);
	}

	async commit() {
		return this.api.commit();
	}
}
