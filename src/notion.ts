import {PageObjectResponse} from '@notionhq/client/build/src/api-endpoints';

export const getTitle = (page: PageObjectResponse): string | undefined => {
	const titleProperty = Object.values(page.properties).find(
		property => property.type === 'title'
	) as ((typeof page.properties)[number] & {type: 'title'}) | undefined;
	const titleValue = titleProperty?.title[0]?.plain_text;
	return titleValue;
};

export const getProperty = <T extends PropertyType>(
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

type PropertyType = PageObjectResponse['properties'][string]['type'];
type PropertyValue<T extends PropertyType> =
	PageObjectResponse['properties'][string] & {type: T};

export const getProperties = <
	TProperties extends [...P: {name: N; type: PropertyType}[]],
	N extends string,
>(
	page: PageObjectResponse,
	properties: TProperties
): GetPropertiesResult<TProperties> =>
	Object.fromEntries(
		properties.map(property => [
			property.name,
			getProperty(page, property.name, property.type),
		])
	) as GetPropertiesResult<TProperties>;

type GetPropertiesResult<
	TProperties extends {name: string; type: PropertyType}[],
> = {
	[K in TProperties[number]['name']]:
		| PropertyValue<FindMatchingType<TProperties[number], K>>
		| undefined;
};

type FindMatchingType<T, K> = T extends {name: K; type: infer U} ? U : never;
