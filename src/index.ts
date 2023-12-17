require('module-alias/register');
import {LastSyncInfoStore} from '@framework/sync';
import {TodoistSyncApi} from '@lib/todoist';
import {Client} from '@notionhq/client';
import {NotionRepository} from '@project/notion/repositories';
import {GistLastSyncInfoStore} from '@project/persistence/gist';
import {
	doNothingProjectStrategy,
	doNothingTaskStrategy,
} from '@project/strategies/do-nothing';
import {
	followNotionProjectStrategy,
	followNotionTaskStrategy,
} from '@project/strategies/follow-notion';
import {pickTodoistIfInSnapshotTaskStrategy} from '@project/strategies/pick-todoist-if-in-snapshot';
import {SyncLogger} from '@project/syncers/logger';
import {TodoistRepository} from '@project/todoist/repositories';
import {SyncStrategy} from '@project/types';
import dotenv from 'dotenv';
import {log} from './framework/utils/dev';
import {RepositorySyncer} from './project/syncers/repository';
import {ConfigFileLastSyncInfoStore} from '@project/persistence/configfile';
dotenv.config();
console.clear();

const SYNC_PROJECTS = false;
const SYNC_TASKS = false;
const SYNC_FORCE_FULL = false;

async function main() {
	// Sync info

	const lastSyncInfoStore: LastSyncInfoStore = process.env.GIST_PAT
		? new GistLastSyncInfoStore(
				'5cb9abe9d92507f9687bd7ec2c7ce239',
				'last-sync-info.json',
				process.env.GIST_PAT
		  )
		: new ConfigFileLastSyncInfoStore('./last-sync-info.json');
	const lastSyncInfo = await lastSyncInfoStore.getLastSyncInfo(SYNC_FORCE_FULL);

	if (typeof lastSyncInfo !== 'string')
		console.log(`Last sync: ${lastSyncInfo.date}`);
	else console.log(`Performing full sync`);

	// Get data from repositories

	console.log('\nConnecting to apis...');
	console.time('Elapsed');
	const {notion, todoist} = createRepositories();
	console.timeEnd('Elapsed');

	console.log('\nFetching data...');
	console.time('Elapsed');
	const [
		{projects: notionProjects, tasks: notionTasks},
		{projects: todoistProjects, tasks: todoistTasks},
	] = await Promise.all([
		notion.fetchSyncCandidates(lastSyncInfo),
		todoist.fetchSyncCandidates(lastSyncInfo),
	]);

	const lastTodoistSnapshot = todoist.getLatestSnapshot();
	console.timeEnd('Elapsed');

	// Determine stategies

	const projectStrategy = SYNC_PROJECTS
		? followNotionProjectStrategy(notionProjects, todoistProjects)
		: doNothingProjectStrategy(notionProjects, todoistProjects);
	const taskStrategy = SYNC_TASKS
		? lastSyncInfo === 'no-last-sync' || !lastTodoistSnapshot
			? followNotionTaskStrategy(notionTasks, todoistTasks)
			: pickTodoistIfInSnapshotTaskStrategy(
					notionTasks,
					todoistTasks,
					lastSyncInfo,
					lastTodoistSnapshot
			  )
		: doNothingTaskStrategy(notionTasks, todoistTasks);

	// Sync projects

	await sync({projects: projectStrategy, tasks: taskStrategy}, notion, todoist);

	// Store sync info

	const token = await todoist.getLastSyncToken();
	if (token) await lastSyncInfoStore.setLastSyncInfo(token);
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
		new TodoistSyncApi(process.env.TODOIST_TOKEN),
		process.env.TODOIST_PROJECT_ROOT
	),
});

async function sync(
	strategies: SyncStrategy,
	notion: NotionRepository,
	todoist: TodoistRepository
) {
	log('strategy-projects', strategies.projects);
	log('strategy-tasks', strategies.tasks);

	const syncer = new SyncLogger(new RepositorySyncer(notion, todoist));
	await syncer.sync(strategies);
}

main();
