import {NotionProjectRepository} from '../repositories/notion/projects';
import {TodoistProjectRepository} from '../repositories/todoist/projects';
import {ProjectSyncStrategy} from './strategies';

export class ProjectSyncService {
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
		for (const project of strategy.add) {
			const id = await this.todoistRepository.addProject(project);
			await this.notionRepository.linkProject(project, id);
		}
		for (const project of strategy.remove)
			await this.todoistRepository.removeProject(project);
		for (const project of strategy.update)
			await this.todoistRepository.updateProject(project);
	}
}
