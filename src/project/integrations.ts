import {TodoistSyncApi} from '@lib/todoist';
import {runLogged} from '@lib/utils/dev';
import {Client as NotionClient} from '@notionhq/client';
import {Uploader} from './files/uploader';
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
	commit: (logOnly: boolean) => Promise<void>;
}> {
	const {lastSyncInfo, lastSyncInfoStore} = await getLastSyncInformation();
	const uploader = initUploader();
	const notion = initNotion();
	const todoist = await runLogged(
		() => initTodoist(lastSyncInfo),
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
		integrations: {todoist, notion, uploader},
		async commit(logOnly = false) {
			if (logOnly) {
				mutationQueues.notion.log();
				mutationQueues.todoist.log();
			} else {
				const pairs = await mutationQueues.notion.commit();
				mutationQueues.todoist.syncTaskPairs(pairs);
				await mutationQueues.todoist.commit();
			}
			await runLogged(
				async () => {
					const token = todoist.getLatestSyncToken();
					if (token && !logOnly) await lastSyncInfoStore.setLastSyncInfo(token);
				},
				logOnly
					? 'Retrieving last sync token...'
					: 'Storing last sync token...',
				'📤'
			);
		},
	};
}

export type Integrations = {
	todoist: TodoistSyncApi;
	notion: NotionClient;
	uploader: Uploader;
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

async function initTodoist(lastSyncInfo: LastSyncInfo) {
	const todoist = new TodoistSyncApi(process.env.TODOIST_TOKEN);
	await todoist.load({
		sinceToken: lastSyncInfo == 'no-last-sync' ? undefined : lastSyncInfo.token,
	});
	return todoist;
}

function initUploader() {
	return new Uploader();
}
