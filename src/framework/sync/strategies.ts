import {ExclusiveKeys, KeyValue} from '@framework/utils/types';
import {Goal, Project} from '../models';

export type ProjectSyncStrategy<
	T1 extends Project,
	T2 extends Project,
> = PlatformSyncStrategy<T1, T2> & PlatformSyncStrategy<T2, T1>;

type PlatformSyncStrategy<
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

export type GoalSyncStrategy<G extends Goal> = {
	add: G[];
	remove: Goal[];
	update: Goal[];
	onlySyncGoals?: boolean;
};
