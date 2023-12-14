import {TodoistApi} from '@doist/todoist-api-typescript';
import {TodoistGoal, TodoistProject} from '../models';
import groupBy from 'object.groupby';
import {Project} from '@framework/models';

export class TodoistProjectRepository {
	constructor(
		private api: TodoistApi,
		private rootProject: string
	) {}

	// Fetching

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
		return await this.api
			.getProjects()
			.then(p => p.filter(p => p.parentId === this.rootProject));
	}

	// Altering

	async addProject(
		project: Pick<Project, 'name' | 'isBlocked'>
	): Promise<string> {
		const {id} = await this.api.addProject({
			parentId: process.env.TODOIST_PROJECT_ROOT,
			name: applyLockInfo(project.name, project.isBlocked),
			viewStyle: 'board',
		});
		return id;
	}

	async removeProject({syncId}: Pick<Project, 'syncId'>): Promise<boolean> {
		return this.api.deleteProject(syncId);
	}

	async updateProject(
		project: Pick<Project, 'syncId' | 'name' | 'isBlocked'>
	): Promise<void> {
		await this.api.updateProject(project.syncId, {
			name: applyLockInfo(project.name, project.isBlocked),
		});
	}

	async addGoal(
		goal: Pick<Project, 'name' | 'isBlocked'>,
		projectId: string
	): Promise<string> {
		const {id} = await this.api.addSection({
			projectId,
			name: applyLockInfo(goal.name, goal.isBlocked),
		});
		return id;
	}

	async removeGoal({syncId}: Pick<Project, 'syncId'>): Promise<boolean> {
		return this.api.deleteSection(syncId);
	}

	async updateGoal(
		goal: Pick<Project, 'syncId' | 'name' | 'isBlocked'>
	): Promise<void> {
		await this.api.updateSection(goal.syncId, {
			name: applyLockInfo(goal.name, goal.isBlocked),
		});
	}

	/**
	 * Deletes all projects.
	 */

	async deleteAllProjects() {
		const projects = await this.fetchProjects();
		for (const project of projects) {
			await this.api.deleteProject(project.id);
		}
	}
}

const extractNameAndBlocked = (name: string) => {
	const isBlocked = name.startsWith('🔒 ');
	const nameWithoutLock = name.replace(/^🔒 /, '');
	return {isBlocked, name: nameWithoutLock};
};

const applyLockInfo = (name: string, isBlocked: boolean) =>
	isBlocked ? `🔒 ${name}` : name;