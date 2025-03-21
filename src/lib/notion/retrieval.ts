import {Client} from '@notionhq/client';
import {
	PageObjectResponse,
	QueryDatabaseResponse,
} from '@notionhq/client/build/src/api-endpoints';
import {
	NotionPage,
	Schema,
	enhancePageProperties,
	getPropertyIds,
} from './properties';

export async function retrievePage<TPropertiesList extends Schema>(options: {
	id: string;
	notion: Client;
	schema: TPropertiesList;
}): Promise<NotionPage<TPropertiesList> | undefined> {
	const response = await options.notion.pages.retrieve({
		page_id: options.id,
		filter_properties: [...(getPropertyIds(options.schema) ?? []), 'title'],
	});
	if (!('url' in response)) return undefined;
	return enhancePageProperties<TPropertiesList>(response, options.schema);
}

type GetChangedPageOptions = Omit<QueryOptions, 'filter'> & {
	since: Date;
	// filter?: SecondaryQueryFilters;
};
export type SecondaryQueryFilters = Extract<
	QueryFilters,
	{and: unknown}
>['and'];

export function getChangedPages<TSchema extends Schema>(
	options: GetChangedPageOptions & {schema: TSchema}
): Promise<NotionPage<TSchema>[]> {
	return queryDatabase({
		...options,
		filter: {
			or: [
				{
					timestamp: 'last_edited_time',
					last_edited_time: {
						on_or_after: options.since.toISOString(),
					},
				},
				{
					timestamp: 'created_time',
					created_time: {
						on_or_after: options.since.toISOString(),
					},
				},
			],
		},
	});
}

type QueryOptions = {
	notion: Client;
	database: string;
	filter?: QueryFilters;
};
export type QueryFilters = Exclude<
	Parameters<Client['databases']['query']>[0]['filter'],
	undefined
>;

export async function queryDatabase<TPropertiesList extends Schema>(
	options: QueryOptions & {schema: TPropertiesList}
): Promise<NotionPage<TPropertiesList>[]> {
	return (await accumulateQueryResults(options)).map(p =>
		enhancePageProperties(p, options.schema)
	);
}

async function accumulateQueryResults<TPropertiesList extends Schema>(
	options: QueryOptions & {schema: TPropertiesList}
) {
	let next_cursor: string | null = null;
	const pages: PageObjectResponse[] = [];
	do {
		const response: QueryDatabaseResponse = await query(
			options,
			next_cursor ?? undefined
		);
		next_cursor = response.next_cursor;
		pages.push(
			...response.results.filter(
				(v): v is PageObjectResponse => v.object === 'page'
			)
		);
	} while (next_cursor);
	return pages;
}

const query = <TPropertiesList extends Schema>(
	{
		database: database_id,
		filter,
		notion,
		schema,
	}: QueryOptions & {schema: TPropertiesList},
	startAt?: string
) =>
	notion.databases.query({
		database_id,
		filter,
		filter_properties: [...(getPropertyIds(schema) ?? []), 'title'],
		page_size: 500,
		start_cursor: startAt,
	});

export const getDatabaseSchema = async (options: {
	notion: Client;
	database: string;
}): Promise<Schema> => {
	const {properties} = await options.notion.databases.retrieve({
		database_id: options.database,
	});
	return Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, v]));
};
