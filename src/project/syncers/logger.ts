import {ProjectSyncStrategy, ProjectSyncer} from '@project/types';

export class ProjectSyncLogger implements ProjectSyncer {
	constructor(private syncer: ProjectSyncer) {}

	async sync(strategy: ProjectSyncStrategy) {
		const output = await this.syncer.sync(strategy);
		this.log(strategy);
		return output;
	}

	private log(strategy: ProjectSyncStrategy) {
		const {notion, todoist} = strategy;
		const notionGoals = this.countGoalMutations(notion);
		const todoistGoals = this.countGoalMutations(todoist);

		console.log(`Notion:`);
		console.log(`   📦 Added    ${notion.add.length}  projects`);
		console.log(`   📦 Removed  ${notion.remove.length}  projects`);
		console.log(`   📦 Updated  ${notion.update.length}  projects`);
		console.log(`   🎯 Added    ${notionGoals.added}  goals`);
		console.log(`   🎯 Removed  ${notionGoals.removed}  goals`);
		console.log(`   🎯 Updated  ${notionGoals.updated}  goals`);
		console.log(`Todoist:`);
		console.log(`   📦 Added    ${todoist.add.length}  projects`);
		console.log(`   📦 Removed  ${todoist.remove.length}  projects`);
		console.log(`   📦 Updated  ${todoist.update.length}  projects`);
		console.log(`   🎯 Added    ${todoistGoals.added}  goals`);
		console.log(`   🎯 Removed  ${todoistGoals.removed}  goals`);
		console.log(`   🎯 Updated  ${todoistGoals.updated}  goals`);
	}

	private countGoalMutations(
		strategy: ProjectSyncStrategy['notion' | 'todoist']
	): {added: number; removed: number; updated: number} {
		const {add, remove, update} = strategy;
		const added = add.reduce((acc, cur) => acc + cur.goals.length, 0);
		const removed = remove.reduce((acc, cur) => acc + cur.goals.length, 0);
		const updated = update.reduce(
			(acc, cur) => acc + cur.goals.update.length,
			0
		);
		return {added, removed, updated};
	}
}
