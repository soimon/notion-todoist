import {GoalSyncStrategy} from '@framework/sync';
import {diffProjects, isNotion, isTodoist} from './utils';
import {NotionGoal, NotionProject} from '@project/notion/models';
import {TodoistGoal, TodoistProject} from '@project/todoist/models';
import {
	GoalSyncStrategizer,
	ProjectSyncStrategizer,
	ProjectSyncStrategy,
} from '@project/types';

export const followNotionProjectStrategy: ProjectSyncStrategizer = (
	notion: NotionProject[],
	todoist: TodoistProject[],
	goalStrategy: GoalSyncStrategizer = followNotionGoalStrategy
): ProjectSyncStrategy => {
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
	notion: NotionGoal[],
	todoist: TodoistGoal[]
): GoalSyncStrategy => {
	console.log(notion, todoist);
	return {add: [], remove: [], update: []};
};
