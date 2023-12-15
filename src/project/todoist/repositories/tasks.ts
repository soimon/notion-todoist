import {Task} from '@framework/models';
import {TemporaryId, TodoistSyncApi} from '@lib/todoist';
import {TodoistProject, TodoistTask, progressionToLabel} from '../models';

// Repository for Todoist tasks.

export class TodoistTaskRepository {
	constructor(private api: TodoistSyncApi) {}

	// Fetching

	async getSyncCandidates(projects: TodoistProject[]): Promise<TodoistTask[]> {
		const tasks = await Promise.all(
			projects.map(({syncId}) => this.getTasksFor(syncId))
		);
		return tasks.flat();
	}

	private async getTasksFor(projectId: string) {
		const tasks = await this.api.getTasks();
		return tasks
			.filter(t => t.project_id === projectId)
			.filter(
				(t): t is typeof t & {section_id: string} =>
					typeof t.section_id === 'string' && t.section_id !== ''
			)
			.map(
				(task): TodoistTask => ({
					syncId: task.id,
					goalSyncId: task.section_id,
					content: task.content,
					isCompleted: task.checked,
					scheduled: task.due?.date ? new Date(task.due.date) : undefined,
					progression: findProgression(task.labels),
					todoist: {
						description: task.description,
					},
				})
			);
	}

	// Altering

	add(task: Task): TemporaryId {
		const label = progressionToLabel[task.progression];
		return this.api.addTask({
			content: task.content,
			dueDate: makeDueString(task.scheduled),
			sectionId: task.goalSyncId,
			labels: label ? [label] : undefined,
		});
	}

	update(newState: Task): void {
		const id = newState.syncId;
		const label = progressionToLabel[newState.progression];

		this.api.updateTask(id, {
			content: newState.content,
			dueDate: makeDueString(newState.scheduled),
			labels: label ? [label] : undefined,
		});
		if (newState.isCompleted) this.api.closeTask(id);
		else this.api.reopenTask(id);
		this.api.moveTask(id, newState.goalSyncId);
	}

	remove(task: Pick<Task, 'syncId'>): void {
		this.api.deleteTask(task.syncId);
	}
}

// Find the first known tag

const findProgression = (labels: string[]) =>
	labelToProgression[labels.find(l => l in labelToProgression) ?? ''] ??
	'not-started';

const labelToProgression = Object.fromEntries(
	Object.entries(progressionToLabel).map(([k, v]) => [v, k])
) as Record<string, Task['progression']>;

// Make a string like "2021-01-01" from a Date object.

const makeDueString = (date: Date | undefined) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	date?.toISOString().split('T')[0] as any;
