import {TodoistApi, TodoistRequestError} from '@doist/todoist-api-typescript';

export type TodoistTask = {
	content: string;
	description: string;
	isCompleted?: boolean;
	dueDate?: Date;
};

export class TodoistTaskRepository {
	constructor(private todoist: TodoistApi) {}

	async add(task: TodoistTask): Promise<string> {
		const {id} = await this.todoist.addTask({
			content: task.content,
			description: task.description,
			dueDate: makeDueString(task.dueDate),
			projectId: '2219800625',
		});
		return id;
	}

	async update(id: string, newState: TodoistTask): Promise<boolean> {
		const {wasFound} = await with404Check(
			(async () => {
				const {isCompleted: wasCompleted} = await this.todoist.updateTask(id, {
					content: newState.content,
					description: newState.description,
					dueDate: makeDueString(newState.dueDate),
				});
				const shouldUpdateState =
					newState.isCompleted !== undefined &&
					wasCompleted !== newState.isCompleted;
				if (shouldUpdateState) {
					if (newState.isCompleted) await this.todoist.closeTask(id);
					else await this.todoist.reopenTask(id);
				}
			})()
		);
		return wasFound;
	}
}

const makeDueString = (date: Date | undefined) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	date?.toISOString().split('T')[0] as any;

function with404Check<T>(
	promise: Promise<T>
): Promise<{wasFound: true; result: T} | {wasFound: false; result: undefined}> {
	return promise
		.then(
			result =>
				({
					wasFound: true,
					result,
				}) as const
		)
		.catch(e => {
			if (
				e instanceof TodoistRequestError &&
				!e.isAuthenticationError() &&
				e.httpStatusCode === 404
			)
				return {wasFound: false, result: undefined} as const;
			else {
				throw e;
			}
		});
}
