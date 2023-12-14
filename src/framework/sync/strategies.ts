import {ExclusiveKeys, KeyValue} from '@framework/utils/types';
import {Goal, Project} from '../models';

export type ProjectSyncStrategy<
	T1 extends Project,
	T2 extends Project,
> = PlatformSyncStrategy<T1, T2> & PlatformSyncStrategy<T2, T1>;

type PlatformSyncStrategy<T1 extends Project, T2 extends Project> = KeyValue<
	ExclusiveKeys<T1, T2>,
	{
		add: T2[];
		remove: Project[];
		update: (Omit<Project, 'goals'> & {goals: GoalSyncStrategy})[];
	}
>;

export type GoalSyncStrategy = {
	add: Goal[];
	remove: Goal[];
	update: Goal[];
	onlySyncGoals?: boolean;
};
