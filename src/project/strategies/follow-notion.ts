import {GoalSyncStrategizer, ProjectSyncStrategizer} from '@project/types';
import {diffProjects, isNotion, isTodoist} from './utils';

export const followNotionProjectStrategy: ProjectSyncStrategizer = (
	notion,
	todoist,
	goalStrategy = followNotionGoalStrategy
) => {
	const diff = diffProjects(notion, todoist);
	return {
		notion: {add: [], remove: [], update: []},
		todoist: {
			add: diff.loners.filter(isNotion),
			remove: diff.loners.filter(isTodoist),
			update: diff.pairs
				.filter(p => p.differences.length)
				.map(p => ({
					...p.notion,
					goals: goalStrategy(p.notion.goals, p.todoist.goals),
				})),
		},
	};
};

export const followNotionGoalStrategy: GoalSyncStrategizer = (
	notion,
	todoist
) => {
	console.log(notion, todoist);
	return {add: [], remove: [], update: []};
};
