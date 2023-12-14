import {ProjectSyncStrategizer, TaskSyncStrategizer} from '@project/types';

export const doNothingProjectStrategy: ProjectSyncStrategizer = (
	notion,
	todoist
) => {
	return {
		notion: {add: [], remove: [], update: []},
		todoist: {add: [], remove: [], update: []},
	};
};

export const doNothingTaskStrategy: TaskSyncStrategizer = (notion, todoist) => {
	return {
		notion: {add: [], remove: [], update: []},
		todoist: {add: [], remove: [], update: []},
	};
};
