export type Project = {
	syncId: string;
	name: string;
	isBlocked: boolean;
	isPaused: boolean;
	goals: Goal[];
};

export type Goal = {
	syncId: string;
	name: string;
	isPaused: boolean;
	isBlocked: boolean;
};

export type Task = {
	syncId: string;
	goalSyncId: Goal['syncId'];
	progression: TaskProgression;
	isCompleted: boolean;
	content: string;
	scheduled?: Date;
	scheduledWithTime: boolean;
};

export type TaskProgression =
	| 'not-started'
	| 'should-delegate'
	| 'delegated'
	| 'in-progress'
	| 'blocked';
