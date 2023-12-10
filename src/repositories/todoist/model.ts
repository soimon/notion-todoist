import {Goal, Project, Task} from '../models';

export type TodoistTask = Task & {
	todoist: {
		lastEdited?: Date;
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
