import {TodoistApi} from '@doist/todoist-api-typescript';
import {Goal, Project} from '@framework/models';
import {TemporaryId, TodoistSyncApi} from '@lib/todoist';
import groupBy from 'object.groupby';
import {TodoistGoal, TodoistProject} from '../models';

export class TodoistProjectRepository {
	constructor(
		private api: TodoistApi,
		private syncApi: TodoistSyncApi,
		private rootProject: string
	) {}

	//-------------------------------------------------------------------------
	// Fetching
	//-------------------------------------------------------------------------

	async getProjects(): Promise<TodoistProject[]> {
		const projects = await this.fetchProjects();
		const goals = await this.getGoals().then(g =>
			groupBy(g, ({todoist}) => todoist.projectId)
		);
		return projects.map(
			({name, id}): TodoistProject => ({
				syncId: id,
				...extractNameAndBlocked(name),
				goals: goals[id] ?? [],
				todoist: {},
			})
		);
	}

	private async getGoals(): Promise<TodoistGoal[]> {
		const sections = await this.api.getSections();
		return sections.map(
			({id, projectId, name}): TodoistGoal => ({
				syncId: id,
				...extractNameAndBlocked(name),
				todoist: {
					projectId,
				},
			})
		);
	}

	private async fetchProjects() {
		return this.api
			.getProjects()
			.then(p => p.filter(p => p.parentId === this.rootProject));
	}

	//-------------------------------------------------------------------------
	// Altering
	//-------------------------------------------------------------------------

	addProject(project: Pick<Project, 'name' | 'isBlocked'>): TemporaryId {
		return this.syncApi.addProject({
			parentId: process.env.TODOIST_PROJECT_ROOT,
			name: applyLockInfo(project.name, project.isBlocked),
			viewStyle: 'board',
		});
	}

	removeProject({syncId}: Pick<Project, 'syncId'>): void {
		this.syncApi.deleteProject(syncId);
	}

	updateProject(project: Pick<Project, 'syncId' | 'name' | 'isBlocked'>): void {
		this.syncApi.updateProject(project.syncId, {
			name: applyLockInfo(project.name, project.isBlocked),
		});
	}

	addGoal(
		goal: Pick<Goal, 'name' | 'isBlocked'>,
		projectId: string
	): TemporaryId {
		return this.syncApi.addSection({
			projectId,
			name: applyLockInfo(goal.name, goal.isBlocked),
		});
	}

	removeGoal({syncId}: Pick<Goal, 'syncId'>): void {
		this.syncApi.deleteSection(syncId);
	}

	updateGoal(goal: Pick<Goal, 'syncId' | 'name' | 'isBlocked'>): void {
		this.syncApi.updateSection(goal.syncId, {
			name: applyLockInfo(goal.name, goal.isBlocked),
		});
		// TODO: Implement moving
		// this.syncApi.moveSection(goal.syncId, )
	}
}

const extractNameAndBlocked = (name: string) => {
	const isBlocked = name.startsWith('🔒 ');
	const nameWithoutLock = name.replace(/^🔒 /, '');
	return {isBlocked, name: nameWithoutLock};
};

const applyLockInfo = (name: string, isBlocked: boolean) =>
	isBlocked ? `🔒 ${name}` : name;
