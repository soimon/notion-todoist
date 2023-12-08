import {Client} from '@notionhq/client';
import {PageObjectResponse} from '@notionhq/client/build/src/api-endpoints';
import {
	NotionPage,
	PropertiesList,
	enhancePageProperties,
	getPropertyIds,
} from './properties';

export async function retrievePage<
	TPropertiesList extends PropertiesList,
>(options: {
	id: string;
	notion: Client;
	properties: TPropertiesList;
}): Promise<NotionPage<TPropertiesList> | undefined> {
	const response = await options.notion.pages.retrieve({
		page_id: options.id,
		filter_properties: getPropertyIds(options.properties),
	});
	if (!('url' in response)) return undefined;
	return enhancePageProperties<TPropertiesList>(response, options.properties);
}

type QueryOptions = {
	notion: Client;
	database: string;
	filter: QueryFilters;
};
type QueryFilters = Parameters<Client['databases']['query']>[0]['filter'];

export async function queryDatabase<TPropertiesList extends PropertiesList>(
	options: QueryOptions & {properties: TPropertiesList}
): Promise<NotionPage<TPropertiesList>[]> {
	return (await accumulateQueryResults(options)).map(p =>
		enhancePageProperties(p, options.properties)
	);
}

async function accumulateQueryResults(options: QueryOptions) {
	let next_cursor: string | null = null;
	const pages: PageObjectResponse[] = [];
	do {
		const response = await query(options, next_cursor ?? undefined);
		next_cursor = response.next_cursor;
		pages.push(
			...response.results.filter(
				(v): v is PageObjectResponse => v.object === 'page'
			)
		);
	} while (next_cursor);
	return pages;
}

// TODO: Respond to rate limits

const query = (
	{database: database_id, filter, notion}: QueryOptions,
	startAt?: string
) =>
	notion.databases.query({
		database_id,
		filter,
		page_size: 100,
		start_cursor: startAt,
	});
