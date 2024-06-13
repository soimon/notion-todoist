export const extractIdFromLink = (link: string | undefined) =>
	link && hasLinks(link)
		? link.split(/[-/]/g).pop()?.split('#').shift()
		: undefined;
export const hasLinks = (text: string) => text.includes('notion.so');
export const extractHashFromLink = (link: string | undefined) =>
	link && hasLinks(link) && link.includes('#')
		? link.split('#').pop()
		: undefined;

export const appifyNotionLinks = (text: string) =>
	text.replace(/https:\/\/www.notion.so\//g, 'notion://notion.so/');
export const generateLink = (id: string) =>
	`notion://notion.so/${normalizeId(id)}`;
export const normalizeId = (id: string) => id.replace(/-/g, '');
