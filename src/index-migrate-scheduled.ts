require('module-alias/register');
import {defineSchema, queryDatabase} from '@lib/notion';
import {makeIsoScheduledString} from '@lib/utils/time';
import {Client} from '@notionhq/client';
import {RichTextItemResponse} from '@notionhq/client/build/src/api-endpoints';
import {config as configDotEnv} from 'dotenv';
configDotEnv();

//--------------------------------------------------------------------------------
// Configuration
//--------------------------------------------------------------------------------

const DEV_ONLY_SYNC_TEST_AREA = !!process.env.DEV;
const DEV_LOG_ONLY = process.argv.includes('--log-only');
const TEST_AREA_ID = '12fc046759aa4bc188398a60f0cc0b28';

const FIELDS = {
	areas: 'fdjt',
	waiting: 'yVIB',
	scheduledAt: 'Scheduled at',
};

const filterValueOfActive = 'Actief';

const migrationSchema = defineSchema({
	Areas: {type: 'relation', id: FIELDS.areas},
	Waiting: {type: 'rich_text', id: FIELDS.waiting},
});

const notion = new Client({auth: process.env.NOTION_TOKEN});

//--------------------------------------------------------------------------------
// Migration logic
//--------------------------------------------------------------------------------

function extractDateFromWaitingText(
	waitingRichText: RichTextItemResponse[]
): Date | undefined {
	const firstItem = waitingRichText[0];
	if (!firstItem) return;
	if (firstItem.type === 'mention' && firstItem.mention.type === 'date') {
		return new Date(firstItem.mention.date.start);
	}
	return undefined;
}

async function migrate() {
	const areaFilter = DEV_ONLY_SYNC_TEST_AREA
		? [
				{
					property: FIELDS.areas,
					relation: {contains: TEST_AREA_ID},
				},
		  ]
		: [];

	const tasks = await queryDatabase({
		notion,
		schema: migrationSchema,
		database: process.env.NOTION_DB_PROJECTS,
		filter: {
			and: [...areaFilter],
		},
	});

	const tasksWithDate = tasks.filter(task => {
		const waiting = task.properties.Waiting;
		return (
			waiting &&
			waiting.rich_text.length > 0 &&
			extractDateFromWaitingText(waiting.rich_text) !== undefined
		);
	});

	console.log(
		`Found ${tasksWithDate.length} task(s) with a date in the waiting field.`
	);

	if (DEV_LOG_ONLY) {
		console.log('Log-only mode: no changes will be made.');
		for (const task of tasksWithDate) {
			const date = extractDateFromWaitingText(
				task.properties.Waiting!.rich_text
			)!;
			console.log(
				`  - ${task.name ?? task.id}: ${makeIsoScheduledString(date, false)}`
			);
		}
		return;
	}

	for (const task of tasksWithDate) {
		const date = extractDateFromWaitingText(
			task.properties.Waiting!.rich_text
		)!;
		const dateStr = makeIsoScheduledString(date, false);
		console.log(`  Migrating: ${task.name ?? task.id} → ${dateStr}`);
		await notion.pages.update({
			page_id: task.id,
			properties: {
				[FIELDS.scheduledAt]: {
					date: {start: dateStr},
				},
			},
		});
	}

	console.log('Migration complete.');
}

// Run

console.clear();
migrate().catch(console.error);
