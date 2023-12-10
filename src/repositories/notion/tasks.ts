// import {Client} from '@notionhq/client';
// import {
// 	NotionPage,
// 	QueryFilters,
// 	getChangedPages,
// 	queryDatabase,
// } from '../../wrappers/notion';
// import {NotionTask, States, isCompleted} from './model';
// import {taskSchema} from './schemas';

// // Repository

// export class NotionTaskRepository {
// 	constructor(
// 		private api: Client,
// 		private databaseId: string
// 	) {}

// 	async getSyncCandidates(since: Date) {
// 		const results = [
// 			...(await this.getChangedSince(since)),
// 			...(await this.getOpenTasks()),
// 		];
// 		const uniqueResults = results.filter(
// 			(v, i, a) => a.findIndex(t => t.id === v.id) === i
// 		);
// 		return uniqueResults;
// 	}

// 	private getOpenTasks = async () =>
// 		await this.query({
// 			and: [
// 				{
// 					property: taskSchema.status.id,
// 					status: {
// 						does_not_equal: States.Done,
// 					},
// 				},
// 				{
// 					property: taskSchema.status.id,
// 					status: {
// 						does_not_equal: States.Cut,
// 					},
// 				},
// 			],
// 		});

// 	private getChangedSince = async (date: Date) =>
// 		(
// 			await getChangedPages({
// 				notion: this.api,
// 				database: this.databaseId,
// 				since: date,
// 				schema: taskSchema,
// 			})
// 		).map(rowToModel);

// 	private query = async (filter: QueryFilters) =>
// 		(
// 			await queryDatabase({
// 				notion: this.api,
// 				database: this.databaseId,
// 				schema: taskSchema,
// 				filter,
// 			})
// 		).map(rowToModel);

// 	async linkWithTodoist(notionId: string, todoistId: string) {
// 		const response = await this.api.pages.update({
// 			page_id: notionId,
// 			properties: {
// 				[taskSchema.todoistId.id]: {
// 					rich_text: [{type: 'text', text: {content: todoistId}}],
// 				},
// 			},
// 		});
// 		return response;
// 	}
// }

// // Converts a Notion page row to a NotionTask model.

// const rowToModel = ({
// 	id,
// 	properties: p,
// 	created_time,
// 	last_edited_time,
// }: NotionPage<typeof taskSchema>): NotionTask => ({
// 	id: id,
// 	todoistId: p.todoistId?.rich_text[0]?.plain_text ?? '',
// 	// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 	projectName: (p.project?.formula as any)?.string ?? '',
// 	content: p.title?.title[0]?.plain_text ?? '',
// 	scheduled: p.scheduled?.date?.start
// 		? new Date(p.scheduled?.date?.start)
// 		: undefined,
// 	isCompleted: isCompleted(p.status?.status?.name ?? ''),
// 	lastEdited: new Date(last_edited_time ?? created_time),
// });
