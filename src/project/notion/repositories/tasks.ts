import {Client} from '@notionhq/client';
import {taskSchema} from './schemas';
import {
	NotionPage,
	QueryFilters,
	getChangedPages,
	queryDatabase,
} from '@lib/notion';
import {NotionTask, closedTaskStates} from '../models';

// Repository

export class NotionTaskRepository {
	constructor(
		private api: Client,
		private databaseId: string
	) {}

	// Fetching

	async getSyncCandidates(since?: Date) {
		const results = [
			...(await this.getChangedSince(since)),
			...(await this.getOpenTasks()),
		];
		const uniqueResults = results.filter(
			(v, i, a) => a.findIndex(t => t.notion.id === v.notion.id) === i
		);
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

	private getChangedSince = async (date?: Date) =>
		date
			? (
					await getChangedPages({
						notion: this.api,
						database: this.databaseId,
						since: date,
						schema: taskSchema,
					})
			  )
					.filter(r => r.properties.goal?.id)
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

	// Altering

	async link(task: NotionTask, syncId: string) {
		const response = await this.api.pages.update({
			page_id: task.notion.id,
			properties: {
				[taskSchema.syncId.id]: {
					rich_text: [{type: 'text', text: {content: syncId}}],
				},
			},
		});
		return response;
	}
}

// Converts a Notion page row to a NotionTask model.

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
	scheduled: p.scheduled?.date?.start
		? new Date(p.scheduled?.date?.start)
		: undefined,
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
