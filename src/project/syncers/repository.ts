import {TemporaryId, TodoistSyncApi} from '@lib/todoist';
import {NotionGoal, NotionProject, NotionTask} from '@project/notion/models';
import {NotionTaskRepository} from '@project/notion/repositories';
import {NotionProjectRepository} from '@project/notion/repositories/projects';
import {TodoistTaskRepository} from '@project/todoist/repositories';
import {TodoistProjectRepository} from '@project/todoist/repositories/projects';
import {
	ProjectSyncStrategy,
	SyncStrategy,
	Syncer,
	TaskSyncStrategy,
} from '@project/types';

export class RepositorySyncer implements Syncer {
	constructor(
		private notion: NotionRepos,
		private todoist: TodoistRepos,
		private todoistSyncApi: TodoistSyncApi
	) {}

	async sync({projects, tasks}: SyncStrategy) {
		await this.syncNotion(projects.notion, tasks.notion);
		await this.syncTodoist(projects.todoist, tasks.todoist);
	}

	private async syncNotion(
		projects: ProjectSyncStrategy['notion'],
		tasks: TaskSyncStrategy['notion']
	) {}

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

		// Projects

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

		// Linking

		const syncIds = await this.todoistSyncApi.commit();
		if (syncIds)
			for (const [temp, syncId] of syncIds) {
				const item = idMapping[temp];
				if (!item) continue;
				if ('content' in item) await this.notion.tasks.link(item, syncId);
				else if ('goals' in item)
					await this.notion.projects.linkProject(item, syncId);
				else await this.notion.projects.linkGoal(item, syncId);
			}
	}
}

export type NotionRepos = {
	projects: NotionProjectRepository;
	tasks: NotionTaskRepository;
};

export type TodoistRepos = {
	projects: TodoistProjectRepository;
	tasks: TodoistTaskRepository;
};
