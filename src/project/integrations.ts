import {TodoistSyncApi} from '@lib/todoist';
import {runLogged} from '@lib/utils/dev';
import {Client as NotionClient} from '@notionhq/client';
import {createMutationQueues, MutationQueues} from './mutating';
import {NoteSchema, ProjectSchema} from './mutating/notion';
import {ConfigFileLastSyncInfoStore} from './persistence/configfile';
import {GistLastSyncInfoStore} from './persistence/gist';
import {LastSyncInfo, LastSyncInfoStore} from './persistence/lastsyncinfo';

//--------------------------------------------------------------------------------
// Functions
//--------------------------------------------------------------------------------

export async function connectIntegrations(
	projectSchema: ProjectSchema,
	noteSchema: NoteSchema
): Promise<{
	mutationQueues: MutationQueues;
	integrations: Integrations;
	commit: () => Promise<void>;
}> {
	const {lastSyncInfo, lastSyncInfoStore} = await getLastSyncInformation();
	const notion = initNotion();
	const [todoist, incrementalTodoist] = await runLogged(
		async () => [
			await initTodoist(),
			await initIncrementalTodoist(lastSyncInfo),
		],
		'Fetching from Todoist...',
		'📥'
	);

	const mutationQueues = createMutationQueues(
		todoist,
		notion,
		projectSchema,
		noteSchema
	);

	return {
		mutationQueues,
		integrations: {todoist, incrementalTodoist, notion},
		async commit() {
			const pairs = await mutationQueues.notion.commit();
			mutationQueues.todoist.syncTaskPairs(pairs);
			await mutationQueues.todoist.commit();
			runLogged(
				async () => {
					const token = todoist.getLatestSyncToken();
					if (token) await lastSyncInfoStore.setLastSyncInfo(token);
				},
				'Storing last sync token...',
				'📤'
			);
		},
	};
}

export type Integrations = {
	todoist: TodoistSyncApi;
	incrementalTodoist: TodoistSyncApi;
	notion: NotionClient;
};

const getLastSyncInformation = async () => {
	const lastSyncInfoStore: LastSyncInfoStore = process.env.GIST_PAT
		? new GistLastSyncInfoStore(
				'5cb9abe9d92507f9687bd7ec2c7ce239',
				'last-sync-info.json',
				process.env.GIST_PAT
		  )
		: new ConfigFileLastSyncInfoStore('./last-sync-info.json');
	const lastSyncInfo = await lastSyncInfoStore.getLastSyncInfo(false);
	if (typeof lastSyncInfo !== 'string')
		console.log(
			`Last sync was on ${new Date(lastSyncInfo.date).toLocaleString('en-US', {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
				hour: 'numeric',
				minute: 'numeric',
			})}`
		);
	else console.log(`No sync has previously been performed`);
	return {lastSyncInfo, lastSyncInfoStore};
};

function initNotion() {
	return new NotionClient({
		auth: process.env.NOTION_TOKEN,
	});
}

async function initTodoist() {
	const todoist = new TodoistSyncApi(process.env.TODOIST_TOKEN);
	await todoist.loadAll();
	return todoist;
}

async function initIncrementalTodoist(lastSyncInfo: LastSyncInfo) {
	const todoist = new TodoistSyncApi(process.env.TODOIST_TOKEN);
	if (lastSyncInfo !== 'no-last-sync')
		await todoist.loadDiff(lastSyncInfo.token, ['items']);
	return todoist;
}
