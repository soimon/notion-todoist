import {Project} from '@framework/models';
import {ProjectSyncStrategy} from './strategies';

export interface ProjectSyncService<T1 extends Project, T2 extends Project> {
	sync(strategy: ProjectSyncStrategy<T1, T2>): Promise<void>;
}
