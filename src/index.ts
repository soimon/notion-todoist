require('module-alias/register');
import {Color} from '@lib/todoist';
import {runLogged} from '@lib/utils/dev';
import {isNotionClientError} from '@notionhq/client';
import {connectIntegrations} from '@project/integrations';
import {NoteSchema, ProjectSchema} from '@project/mutating/notion';
import {createLabelSyncer} from '@project/sync-labels';
import {createNoteSyncer} from '@project/sync-notes';
import {createProjectSyncer} from '@project/sync-projects';
import {createTaskSyncer} from '@project/sync-tasks';
import {config as configDotEnv} from 'dotenv';
configDotEnv();

//--------------------------------------------------------------------------------
// Configuration
//--------------------------------------------------------------------------------

const DEV_ONLY_SYNC_TEST_AREA = !!process.env.DEV;
const DEV_LOG_ONLY = process.argv.includes('--log-only');
const DEV_REHASH_ALL_TODOIST_TASKS = process.argv.includes('--rehash-todoist');

const projectSchema: ProjectSchema = {
	database: process.env.NOTION_DB_PROJECTS,
	fields: {
		archivedState: 'GNpW',
		isPostponed: '%3A%3FZe',
		isScheduled: 'uSRZ',
		parent: '%7CjQZ',
		areas: 'fdjt',
		place: 'QCy%7B',
		people: 'F%7DnR',
		verb: '%7BWG%3C',
		waiting: 'yVIB',
		deadline: 'HiWj',
		reviewState: 'OQcZ',
		starAt: 'eVZD',
		star: '%7CVYt',
		todoist: '%3Ff%5Em',
	},
	filterValueOfActive: 'Actief',
	valueOfGoal: '🎯',
	valueOfStar: '⭐',
	colorOfStar: 'gray',
	valueOfWaiting: '⏳',
	colorOfWaiting: 'purple',
	idOfArchivedOption: 'e363f213-a760-4b0f-a87c-1cd0f04624f7',
	idOfNewNotesOption: '02376990-9e21-4503-b498-73428a3c0d23',
};
const noteSchema: NoteSchema = {
	database: process.env.NOTION_DB_ATTACHMENTS,
	fields: {files: '%3ATLZ', date: '%5Bhjz'},
};

const notionToTodoistColors: Record<string, Color> = {
	gray: 'charcoal',
	lightgray: 'grey',
	brown: 'taupe',
	yellow: 'yellow',
	orange: 'orange',
	green: 'green',
	blue: 'teal',
	purple: 'grape',
	pink: 'magenta',
	red: 'red',
};

const {prepare: prepareLabels, stage: stageLabels} = createLabelSyncer({
	projectSchema,
	verbColor: 'taupe',
	placeColor: 'green',
});

const {prepare: prepareProjects, stage: stageProjects} = createProjectSyncer({
	rootProjects: {
		Area: process.env.TODOIST_PROJECT_AREAS,
		Resource: process.env.TODOIST_PROJECT_RESOURCES,
	},
	areaSchemaIds: {
		database: process.env.NOTION_DB_AREAS,
		type: 'wMUV',
		emoji: 'fvWP',
		category: 'WcyD',
	},
	notionToTodoistColors,
	colorOrder: ['blue', 'pink', 'green', 'brown', 'orange', 'purple'],
});

const {
	prepare: prepareTasks,
	stage: stageTasks,
	rehashAllTodoistTasks,
} = createTaskSyncer({
	schema: projectSchema,
	onlySyncThisArea: DEV_ONLY_SYNC_TEST_AREA
		? '12fc046759aa4bc188398a60f0cc0b28'
		: undefined,
	recurringSymbol: '🔄',
	postponedSymbol: '⏸',
});

const {prepare: prepareNotes, stage: stageNotes} = createNoteSyncer({
	schema: noteSchema,
});

//--------------------------------------------------------------------------------
// Main
//--------------------------------------------------------------------------------

async function main() {
	const {integrations, mutationQueues, commit} = await connectIntegrations(
		projectSchema,
		noteSchema
	);

	if (DEV_REHASH_ALL_TODOIST_TASKS) {
		console.log('GOING TO REHASH ALL TODOIST FLAGS...');
	}

	const [labelsPreparation, projectsPreparation] = await Promise.all([
		runLogged(() => prepareLabels(integrations), 'Fetching labels...', '🏷️ '),
		runLogged(
			() => prepareProjects(integrations),
			'Preparing projects...',
			'📂'
		),
	]);

	if (
		labelsPreparation.labels.length + projectsPreparation.projects.length ===
		0
	)
		return showServiceError();

	const [labels, {areaProjectsMap}] = await Promise.all([
		runLogged(
			() => stageLabels(labelsPreparation, mutationQueues),
			'Diffing labels...',
			'🏷️ '
		),
		runLogged(
			() => stageProjects(projectsPreparation, mutationQueues),
			'Diffing projects...',
			'📂'
		),
	]);

	const tasksPreparation = await runLogged(
		() => prepareTasks(integrations, areaProjectsMap, labels),
		'Preparing tasks...',
		'📝'
	);

	if (DEV_REHASH_ALL_TODOIST_TASKS) {
		console.log('#️⃣  Rehashing all Todoist tasks...');
		await rehashAllTodoistTasks(tasksPreparation, mutationQueues);
	} else {
		const {notionIdByTodoistId} = await runLogged(
			() => stageTasks(tasksPreparation, mutationQueues),
			'Diffing tasks...',
			'📝'
		);
		const notesPreparation = await runLogged(
			() => prepareNotes(integrations, notionIdByTodoistId),
			'Preparing notes...',
			'💬'
		);
		await runLogged(
			() => stageNotes(notesPreparation, mutationQueues),
			'Diffing notes...',
			'💬'
		);
	}
	if (DEV_LOG_ONLY) return;
	await commit();
}

// Run

console.clear();

(async () => {
	try {
		await main();
	} catch (error) {
		if (isNotionClientError(error))
			if (
				[
					'notionhq_client_request_timeout',
					'notionhq_client_response_error',
					'invalid-json',
					'service_unavailable',
				].includes(error.code)
			)
				return showServiceError();
		throw error;
	}
})();

function showServiceError() {
	console.error('Error with external services. Exiting gracefully.');
}
