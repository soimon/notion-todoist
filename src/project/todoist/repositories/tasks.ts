import {TodoistApi} from '@doist/todoist-api-typescript';
import {Task} from '@framework/models';
import {TemporaryId, TodoistSyncApi} from '@lib/todoist';
import {TodoistProject, TodoistTask} from '../models';

// Repository for Todoist tasks.

export class TodoistTaskRepository {
	constructor(
		private api: TodoistApi,
		private syncApi: TodoistSyncApi
	) {}

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

	add(task: Task): TemporaryId {
		return this.syncApi.addTask({
			content: task.content,
			dueDate: makeDueString(task.scheduled),
			sectionId: task.goalSyncId,
		});
	}

	update(newState: Task): void {
		const id = newState.syncId;
		this.syncApi.updateTask(id, {
			content: newState.content,
			dueDate: makeDueString(newState.scheduled),
		});
		if (newState.isCompleted) this.syncApi.closeTask(id);
		else this.syncApi.reopenTask(id);
		this.syncApi.moveTask(id, newState.goalSyncId);
	}

	remove(task: Pick<Task, 'syncId'>): void {
		this.syncApi.deleteTask(task.syncId);
	}
}

// Make a string like "2021-01-01" from a Date object.

const makeDueString = (date: Date | undefined) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	date?.toISOString().split('T')[0] as any;
