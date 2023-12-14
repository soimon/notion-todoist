import {TodoistApi} from '@doist/todoist-api-typescript';
import {TodoistProject, TodoistTask} from '../models';
import {with404Check} from './utils';
import {Task} from '@framework/models';
import {v4 as uuidv4} from 'uuid';
import fetch from 'node-fetch';

// Repository for Todoist tasks.

export class TodoistTaskRepository {
	constructor(private api: TodoistApi) {}

	// Fetching

	async getSyncCandidates(projects: TodoistProject[]): Promise<TodoistTask[]> {
		const tasks = await Promise.all(
			projects.map(({syncId}) => this.getTasksFor(syncId))
		);
		return tasks.flat();
	}

	private async getTasksFor(projectId: string) {
		const tasks = await this.api.getTasks({
			projectId,
		});
		return tasks
			.filter(
				(t): t is typeof t & {sectionId: string} =>
					typeof t.sectionId === 'string' && t.sectionId !== ''
			)
			.map(
				(task): TodoistTask => ({
					syncId: task.id,
					goalSyncId: task.sectionId,
					content: task.content,
					isCompleted: task.isCompleted,
					scheduled: task.due?.date ? new Date(task.due.date) : undefined,
					todoist: {
						description: task.description,
						projectId: task.projectId,
						sectionId: task.sectionId,
					},
				})
			);
	}

	// Altering

	async add(task: Task): Promise<string> {
		const {id} = await this.api.addTask({
			content: task.content,
			dueDate: makeDueString(task.scheduled),
			sectionId: task.goalSyncId,
		});
		return id;
	}

	async update(newState: Task): Promise<boolean> {
		const {wasFound} = await with404Check(
			(async () => {
				const id = newState.syncId;
				const {isCompleted: wasCompleted, sectionId} =
					await this.api.updateTask(id, {
						content: newState.content,
						dueDate: makeDueString(newState.scheduled),
					});
				const shouldChangeCompletion =
					newState.isCompleted !== undefined &&
					wasCompleted !== newState.isCompleted;
				if (shouldChangeCompletion) {
					if (newState.isCompleted) await this.api.closeTask(id);
					else await this.api.reopenTask(id);
				}
				const shouldMove = newState.goalSyncId !== sectionId;
				if (shouldMove) await this.moveTask(id, newState.goalSyncId);
			})()
		);
		return wasFound;
	}

	private async moveTask(id: string, sectionId: string) {
		const url = 'https://api.todoist.com/sync/v9/sync';
		const headers = {
			Authorization: `Bearer ${process.env.TODOIST_TOKEN}`,
			'Content-Type': 'application/json',
		};
		const data = {
			commands: [
				{
					type: 'item_move',
					uuid: uuidv4(),
					args: {id, section_id: sectionId},
				},
			],
		};
		await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(data),
		});
	}

	async remove(task: Pick<Task, 'syncId'>): Promise<boolean> {
		return await this.api.deleteTask(task.syncId);
	}
}

// Make a string like "2021-01-01" from a Date object.

const makeDueString = (date: Date | undefined) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	date?.toISOString().split('T')[0] as any;
