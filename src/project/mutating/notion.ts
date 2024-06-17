import {extractIdFromLink, hasLinks} from '@lib/notion';
import {runLogged} from '@lib/utils/dev';
import {makeIsoScheduledString} from '@lib/utils/time';
import {Client} from '@notionhq/client';
import {RichTextItemResponse} from '@notionhq/client/build/src/api-endpoints';
import {markdownToBlocks} from '@tryfabric/martian';
import {SyncPair} from './todoist';

export class NotionMutationQueue {
	private operations: ((notion: Client) => Promise<unknown>)[] = [];
	private syncQueue: SyncPair[] = [];
	private taskCounters = {
		create: 0,
		update: 0,
		complete: 0,
		fix: 0,
		attach: 0,
	};

	constructor(
		private client: Client,
		private projectSchema: ProjectSchema,
		private noteSchema: NoteSchema
	) {}

	// Perform sync

	async commit(): Promise<SyncPair[]> {
		this.log();
		if (this.operations.length > 0)
			await runLogged(
				async () => {
					for (const operation of this.operations) await operation(this.client);
				},
				'Committing changes to Notion...',
				'📤'
			);
		return this.syncQueue;
	}

	private log() {
		if (this.taskCounters.create > 0)
			console.log(`Create ${this.taskCounters.create} tasks in Notion`);
		if (this.taskCounters.complete > 0)
			console.log(`Complete ${this.taskCounters.complete} tasks in Notion`);
		if (this.taskCounters.fix > 0)
			console.log(`Fix the areas of ${this.taskCounters.fix} tasks in Notion`);
		if (this.taskCounters.update > 0)
			console.log(`Update ${this.taskCounters.update} tasks in Notion`);
		if (this.taskCounters.attach > 0)
			console.log(`Attach ${this.taskCounters.attach} notes to Notion`);
		this.taskCounters.create =
			this.taskCounters.complete =
			this.taskCounters.fix =
			this.taskCounters.update =
			this.taskCounters.attach =
				0;
	}

	// Tasks

	createTask(
		data: {
			name: string;
			areaId?: string;
			goalId?: string;
			verb?: string;
			places: string[];
			waitingForDate?: Date;
		},
		pair: NewPairData
	) {
		this.taskCounters.create++;
		this.operations.push(async notion => {
			const {id} = await notion.pages.create({
				parent: {database_id: this.projectSchema.database},
				properties: {
					title: {title: formatTitle(data.name)},
					// ...{[this.projectSchema.fields.todoist]: {
					// 	url: `todoist://task?id=${pair.todoistTaskId}`,
					// }},
					...(data.areaId && {
						[this.projectSchema.fields.areas]: {relation: [{id: data.areaId}]},
					}),
					...(data.goalId && {
						[this.projectSchema.fields.goal]: {relation: [{id: data.goalId}]},
					}),
					...(data.verb && {
						[this.projectSchema.fields.verb]: {select: {name: data.verb}},
					}),
					...(data.waitingForDate && {
						[this.projectSchema.fields.waiting]: {
							rich_text: [createDateMention(data.waitingForDate)],
						},
					}),
					...(data.places.length && {
						[this.projectSchema.fields.place]: {
							multi_select: data.places.map(name => ({name})),
						},
					}),
				},
			});
			this.syncQueue.push({
				notionId: id,
				todoistId: pair.todoistTaskId,
				hash: pair.todoistHash,
			});
		});
	}

	updateTask(
		id: string,
		data: {
			name: string;
			verb?: string;
			places: string[];
			waitingForDate?: Date;
		},
		original: {
			Waiting?: {rich_text: RichTextItemResponse[]};
		},
		pair: ExistingPairData
	) {
		this.taskCounters.update++;

		const waiting = getUpdatedWaitingFor(
			data.waitingForDate,
			original.Waiting?.rich_text
		);

		this.operations.push(async notion => {
			notion.pages.update({
				page_id: id,
				properties: {
					title: {title: formatTitle(data.name)},

					// Verb
					...(data.verb && {
						[this.projectSchema.fields.verb]: {select: {name: data.verb}},
					}),

					// Places
					...(data.places.length && {
						[this.projectSchema.fields.place]: {
							multi_select: data.places.map(name => ({name})),
						},
					}),

					// Waiting for date
					...(waiting && {
						[this.projectSchema.fields.waiting]: {
							rich_text: waiting,
						},
					}),
				},
			});
			this.syncQueue.push({
				notionId: id,
				hash: pair.todoistHash,
				commentId: pair.todoistCommentId,
			});
		});
	}

