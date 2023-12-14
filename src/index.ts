require('module-alias/register');
import {TodoistApi} from '@doist/todoist-api-typescript';
import {Client} from '@notionhq/client';
import {NotionTaskRepository} from '@project/notion/repositories';
import {
	doNothingProjectStrategy,
	doNothingTaskStrategy,
} from '@project/strategies/do-nothing';
import {followNotionProjectStrategy} from '@project/strategies/follow-notion';
import {SyncLogger} from '@project/syncers/logger';
import {TodoistTaskRepository} from '@project/todoist/repositories';
import {
	ProjectSyncStrategy,
	SyncStrategy,
	TaskSyncStrategy,
} from '@project/types';
import dotenv from 'dotenv';
import {log} from './framework/utils/dev';
import {NotionProjectRepository} from './project/notion/repositories/projects';
import {RepositorySyncer} from './project/syncers/repository';
import {TodoistProjectRepository} from './project/todoist/repositories/projects';
import {NotionRepos, TodoistRepos} from '@project/syncers/repository';
dotenv.config();
console.clear();

const SYNC_PROJECTS = false;

async function main() {
	console.log('Connecting to apis...');
	console.time('Elapsed');

	// Get data from repositories

	const {notion, todoist} = createRepositories();
	const [{notionProjects, notionTasks}, {todoistProjects, todoistTasks}] =
		await Promise.all([fetchNotion(notion), fetchTodoist(todoist)]);
	console.timeEnd('Elapsed');

	// Determine stategies

	const projectStrategy = SYNC_PROJECTS
		? doNothingProjectStrategy(notionProjects, todoistProjects)
		: followNotionProjectStrategy(notionProjects, todoistProjects);
	const taskStrategy = doNothingTaskStrategy(notionTasks, todoistTasks);

	// Sync projects

	sync({projects: projectStrategy, tasks: taskStrategy}, notion, todoist);

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

function createRepositories(): {notion: NotionRepos; todoist: TodoistRepos} {
	const notionApi = new Client({
		auth: process.env.NOTION_TOKEN,
	});
	const todoistApi = new TodoistApi(process.env.TODOIST_TOKEN);

	return {
		notion: {
			projects: new NotionProjectRepository(
				notionApi,
				process.env.NOTION_DB_PROJECTS,
				process.env.NOTION_DB_GOALS
			),
			tasks: new NotionTaskRepository(notionApi, process.env.NOTION_DB_TASKS),
		},
		todoist: {
			projects: new TodoistProjectRepository(
				todoistApi,
				process.env.TODOIST_PROJECT_ROOT
			),
			tasks: new TodoistTaskRepository(todoistApi),
		},
	};
}

async function fetchNotion({projects, tasks}: NotionRepos) {
	const notionProjects = await projects.getProjects();
	const notionTasks = await tasks.getSyncCandidates(new Date());
	return {notionProjects, notionTasks};
}

async function fetchTodoist({projects, tasks}: TodoistRepos) {
	const todoistProjects = await projects.getProjects();
	const todoistTasks = await tasks.getSyncCandidates(todoistProjects);
	return {todoistProjects, todoistTasks};
}

function sync(
	strategies: SyncStrategy,
	notion: NotionRepos,
	todoist: TodoistRepos
) {
	log('strategy-projects', strategies.projects);
	log('strategy-tasks', strategies.tasks);

	const syncer = new SyncLogger(new RepositorySyncer(notion, todoist));
	syncer.sync(strategies);
}
