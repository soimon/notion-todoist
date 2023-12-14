import {
	ProjectSyncStrategy,
	SyncStrategy,
	Syncer,
	TaskSyncStrategy,
} from '@project/types';

const TAB_PREFIX = '   ';
const PROJECT_PREFIX = `${TAB_PREFIX}📦 `;
const GOAL_PREFIX = `${TAB_PREFIX}🎯 `;
const TASK_PREFIX = `${TAB_PREFIX}☑ `;

export class SyncLogger implements Syncer {
	constructor(private syncer: Syncer) {}

	async sync(strategy: SyncStrategy) {
		console.log('\nPerforming the following strategy:\n');
		this.log(strategy);
		console.time('Elapsed');
		const output = await this.syncer.sync(strategy);
		console.log('\nDone!');
		console.timeEnd('Elapsed');
		return output;
	}

	private log(strategy: SyncStrategy) {
		this.logPlatform('NOTION', 'notion', strategy);
		this.logPlatform('TODOIST', 'todoist', strategy);
	}

	private logPlatform(
		platform: string,
		key: keyof SyncStrategy['projects'] & keyof SyncStrategy['tasks'],
		strategy: SyncStrategy
	) {
		const [p, t] = [strategy.projects[key], strategy.tasks[key]];
		console.log(`${platform}:`);
		if (
			p.add.length +
				p.remove.length +
				p.update.length +
				t.add.length +
				t.remove.length +
				t.update.length ===
			0
		)
			console.log(`${TAB_PREFIX}No changes`);
		this.logProjects(strategy.projects[key]);
		this.logGoals(strategy.projects[key]);
		this.logTasks(strategy.tasks[key]);
	}

	private logProjects(strategy: ProjectSyncStrategy['notion' | 'todoist']) {
		const {add, remove, update} = strategy;
		const updateCount = countUpdates(update);
		if (add.length + remove.length + updateCount > 0)
			console.log(`${TAB_PREFIX}Projects`);
		if (add.length > 0) console.log(`${PROJECT_PREFIX}Add   ${add.length}`);
		if (remove.length > 0)
			console.log(`${PROJECT_PREFIX}Remove  ${remove.length}`);
		if (updateCount > 0) console.log(`${PROJECT_PREFIX}Update  ${updateCount}`);
	}

	private logGoals(strategy: ProjectSyncStrategy['notion' | 'todoist']) {
		const {added, removed, updated} = this.countGoalMutations(strategy);
		if (added + removed + updated > 0) console.log(`${TAB_PREFIX}Goals`);
		if (added > 0) console.log(`${GOAL_PREFIX}Add   ${added}`);
		if (removed > 0) console.log(`${GOAL_PREFIX}Remove  ${removed}`);
		if (updated > 0) console.log(`${GOAL_PREFIX}Update  ${updated}`);
	}

	private logTasks(strategy: TaskSyncStrategy['notion' | 'todoist']) {
		const {add, remove, update} = strategy;
		if (add.length > 0) console.log(`${TASK_PREFIX}Add   ${add.length}`);
		if (remove.length > 0)
			console.log(`${TASK_PREFIX}Remove  ${remove.length}`);
		if (update.length > 0)
			console.log(`${TASK_PREFIX}Update  ${update.length}`);
	}

	private countGoalMutations(
		strategy: ProjectSyncStrategy['notion' | 'todoist']
	): {added: number; removed: number; updated: number} {
		const {add, remove, update} = strategy;
		const added =
			add.reduce((acc, cur) => acc + cur.goals.length, 0) +
			update.reduce((acc, cur) => acc + cur.goals.add.length, 0);
		const removed =
			remove.reduce((acc, cur) => acc + cur.goals.length, 0) +
			update.reduce((acc, cur) => acc + cur.goals.remove.length, 0);
		const updated = update.reduce(
			(acc, cur) => acc + cur.goals.update.length,
			0
		);
		return {added, removed, updated};
	}
}

function countUpdates(
	update: ProjectSyncStrategy['notion' | 'todoist']['update']
) {
	return update.filter(p => !p.goals.onlySyncGoals).length;
}
