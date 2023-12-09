import {Client} from '@notionhq/client';
import {NotionPage, QueryFilters, defineSchema, queryDatabase} from '../notion';

const schema = defineSchema({
	title: {type: 'title', id: 'title'},
	project: {type: 'formula', id: '%3DCAH'},
	goal: {type: 'relation', id: 'cMU%5D'},
	priority: {type: 'select', id: 'Cckb'},
	scheduled: {type: 'date', id: 'lB%5Dl'},
	status: {type: 'status', id: 'oua%5B'},
	who: {type: 'relation', id: 'n%3D%7Dt'},
	todoistId: {type: 'rich_text', id: 'sn%5EO'},
});

enum States {
	NotStarted = 'Not started',
	InProgress = 'In progress',
	Done = 'Done',
	Cut = 'Cut',
}
const STATES_CLOSED: string[] = [States.Done, States.Cut];

export type NotionTask = {
	notionId: NotionPage<{}>['id'];
	todoistId: string;
	isCompleted: boolean;
	content: string;
	scheduled?: Date;
	projectName: string;
};

export class NotionTaskRepository {
	constructor(
		private notion: Client,
		private databaseId: string
	) {}

	async getOpenTasks() {
		return await this.query({
			and: [
				{
					property: schema.goal.id,
					relation: {
						contains: '11f3e9a8-473e-47fc-bc6e-a67e466bbc85',
					},
				},
				{
					property: schema.status.id,
					status: {
						does_not_equal: States.Done,
					},
				},
				{
					property: schema.status.id,
					status: {
						does_not_equal: States.Cut,
					},
				},
			],
		});
	}

	private async query(filter: QueryFilters) {
		const pages = await queryDatabase({
			notion: this.notion,
			database: this.databaseId,
			schema: schema,
			filter,
		});
		return pages.map(this.pageToDTO);
	}

	private pageToDTO({id, properties}: NotionPage<typeof schema>): NotionTask {
		const todoistId = properties.todoistId?.rich_text[0]?.plain_text ?? '';
		const content = properties.title?.title[0]?.plain_text ?? '';
		const date = properties.scheduled?.date?.start;
		const scheduled = date ? new Date(date) : undefined;
		const project = (properties.project?.formula as any)?.string ?? '';
		const status = properties.status?.status?.name ?? '';
		// const goalId = properties.goal?.relation[0]?.id ?? '';
		// const priority = properties.priority?.select?.name ?? '';

		return {
			notionId: id,
			todoistId,
			projectName: project,
			content,
			scheduled,
			isCompleted: STATES_CLOSED.includes(status),
		};
	}

	async linkWithTodoist(notionId: string, todoistId: string) {
		const response = await this.notion.pages.update({
			page_id: notionId,
			properties: {
				[schema.todoistId.id]: {
					rich_text: [{type: 'text', text: {content: todoistId}}],
				},
			},
		});
		return response;
	}
}
