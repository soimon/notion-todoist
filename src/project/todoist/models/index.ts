import {Goal, Project, Task, TaskProgression} from '@framework/models';

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

// Task progression

export const progressionToLabel: {[k in TaskProgression]: string | undefined} =
	{
		'not-started': undefined,
		'should-delegate': 'To delegate',
		delegated: 'Delegated',
		'in-progress': 'In progress',
		blocked: 'Blocked',
	};
