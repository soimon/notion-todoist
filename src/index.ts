require('module-alias/register');
import {TodoistApi} from '@doist/todoist-api-typescript';
import {TodoistSyncApi} from '@lib/todoist';
import {Client} from '@notionhq/client';
import {NotionRepository} from '@project/notion/repositories';
import {
	doNothingProjectStrategy,
	doNothingTaskStrategy,
} from '@project/strategies/do-nothing';
import {
	followNotionProjectStrategy,
	followNotionTaskStrategy,
} from '@project/strategies/follow-notion';
import {SyncLogger} from '@project/syncers/logger';
import {TodoistRepository} from '@project/todoist/repositories';
import {SyncStrategy} from '@project/types';
import dotenv from 'dotenv';
import {log} from './framework/utils/dev';
import {RepositorySyncer} from './project/syncers/repository';
dotenv.config();
console.clear();

const SYNC_PROJECTS = true;
const SYNC_TASKS = true;

async function main() {
	// Get data from repositories

	console.log('Connecting to apis...');
	console.time('Elapsed');
	const {notion, todoist} = createRepositories();
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

	sync({projects: projectStrategy, tasks: taskStrategy}, notion, todoist);
}

const createRepositories = () => ({
	notion: new NotionRepository(
		new Client({
			auth: process.env.NOTION_TOKEN,
		}),
		process.env.NOTION_DB_PROJECTS,
		process.env.NOTION_DB_GOALS,
		process.env.NOTION_DB_TASKS
	),
	todoist: new TodoistRepository(
		new TodoistApi(process.env.TODOIST_TOKEN),
		new TodoistSyncApi(process.env.TODOIST_TOKEN),
		process.env.TODOIST_PROJECT_ROOT
	),
});

async function fetchNotion({projects, tasks}: NotionRepository) {
	const notionProjects = await projects.getProjects();
	const notionTasks = await tasks.getSyncCandidates(new Date());
	return {notionProjects, notionTasks};
}

async function fetchTodoist({projects, tasks}: TodoistRepository) {
	const todoistProjects = await projects.getProjects();
	const todoistTasks = await tasks.getSyncCandidates(todoistProjects);
	return {todoistProjects, todoistTasks};
}

function sync(
	strategies: SyncStrategy,
	notion: NotionRepository,
	todoist: TodoistRepository
) {
	log('strategy-projects', strategies.projects);
	log('strategy-tasks', strategies.tasks);

	const syncer = new SyncLogger(new RepositorySyncer(notion, todoist));
	syncer.sync(strategies);
}

main();
