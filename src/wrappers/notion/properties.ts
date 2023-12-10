import {PageObjectResponse} from '@notionhq/client/build/src/api-endpoints';

export type NotionPage<TSchema extends Schema> = Omit<
	PageObjectResponse,
	'properties'
> & {
	properties: GetPropertiesResult<TSchema>;
};

export function enhancePageProperties<TSchema extends Schema>(
	response: PageObjectResponse,
	schema: TSchema
): NotionPage<TSchema> {
	return {...response, properties: getProperties(response, schema)};
}

export const getProperties = <
	TSchema extends Schema<TNames>,
	TNames extends string,
>(
	page: PageObjectResponse,
	schema: TSchema
): GetPropertiesResult<TSchema> =>
	Object.fromEntries(
		Object.entries<PropertyDescriptor>(schema).map(([name, descriptor]) => [
			name,
			typeof descriptor === 'string'
				? getPropertyByName(page, name, descriptor)
				: getPropertyById(page, descriptor.id, descriptor.type),
		])
	) as GetPropertiesResult<TSchema>;

export const defineSchema = <T extends Schema>(schema: T): Readonly<T> =>
	schema;

export type Schema<N extends string = string> = Record<N, PropertyDescriptor>;
type PropertyDescriptor = PropertyType | {id: string; type: PropertyType};
type PropertyType = PageObjectResponse['properties'][string]['type'];
export type GetPropertiesResult<TList extends Schema> = {
	[K in keyof TList]: PropertyValue<ExtractPropertyType<TList[K]>> | undefined;
};
type PropertyValue<T extends PropertyType> =
	PageObjectResponse['properties'][string] & {type: T};
type ExtractPropertyType<T extends PropertyDescriptor> = T extends {
	type: infer P;
}
	? P
	: T;

export const getPropertyByName = <T extends PropertyType>(
	page: PageObjectResponse,
	propertyName: string,
	propertyType: T
): PropertyValue<T> | undefined => {
	const property = page.properties[propertyName];
	if (property && property.type === propertyType) {
		return property as PageObjectResponse['properties'][string] & {type: T};
	}
	return undefined;
};

export const getPropertyById = <T extends PropertyType>(
	page: PageObjectResponse,
	propertyId: string,
	propertyType: T
): PropertyValue<T> | undefined => {
	const property = Object.values(page.properties).find(
		property => property.id === propertyId
	);
	if (property && property.type === propertyType) {
		return property as PageObjectResponse['properties'][string] & {type: T};
	}
	return undefined;
};

export const getPropertyIds = (properties: Schema) => {
	const ids = Object.entries(properties).map(([, data]) =>
		typeof data === 'object' ? data.id : null
	);
	const hasOnlyIds = (list: typeof ids): list is string[] =>
		!list.some(i => typeof i !== 'string');
	return hasOnlyIds(ids) ? ids : undefined;
};

export const getTitle = (page: PageObjectResponse): string | undefined => {
	const titleProperty = Object.values(page.properties).find(
		property => property.type === 'title'
	) as ((typeof page.properties)[number] & {type: 'title'}) | undefined;
	const titleValue = titleProperty?.title[0]?.plain_text;
	return titleValue;
};
