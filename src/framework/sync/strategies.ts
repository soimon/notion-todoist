import {ExclusiveKeys, KeyValue} from '@framework/utils/types';
import {Goal, Project, Task} from '../models';

export type SyncStrategy<
	P1 extends Project,
	P2 extends Project,
	T1 extends Task,
	T2 extends Task,
> = {
	projects: ProjectSyncStrategy<P1, P2>;
	tasks: TaskSyncStrategy<T1, T2>;
};

export type ProjectSyncStrategy<
	T1 extends Project,
	T2 extends Project,
> = PlatformProjectSyncStrategy<T1, T2> & PlatformProjectSyncStrategy<T2, T1>;

export type TaskSyncStrategy<
	T1 extends Task,
	T2 extends Task,
> = PlatformTaskSyncStrategy<T1, T2> & PlatformTaskSyncStrategy<T2, T1>;

export type GoalSyncStrategy<G extends Goal> = {
	add: G[];
	remove: Goal[];
	update: G[];
	onlySyncGoals?: boolean;
};

type PlatformProjectSyncStrategy<
	P1 extends Project,
	P2 extends Project,
	G extends Goal = P2['goals'][number],
> = KeyValue<
	ExclusiveKeys<P1, P2>,
	{
		add: P2[];
		remove: Project[];
		update: (Omit<Project, 'goals'> & {goals: GoalSyncStrategy<G>})[];
	}
>;

type PlatformTaskSyncStrategy<T1 extends Task, T2 extends Task> = KeyValue<
	ExclusiveKeys<T1, T2>,
	{
		add: T2[];
		remove: T1[];
		update: T2[];
	}
>;
