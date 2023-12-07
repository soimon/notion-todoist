import {Client} from '@notionhq/client';
import {PropertiesList, GetPropertiesResult, getProperties} from './page-utils';

// TODO: merge the output type with the actual API output, only replace the properties by a typed version
export async function retrievePage<TList extends PropertiesList>(options: {
	id: string;
	notion: Client;
	properties: TList;
}): Promise<GetPropertiesResult<TList> | undefined> {
	const response = await options.notion.pages.retrieve({
		page_id: options.id,
		filter_properties: getPropertyIds(options.properties),
	});
	if (!('url' in response)) return undefined;
	return getProperties(response, options.properties);
}
const getPropertyIds = (properties: PropertiesList) => {
	const ids = Object.entries(properties).map(([, data]) =>
		typeof data === 'object' ? data.id : null
	);
	const hasOnlyIds = (list: typeof ids): list is string[] =>
		!list.some(i => typeof i !== 'string');
	return hasOnlyIds(ids) ? ids : undefined;
};
