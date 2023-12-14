import {ProjectSyncStrategy, ProjectSyncer} from '@project/types';

const TAB_PREFIX = '   ';
const PROJECT_PREFIX = `${TAB_PREFIX}📦 `;
const GOAL_PREFIX = `${TAB_PREFIX}🎯 `;

export class ProjectSyncLogger implements ProjectSyncer {
	constructor(private syncer: ProjectSyncer) {}

	async sync(strategy: ProjectSyncStrategy) {
		console.log('\nPerforming the following strategy:\n');
		this.log(strategy);
		console.time('Elapsed');
		const output = await this.syncer.sync(strategy);
		console.log('\nDone!');
		console.timeEnd('Elapsed');
		return output;
	}

	private log(strategy: ProjectSyncStrategy) {
		const {notion, todoist} = strategy;
		this.logPlatform('NOTION', notion);
		this.logPlatform('TODOIST', todoist);
	}

	private logPlatform(
		platform: string,
		strategy: ProjectSyncStrategy['notion' | 'todoist']
	) {
		const {add, remove, update} = strategy;
		console.log(`${platform}:`);
		if (add.length + remove.length + update.length === 0)
			console.log(`${TAB_PREFIX}No changes`);
		this.logProjects(strategy);
		this.logGoals(strategy);
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
