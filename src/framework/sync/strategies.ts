import {NotionProject} from '@project/notion/models';
import {TodoistProject} from '@project/todoist/models';
import {Project} from '../models';
import {diff} from '../utils/diffing';

export type ProjectSyncStrategy = {
	notion: {
		add: TodoistProject[];
		remove: Project[];
		update: Project[];
	};
	todoist: {
		add: NotionProject[];
		remove: Project[];
		update: Project[];
	};
};

export function makeProjectSyncStrategy(
	notion: NotionProject[],
	todoist: TodoistProject[]
): ProjectSyncStrategy {
	const diff = diffProjects(notion, todoist);
	return {
		notion: {add: [], remove: [], update: []},
		todoist: {
			add: diff.loners.filter(isNotion),
			remove: diff.loners.filter(isTodoist),
			update: diff.pairs.filter(p => p.differences.length).map(p => p.notion),
		},
	};
}

function diffProjects(notion: NotionProject[], todoist: TodoistProject[]) {
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

const isNotion = (p: NotionProject | TodoistProject): p is NotionProject =>
	'notion' in p;
const isTodoist = (p: NotionProject | TodoistProject): p is TodoistProject =>
	'todoist' in p;
