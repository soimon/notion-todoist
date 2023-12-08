import {Client} from '@notionhq/client';
import {NotionPage, queryDatabase} from '../notion';

const PROPERTIES = {
	title: {type: 'title', id: 'title'},
	project: {type: 'formula', id: '%3DCAH'},
	goal: {type: 'relation', id: 'cMU%5D'},
	priority: {type: 'select', id: 'Cckb'},
	scheduled: {type: 'date', id: 'lB%5Dl'},
	status: {type: 'status', id: 'oua%5B'},
	who: {type: 'relation', id: 'n%3D%7Dt'},
	todoistId: {type: 'number', id: 'sn%5EO'},
} as const;

enum States {
	NotStarted = 'Not started',
	InProgress = 'In progress',
	Done = 'Done',
	Cut = 'Cut',
}

export class NotionTasks {
	constructor(
		private notion: Client,
		private databaseId: string
	) {}

	async getOpenTasks() {
		const pages = await queryDatabase({
			notion: this.notion,
			database: this.databaseId,
			properties: PROPERTIES,
			filter: {
				and: [
					{
						property: 'Status',
						status: {
							does_not_equal: States.Done,
						},
					},
					{
						property: 'Status',
						status: {
							does_not_equal: States.Cut,
						},
					},
				],
			},
		});
		return pages.map(pageToDTO);
	}
}

function pageToDTO({id, properties}: NotionPage<typeof PROPERTIES>) {
	const title = properties.title?.title[0]?.plain_text ?? '';
	const project = (properties.project?.formula as any)?.string ?? '';
	const goalId = properties.goal?.relation[0]?.id ?? '';
	const priority = properties.priority?.select?.name ?? '';
	const scheduled = properties.scheduled?.date?.start ?? '';
	const status = properties.status?.status?.name ?? '';
	const todoistId = properties.todoistId?.number ?? 0;

	return {
		id,
		title,
		project,
		goalId,
		priority,
		scheduled,
		status,
		todoistId,
	};
}
