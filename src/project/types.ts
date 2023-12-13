import {ProjectSyncService} from '@framework/sync';
import {ProjectSyncStrategy as _ProjectSyncStrategy} from '@framework/sync';
import {NotionProject} from '@project/notion/models';
import {TodoistProject} from '@project/todoist/models';

export type ProjectSyncer = ProjectSyncService<NotionProject, TodoistProject>;
export type ProjectSyncStrategy = _ProjectSyncStrategy<
	NotionProject,
	TodoistProject
>;
