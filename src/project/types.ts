import {
	GoalSyncStrategy,
	SyncService,
	SyncStrategy as _SyncStrategy,
	ProjectSyncStrategy as _ProjectSyncStrategy,
	TaskSyncStrategy as _TaskSyncStrategy,
} from '@framework/sync';
import {NotionProject, NotionTask} from '@project/notion/models';
import {TodoistProject, TodoistTask} from '@project/todoist/models';
import {GoalDiff} from './strategies/utils';
import {Goal} from '@framework/models';

export type Syncer = SyncService<SyncStrategy>;
export type SyncStrategy = _SyncStrategy<
	NotionProject,
	TodoistProject,
	NotionTask,
	TodoistTask
>;

export type ProjectSyncStrategy = _ProjectSyncStrategy<
	NotionProject,
	TodoistProject
>;
export type TaskSyncStrategy = _TaskSyncStrategy<NotionTask, TodoistTask>;

// Strategizers

export type ProjectSyncStrategizer = (
	notion: NotionProject[],
	todoist: TodoistProject[]
) => ProjectSyncStrategy;

export type GoalSyncStrategizer<G extends Goal> = (
	diff: GoalDiff
) => GoalSyncStrategy<G>;

export type TaskSyncStrategizer = (
	notion: NotionTask[],
	todoist: TodoistTask[]
) => TaskSyncStrategy;
