import {Client} from '@notionhq/client';
import dotenv from 'dotenv';
import {retrievePage} from './notion/';
import {getChangedPages, queryDatabase} from './notion/retrieval';
dotenv.config();

async function main() {
	const notion = new Client({
		auth: process.env.NOTION_TOKEN,
	});
	const page = await retrievePage({
		notion,
		id: '7f19f60417404abc85e35a1df025c651',
		properties: {
			state: {id: 'oua%5B', type: 'status'},
			Doel: 'relation',
			// Status: 'status',
		},
	});

	const lastQueried = new Date();
	lastQueried.setHours(lastQueried.getHours() - 1);
	const pages = await getChangedPages({
		notion,
		since: lastQueried,
		database: process.env.NOTION_DB_TASKS,
		properties: {
			state: {id: 'oua%5B', type: 'status'},
			Doel: 'relation',
			// Status: 'status',
		},
	});
	console.log(pages[0]!.properties.state);
}

main();
