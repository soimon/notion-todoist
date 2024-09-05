import {
	AddCommentArgs,
	AddLabelArgs,
	AddProjectArgs,
	AddSectionArgs,
	AddTaskArgs,
	UpdateLabelArgs,
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

// TODO: Refactor this to remove all state out of it

export class TodoistSyncApi {
	constructor(private readonly token: string) {}

	//-----------------------------------------------------------------
	// Fetching
	//-----------------------------------------------------------------

	private loadedData: Snapshot | undefined;
	private loadedDiff: Snapshot | undefined;
	private latestSyncToken: string | undefined;

	async loadAll(resourceTypes?: ResourceType[]) {
		const {data} = await this.fetchData(resourceTypes);
		return (this.loadedData = data);
	}

	async loadDiff(previousSyncToken: string, resourceTypes?: ResourceType[]) {
		const {data, fullSync, syncToken} = await this.fetchData(
			resourceTypes,
			previousSyncToken
		);
		this.loadedDiff = this.mergeSnapshots(this.loadedDiff, data);
		this.loadedData = this.mergeSnapshots(this.loadedData, this.loadedDiff);
		return fullSync ? undefined : syncToken;
	}

	getProjects = () => this.loadedData?.projects ?? [];
	getSections = () => this.loadedData?.sections ?? [];
	getTasks = () => this.loadedData?.tasks ?? [];
	getComments = () => this.loadedData?.comments ?? [];
	getLabels = () => this.loadedData?.labels ?? [];
	getProjectComments = () => this.loadedData?.projectComments ?? [];

	private async fetchData(resourceTypes?: ResourceType[], sinceToken = '*') {
		const {
			projects,
			sections,
			items,
			labels,
			notes,
			project_notes,
			sync_token,
			full_sync,
		} = await this.request({
			sync_token: sinceToken,
			resource_types: resourceTypes ?? [
				'projects',
				'project_notes',
				'notes',
				'items',
				'sections',
				'labels',
			],
		}).then(this.parseData);

		const data: Snapshot = {
			projects: Array.isArray(projects) ? projects : [],
			sections: Array.isArray(sections) ? sections : [],
			tasks: Array.isArray(items) ? items : [],
			labels: Array.isArray(labels) ? labels : [],
			projectComments: Array.isArray(project_notes) ? project_notes : [],
			comments: Array.isArray(notes) ? notes : [],
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
			if (
				text.includes('Scheduled maintenance') ||
				text.includes('Timeout') ||
				text.length === 0 ||
				r.status === 502
			) {
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
			labels: new Map<string, ApiLabel>(),
			projectComments: new Map<string, ApiProjectComment>(),
			comments: new Map<string, ApiComment>(),
		} as const;

		function merge<T extends AllApiTypes>(map: Map<string, T>, items: T[]) {
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
			color: project.color,
			view_style: project.viewStyle,
		});
	}

	updateProject(id: string, project: UpdateProjectArgs): void {
		this.addCommand('project_update', {
			id,
			name: project.name,
			color: project.color,
			view_style: project.viewStyle,
		});
	}

	moveProject(id: string, parent_id: string): void {
		this.addCommand('project_move', {id, parent_id});
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
			parent_id: task.parentId,
			project_id: task.projectId,
			section_id: task.sectionId,
			due: {date: task.dueDate},
			priority: task.priority,
			duration: task.duration,
			labels: task.labels,
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

	moveTask(
		id: string,
		to: {sectionId?: string; projectId?: string; parentId?: string}
	): void {
		this.addCommand('item_move', {
			id,
			section_id: to.sectionId,
			project_id: to.projectId,
			parent_id: to.parentId,
		});
	}

	deleteTask(id: string): void {
		this.addCommand('item_delete', {id});
	}

	addComment(comment: AddCommentArgs): TemporaryId {
		return this.addCommand('note_add', {
			content: comment.content,
			item_id: comment.taskId,
			project_id: comment.projectId,
		});
	}

	updateComment(id: string, content: string) {
		return this.addCommand('note_update', {
			id,
			content,
		});
	}

	deleteComment(id: string) {
		return this.addCommand('note_delete', {id});
	}

	addLabel(label: AddLabelArgs): TemporaryId {
		return this.addCommand('label_add', {
			name: label.name,
			color: label.color,
			item_order: label.order,
		});
	}

	updateLabel(id: string, label: UpdateLabelArgs) {
		this.addCommand('label_update', {
			id,
			name: label.name,
			color: label.color,
			item_order: label.order,
		});
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
			const syncToken = json?.sync_token;

			if (syncStatus && typeof syncStatus === 'object')
				Object.values(syncStatus)
					.filter(v => v !== 'ok')
					.forEach(v => console.error(v));

			if (syncToken) this.latestSyncToken = syncToken;

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

function findMutationDate(item: AllApiTypes) {
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
		color: string;
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
		parent_id: string;
		section_id: string | null;
		content: string;
		checked: boolean;
		description: string;
		due?: DueDate;
		completed_at: string;
		updated_at: string;
		added_at: string;
		is_deleted: boolean;
		labels: string[];
	}[];
	labels: {
		color: string;
		id: string;
		is_deleted: boolean;
		is_favorite: boolean;
		item_order: number;
		name: string;
	}[];
	projectComments: {
		id: string;
		project_id: string;
		content: string;
		is_deleted: boolean;
		posted_at: string;
	}[];
	comments: {
		id: string;
		item_id: string;
		content: string;
		posted_at: string;
		reactions?: Record<string, string[]>;
		file_attachment?: ApiAttachment;
	}[];
};
type DueDate = {
	date: string;
	is_recurring: boolean;
};

export type ApiAttachment = {
	file_name: string;
	file_size: number;
	file_url: string;
	resource_type: 'file' | 'audio' | 'image' | 'website';
	upload_state: 'pending' | 'completed';
};

export type ApiTask = Snapshot['tasks'][number];
export type ApiProject = Snapshot['projects'][number];
export type ApiSection = Snapshot['sections'][number];
export type ApiLabel = Snapshot['labels'][number];
export type ApiProjectComment = Snapshot['projectComments'][number];
export type ApiComment = Snapshot['comments'][number];
export type Color =
	| 'berry_red'
	| 'red'
	| 'orange'
	| 'yellow'
	| 'olive_green'
	| 'lime_green'
	| 'green'
	| 'mint_green'
	| 'teal'
	| 'sky_blue'
	| 'light_blue'
	| 'blue'
	| 'grape'
	| 'violet'
	| 'lavender'
	| 'magenta'
	| 'salmon'
	| 'charcoal'
	| 'grey'
	| 'taupe';
export type ResourceType =
	| 'projects'
	| 'project_notes'
	| 'notes'
	| 'items'
	| 'sections'
	| 'labels';

type AllApiTypes =
	| ApiTask
	| ApiProject
	| ApiSection
	| ApiLabel
	| ApiComment
	| ApiProjectComment;
export type ApiEvent<T extends {}> = {
	[K in keyof T]: K extends `${infer T}_at` ? T : never;
}[keyof T];
