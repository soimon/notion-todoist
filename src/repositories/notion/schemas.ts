import {defineSchema} from '../../wrappers/notion';

export const projectSchema = defineSchema({
	name: {type: 'title', id: 'title'},
	team: {type: 'relation', id: '%3Faco'},
	status: {type: 'status', id: 'IpTf'},
	blocked: {type: 'select', id: 'Rbk%7C'},
	syncId: {type: 'rich_text', id: 'yo%3Df'},
});

export const goalSchema = defineSchema({
	name: {type: 'title', id: 'title'},
	status: {type: 'status', id: '%3FFrW'},
	tasks: {type: 'relation', id: 'K_%5CS'},
	waitingFor: {type: 'relation', id: 'LfCT'},
	project: {type: 'relation', id: '%60%3EOl'},
	todoistId: {type: 'rich_text', id: 'zcHs'},
});

export const taskSchema = defineSchema({
	title: {type: 'title', id: 'title'},
	project: {type: 'formula', id: '%3DCAH'},
	goal: {type: 'relation', id: 'cMU%5D'},
	priority: {type: 'select', id: 'Cckb'},
	scheduled: {type: 'date', id: 'lB%5Dl'},
	status: {type: 'status', id: 'oua%5B'},
	who: {type: 'relation', id: 'n%3D%7Dt'},
	todoistId: {type: 'rich_text', id: 'sn%5EO'},
});
