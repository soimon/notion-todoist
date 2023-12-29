import {TemporaryId} from '@lib/todoist';
import {NotionGoal, NotionProject, NotionTask} from '@project/notion/models';
import {NotionRepository} from '@project/notion/repositories';
import {TodoistGoal, TodoistProject} from '@project/todoist/models';
import {TodoistRepository} from '@project/todoist/repositories';
import {
	ProjectSyncStrategy,
	SyncStrategy,
	Syncer,
	TaskSyncStrategy,
} from '@project/types';
import {GOAL_PREFIX, PROJECT_PREFIX} from './logger';

export class RepositorySyncer implements Syncer {
	constructor(
		private notion: NotionRepository,
		private todoist: TodoistRepository
	) {}

	async sync({projects, tasks}: SyncStrategy) {
		await this.syncNotion(projects.notion, tasks.notion);
		await this.syncTodoist(projects.todoist, tasks.todoist);
	}

	//--------------------------------------------------------------------------
	// Notion syncing
	//--------------------------------------------------------------------------

	private async syncNotion(
		projects: ProjectSyncStrategy['notion'],
		tasks: TaskSyncStrategy['notion']
	) {
		// Projects

		for (const project of projects.update)
			for (const goal of project.goals.add)
				await this.notion.projects.addGoal(goal, project.syncId);

		// Tasks

		for (const task of tasks.add) await this.notion.tasks.add(task);
		for (const task of tasks.update) await this.notion.tasks.update(task);
		for (const task of tasks.remove) await this.notion.tasks.remove(task);
	}

	//--------------------------------------------------------------------------
	// Todoist syncing
	//--------------------------------------------------------------------------

	private async syncTodoist(
		projects: ProjectSyncStrategy['todoist'],
		tasks: TaskSyncStrategy['todoist']
	) {
		const [p, t] = [this.todoist.projects, this.todoist.tasks];
		const idMapping: Record<
			TemporaryId,
			NotionProject | NotionGoal | NotionTask
		> = {};
		const goalIdMapping: Record<NotionGoal['notion']['id'], TemporaryId> = {};

		// Tasks

		for (const task of remapGoals(tasks.add)) idMapping[t.add(task)] = task;
		for (const task of remapGoals(tasks.update)) t.update(task);
		for (const task of tasks.remove) t.remove(task);

		function remapGoals(tasks: NotionTask[]) {
			return tasks.map(t => ({
				...t,
				goalSyncId: goalIdMapping[t.notion.goalId] ?? t.goalSyncId,
			}));
		}

		// Projects

		for (const project of projects.update) {
			if (!project.goals.onlySyncGoals) p.updateProject(project);

			// Goals

			for (const goal of project.goals.add) {
				const tempId = p.addGoal(goal, project.syncId);
				goalIdMapping[goal.notion.id] = tempId;
				idMapping[tempId] = goal;
			}
			for (const goal of project.goals.remove) p.removeGoal(goal);
			for (const goal of project.goals.update) p.updateGoal(goal);
		}

		for (const project of projects.add) {
			const tempId = p.addProject(project);
			idMapping[tempId] = project;
			for (const goal of project.goals) {
				const tempGoalId = p.addGoal(goal, tempId);
				goalIdMapping[goal.notion.id] = tempGoalId;
				idMapping[tempGoalId] = goal;
			}
		}

		for (const project of projects.remove) p.removeProject(project);

		// Linking

		const syncIds = await this.todoist.commit();

		if (syncIds)
			for (const [temp, syncId] of syncIds) {
				const item = idMapping[temp];
				if (!item) continue;
				if ('content' in item) await this.notion.tasks.link(item, syncId);
				else if ('goals' in item)
					await this.notion.projects.linkProject(item, syncId);
				else await this.notion.projects.linkGoal(item, syncId);
			}

		// Sorting
		await this.sortTodoist();
	}

	private async sortTodoist() {
		const lastToken = await this.todoist.getLastSyncToken();
		const {projects} = await this.todoist.fetchSyncCandidates(
			lastToken
				? {
						token: lastToken,
						date: new Date(),
				  }
				: 'no-last-sync'
		);
		projects.sort((a, b) => a.todoist.order - b.todoist.order);

		const correctProjectOrder = [...projects].sort(sortTodoistProjectsAndGoals);
		const projectOrderHasChanged = correctProjectOrder.some(
			(p, i) => p.syncId !== projects[i]?.syncId
		);

		if (projectOrderHasChanged) {
			console.log(`${PROJECT_PREFIX}Reordering projects`);
			this.todoist.projects.reorderProjects(correctProjectOrder);
		}

		for (const {name, goals} of projects) {
			goals.sort((a, b) => a.todoist.order - b.todoist.order);
			const correctGoalOrder = [...goals].sort(sortTodoistProjectsAndGoals);
			const goalOrderHasChanged = correctGoalOrder.some(
				(g, i) => g.syncId !== goals[i]?.syncId
			);

			if (goalOrderHasChanged) {
				console.log(`${GOAL_PREFIX}Reordering goals of "${name}"`);
				this.todoist.projects.reorderGoals(correctGoalOrder);
			}
		}

		await this.todoist.commit();
	}
}

export const sortTodoistProjectsAndGoals = (
	a: TodoistProject | TodoistGoal,
	b: TodoistProject | TodoistGoal
) => {
	if (a.blockedState === 'free' && b.blockedState !== 'free') return -1;
	if (a.blockedState !== 'free' && b.blockedState === 'free') return 1;
	if (a.blockedState === 'paused' && b.blockedState === 'blocked') return -1;
	if (a.blockedState === 'blocked' && b.blockedState === 'paused') return 1;
	if (a.todoist.order < b.todoist.order) return -1;
	if (a.todoist.order > b.todoist.order) return 1;
	return 0;
};
