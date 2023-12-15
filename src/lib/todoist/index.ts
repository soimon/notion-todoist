import {
	AddProjectArgs,
	AddSectionArgs,
	AddTaskArgs,
	UpdateProjectArgs,
	UpdateSectionArgs,
	UpdateTaskArgs,
} from '@doist/todoist-api-typescript';
import fetch from 'node-fetch';
import {v4 as uuidv4} from 'uuid';

const URL = 'https://api.todoist.com/sync/v9/sync';

export class TodoistSyncApi {
	constructor(private readonly token: string) {}

	//-----------------------------------------------------------------
	// Fetching
	//-----------------------------------------------------------------

	private loadedData: Snapshot | undefined;
	private latestSyncToken: string | undefined;
	loadedDiff: Snapshot | undefined;

	async loadAll() {
		const {data} = await this.fetchData();
		this.loadedData = data;
	}

	async loadDiff(previousSyncToken: string) {
		const {data, fullSync, syncToken} = await this.fetchData(previousSyncToken);
		this.loadedDiff = data;
		return fullSync ? undefined : syncToken;
	}

	private async fetchData(sinceToken = '*') {
		const {projects, sections, items, sync_token, full_sync} =
			await this.request({
				sync_token: sinceToken,
				resource_types: ['projects', 'items', 'sections'],
			}).then(r => r.json());
		const data: Snapshot = {
			projects: Array.isArray(projects) ? projects : [],
			sections: Array.isArray(sections) ? sections : [],
			tasks: Array.isArray(items) ? items : [],
		};
		this.latestSyncToken = sync_token;
		return {data, syncToken: `${sync_token}`, fullSync: Boolean(full_sync)};
	}

	getProjects = () => this.ensureLoaded().then(d => d?.projects ?? []);
	getSections = () => this.ensureLoaded().then(d => d?.sections ?? []);
	getTasks = () => this.ensureLoaded().then(d => d?.tasks ?? []);

	private async ensureLoaded() {
		if (!this.loadedData) await this.loadAll();
		return this.loadedData;
	}

	getLatestSyncToken() {
		return this.latestSyncToken;
	}

	//-----------------------------------------------------------------
	// Modifiers
	//-----------------------------------------------------------------

	addProject(project: AddProjectArgs): TemporaryId {
		return this.addCommand('project_add', {
			name: project.name,
			parent_id: project.parentId,
			view_style: project.viewStyle,
		});
	}

	updateProject(id: string, project: UpdateProjectArgs): void {
		this.addCommand('project_update', {
			id,
			name: project.name,
			view_style: project.viewStyle,
		});
	}

	deleteProject(id: string): void {
		this.addCommand('project_delete', {id});
	}

	addSection(section: AddSectionArgs): TemporaryId {
		return this.addCommand('section_add', {
			name: section.name,
			project_id: section.projectId,
		});
	}

	updateSection(id: string, section: UpdateSectionArgs): void {
		this.addCommand('section_update', {
			id,
			name: section.name,
		});
	}

	deleteSection(id: string): void {
		this.addCommand('section_delete', {id});
	}

	moveSection(id: string, project_id: string): void {
		this.addCommand('section_move', {id, project_id});
	}

	addTask(task: AddTaskArgs): TemporaryId {
		return this.addCommand('item_add', {
			content: task.content,
			description: task.description,
			project_id: task.projectId,
			section_id: task.sectionId,
			due: {date: task.dueDate},
			priority: task.priority,
			duration: task.duration,
		});
	}

	updateTask(id: string, task: UpdateTaskArgs): void {
		this.addCommand('item_update', {
			id,
			content: task.content,
			description: task.description,
			due: {date: task.dueDate},
			priority: task.priority,
			duration: task.duration,
		});
	}

	closeTask(id: string): void {
		this.addCommand('item_close', {id});
	}

	reopenTask(id: string): void {
		this.addCommand('item_uncomplete', {id});
	}

	moveTask(id: string, sectionId: string): void {
		this.addCommand('item_move', {id, section_id: sectionId});
	}

	deleteTask(id: string): void {
		this.addCommand('item_delete', {id});
	}

	//-----------------------------------------------------------------
	// Batching
	//-----------------------------------------------------------------

	public async commit(): Promise<Map<TemporaryId, string> | undefined> {
		const response = await this.request({commands: this.commands});
		this.commands.length = 0;

		const json = await response.json();
		const idMapping = json?.temp_id_mapping;
		const syncStatus = json?.sync_status;

		if (syncStatus && typeof syncStatus === 'object')
			Object.values(syncStatus)
				.filter(v => v !== 'ok')
				.forEach(v => console.error(v));

		return idMapping ? new Map(Object.entries(idMapping)) : undefined;
	}

	private readonly commands: object[] = [];
	private addCommand(type: string, args: object = {}): TemporaryId {
		const uuid = uuidv4();
		this.commands.push({
			type,
			uuid,
			args,
			...(type.endsWith('_add') ? {temp_id: uuid} : {}),
		});
		return uuid;
	}

	private async request(data: object = {}) {
		const headers = {
			Authorization: `Bearer ${this.token}`,
			'Content-Type': 'application/json',
		};
		return await fetch(URL, {
			method: 'POST',
			headers,
			body: JSON.stringify(data),
		});
	}
}

export type TemporaryId = string;

export type Snapshot = {
	projects: {id: string; parent_id: string; name: string}[];
	sections: {id: string; project_id: string; name: string}[];
	tasks: {
		id: string;
		project_id: string;
		section_id: string | null;
		content: string;
		checked: boolean;
		description: string;
		due: DueDate;
	}[];
};

type DueDate = {
	date: string;
};
