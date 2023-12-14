import {Goal} from '@framework/models';
import {diff} from '@framework/sync';
import {NotionProject} from '@project/notion/models';
import {TodoistProject} from '@project/todoist/models';
import {GoalSyncStrategizer} from '@project/types';

// Diff projects with their goals included

export function diffProjects(
	notion: NotionProject[],
	todoist: TodoistProject[]
) {
	const {loners, pairs} = diff(notion, todoist, v => v.syncId);
	return {
		loners,
		pairs: pairs.map(project => ({
			...project,
			goals: diff(project.notion.goals, project.todoist.goals, v => v.syncId),
		})),
	};
}
export type GoalDiff = ReturnType<typeof diffProjects>['pairs'][0]['goals'];

// Filters

export const isNotion = <T extends {notion: object}>(p: object): p is T =>
	'notion' in p;
export const isTodoist = <T extends {todoist: object}>(p: object): p is T =>
	'todoist' in p;

export const applyGoalStrategyAndFilter = <G extends Goal>(
	pairs: ReturnType<typeof diffProjects>['pairs'],
	goalStrategizer: GoalSyncStrategizer<G>
) =>
	pairs
		.map(p => ({
			...p,
			goals: {
				...goalStrategizer(p.goals),
				onlySyncGoals: p.differences.length === 0,
			},
		}))
		.filter(
			p =>
				p.differences.length +
				p.goals.add.length +
				p.goals.remove.length +
				p.goals.update.length
		);
