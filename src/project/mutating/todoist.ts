import {AddTaskArgs} from '@doist/todoist-api-typescript';
import {generateLink} from '@lib/notion';
import {Color, TodoistSyncApi} from '@lib/todoist';
import {runLogged} from '@lib/utils/dev';
import {makeIsoScheduledString} from '@lib/utils/time';
import {generateContentHash, stampToLink} from '@project/syncstamp';
import {RequireAtLeastOne} from 'type-fest';

export class TodoistMutationQueue {
	private logs: string[] = [];
	private taskCounters = {
		create: 0,
		update: 0,
		move: 0,
		delete: 0,
		pair: 0,
	};
	private commentCounters = {
		delete: 0,
	};
	constructor(private readonly client: TodoistSyncApi) {}

	// Perform sync

	async commit() {
		const count = this.operationsCount;
		this.log();
		if (count > 0)
			await runLogged(
				async () => {
					await this.client.commit();
				},
				'Committing changes to Todoist...',
				'📤'
			);
	}

	private get operationsCount() {
		return (
			this.logs.length +
			Object.values(this.taskCounters).reduce((a, b) => a + b, 0) +
			Object.values(this.commentCounters).reduce((a, b) => a + b, 0)
		);
	}

	private log() {
		if (this.taskCounters.create > 0)
			console.log(`Create ${this.taskCounters.create} tasks in Todoist`);
		if (this.taskCounters.update > 0)
			console.log(`Update ${this.taskCounters.update} tasks in Todoist`);
		if (this.taskCounters.move > 0)
			console.log(`Move ${this.taskCounters.move} tasks in Todoist`);
		if (this.taskCounters.delete > 0)
			console.log(`Delete ${this.taskCounters.delete} tasks from Todoist`);
		if (this.taskCounters.pair > 0)
			console.log(
				`Pair ${this.taskCounters.pair} tasks between Notion and Todoist`
			);
		if (this.commentCounters.delete > 0)
			console.log(
				`Delete ${this.commentCounters.delete} comments from Todoist`
			);
		this.taskCounters.create =
			this.taskCounters.update =
			this.taskCounters.move =
			this.taskCounters.delete =
			this.taskCounters.pair =
			this.commentCounters.delete =
				0;
		this.logs = [];
	}

	// Labels

	createLabel(data: {name: string; color: Color; order: number}) {
		const id = this.client.addLabel(data);
		this.logs.push(`Create label ${data.name}`);
		return id;
	}

	updateLabel(id: string, data: {name: string; color: Color; order: number}) {
		this.client.updateLabel(id, data);
		this.logs.push(`Update label ${data.name}`);
	}

	// Projects

	createProject(
		data: {
			name: string;
			color: string | undefined;
			parentId: string;
		},
		pair: NewPairData
	) {
		const projectId = this.client.addProject(data);
		this.client.addComment({
			content: generateLink(pair.notionId),
			projectId,
		});
		this.logs.push(`Create project ${data.name}`);
		return projectId;
	}

	updateProject(id: string, data: {name: string; color: string | undefined}) {
		this.client.updateProject(id, data);
		this.logs.push(`Update project ${data.name}`);
	}

	moveProject(id: string, todoistId: string) {
		this.client.moveProject(id, todoistId);
		this.logs.push(`Move a project`);
	}

	// Tasks

	createTask(
		data: {
			labels: string[];
			parentId?: string | undefined;
			projectId?: string | undefined;
			sectionId?: string | undefined;
			content: string;
			date?: Date;
		},
		pair: NewPairData
	): string {
		const taskId = this.client.addTask({
			...data,
			...formatDate(data.date),
		});
		this.syncTaskPair({
			notionId: pair.notionId,
			todoistId: taskId,
			hash: generateContentHash(data),
		});
		this.taskCounters.create++;
		return taskId;
	}

	updateTask(
		id: string,
		data: {content: string; labels: string[]; date?: Date},
		pair: ExistingPairData
	) {
		const hash = generateContentHash(data);
		this.syncTaskPair({
			notionId: pair.notionId,
			todoistId: id,
			hash,
			commentId: pair.todoistCommentId,
		});
		this.client.updateTask(id, {
			...data,
			...formatDate(data.date),
		});
		this.taskCounters.update++;
	}

	deleteTask(id: string) {
		this.client.deleteTask(id);
		this.taskCounters.delete++;
	}

	moveTask(
		id: string,
		parentInfo: Pick<AddTaskArgs, 'parentId' | 'projectId' | 'sectionId'>
	) {
		if (!parentInfo.parentId && !parentInfo.projectId && !parentInfo.sectionId)
			parentInfo.projectId = process.env.TODOIST_PROJECT_INBOX;
		this.client.moveTask(id, parentInfo);
		this.taskCounters.move++;
	}

	syncTaskPairs(pairs: SyncPair[]) {
		pairs.forEach(p => this.syncTaskPair(p));
	}

	private syncTaskPair(pair: SyncPair) {
		this.taskCounters.pair++;
		if (pair.commentId) {
			this.client.updateComment(
				pair.commentId,
				stampToLink({hash: pair.hash, notionId: pair.notionId})
			);
		} else if (pair.todoistId) {
			this.client.addComment({
				content: stampToLink({hash: pair.hash, notionId: pair.notionId}),
				taskId: pair.todoistId,
			});
		}
	}

	// Comments

	deleteComment(id: string) {
		this.client.deleteComment(id);
		this.commentCounters.delete++;
	}
}

const formatDate = (date?: Date) => {
	if (!date) return {};
	return {
		dueDate: makeIsoScheduledString(date, false),
	};
};

export type SyncPair = {
	notionId: string;
	hash: string;
} & RequireAtLeastOne<{
	todoistId: string;
	commentId: string;
}>;

type NewPairData = {
	notionId: string;
};
type ExistingPairData = {
	notionId: string;
	todoistCommentId?: string;
};