	completeTask(id: string) {
		this.taskCounters.complete++;
		this.operations.push(notion =>
			notion.pages.update({
				page_id: id,
				properties: {
					[this.projectSchema.fields.archived]: {
						type: 'select',
						select: {id: this.projectSchema.idOfArchivedOption},
					},
				},
			})
		);
	}

	fixTaskArea(id: string, areas: string[]) {
		this.taskCounters.fix++;
		this.operations.push(notion =>
			notion.pages.update({
				page_id: id,
				properties: {
					[this.projectSchema.fields.areas]: {
						relation: areas.map(id => ({id})),
					},
				},
			})
		);
	}

	// Notes

	createNote(
		project: string,
		data: {
			title: string;
			content: string;
			date: Date;
			fileName?: string;
			filePath?: string;
		}
	) {
		this.taskCounters.attach++;
		this.operations.push(notion =>
			notion.pages.create({
				parent: {database_id: this.noteSchema.database},
				properties: {
					title: {title: [{text: {content: data.title}}]},
					[this.noteSchema.fields.date]: {
						date: {start: makeIsoScheduledString(data.date, true)},
					},
					...(data.fileName && data.filePath
						? {
								[this.noteSchema.fields.files]: {
									files: [
										{external: {url: data.filePath}, name: data.fileName},
									],
								},
						  }
						: {}),
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				children: markdownToBlocks(data.content) as any,
			})
		);
	}
}

const getUpdatedWaitingFor = (
	date: Date | undefined,
	original: RichTextItemResponse[] | undefined
) => {
	const dateMention = createDateMention(date);
	if (!original?.length) return dateMention;
	else {
		const firstMentionWasDate = checkFirstMentionForDate(original);
		if (dateMention) {
			if (firstMentionWasDate) return [dateMention, ...original.slice(1)];
			else return [dateMention, {text: {content: ', '}}, ...original];
		} else {
			if (firstMentionWasDate) {
				const withoutDate = original.slice(1);
				if (withoutDate[0]?.type === 'text')
					withoutDate[0].text.content = withoutDate[0].text.content.replace(
						/^, /,
						''
					);
				if (
					withoutDate
						.map(item => item.plain_text)
						.join('')
						.trim() === ''
				)
					return [];
				return withoutDate;
			} else return undefined;
		}
	}
};

function checkFirstMentionForDate(
	waitingRichText: RichTextItemResponse[]
): boolean {
	return (
		waitingRichText[0]?.type === 'mention' &&
		waitingRichText[0]?.mention.type === 'date'
	);
}

function formatTitle(text: string) {
	if (hasLinks(text)) {
		const linkSearch = /\[.*?\]\((.*?)\)/g;
		return text
			.split(linkSearch)
			.filter(v => v)
			.map(content => {
				if (hasLinks(content)) {
					const id = extractIdFromLink(content);
					if (id) return {mention: {page: {id}}};
				}
				return {text: {content}};
			});
	} else return [{text: {content: text}}];
}

const createDateMention = (date?: Date) =>
	date
		? {
				type: 'mention',
				mention: {
					date: {
						start: makeIsoScheduledString(date, false),
					},
				},
		  }
		: undefined;

export type ProjectSchema = {
	database: string;
	fields: Readonly<{
		archivedState: string;
		isPostponed: string;
		goal: string;
		areas: string;
		place: string;
		people: string;
		verb: string;
		waiting: string;
		archived: string;
		todoist: string;
	}>;
	idOfArchivedOption: string;
	filterValueOfActive: string;
};

export type NoteSchema = {
	database: string;
	fields: {files: string; date: string};
};

type NewPairData = {
	todoistTaskId: string;
	todoistHash: string;
};
type ExistingPairData = {
	todoistCommentId: string;
	todoistHash: string;
};
