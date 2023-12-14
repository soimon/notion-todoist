import {NotionProjectRepository} from '@project/notion/repositories/projects';
import {TodoistProjectRepository} from '@project/todoist/repositories/projects';
import {ProjectSyncStrategy, ProjectSyncer} from '@project/types';

export class RepositoryProjectSyncer implements ProjectSyncer {
	constructor(
		private notionRepository: NotionProjectRepository,
		private todoistRepository: TodoistProjectRepository
	) {}

	async sync(strategy: ProjectSyncStrategy) {
		await this.syncNotion(strategy.notion);
		await this.syncTodoist(strategy.todoist);
	}

	private async syncNotion(strategy: ProjectSyncStrategy['notion']) {
		// strategy.add.forEach(project => this.notionRepository.addProject(project));
		// strategy.remove.forEach(project => this.notionRepository.removeProject(project));
		// strategy.update.forEach(project => this.notionRepository.updateProject(project));
	}

	private async syncTodoist(strategy: ProjectSyncStrategy['todoist']) {
		// Add projects

		for (const project of strategy.add) {
			const id = await this.todoistRepository.addProject(project);
			await this.notionRepository.linkProject(project, id);
		}

		// Remove projects

		for (const project of strategy.remove)
			await this.todoistRepository.removeProject(project);

		// Update projects or goals

		for (const project of strategy.update) {
			// Update the project (if it's not just a goal sync)
			if (!project.goals.onlySyncGoals)
				await this.todoistRepository.updateProject(project);

			// Add goals

			for (const goal of project.goals.add) {
				const id = await this.todoistRepository.addGoal(goal, project.syncId);
				await this.notionRepository.linkGoal(goal, id);
			}

			// Remove goals

			for (const goal of project.goals.remove)
				await this.todoistRepository.removeGoal(goal);

			// Update goals
			for (const goal of project.goals.update)
				await this.todoistRepository.updateGoal(goal);
		}
	}
}
