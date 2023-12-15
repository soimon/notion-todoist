import {Goal, Project, Task} from '@framework/models';

export type TodoistTask = Task & {
	todoist: {
		description: string;
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
