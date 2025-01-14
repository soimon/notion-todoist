import {extractIdFromLink, hasLinks} from '@lib/notion';
import {runLogged} from '@lib/utils/dev';
import {makeIsoScheduledString} from '@lib/utils/time';
import {Client} from '@notionhq/client';
import {
	PageObjectResponse,
	RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints';
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
			parentId?: string;
			verb?: string;
			places: string[];
			waitingForDate?: Date;
			deadline?: Date;
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
					...(data.parentId && {
						[this.projectSchema.fields.parent]: {
							relation: [{id: data.parentId}],
						},
					}),
					...(data.verb && {
						[this.projectSchema.fields.verb]: {select: {name: data.verb}},
					}),
					...(data.waitingForDate && {
						[this.projectSchema.fields.waiting]: {
							rich_text: [createDateMention(data.waitingForDate)],
						},
					}),
					...(data.deadline && {
						[this.projectSchema.fields.deadline]: {
							date: {start: makeIsoScheduledString(data.deadline, false)},
						},
					}),
					...{
						[this.projectSchema.fields.isScheduled]: {
							type: 'checkbox',
							checkbox: data.waitingForDate ? true : false,
						},
					},
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

	updateTaskFlags(id: string, flags: {isScheduled?: boolean}) {
		this.taskCounters.update++;

		this.operations.push(
			async notion =>
				await notion.pages.update({
					page_id: id,
					properties: {
						// Is scheduled
						...{
							[this.projectSchema.fields.isScheduled]: {
								type: 'checkbox',
								checkbox: flags.isScheduled ?? false,
							},
						},
					},
				})
		);
	}

	updateTask(
		id: string,
		data: {
			name: string;
			verb?: string;
			places: string[];
			waitingForDate?: Date;
			deadline?: Date;
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

		this.operations.push(
			async notion =>
				await notion.pages.update({
					page_id: id,
					properties: {
						title: {title: formatTitle(data.name)},

						// Verb
						...{
							[this.projectSchema.fields.verb]: {
								select: data.verb ? {name: data.verb} : null,
							},
						},

						// Places
						[this.projectSchema.fields.place]: {
							multi_select: data.places.map(name => ({name})),
						},

						// Waiting for date
						...(waiting && {
							[this.projectSchema.fields.waiting]: {
								rich_text: waiting,
							},
						}),

						// Deadline
						...(data.deadline && {
							[this.projectSchema.fields.deadline]: {
								date: {start: makeIsoScheduledString(data.deadline, false)},
							},
						}),
					},
				})
		);
		this.syncQueue.push({
			notionId: id,
			hash: pair.todoistHash,
			commentId: pair.todoistCommentId,
		});
	}

	completeTask(id: string) {
		this.taskCounters.complete++;
		this.operations.push(
			async notion =>
				await notion.pages.update({
					page_id: id,
					properties: {
						[this.projectSchema.fields.reviewState]: {
							type: 'select',
							select: {id: this.projectSchema.idOfArchivedOption},
						},
					},
				})
		);
	}

	fixTaskArea(id: string, areas: string[]) {
		const areasIsEmpty = areas.length === 1 && areas[0] === NO_AREA;
		this.taskCounters.fix++;
		this.operations.push(
			async notion =>
				await notion.pages.update({
					page_id: id,
					properties: {
						[this.projectSchema.fields.areas]: {
							relation: areasIsEmpty ? [] : areas.map(id => ({id})),
						},
					},
				})
		);
	}

	// Notes

	appendTaskContent({
		id,
		date,
		content,
	}: {
		id: string;
		date: Date;
		content: string;
	}) {
		this.taskCounters.attach++;
		this.operations.push(
			async notion =>
				await notion.blocks.children.append({
					block_id: id,
					children: [
						{divider: {}},
						{heading_3: {rich_text: [createDateMention(date)]}},
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						...(markdownToBlocks(content) as any),
					],
				})
		);
	}

	flagTaskAsReviewable(id: string) {
		this.taskCounters.update++;
		this.operations.push(
			async notion =>
				await notion.pages.update({
					page_id: id,
					properties: {
						[this.projectSchema.fields.reviewState]: {
							select: {id: this.projectSchema.idOfNewNotesOption},
						},
					},
				})
		);
	}

	starTask(id: string, icon: PageObjectResponse['icon']) {
		this.taskCounters.update++;
		this.operations.push(
			async notion =>
				await notion.pages.update({
					page_id: id,
					icon: getIconWithUpdatedColorOrUndefined(
						icon,
						this.projectSchema.colorOfStar
					),
					properties: {
						[this.projectSchema.fields.star]: {
							type: 'select',
							select: {name: this.projectSchema.valueOfStar},
						},
						[this.projectSchema.fields.starAt]: {
							type: 'date',
							date: null,
						},
						[this.projectSchema.fields.waiting]: {
							type: 'rich_text',
							rich_text: [],
						},
					},
				})
		);
	}

	starTaskAsWaiting(id: string, icon: PageObjectResponse['icon']) {
		this.taskCounters.update++;
		this.operations.push(
			async notion =>
				await notion.pages.update({
					page_id: id,
					icon: getIconWithUpdatedColorOrUndefined(
						icon,
						this.projectSchema.colorOfWaiting
					),
					properties: {
						[this.projectSchema.fields.star]: {
							type: 'select',
							select: {name: this.projectSchema.valueOfWaiting},
						},
					},
				})
		);
	}

	starTaskAsGoal(id: string, icon: PageObjectResponse['icon']) {
		this.taskCounters.update++;
		this.operations.push(
			async notion =>
				await notion.pages.update({
					page_id: id,
					icon: getIconWithUpdatedColorOrUndefined(
						icon,
						this.projectSchema.colorOfStar
					),
					properties: {
						[this.projectSchema.fields.star]: {
							type: 'select',
							select: {name: this.projectSchema.valueOfGoal},
						},
					},
				})
		);
	}
}

const getIconWithUpdatedColorOrUndefined = (
	icon: PageObjectResponse['icon'],
	color: string
) => {
	if (
		icon &&
		icon.type === 'external' &&
		icon.external.url.startsWith('https://www.notion.so/icons/')
	) {
		return {
			type: 'external',
			external: {
				url: icon.external.url.replace(
					/(https:\/\/www.notion.so\/icons\/[a-zA-Z0-9-]+_)(.*?)(\.svg)/,
					`$1${color}$3`
				),
			},
		} as const;
	} else return undefined;
};

const getUpdatedWaitingFor = (
	date: Date | undefined,
	original: RichTextItemResponse[] | undefined
) => {
	const dateMention = createDateMention(date);
	if (!original?.length) return dateMention ? [dateMention] : [];
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

const createDateMention = (date?: Date, withTime = false) =>
	date
		? {
				type: 'mention',
				mention: {
					date: {
						start: makeIsoScheduledString(date, withTime),
					},
				},
		  }
		: undefined;

export type ProjectSchema = {
	database: string;
	fields: Readonly<{
		archivedState: string;
		isPostponed: string;
		isScheduled: string;
		parent: string;
		areas: string;
		place: string;
		people: string;
		verb: string;
		waiting: string;
		deadline: string;
		reviewState: string;
		starAt: string;
		star: string;
		todoist: string;
	}>;
	idOfArchivedOption: string;
	idOfNewNotesOption: string;
	valueOfGoal: string;
	valueOfStar: string;
	colorOfStar: string;
	valueOfWaiting: string;
	colorOfWaiting: string;
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

export const NO_AREA = '';
