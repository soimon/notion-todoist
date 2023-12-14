require('module-alias/register');
import {TodoistApi} from '@doist/todoist-api-typescript';
import {Client} from '@notionhq/client';
import {followNotionProjectStrategy} from '@project/strategies/follow-notion';
import {ProjectSyncLogger} from '@project/syncers/logger';
import dotenv from 'dotenv';
import {log} from './framework/utils/dev';
import {NotionProjectRepository} from './project/notion/repositories/projects';
import {RepositoryProjectSyncer} from './project/syncers/repository';
import {TodoistProjectRepository} from './project/todoist/repositories/projects';
import {NotionProject} from 'c:/Users/simon/Projects/Lifehacks/integrations/notion-todoist/src/project/notion/models/index';
import {TodoistProject} from '@project/todoist/models';
import {TodoistTaskRepository} from '@project/todoist/repositories';
import {NotionTaskRepository} from '@project/notion/repositories';
dotenv.config();
console.clear();

const SYNC_PROJECTS = false;

async function main() {
	console.log('Connecting to apis...');
	console.time('Elapsed');

	// Get data from repositories

	const {
		notionProjectsRepo,
		todoistProjectsRepo,
		notionTasksRepo,
		todoistTasksRepo,
	} = createRepositories();
	const notionProjects = await notionProjectsRepo.getProjects();
	const todoistProjects = await todoistProjectsRepo.getProjects();
	const notionTasks = await notionTasksRepo.getSyncCandidates(new Date());
	const todoistTasks = await todoistTasksRepo.getSyncCandidates();
	console.timeEnd('Elapsed');

	// Sync projects

	if (SYNC_PROJECTS) {
		syncProjects(
			{notion: notionProjects, todoist: todoistProjects},
			{notion: notionProjectsRepo, todoist: todoistProjectsRepo}
		);
	}

	// Sync tasks
	log('tasks', {notion: notionTasks, todoist: todoistTasks});

	// const todoistTasks = new TodoistTaskRepository(todoist);
	// const notionTasks = new NotionTaskRepository(
	// 	notion,
	// 	process.env.NOTION_DB_TASKS
	// );

	// Fetch notion tasks
	// TODO: Get all potentially out of sync candidates from the Notion side
	// - Tasks that are open, and not in Todoist (closed isn't visible anyway)
	// - Tasks that have recently changed
	// - Tasks that have recently been added
	// This covers the following Notion -> Todoist sync cases:
	// - Task is created in Notion
	// - Task is updated in Notion
	// - Task is closed in Notion
	// - Task is reopened in Notion
	// - Task is scheduled in Notion
	// - Task is unscheduled in Notion
	// - Task is moved to a different goal in Notion
	// This doesn't cover the following sync cases:
	// - Task is deleted in Notion
	// - Task is moved to a different project in Notion
	// - Goal or project properties have changed
	// So in order to cover those cases, we need to also:
	// - Get all open tasks from Todoist (to see if they're not deleted)

	// const notionCandidates = await notionTasks.getSyncCandidates(new Date());
	// const todoistCandidates = await todoistTasks.getSyncCandidates();
	// const diff = diffCandidates(notionCandidates, todoistCandidates);
	// console.log(diff.notion);

	// Update tasks in Todoist

	// for (const notionTask of changedTasks) {
	// 	const wasFound = await todoistTasks.update(notionTask.todoistId, {
	// 		content: notionTask.content,
	// 		description: notionTask.projectName,
	// 		isCompleted: notionTask.isCompleted,
	// 		dueDate: notionTask.scheduled,
	// 	});
	// 	if (!wasFound) newTasks.push(notionTask);
	// }

	// // Create tasks in Todoist

	// newTasks.forEach(async t => {
	// 	const todoistId = await todoistTasks.add({
	// 		content: t.content,
	// 		description: t.projectName,
	// 		dueDate: t.scheduled,
	// 	});
	// 	await notionTasks.linkWithTodoist(t.notionId, todoistId);
	// });
}

main();

function createRepositories() {
	// Connect to apis

	const notion = new Client({
		auth: process.env.NOTION_TOKEN,
	});
	const todoist = new TodoistApi(process.env.TODOIST_TOKEN);

	// Create repositories

	const todoistProjectsRepo = new TodoistProjectRepository(
		todoist,
		process.env.TODOIST_PROJECT_ROOT
	);
	const notionProjectsRepo = new NotionProjectRepository(
		notion,
		process.env.NOTION_DB_PROJECTS,
		process.env.NOTION_DB_GOALS
	);
	const notionTasksRepo = new NotionTaskRepository(
		notion,
		process.env.NOTION_DB_TASKS
	);
	const todoistTasksRepo = new TodoistTaskRepository(todoist);

	return {
		notionProjectsRepo,
		todoistProjectsRepo,
		notionTasksRepo,
		todoistTasksRepo,
	};
}

function syncProjects(
	projects: {notion: NotionProject[]; todoist: TodoistProject[]},
	repos: {notion: NotionProjectRepository; todoist: TodoistProjectRepository}
) {
	const projectStrategy = followNotionProjectStrategy(
		projects.notion,
		projects.todoist
	);
	log('strategy-project', projectStrategy);

	const projectSyncer = new ProjectSyncLogger(
		new RepositoryProjectSyncer(repos.notion, repos.todoist)
	);
	projectSyncer.sync(projectStrategy);
}
