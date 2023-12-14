import {TodoistApi} from '@doist/todoist-api-typescript';
import {TodoistTask} from '../models';
import {with404Check} from './utils';

// Repository for Todoist tasks.

export class TodoistTaskRepository {
	constructor(private api: TodoistApi) {}

	// Fetching

	async getSyncCandidates(): Promise<TodoistTask[]> {
		// TODO: Get subtasks of all projects
		const tasks = await this.api.getTasks({
			projectId: process.env.TODOIST_PROJECT_ROOT,
		});
		return tasks.map(
			(task): TodoistTask => ({
				syncId: task.id,
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

	async add(task: TodoistTask): Promise<string> {
		const {id} = await this.api.addTask({
			content: task.content,
			dueDate: makeDueString(task.scheduled),
			projectId: '2219800625',
		});
		return id;
	}

	async update(newState: TodoistTask): Promise<boolean> {
		const {wasFound} = await with404Check(
			(async () => {
				const id = newState.syncId;
				const {isCompleted: wasCompleted} = await this.api.updateTask(id, {
					content: newState.content,
					dueDate: makeDueString(newState.scheduled),
				});
				const shouldUpdateState =
					newState.isCompleted !== undefined &&
					wasCompleted !== newState.isCompleted;
				if (shouldUpdateState) {
					if (newState.isCompleted) await this.api.closeTask(id);
					else await this.api.reopenTask(id);
				}
			})()
		);
		return wasFound;
	}
}

// Make a string like "2021-01-01" from a Date object.

const makeDueString = (date: Date | undefined) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	date?.toISOString().split('T')[0] as any;
