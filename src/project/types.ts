import {
	GoalSyncStrategy,
	ProjectSyncService,
	ProjectSyncStrategy as _ProjectSyncStrategy,
} from '@framework/sync';
import {NotionProject} from '@project/notion/models';
import {TodoistProject} from '@project/todoist/models';
import {GoalDiff} from './strategies/utils';

export type ProjectSyncer = ProjectSyncService<NotionProject, TodoistProject>;
export type ProjectSyncStrategy = _ProjectSyncStrategy<
	NotionProject,
	TodoistProject
>;

// Strategizers

export type ProjectSyncStrategizer = (
	notion: NotionProject[],
	todoist: TodoistProject[],
	goalStrategy?: GoalSyncStrategizer
) => ProjectSyncStrategy;

export type GoalSyncStrategizer = (diff: GoalDiff) => GoalSyncStrategy;
