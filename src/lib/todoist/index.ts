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
	TodoistApi,
	Task,
	Project,
	Section,
	Label,
	Comment,
} from '@doist/todoist-api-typescript';
// eslint-disable-next-line node/no-unpublished-import
import {IterableElement} from 'type-fest';
import {v4 as uuidv4} from 'uuid';

// TODO: Refactor this to remove all state out of it

export class TodoistSyncApi {
	private api: TodoistApi;

	constructor(private readonly token: string) {
		this.api = new TodoistApi(token);
	}

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
		// REST API v2 doesn't support sync tokens - always fetch all resources
		// sinceToken parameter kept for backward compatibility but ignored
		
		try {
			const [projects, sections, tasks, labels, comments] = await Promise.all([
				this.shouldFetch('projects', resourceTypes) ? this.api.getProjects() : [],
				this.shouldFetch('sections', resourceTypes) ? this.api.getSections() : [],
				this.shouldFetch('items', resourceTypes) ? this.api.getTasks() : [],
				this.shouldFetch('labels', resourceTypes) ? this.api.getLabels() : [],
				this.shouldFetch('notes', resourceTypes) || this.shouldFetch('project_notes', resourceTypes)
					? this.api.getComments({taskId: undefined, projectId: undefined} as any).catch(() => [])
					: [],
			]);

			const data: Snapshot = {
				projects: this.convertProjects(projects),
				sections: this.convertSections(sections),
				tasks: this.convertTasks(tasks),
				labels: this.convertLabels(labels),
				projectComments: this.filterProjectComments(comments),
				comments: this.filterTaskComments(comments),
			};

			// Generate a sync token from current timestamp for compatibility
			this.latestSyncToken = new Date().toISOString();
			return {data, syncToken: this.latestSyncToken, fullSync: sinceToken === '*'};
		} catch (error) {
			// Handle API errors gracefully
			if (error instanceof Error && 
				(error.message.includes('maintenance') || 
				 error.message.includes('Timeout') ||
				 error.message.includes('502'))) {
				console.log(
					'Todoist seems to be down. As this happens often, I will gracefully exit instead of spamming your mailbox with error messages.'
				);
				// eslint-disable-next-line no-process-exit
				process.exit(0);
			}
			throw error;
		}
	}

	private shouldFetch(resourceType: string, resourceTypes?: ResourceType[]): boolean {
		if (!resourceTypes) return true;
		return resourceTypes.includes(resourceType as ResourceType);
	}

	private convertProjects(projects: Project[]): Snapshot['projects'] {
		return projects.map(p => ({
			id: p.id,
			parent_id: p.parentId ?? '',
			name: p.name,
			color: p.color,
			updated_at: new Date().toISOString(), // REST API doesn't provide timestamps
			added_at: new Date().toISOString(),
			child_order: p.order,
		}));
	}

	private convertSections(sections: Section[]): Snapshot['sections'] {
		return sections.map(s => ({
			id: s.id,
			project_id: s.projectId,
			name: s.name,
			added_at: new Date().toISOString(),
			is_deleted: false,
			section_order: s.order,
		}));
	}

	private convertTasks(tasks: Task[]): Snapshot['tasks'] {
		return tasks.map(t => ({
			id: t.id,
			project_id: t.projectId,
			parent_id: t.parentId ?? '',
			section_id: t.sectionId ?? null,
			content: t.content,
			checked: t.isCompleted,
			description: t.description,
			due: t.due ? {date: t.due.date, is_recurring: t.due.isRecurring} : undefined,
			deadline: undefined, // REST API doesn't have deadline separate from due
			completed_at: t.isCompleted ? new Date().toISOString() : '',
			updated_at: new Date().toISOString(),
			added_at: t.createdAt,
			is_deleted: false,
			labels: t.labels,
		}));
	}

	private convertLabels(labels: Label[]): Snapshot['labels'] {
		return labels.map(l => ({
			id: l.id,
			color: l.color,
			is_deleted: false,
			is_favorite: l.isFavorite,
			item_order: l.order,
			name: l.name,
		}));
	}

	private filterProjectComments(comments: Comment[]): Snapshot['projectComments'] {
		return comments
			.filter((c: any) => c.projectId && !c.taskId)
			.map((c: any) => ({
				id: c.id,
				project_id: c.projectId,
				content: c.content,
				is_deleted: false,
				posted_at: c.postedAt,
			}));
	}

	private filterTaskComments(comments: Comment[]): Snapshot['comments'] {
		return comments
			.filter((c: any) => c.taskId)
			.map((c: any) => ({
				id: c.id,
				item_id: c.taskId,
				content: c.content,
				posted_at: c.postedAt,
				reactions: undefined,
				file_attachment: c.attachment ? {
					file_name: c.attachment.fileName ?? '',
					file_size: 0,
					file_url: c.attachment.fileUrl ?? '',
					resource_type: c.attachment.resourceType as any ?? 'file',
					upload_state: 'completed' as const,
				} : undefined,
			}));
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
		return this.addCommand('project_add', project);
	}

	updateProject(id: string, project: UpdateProjectArgs): void {
		this.addCommand('project_update', {id, ...project});
	}

	moveProject(id: string, parentId: string): void {
		this.addCommand('project_move', {id, parentId});
	}

	deleteProject(id: string): void {
		this.addCommand('project_delete', {id});
	}

	reorderProjects(ids: string[]): void {
		// REST API doesn't support batch reordering - queue individual updates
		ids.forEach((id, order) => {
			this.addCommand('project_reorder', {id, order});
		});
	}

	addSection(section: AddSectionArgs): TemporaryId {
		return this.addCommand('section_add', section);
	}

	updateSection(id: string, section: UpdateSectionArgs): void {
		this.addCommand('section_update', {id, ...section});
	}

	reorderSections(ids: string[]): void {
		// REST API doesn't support batch reordering - queue individual updates
		ids.forEach((id, order) => {
			this.addCommand('section_reorder', {id, order: order + 1});
		});
	}

	deleteSection(id: string): void {
		this.addCommand('section_delete', {id});
	}

	moveSection(id: string, projectId: string): void {
		this.addCommand('section_move', {id, projectId});
	}

	addTask(task: AddTaskArgs & DeadlineArg): TemporaryId {
		// Convert to REST API format
		const args: any = {
			content: task.content,
			description: task.description,
			parentId: task.parentId,
			projectId: task.projectId,
			sectionId: task.sectionId,
			priority: task.priority,
			labels: task.labels,
		};
		// REST API uses dueString for natural language or dueDate for ISO format
		if (task.dueDate) {
			args.dueDate = task.dueDate;
		}
		// Note: REST API v2 doesn't support deadline separate from due date
		// deadline is mapped to due date if no due date exists
		if (!task.dueDate && task.deadlineDate) {
			args.dueDate = task.deadlineDate;
		}
		return this.addCommand('item_add', args);
	}

	updateTask(id: string, task: UpdateTaskArgs & DeadlineArg): void {
		const args: any = {
			content: task.content,
			description: task.description,
			priority: task.priority,
			labels: task.labels,
		};
		if (task.dueDate) {
			args.dueDate = task.dueDate;
		}
		if (!task.dueDate && task.deadlineDate) {
			args.dueDate = task.deadlineDate;
		}
		this.addCommand('item_update', {id, ...args});
	}

	closeTask(id: string): void {
		this.addCommand('item_close', {id});
	}

	reopenTask(id: string): void {
		this.addCommand('item_reopen', {id});
	}

	moveTask(
		id: string,
		to: {sectionId?: string; projectId?: string; parentId?: string}
	): void {
		this.addCommand('item_move', {id, ...to});
	}

	deleteTask(id: string): void {
		this.addCommand('item_delete', {id});
	}

	addComment(comment: AddCommentArgs): TemporaryId {
		return this.addCommand('note_add', comment);
	}

	updateComment(id: string, content: string) {
		return this.addCommand('note_update', {id, content});
	}

	deleteComment(id: string) {
		return this.addCommand('note_delete', {id});
	}

	addLabel(label: AddLabelArgs): TemporaryId {
		return this.addCommand('label_add', label);
	}

	updateLabel(id: string, label: UpdateLabelArgs) {
		this.addCommand('label_update', {id, ...label});
	}

	//-----------------------------------------------------------------
	// Batching
	//-----------------------------------------------------------------

	public async commit(): Promise<Map<TemporaryId, string> | undefined> {
		const idMapping = new Map<TemporaryId, string>();
		
		// Execute commands sequentially using REST API v2
		for (const cmd of this.commands) {
			try {
				const result = await this.executeCommand(cmd);
				if (result) {
					idMapping.set(cmd.tempId, result.id);
				}
			} catch (error) {
				console.error(`Error executing ${cmd.type}:`, error);
				throw error;
			}
		}
		
		this.commands.length = 0;
		return idMapping.size > 0 ? idMapping : undefined;
	}

	private async executeCommand(cmd: Command): Promise<{id: string} | undefined> {
		const {type, args} = cmd;
		
		// Project operations
		if (type === 'project_add') {
			const result = await this.api.addProject(args as AddProjectArgs);
			return {id: result.id};
		}
		if (type === 'project_update') {
			const {id, ...updateArgs} = args as any;
			await this.api.updateProject(id, updateArgs as UpdateProjectArgs);
			return undefined;
		}
		if (type === 'project_delete') {
			await this.api.deleteProject((args as any).id);
			return undefined;
		}
		if (type === 'project_move') {
			// REST API doesn't have a separate move endpoint - ignore for now
			// Parent project relationships would need to be handled differently
			console.warn('Project move not supported in REST API v2');
			return undefined;
		}
		if (type === 'project_reorder') {
			// REST API doesn't support explicit ordering - ignore
			console.warn('Project reorder not supported in REST API v2');
			return undefined;
		}
		
		// Section operations
		if (type === 'section_add') {
			const result = await this.api.addSection(args as AddSectionArgs);
			return {id: result.id};
		}
		if (type === 'section_update') {
			const {id, ...updateArgs} = args as any;
			await this.api.updateSection(id, updateArgs as UpdateSectionArgs);
			return undefined;
		}
		if (type === 'section_delete') {
			await this.api.deleteSection((args as any).id);
			return undefined;
		}
		if (type === 'section_move') {
			const {id, projectId} = args as any;
			await this.api.updateSection(id, {projectId} as any);
			return undefined;
		}
		if (type === 'section_reorder') {
			const {id, order} = args as any;
			await this.api.updateSection(id, {order} as any);
			return undefined;
		}
		
		// Task operations
		if (type === 'item_add') {
			const result = await this.api.addTask(args as AddTaskArgs);
			return {id: result.id};
		}
		if (type === 'item_update') {
			const {id, ...updateArgs} = args as any;
			await this.api.updateTask(id, updateArgs as UpdateTaskArgs);
			return undefined;
		}
		if (type === 'item_close') {
			await this.api.closeTask((args as any).id);
			return undefined;
		}
		if (type === 'item_reopen') {
			await this.api.reopenTask((args as any).id);
			return undefined;
		}
		if (type === 'item_delete') {
			await this.api.deleteTask((args as any).id);
			return undefined;
		}
		if (type === 'item_move') {
			const {id, ...moveArgs} = args as any;
			await this.api.updateTask(id, moveArgs as UpdateTaskArgs);
			return undefined;
		}
		
		// Comment operations
		if (type === 'note_add') {
			const result = await this.api.addComment(args as AddCommentArgs);
			return {id: result.id};
		}
		if (type === 'note_update') {
			const {id, content} = args as any;
			await this.api.updateComment(id, {content});
			return undefined;
		}
		if (type === 'note_delete') {
			await this.api.deleteComment((args as any).id);
			return undefined;
		}
		
		// Label operations
		if (type === 'label_add') {
			const result = await this.api.addLabel(args as AddLabelArgs);
			return {id: result.id};
		}
		if (type === 'label_update') {
			const {id, ...updateArgs} = args as any;
			await this.api.updateLabel(id, updateArgs as UpdateLabelArgs);
			return undefined;
		}
		
		console.warn(`Unknown command type: ${type}`);
		return undefined;
	}

	private readonly commands: Command[] = [];
	private addCommand(type: string, args: any = {}): TemporaryId {
		const tempId = uuidv4();
		this.commands.push({
			type,
			tempId,
			args,
		});
		return tempId;
	}
}

type Command = {
	type: string;
	tempId: string;
	args: any;
};

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
		deadline?: DeadlineDate;
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
type DeadlineDate = {
	date: string;
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

export type DeadlineArg = {
	deadlineDate?: string;
};
