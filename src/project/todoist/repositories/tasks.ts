// import {TodoistApi, TodoistRequestError} from '@doist/todoist-api-typescript';
// import {TodoistTask} from './model';

// // Repository for Todoist tasks.

// export class TodoistTaskRepository {
// 	constructor(private api: TodoistApi) {}

// 	async getSyncCandidates(): Promise<TodoistTask[]> {
// 		// TODO: Get subtasks of all projects
// 		const tasks = await this.api.getTasks({
// 			projectId: '2219800625',
// 		});
// 		return tasks.map(task => ({
// 			id: task.id,
// 			content: task.content,
// 			description: task.description,
// 			isCompleted: task.isCompleted,
// 			dueDate: task.due?.date ? new Date(task.due.date) : undefined,
// 		}));
// 	}

// 	async add(task: TodoistTask): Promise<string> {
// 		const {id} = await this.api.addTask({
// 			content: task.content,
// 			description: task.description,
// 			dueDate: makeDueString(task.dueDate),
// 			projectId: '2219800625',
// 		});
// 		return id;
// 	}

// 	async update(newState: TodoistTask): Promise<boolean> {
// 		const {wasFound} = await with404Check(
// 			(async () => {
// 				const id = newState.id;
// 				const {isCompleted: wasCompleted} = await this.api.updateTask(id, {
// 					content: newState.content,
// 					description: newState.description,
// 					dueDate: makeDueString(newState.dueDate),
// 				});
// 				const shouldUpdateState =
// 					newState.isCompleted !== undefined &&
// 					wasCompleted !== newState.isCompleted;
// 				if (shouldUpdateState) {
// 					if (newState.isCompleted) await this.api.closeTask(id);
// 					else await this.api.reopenTask(id);
// 				}
// 			})()
// 		);
// 		return wasFound;
// 	}
// }

// // Make a string like "2021-01-01" from a Date object.

// const makeDueString = (date: Date | undefined) =>
// 	// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 	date?.toISOString().split('T')[0] as any;

// // Wrap a promise in a 404 check

// function with404Check<T>(
// 	promise: Promise<T>
// ): Promise<{wasFound: true; result: T} | {wasFound: false; result: undefined}> {
// 	return promise
// 		.then(
// 			result =>
// 				({
// 					wasFound: true,
// 					result,
// 				}) as const
// 		)
// 		.catch(e => {
// 			if (
// 				e instanceof TodoistRequestError &&
// 				!e.isAuthenticationError() &&
// 				e.httpStatusCode === 404
// 			)
// 				return {wasFound: false, result: undefined} as const;
// 			else {
// 				throw e;
// 			}
// 		});
// }

export const a = 5;
