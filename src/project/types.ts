import {
	GoalSyncStrategy,
	ProjectSyncService,
	ProjectSyncStrategy as _ProjectSyncStrategy,
} from '@framework/sync';
import {NotionProject} from '@project/notion/models';
import {TodoistProject} from '@project/todoist/models';
import {GoalDiff} from './strategies/utils';
import {Goal} from '@framework/models';

export type ProjectSyncer = ProjectSyncService<NotionProject, TodoistProject>;
export type ProjectSyncStrategy = _ProjectSyncStrategy<
	NotionProject,
	TodoistProject
>;

// Strategizers

export type ProjectSyncStrategizer = (
	notion: NotionProject[],
	todoist: TodoistProject[]
) => ProjectSyncStrategy;

export type GoalSyncStrategizer<G extends Goal> = (
	diff: GoalDiff
) => GoalSyncStrategy<G>;
