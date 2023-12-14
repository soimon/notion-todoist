import {GoalSyncStrategizer, ProjectSyncStrategizer} from '@project/types';
import {
	applyGoalStrategyAndFilter,
	diffProjects,
	isNotion,
	isTodoist,
} from './utils';
import {NotionGoal, NotionProject} from '@project/notion/models';
import {TodoistGoal, TodoistProject} from '@project/todoist/models';

export const followNotionProjectStrategy: ProjectSyncStrategizer = (
	notion,
	todoist,
	goalStrategy = followNotionGoalStrategy
) => {
	const diff = diffProjects(notion, todoist);
	return {
		notion: {add: [], remove: [], update: []},
		todoist: {
			add: diff.loners.filter(isNotion<NotionProject>),
			remove: diff.loners.filter(isTodoist<TodoistProject>),
			update: applyGoalStrategyAndFilter(diff.pairs, goalStrategy).map(
				({notion, goals}) => ({
					...notion,
					goals,
				})
			),
		},
	};
};

export const followNotionGoalStrategy: GoalSyncStrategizer = ({
	loners,
	pairs,
}) => {
	return {
		add: loners.filter(isNotion<NotionGoal>),
		remove: loners.filter(isTodoist<TodoistGoal>),
		update: pairs.filter(p => p.differences.length).map(p => p.notion),
	};
};
