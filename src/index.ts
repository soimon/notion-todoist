require('module-alias/register');
import {TodoistApi} from '@doist/todoist-api-typescript';
import {Client} from '@notionhq/client';
import {NotionTaskRepository} from '@project/notion/repositories';
import {
	doNothingProjectStrategy,
	doNothingTaskStrategy,
} from '@project/strategies/do-nothing';
import {
	followNotionProjectStrategy,
	followNotionTaskStrategy,
} from '@project/strategies/follow-notion';
import {SyncLogger} from '@project/syncers/logger';
import {NotionRepos, TodoistRepos} from '@project/syncers/repository';
import {TodoistTaskRepository} from '@project/todoist/repositories';
import {SyncStrategy} from '@project/types';
import dotenv from 'dotenv';
import {log} from './framework/utils/dev';
import {NotionProjectRepository} from './project/notion/repositories/projects';
import {RepositorySyncer} from './project/syncers/repository';
import {TodoistProjectRepository} from './project/todoist/repositories/projects';
import {TodoistSyncApi} from '@lib/todoist';
dotenv.config();
console.clear();

const SYNC_PROJECTS = true;
const SYNC_TASKS = true;

async function main() {
	// Get data from repositories

	console.log('Connecting to apis...');
	console.time('Elapsed');
	const {notion, todoist, todoistSyncApi} = createRepositories();
	console.timeEnd('Elapsed');

	console.log('\nFetching data...');
	console.time('Elapsed');
	const [{notionProjects, notionTasks}, {todoistProjects, todoistTasks}] =
		await Promise.all([fetchNotion(notion), fetchTodoist(todoist)]);
	console.timeEnd('Elapsed');

	// Determine stategies

	const projectStrategy = !SYNC_PROJECTS
		? doNothingProjectStrategy(notionProjects, todoistProjects)
		: followNotionProjectStrategy(notionProjects, todoistProjects);
	const taskStrategy = !SYNC_TASKS
		? doNothingTaskStrategy(notionTasks, todoistTasks)
		: followNotionTaskStrategy(notionTasks, todoistTasks);

	// Sync projects

	sync(
		{projects: projectStrategy, tasks: taskStrategy},
		notion,
		todoist,
		todoistSyncApi
	);
}

main();

function createRepositories(): {
	notion: NotionRepos;
	todoist: TodoistRepos;
	todoistSyncApi: TodoistSyncApi;
} {
	const notionApi = new Client({
		auth: process.env.NOTION_TOKEN,
	});
	const todoistApi = new TodoistApi(process.env.TODOIST_TOKEN);
	const todoistSyncApi = new TodoistSyncApi(process.env.TODOIST_TOKEN);

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
				todoistSyncApi,
				process.env.TODOIST_PROJECT_ROOT
			),
			tasks: new TodoistTaskRepository(todoistApi, todoistSyncApi),
		},
		todoistSyncApi: todoistSyncApi,
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
	todoist: TodoistRepos,
	todoistSyncApi: TodoistSyncApi
) {
	log('strategy-projects', strategies.projects);
	log('strategy-tasks', strategies.tasks);

	const syncer = new SyncLogger(
		new RepositorySyncer(notion, todoist, todoistSyncApi)
	);
	syncer.sync(strategies);
}
