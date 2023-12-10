import {NotionPage} from '../../wrappers/notion';
import {Goal, Project, Task} from '../models';

export type NotionTask = Task & {
	notion: {
		id: NotionPage<{}>['id'];
		lastEdited: Date;
		projectName: string;
	};
};

export type NotionProject = Project & {
	goals: NotionGoal[];
	notion: {
		id: string;
	};
};

export type NotionGoal = Goal & {
	notion: {
		id: string;
		projectId: string;
	};
};

export enum States {
	NotStarted = 'Not started',
	InProgress = 'In progress',
	Done = 'Done',
	Cut = 'Cut',
}

export const isCompleted = (state: string): boolean =>
	([States.Done, States.Cut] as string[]).includes(state);
