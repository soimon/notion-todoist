import {LastSyncInfo} from '@framework/sync';
import {log} from '@framework/utils/dev';
import {
	ApiEvent,
	ApiProject,
	ApiSection,
	ApiTask,
	Snapshot,
} from '@lib/todoist';
import {NotionGoal, NotionProject, NotionTask} from '@project/notion/models';
import {
	TodoistGoal,
	TodoistProject,
	TodoistTask,
} from '@project/todoist/models';
import {
	GoalSyncStrategizer,
	ProjectSyncStrategizer,
	TaskSyncStrategizer,
} from '@project/types';
import {
	applyGoalStrategyAndFilter,
	diffProjects,
	diffTasks,
	isNotion,
	isTodoist,
} from './utils';

export const pickTodoistIfInSnapshotProjectStrategy = (
	notion: NotionProject[],
	todoist: TodoistProject[],
	{date}: Exclude<LastSyncInfo, 'no-last-sync'>,
	{sections}: Snapshot
): ReturnType<ProjectSyncStrategizer> => {
	const diff = diffProjects(notion, todoist);
	log('snapshot-sections', sections);

	const goalsDeletedInTodoist = new Set(
		sections.filter(t => t.is_deleted).map(t => t.id)
	);
	const goalsAddedInTodoist = findMutations(
		sections,
		['added'],
		date,
		goalsDeletedInTodoist
	);

	const projectsWithAddedSections = diff.pairs.filter(p =>
		p.goals.loners.some(g => goalsAddedInTodoist.has(g.syncId))
	);

	return {
		notion: {
			add: [],
			remove: [],
			update: projectsWithAddedSections.map(p => ({
				...p.notion,
				goals: {
					remove: [],
					update: [],
					add: p.goals.loners
						.filter(isTodoist<TodoistGoal>)
						.filter(g => goalsAddedInTodoist.has(g.syncId)),
					onlySyncGoals: true,
				},
			})),
		},
		todoist: {
			add: diff.loners.filter(isNotion<NotionProject>),
			remove: diff.loners.filter(isTodoist<TodoistProject>),
			update: applyGoalStrategyAndFilter(
				diff.pairs,
				pickTodoistIfInSnapshotGoalStrategy(goalsAddedInTodoist)
			).map(({notion, goals}) => ({
				...notion,
				goals,
			})),
		},
	};
};

const pickTodoistIfInSnapshotGoalStrategy =
	(addedInTodoist: Set<string>): GoalSyncStrategizer<NotionGoal> =>
	({loners, pairs}) => {
		return {
			add: loners.filter(isNotion<NotionGoal>),
			remove: loners
				.filter(isTodoist<TodoistGoal>)
				.filter(v => !addedInTodoist.has(v.syncId)),
			update: pairs.filter(p => p.differences.length).map(p => p.notion),
		};
	};

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
	const completedInTodoist = findMutations(
		tasks,
		['completed'],
		date,
		deletedInTodoist
	);
	const addedInTodoist = findMutations(
		tasks,
		['added'],
		date,
		deletedInTodoist
	);

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

	const onlyFoundInNotionAndNotDeletedOrCompletedInTodoist = loners
		.filter(isNotion<NotionTask>)
		.filter(
			v =>
				!v.isCompleted &&
				!deletedInTodoist.has(v.syncId) &&
				!completedInTodoist.has(v.syncId)
		);
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
			add: onlyFoundInNotionAndNotDeletedOrCompletedInTodoist,
			remove: onlyFoundInTodoistAndNotAddedInTodoist,
			update: differentAndNotUpdatedInTodoist,
		},
	};
};

const findMutations = <T extends ApiTask | ApiSection | ApiProject>(
	items: T[],
	property: ApiEvent<T>[],
	date: Date,
	exclude?: Set<string>
) =>
	new Set(
		items
			.filter(
				v =>
					property.some(p => happenedAfter<T>(p, date)(v)) &&
					(!exclude || !exclude.has(v.id))
			)
			.map(i => i.id)
	);

const happenedAfter =
	<T extends ApiTask | ApiSection | ApiProject>(
		property: ApiEvent<T>,
		referenceDate: Date
	) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(item: Record<string, any>) =>
		item[`${property}_at`]
			? new Date(item[`${property}_at`]) > referenceDate
			: false;
