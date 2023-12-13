import {ProjectSyncStrategy, ProjectSyncer} from '@project/types';

const TAB_PREFIX = '\u2192  ';
const PROJECT_PREFIX = `${TAB_PREFIX}📦 `;
const GOAL_PREFIX = `${TAB_PREFIX}🎯 `;

export class ProjectSyncLogger implements ProjectSyncer {
	constructor(private syncer: ProjectSyncer) {}

	async sync(strategy: ProjectSyncStrategy) {
		const output = await this.syncer.sync(strategy);
		this.log(strategy);
		return output;
	}

	private log(strategy: ProjectSyncStrategy) {
		const {notion, todoist} = strategy;
		this.logPlatform('Notion', notion);
		this.logPlatform('Todoist', todoist);
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
		if (add.length + remove.length + update.length > 0)
			console.log(`${TAB_PREFIX}Projects`);
		if (add.length > 0) console.log(`${PROJECT_PREFIX}Added    ${add.length}`);
		if (remove.length > 0)
			console.log(`${PROJECT_PREFIX}📦 Removed  ${remove.length}`);
		if (update.length > 0)
			console.log(`${PROJECT_PREFIX}📦 Updated  ${update.length}`);
	}

	private logGoals(strategy: ProjectSyncStrategy['notion' | 'todoist']) {
		const {added, removed, updated} = this.countGoalMutations(strategy);
		if (added + removed + updated > 0) console.log(`${TAB_PREFIX}Goals`);
		if (added > 0) console.log(`${GOAL_PREFIX}Added    ${added}`);
		if (removed > 0) console.log(`${GOAL_PREFIX}Removed  ${removed}`);
		if (updated > 0) console.log(`${GOAL_PREFIX}Updated  ${updated}`);
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
