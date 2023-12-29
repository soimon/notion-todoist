import {Goal, Project} from '@framework/models';
import {TemporaryId, TodoistSyncApi} from '@lib/todoist';
import groupBy from 'object.groupby';
import {TodoistGoal, TodoistProject} from '../models';

const INDICATOR_BLOCKED = '🔒';
const INDICATOR_PAUSED = '⏸';

export class TodoistProjectRepository {
	constructor(
		private api: TodoistSyncApi,
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
			({id, project_id, name}): TodoistGoal => ({
				syncId: id,
				...extractNameAndBlocked(name),
				todoist: {
					projectId: project_id,
				},
			})
		);
	}

	private async fetchProjects() {
		return this.api
			.getProjects()
			.then(p => p.filter(({parent_id}) => parent_id === this.rootProject));
	}

	//-------------------------------------------------------------------------
	// Altering
	//-------------------------------------------------------------------------

	addProject(
		project: Pick<Project, 'name' | 'isBlocked' | 'isPaused'>
	): TemporaryId {
		return this.api.addProject({
			parentId: process.env.TODOIST_PROJECT_ROOT,
			name: applyLockInfo(project),
			viewStyle: 'board',
		});
	}

	removeProject({syncId}: Pick<Project, 'syncId'>): void {
		this.api.deleteProject(syncId);
	}

	updateProject(
		project: Pick<Project, 'syncId' | 'name' | 'isBlocked' | 'isPaused'>
	): void {
		this.api.updateProject(project.syncId, {
			name: applyLockInfo(project),
		});
	}

	addGoal(
		goal: Pick<Goal, 'name' | 'isBlocked' | 'isPaused'>,
		projectId: string
	): TemporaryId {
		return this.api.addSection({
			projectId,
			name: applyLockInfo(goal),
		});
	}

	removeGoal({syncId}: Pick<Goal, 'syncId'>): void {
		this.api.deleteSection(syncId);
	}

	updateGoal(
		goal: Pick<Goal, 'syncId' | 'name' | 'isBlocked' | 'isPaused'>
	): void {
		this.api.updateSection(goal.syncId, {
			name: applyLockInfo(goal),
		});
		// TODO: Implement moving
		// this.syncApi.moveSection(goal.syncId, )
	}
}

const extractNameAndBlocked = (name: string) => {
	const isBlocked = name.startsWith(`${INDICATOR_BLOCKED} `);
	const isPaused = name.startsWith(`${INDICATOR_PAUSED} `);
	const nameWithoutIndicators = name.replace(
		new RegExp(`^(${INDICATOR_BLOCKED}|${INDICATOR_PAUSED}) `),
		''
	);
	return {isBlocked, isPaused, name: nameWithoutIndicators};
};

const applyLockInfo = ({
	name,
	isBlocked,
	isPaused,
}: Pick<TodoistGoal | TodoistProject, 'name' | 'isBlocked' | 'isPaused'>) =>
	isBlocked
		? `${INDICATOR_BLOCKED} ${name}`
		: isPaused
		? `${INDICATOR_PAUSED} ${name}`
		: name;
