import {Task} from '@framework/models';
import {
	NotionPage,
	QueryFilters,
	getChangedPages,
	queryDatabase,
} from '@lib/notion';
import {Client} from '@notionhq/client';
import {
	NotionTask,
	closedTaskStates,
	completedTaskState,
	cutTaskState,
	newTaskState,
	progressionToState,
} from '../models';
import {taskSchema} from './schemas';
import {NotionProjectRepository} from './projects';
import {makeIsoScheduledString} from '@framework/utils/time';

// Repository

export class NotionTaskRepository {
	constructor(
		private api: Client,
		private databaseId: string,
		private projects: NotionProjectRepository
	) {}

	// Fetching

	async getSyncCandidates(since?: Date) {
		const changed = await this.getChangedSince(since);
		const open = await this.getOpenTasks();
		const results = [...changed, ...open];
		const uniqueResults = results.filter(
			(v, i, a) => a.findIndex(t => t.notion.id === v.notion.id) === i
		);
		this.storeIdMappings(uniqueResults);
		return uniqueResults;
	}

	private getOpenTasks = async () =>
		await this.query({
			and: [
				...closedTaskStates.map(state => ({
					property: taskSchema.status.id,
					status: {
						does_not_equal: state,
					},
				})),
				{
					property: taskSchema.goal.id,
					relation: {
						is_not_empty: true,
					},
				},
			],
		});

	private getChangedSince = async (since?: Date) =>
		since
			? (
					await getChangedPages({
						notion: this.api,
						database: this.databaseId,
						since,
						schema: taskSchema,
					})
			  )
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					.filter(r => (r.properties.goalSyncId?.formula as any)?.string)
					.map(rowToModel)
			: [];

	private query = async (filter: QueryFilters) =>
		(
			await queryDatabase({
				notion: this.api,
				database: this.databaseId,
				schema: taskSchema,
				filter,
			})
		).map(rowToModel);

	// Id mapping

	private idMappings: Record<NotionTask['syncId'], NotionTask['notion']['id']> =
		{};

	private requireTaskIdFromSyncId(syncId: string) {
		const id = this.idMappings[syncId];
		if (!id) throw new Error(`No task found with sync ID ${syncId}`);
		return id;
	}

	private storeIdMappings(tasks: NotionTask[]) {
		for (const task of tasks) this.idMappings[task.syncId] = task.notion.id;
	}

	// Altering

	async add(task: Task) {
		const goalId = this.projects.requireIdFromSyncId(task.goalSyncId);
		return await this.api.pages.create({
			parent: {database_id: this.databaseId},
			properties: {
				[taskSchema.syncId.id]: {
					rich_text: [{type: 'text', text: {content: task.syncId}}],
				},
				[taskSchema.title.id]: {
					title: [{type: 'text', text: {content: task.content}}],
				},
				[taskSchema.goal.id]: {
					relation: [{id: goalId}],
				},
				[taskSchema.status.id]: {
					status: {
						name: task.isCompleted
							? completedTaskState
							: progressionToState[task.progression] ?? newTaskState,
					},
				},
				[taskSchema.scheduled.id]: {
					date: task.scheduled
						? {
								start: makeIsoScheduledString(
									task.scheduled,
									task.scheduledWithTime
								),
						  }
						: null,
				},
			},
		});
	}

	async update(task: Task) {
		let goalId;
		try {
			goalId = {
				[taskSchema.goal.id]: {
					relation: [{id: this.projects.requireIdFromSyncId(task.goalSyncId)}],
				},
			};
		} catch (e) {
			goalId = {};
		}
		const notionId = this.requireTaskIdFromSyncId(task.syncId);
		const state = progressionToState[task.progression];
		return await this.api.pages.update({
			page_id: notionId,
			properties: {
				[taskSchema.title.id]: {
					title: [{type: 'text', text: {content: task.content}}],
				},
				...goalId,
				[taskSchema.scheduled.id]: {
					date: task.scheduled
						? {
								start: makeIsoScheduledString(
									task.scheduled,
									task.scheduledWithTime
								),
						  }
						: null,
				},
				...(task.isCompleted || state
					? {
							[taskSchema.status.id]: {
								status: {name: task.isCompleted ? completedTaskState : state},
							},
					  }
					: {}),
			},
		});
	}

	async remove(task: NotionTask) {
		return await this.api.pages.update({
			page_id: task.notion.id,
			properties: {
				[taskSchema.status.id]: {
					status: {name: cutTaskState},
				},
			},
		});
	}

	async link(task: NotionTask, syncId: string) {
		return await this.api.pages.update({
			page_id: task.notion.id,
			properties: {
				[taskSchema.syncId.id]: {
					rich_text: [{type: 'text', text: {content: syncId}}],
				},
			},
		});
	}
}

// Converts a Notion page row to a NotionTask model.

const stateToProgression = Object.fromEntries(
	Object.entries(progressionToState).map(([k, v]) => [v, k])
) as Record<string, Task['progression']>;

const rowToModel = ({
	id,
	properties: p,
	created_time,
	last_edited_time,
}: NotionPage<typeof taskSchema>): NotionTask => ({
	syncId: p.syncId?.rich_text[0]?.plain_text ?? '',
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	goalSyncId: (p.goalSyncId?.formula as any)?.string ?? '',
	content: p.title?.title[0]?.plain_text ?? '',
	progression:
		stateToProgression[p.status?.status?.name ?? ''] ?? 'not-started',
	scheduled: p.scheduled?.date?.start
		? new Date(p.scheduled?.date?.start)
		: undefined,
	scheduledWithTime: p.scheduled?.date?.start?.includes('T') ?? false,
	isCompleted: closedTaskStates.includes(p.status?.status?.name ?? ''),
	notion: {
		id,
		goalId: p.goal?.relation[0]?.id ?? '',
		lastEdited: new Date(last_edited_time ?? created_time),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		projectName: (p.project?.formula as any)?.string ?? '',
		status: p.status?.status?.name ?? '',
	},
});
