import {Project, Task} from '@framework/models';
import {ProjectSyncStrategy, TaskSyncStrategy} from './strategies';

export interface ProjectSyncService<T1 extends Project, T2 extends Project> {
	sync(strategy: ProjectSyncStrategy<T1, T2>): Promise<void>;
}
export interface TaskSyncService<T1 extends Task, T2 extends Task> {
	sync(strategy: TaskSyncStrategy<T1, T2>): Promise<void>;
}
