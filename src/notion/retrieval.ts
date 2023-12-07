import {Client} from '@notionhq/client';
import {PropertiesList, GetPropertiesResult, getProperties} from './page-utils';
import {PageObjectResponse} from '@notionhq/client/build/src/api-endpoints';

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
	const properties = getProperties(response, options.properties);
	return {...response, properties};
}

const getPropertyIds = (properties: PropertiesList) => {
	const ids = Object.entries(properties).map(([, data]) =>
		typeof data === 'object' ? data.id : null
	);
	const hasOnlyIds = (list: typeof ids): list is string[] =>
		!list.some(i => typeof i !== 'string');
	return hasOnlyIds(ids) ? ids : undefined;
};

type NotionPage<TPropertiesList extends PropertiesList> = Omit<
	PageObjectResponse,
	'properties'
> & {
	properties: GetPropertiesResult<TPropertiesList>;
};
