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

type GetChangedPageOptions = Omit<QueryOptions, 'filter'> & {
	since: Date;
	filter?: Extract<QueryFilters, {and: unknown}>['and'];
};

export async function getChangedPages<TPropertiesList extends PropertiesList>(
	options: GetChangedPageOptions & {properties: TPropertiesList}
): Promise<NotionPage<TPropertiesList>[]> {
	return queryDatabase({
		...options,
		filter: {
			or: [
				{
					timestamp: 'last_edited_time',
					last_edited_time: {
						after: options.since.toISOString(),
					},
				},
				{
					timestamp: 'created_time',
					created_time: {
						after: options.since.toISOString(),
					},
				},
			],
			and: options.filter,
		},
	});
}

type QueryOptions = {
	notion: Client;
	database: string;
	filter: QueryFilters;
};
type QueryFilters = Exclude<
	Parameters<Client['databases']['query']>[0]['filter'],
	undefined
>;

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