import {Goal, Project, Task} from '@framework/models';
import {NotionPage} from '@lib/notion';

// Models

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

enum TaskStates {
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
export const closedTaskStates: string[] = [TaskStates.Done, TaskStates.Cut];
