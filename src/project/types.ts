import {GoalSyncStrategy, ProjectSyncService} from '@framework/sync';
import {ProjectSyncStrategy as _ProjectSyncStrategy} from '@framework/sync';
import {NotionGoal, NotionProject} from '@project/notion/models';
import {TodoistGoal, TodoistProject} from '@project/todoist/models';

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

export type GoalSyncStrategizer = (
	notion: NotionGoal[],
	todoist: TodoistGoal[]
) => GoalSyncStrategy;
