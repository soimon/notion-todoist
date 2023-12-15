import {Goal, Project, Task, TaskProgression} from '@framework/models';
import {NotionPage} from '@lib/notion';

// Models

export type NotionTask = Task & {
	notion: {
		id: NotionPage<{}>['id'];
		goalId: NotionPage<{}>['id'];
		lastEdited: Date;
		projectName: string;
		status: string;
	};
};

export type NotionProject = Omit<Project, 'goals'> & {
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

// Business logic related to enums

enum ProjectStates {
	Outlining = '2: Outlining',
	InProgress = '3: In progress',
	Wrapping = 'Wrapping',
}

enum GoalStates {
	Paused = 'Paused',
	Done = 'Done',
}

enum TaskState {
	NotStarted = 'Not started',
	ToDelegate = 'To delegate',
	Delegated = 'Delegated',
	InProgress = 'In progress',
	Blocked = 'Blocked',
	Done = 'Done',
	Cut = 'Cut',
}

export const inProgressProjectStates: string[] = [
	ProjectStates.Outlining,
	ProjectStates.InProgress,
	ProjectStates.Wrapping,
];

export const blockedGoalStates: string[] = [GoalStates.Paused];
export const closedGoalStates: string[] = [GoalStates.Done];
export const closedTaskStates: string[] = [TaskState.Done, TaskState.Cut];
export const completedTaskState = TaskState.Done;
export const newTaskState = TaskState.NotStarted;
export const cutTaskState = TaskState.Cut;

// Task progression

export const progressionToState: {[k in TaskProgression]: TaskState} = {
	'not-started': TaskState.NotStarted,
	'should-delegate': TaskState.ToDelegate,
	delegated: TaskState.Delegated,
	'in-progress': TaskState.InProgress,
	blocked: TaskState.Blocked,
};
