require('module-alias/register');
import {Color} from '@lib/todoist';
import {runLogged} from '@lib/utils/dev';
import {connectIntegrations} from '@project/integrations';
import {NoteSchema, ProjectSchema} from '@project/mutating/notion';
import {createLabelSyncer} from '@project/sync-labels';
import {createProjectSyncer} from '@project/sync-projects';
import {createTaskSyncer} from '@project/sync-tasks';
import {config as configDotEnv} from 'dotenv';
configDotEnv();

//--------------------------------------------------------------------------------
// Configuration
//--------------------------------------------------------------------------------

const DEV_ONLY_SYNC_TEST_AREA = process.env.DEV;

const projectSchema: ProjectSchema = {
	database: process.env.NOTION_DB_PROJECTS,
	fields: {
		archivedState: 'GNpW',
		isPostponed: '%3A%3FZe',
		goal: '%7CjQZ',
		areas: 'fdjt',
		place: 'QCy%7B',
		people: 'F%7DnR',
		verb: '%7BWG%3C',
		waiting: 'yVIB',
		archived: 'OQcZ',
		todoist: '%3Ff%5Em',
	},
	filterValueOfActive: 'Actief',
	idOfArchivedOption: 'e363f213-a760-4b0f-a87c-1cd0f04624f7',
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

const {prepare: prepareTasks, stage: stageTasks} = createTaskSyncer({
	schema: projectSchema,
	onlySyncThisArea: DEV_ONLY_SYNC_TEST_AREA
		? '12fc046759aa4bc188398a60f0cc0b28'
		: undefined,
	recurringSymbol: '🔄',
	postponedSymbol: '⏸',
});

// const {prepare: prepareNotes, stage: stageNotes} = createNoteSyncer({
// 	schema: noteSchema,
// });

//--------------------------------------------------------------------------------
// Main
//--------------------------------------------------------------------------------

async function main() {
	const {integrations, mutationQueues, commit} = await connectIntegrations(
		projectSchema,
		noteSchema
	);

	const labelsPreparation = await runLogged(
		() => prepareLabels(integrations),
		'Fetching labels...',
		'🏷️ '
	);
	const projectsPreparation = await runLogged(
		() => prepareProjects(integrations),
		'Preparing projects...',
		'📂'
	);

	const labels = await runLogged(
		() => stageLabels(labelsPreparation, mutationQueues),
		'Diffing labels...',
		'🏷️ '
	);
	const {areaProjectsMap} = await runLogged(
		() => stageProjects(projectsPreparation, mutationQueues),
		'Diffing projects...',
		'📂'
	);
	const tasksPreparation = await runLogged(
		() => prepareTasks(integrations, areaProjectsMap, labels),
		'Preparing tasks...',
		'📝'
	);
	await runLogged(
		() => stageTasks(tasksPreparation, mutationQueues),
		'Diffing tasks...',
		'📝'
	);
	await commit();
}

// Run
console.clear();
main();
