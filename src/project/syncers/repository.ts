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
		private todoist: TodoistRepos
	) {}

	async sync({projects, tasks}: SyncStrategy) {
		await this.syncNotion(projects.notion, tasks.notion);
		await this.syncTodoist(projects.todoist, tasks.todoist);
	}

	private async syncNotion(
		projects: ProjectSyncStrategy['notion'],
		tasks: TaskSyncStrategy['notion']
	) {
		// strategy.add.forEach(project => this.notionRepository.addProject(project));
		// strategy.remove.forEach(project => this.notionRepository.removeProject(project));
		// strategy.update.forEach(project => this.notionRepository.updateProject(project));
	}

	private async syncTodoist(
		projects: ProjectSyncStrategy['todoist'],
		tasks: TaskSyncStrategy['todoist']
	) {
		const projectsRepo = this.todoist.projects;

		// Add projects

		for (const project of projects.add) {
			const id = await projectsRepo.addProject(project);
			await this.notion.projects.linkProject(project, id);
		}

		// Remove projects

		for (const project of projects.remove)
			await projectsRepo.removeProject(project);

		// Update projects or goals

		for (const project of projects.update) {
			// Update the project (if it's not just a goal sync)
			if (!project.goals.onlySyncGoals)
				await projectsRepo.updateProject(project);

			// Add goals

			for (const goal of project.goals.add) {
				const id = await projectsRepo.addGoal(goal, project.syncId);
				await this.notion.projects.linkGoal(goal, id);
			}

			// Remove goals

			for (const goal of project.goals.remove)
				await projectsRepo.removeGoal(goal);

			// Update goals
			for (const goal of project.goals.update)
				await projectsRepo.updateGoal(goal);
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
