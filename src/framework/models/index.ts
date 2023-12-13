export type Project = {
	syncId: string;
	name: string;
	isBlocked: boolean;
	goals: Goal[];
};

export type Goal = {
	syncId: string;
	name: string;
	isBlocked: boolean;
};

export type Task = {
	syncId: string;
	isCompleted: boolean;
	content: string;
	scheduled?: Date;
};
