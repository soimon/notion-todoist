import {diffProjects, isNotion, isTodoist} from './utils';
import {NotionProject} from '@project/notion/models';
import {TodoistProject} from '@project/todoist/models';
import {ProjectSyncStrategy} from '@project/types';

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
			update: diff.pairs
				.filter(p => p.differences.length)
				.map(p => ({...p.notion, goals: {add: [], remove: [], update: []}})),
		},
	};
}
