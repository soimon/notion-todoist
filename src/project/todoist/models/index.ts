import {Goal, Project, Task} from '@framework/models';

export type TodoistTask = Task & {
	todoist: {
		lastEdited?: Date;
		description: string;
		projectId: string;
		sectionId: string | null | undefined;
	};
};

export type TodoistProject = Project & {
	goals: TodoistGoal[];
	todoist: {};
};

export type TodoistGoal = Goal & {
	todoist: {
		projectId: string;
	};
};
