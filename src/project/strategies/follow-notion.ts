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
import {NotionGoal, NotionProject, NotionTask} from '@project/notion/models';
import {
	TodoistGoal,
	TodoistProject,
	TodoistTask,
} from '@project/todoist/models';

export const followNotionProjectStrategy: ProjectSyncStrategizer = (
	notion,
	todoist
) => {
	const diff = diffProjects(notion, todoist);
	return {
		notion: {add: [], remove: [], update: []},
		todoist: {
			add: diff.loners.filter(isNotion<NotionProject>),
			remove: diff.loners.filter(isTodoist<TodoistProject>),
			update: applyGoalStrategyAndFilter(
				diff.pairs,
				followNotionGoalStrategy
			).map(({notion, goals}) => ({
				...notion,
				goals,
			})),
		},
	};
};

const followNotionGoalStrategy: GoalSyncStrategizer<NotionGoal> = ({
	loners,
	pairs,
}) => {
	return {
		add: loners.filter(isNotion<NotionGoal>),
		remove: loners.filter(isTodoist<TodoistGoal>),
		update: pairs.filter(p => p.differences.length).map(p => p.notion),
	};
};

export const followNotionTaskStrategy: TaskSyncStrategizer = (
	notion,
	todoist
) => {
	const {loners, pairs} = diffTasks(notion, todoist);
	return {
		notion: {add: [], remove: [], update: []},
		todoist: {
			add: loners.filter(isNotion<NotionTask>),
			remove: loners.filter(isTodoist<TodoistTask>),
			update: pairs.filter(p => p.differences.length).map(p => p.notion),
		},
	};
};
