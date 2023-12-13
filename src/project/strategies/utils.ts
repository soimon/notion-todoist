import {diff} from '@framework/sync';
import {NotionProject} from '@project/notion/models';
import {TodoistProject} from '@project/todoist/models';

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

// Filters

export const isNotion = (
	p: NotionProject | TodoistProject
): p is NotionProject => 'notion' in p;
export const isTodoist = (
	p: NotionProject | TodoistProject
): p is TodoistProject => 'todoist' in p;
