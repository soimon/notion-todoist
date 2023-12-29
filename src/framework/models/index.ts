export type Project = {
	syncId: string;
	name: string;
	blockedState: BlockedState;
	goals: Goal[];
};

export type Goal = {
	syncId: string;
	name: string;
	blockedState: BlockedState;
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

export type BlockedState = 'free' | 'blocked' | 'paused';
export type TaskProgression =
	| 'not-started'
	| 'should-delegate'
	| 'delegated'
	| 'in-progress'
	| 'blocked';
