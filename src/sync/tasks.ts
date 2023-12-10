// import {NotionTask, NotionTaskMutation} from '../tasks/notion/model';
// import {TodoistTask, TodoistTaskMutation} from '../tasks/todoist/model';

// type DiffResult = {
// 	todoist: {
// 		add: TodoistTaskMutation[];
// 		change: Record<TodoistTask['id'], TodoistTaskMutation[]>;
// 		delete: TodoistTask['id'][];
// 	};
// 	notion: {
// 		add: NotionTaskMutation[];
// 		change: Record<NotionTask['id'], TodoistTaskMutation[]>;
// 	};
// };

// export function diffCandidates(
// 	notion: NotionTask[],
// 	todoist: TodoistTask[]
// ): DiffResult {
// 	const {addT, deleteT, addN} = findXorOperations(notion, todoist);
// 	const {changeT, changeN} = findIntersectingOperations(notion, todoist);
// 	return {
// 		todoist: {
// 			add: addT,
// 			delete: deleteT,
// 			change: changeT,
// 		},
// 		notion: {
// 			add: addN,
// 			change: changeN,
// 		},
// 	};
// }

// // Find the necessary sync operations

// function findXorOperations(notion: NotionTask[], todoist: TodoistTask[]) {
// 	const addT = withoutExistingTodoistId(notion, todoist);
// 	const _unknownInT = notLinkedWithNotion(notion, todoist);
// 	const addN = hasNotSyncedBefore(_unknownInT);
// 	const deleteT = hasSyncedBefore(_unknownInT);
// 	return {
// 		addN: addN.map(todoistToNotion),
// 		addT: addT.map(notionToTodoist),
// 		deleteT: deleteT.map(t => t.id),
// 	};
// }

// function findIntersectingOperations(
// 	notion: NotionTask[],
// 	todoist: TodoistTask[]
// ) {
// 	// TODO: How am I ever gonna make it sync from Todoist to Notion? Perhaps something with webhooks.
// 	const taskToConsider = notion.filter(task => Boolean(task.todoistId));
// 	return {changeT: {}, changeN: {}};
// }

// // Filters

// const withoutExistingTodoistId = (
// 	notion: NotionTask[],
// 	todoist: TodoistTask[]
// ) =>
// 	notion.filter(n => !n.todoistId || !todoist.find(t => t.id === n.todoistId));

// const notLinkedWithNotion = (notion: NotionTask[], todoist: TodoistTask[]) =>
// 	todoist.filter(n => !notion.find(t => t.todoistId === n.id));

// const hasSyncedBefore = (tasks: TodoistTask[]) =>
// 	tasks.filter(t => Boolean(t.description));

// const hasNotSyncedBefore = (tasks: TodoistTask[]) =>
// 	tasks.filter(t => !t.description);

// // Adapters between the different task types

// const notionToTodoist = (notionTask: NotionTask): TodoistTaskMutation => ({
// 	content: notionTask.content,
// 	description: notionTask.projectName,
// 	isCompleted: notionTask.isCompleted,
// 	dueDate: notionTask.scheduled,
// });

// const todoistToNotion = (todoistTask: TodoistTask): NotionTaskMutation => ({
// 	content: todoistTask.content,
// 	isCompleted: todoistTask.isCompleted ?? false,
// 	scheduled: todoistTask.dueDate,
// });
