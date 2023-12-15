import {LastSyncInfo} from '@framework/sync';
import {log} from '@framework/utils/dev';
import {ApiTask, ApiTaskEvent, Snapshot} from '@lib/todoist';
import {NotionTask} from '@project/notion/models';
import {TodoistTask} from '@project/todoist/models';
import {TaskSyncStrategizer} from '@project/types';
import {diffTasks, isNotion, isTodoist} from './utils';

export const pickTodoistIfInSnapshotTaskStrategy = (
	notion: NotionTask[],
	todoist: TodoistTask[],
	{date}: Exclude<LastSyncInfo, 'no-last-sync'>,
	{tasks}: Snapshot
): ReturnType<TaskSyncStrategizer> => {
	const {loners, pairs} = diffTasks(notion, todoist);
	log('snapshot-tasks', tasks);

	const deletedInTodoist = new Set(
		tasks.filter(t => t.is_deleted).map(t => t.id)
	);
	const updatedInTodoist = findMutations(
		tasks,
		['updated', 'completed'],
		date,
		deletedInTodoist
	);
	const addedInTodoist = findMutations(
		tasks,
		['added'],
		date,
		deletedInTodoist
	);
	console.log(deletedInTodoist);

	// Deduce

	const onlyFoundInTodoistAndAddedThere = loners
		.filter(isTodoist<TodoistTask>)
		.filter(v => addedInTodoist.has(v.syncId));
	const onlyFoundInNotionButDeletedInTodoist = loners
		.filter(isNotion<NotionTask>)
		.filter(v => deletedInTodoist.has(v.syncId));
	const differentAndUpdatedInTodoist = pairs
		.filter(p => p.differences.length)
		.filter(v => updatedInTodoist.has(v.todoist.syncId))
		.map(p => p.todoist);

	const onlyFoundInNotionAndNotDeletedInTodoist = loners
		.filter(isNotion<NotionTask>)
		.filter(v => !deletedInTodoist.has(v.syncId));
	const onlyFoundInTodoistAndNotAddedInTodoist = loners
		.filter(isTodoist<TodoistTask>)
		.filter(v => !addedInTodoist.has(v.syncId));
	const differentAndNotUpdatedInTodoist = pairs
		.filter(p => p.differences.length)
		.filter(v => !updatedInTodoist.has(v.notion.syncId))
		.map(p => p.notion);

	// Assemble

	return {
		notion: {
			add: onlyFoundInTodoistAndAddedThere,
			remove: onlyFoundInNotionButDeletedInTodoist,
			update: differentAndUpdatedInTodoist,
		},
		todoist: {
			add: onlyFoundInNotionAndNotDeletedInTodoist,
			remove: onlyFoundInTodoistAndNotAddedInTodoist,
			update: differentAndNotUpdatedInTodoist,
		},
	};
};

const findMutations = (
	tasks: ApiTask[],
	property: ApiTaskEvent[],
	date: Date,
	exclude?: Set<string>
) =>
	new Set(
		tasks
			.filter(
				v =>
					property.some(p => happenedAfter(p, date)(v)) &&
					(!exclude || exclude.has(v.id))
			)
			.map(t => t.id)
	);

const happenedAfter =
	(property: ApiTaskEvent, referenceDate: Date) => (task: ApiTask) =>
		task[`${property}_at`]
			? new Date(task[`${property}_at`]) > referenceDate
			: false;
