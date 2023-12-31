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
			({name, id, child_order}): TodoistProject => ({
				syncId: id,
				...extractNameAndBlocked(name),
				goals: goals[id] ?? [],
				todoist: {
					order: child_order,
				},
			})
		);
	}

	private async getGoals(): Promise<TodoistGoal[]> {
		const sections = await this.api.getSections();
		return sections.map(
			({id, project_id, name, section_order}): TodoistGoal => ({
				syncId: id,
				...extractNameAndBlocked(name),
				todoist: {
					projectId: project_id,
					order: section_order,
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

	addProject(project: Pick<Project, 'name' | 'blockedState'>): TemporaryId {
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
		project: Pick<Project, 'syncId' | 'name' | 'blockedState'>
	): void {
		this.api.updateProject(project.syncId, {
			name: applyLockInfo(project),
		});
	}

	reorderProjects(order: Pick<Project, 'syncId'>[]) {
		this.api.reorderProjects(order.map(({syncId}) => syncId));
	}

	addGoal(
		goal: Pick<Goal, 'name' | 'blockedState'>,
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

	updateGoal(goal: Pick<Goal, 'syncId' | 'name' | 'blockedState'>): void {
		this.api.updateSection(goal.syncId, {
			name: applyLockInfo(goal),
		});
		// TODO: Implement moving
		// this.syncApi.moveSection(goal.syncId, )
	}

	reorderGoals(order: Pick<Goal, 'syncId'>[]) {
		this.api.reorderSections(order.map(({syncId}) => syncId));
	}
}

const extractNameAndBlocked = (
	name: string
): Pick<Project, 'blockedState' | 'name'> => {
	const isBlocked = name.startsWith(`${INDICATOR_BLOCKED} `);
	const isPaused = name.startsWith(`${INDICATOR_PAUSED} `);
	const nameWithoutIndicators = name.replace(
		new RegExp(`^(${INDICATOR_BLOCKED}|${INDICATOR_PAUSED}) `),
		''
	);
	return {
		blockedState: isBlocked ? 'blocked' : isPaused ? 'paused' : 'free',
		name: nameWithoutIndicators,
	};
};

const applyLockInfo = ({
	name,
	blockedState,
}: Pick<TodoistGoal | TodoistProject, 'name' | 'blockedState'>) =>
	blockedState === 'blocked'
		? `${INDICATOR_BLOCKED} ${name}`
		: blockedState === 'paused'
		? `${INDICATOR_PAUSED} ${name}`
		: name;
