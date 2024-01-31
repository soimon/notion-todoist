import {
	AddProjectArgs,
	AddSectionArgs,
	AddTaskArgs,
	UpdateProjectArgs,
	UpdateSectionArgs,
	UpdateTaskArgs,
} from '@doist/todoist-api-typescript';
import fetch, {Response} from 'node-fetch';
// eslint-disable-next-line node/no-unpublished-import
import {IterableElement} from 'type-fest';
import {v4 as uuidv4} from 'uuid';

const URL = 'https://api.todoist.com/sync/v9/sync';
const COMMAND_LIMIT = 100;

export class TodoistSyncApi {
	constructor(private readonly token: string) {}

	//-----------------------------------------------------------------
	// Fetching
	//-----------------------------------------------------------------

	private loadedData: Snapshot | undefined;
	private loadedDiff: Snapshot | undefined;
	private latestSyncToken: string | undefined;

	async loadAll() {
		const {data} = await this.fetchData();
		return (this.loadedData = data);
	}

	async loadDiff(previousSyncToken: string) {
		const {data, fullSync, syncToken} = await this.fetchData(previousSyncToken);
		this.loadedDiff = this.mergeSnapshots(this.loadedDiff, data);
		this.loadedData = this.mergeSnapshots(this.loadedData, this.loadedDiff);
		return fullSync ? undefined : syncToken;
	}

	getProjects = async () => this.loadedData?.projects ?? [];
	getSections = async () => this.loadedData?.sections ?? [];
	getTasks = async () => this.loadedData?.tasks ?? [];

	private async fetchData(sinceToken = '*') {
		const {projects, sections, items, sync_token, full_sync} =
			await this.request({
				sync_token: sinceToken,
				resource_types: ['projects', 'items', 'sections'],
			}).then(this.parseData);

		const data: Snapshot = {
			projects: Array.isArray(projects) ? projects : [],
			sections: Array.isArray(sections) ? sections : [],
			tasks: Array.isArray(items) ? items : [],
		};
		this.latestSyncToken = sync_token;
		return {data, syncToken: `${sync_token}`, fullSync: Boolean(full_sync)};
	}

	private async parseData(r: Response) {
		const text = await r.text();
		try {
			const json = JSON.parse(text);
			return json;
		} catch (e) {
			if (text.includes('Timeout') || text.length === 0 || r.status === 502) {
				console.log(
					'Todoist seems to be down. As this happens often, I will gracefully exit instead of spamming your mailbox with error messages.'
				);
				// eslint-disable-next-line no-process-exit
				process.exit(0);
			} else console.log(text);
			throw e;
		}
	}

	private mergeSnapshots(
		...snapshots: (Snapshot | undefined)[]
	): Snapshot | undefined {
		const maps: Record<
			keyof Snapshot,
			Map<string, IterableElement<Snapshot[keyof Snapshot]>>
		> = {
			projects: new Map<string, ApiProject>(),
			sections: new Map<string, ApiSection>(),
			tasks: new Map<string, ApiTask>(),
		} as const;

		function merge<T extends ApiTask | ApiProject | ApiSection>(
			map: Map<string, T>,
			items: T[]
		) {
			items.forEach(item => {
				const existing = map.get(item.id);
				if (!existing) map.set(item.id, item);
				else if (findMutationDate(existing) > findMutationDate(item))
					map.set(item.id, item);
			});
		}

		for (const snapshot of snapshots) {
			if (!snapshot) continue;
			Object.keys(maps)
				.filter((k): k is keyof typeof maps => true)
				.forEach(k => merge(maps[k], snapshot[k]));
		}

		return Object.entries(maps).reduce(
			(acc, [k, v]) => ({...acc, [k]: [...v.values()]}),
			{} as Snapshot
		);
	}

	getLatestSyncToken() {
		return this.latestSyncToken;
	}

	getLatestSnapshot(): Readonly<Snapshot> | undefined {
		return this.loadedDiff;
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

	reorderProjects(ids: string[]): void {
		this.addCommand('project_reorder', {
			projects: ids.map((id, child_order) => ({id, child_order})),
		});
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

	reorderSections(ids: string[]): void {
		this.addCommand('section_reorder', {
			sections: ids.map((id, section_order) => ({
				id,
				section_order: section_order + 1,
			})),
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
			labels: task.labels,
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
		const idMapping = new Map<TemporaryId, string>();
		const totalCommands = this.commands.length;
		let startIndex = 0;

		while (startIndex < totalCommands) {
			const endIndex = Math.min(startIndex + COMMAND_LIMIT, totalCommands);
			const commands = this.commands.slice(startIndex, endIndex);
			const response = await this.request({commands});

			const json = await response.json();
			const batchIdMapping: Record<string, string> | undefined =
				json?.temp_id_mapping;
			const syncStatus = json?.sync_status;

			if (syncStatus && typeof syncStatus === 'object')
				Object.values(syncStatus)
					.filter(v => v !== 'ok')
					.forEach(v => console.error(v));

			if (batchIdMapping)
				Object.entries(batchIdMapping).forEach(([tempId, id]) => {
					idMapping.set(tempId, id);
				});
			startIndex = endIndex;
		}
		this.commands.length = 0;
		return idMapping.size > 0 ? idMapping : undefined;
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

function findMutationDate(item: ApiTask | ApiProject | ApiSection) {
	return Math.max(
		...Object.keys(item)
			.filter((k): k is keyof typeof item => k.endsWith('_at'))
			.map(k => (item[k] ? new Date(item[k] as string).getTime() : 0))
	);
}

export type TemporaryId = string;

export type Snapshot = {
	projects: {
		id: string;
		parent_id: string;
		name: string;
		updated_at: string;
		added_at: string;
		child_order: number;
	}[];
	sections: {
		id: string;
		project_id: string;
		name: string;
		added_at: string;
		is_deleted: boolean;
		section_order: number;
	}[];
	tasks: {
		id: string;
		project_id: string;
		section_id: string | null;
		content: string;
		checked: boolean;
		description: string;
		due: DueDate;
		completed_at: string;
		updated_at: string;
		added_at: string;
		is_deleted: boolean;
		labels: string[];
	}[];
};
type DueDate = {
	date: string;
};
export type ApiTask = Snapshot['tasks'][number];
export type ApiProject = Snapshot['projects'][number];
export type ApiSection = Snapshot['sections'][number];

export type ApiEvent<T extends {}> = {
	[K in keyof T]: K extends `${infer T}_at` ? T : never;
}[keyof T];
