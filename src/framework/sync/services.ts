import {Project, Task} from '@framework/models';
import {SyncStrategy} from './strategies';

export interface SyncService<
	S extends SyncStrategy<Project, Project, Task, Task>,
> {
	sync(strategies: S): Promise<void>;
}
