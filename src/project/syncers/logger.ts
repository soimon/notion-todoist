import {ProjectSyncStrategy, ProjectSyncer} from '@project/types';

export class ProjectSyncLogger implements ProjectSyncer {
	constructor(private syncer: ProjectSyncer) {}

	async sync(strategy: ProjectSyncStrategy) {
		const output = await this.syncer.sync(strategy);
		this.log(strategy);
		return output;
	}

	private log(strategy: ProjectSyncStrategy) {
		console.log(`Notion:`);
		console.log(`   Added ${strategy.notion.add.length} projects`);
		console.log(`   Removed ${strategy.notion.remove.length} projects`);
		console.log(`   Updated ${strategy.notion.update.length} projects`);
		console.log(`Todoist:`);
		console.log(`   Added ${strategy.todoist.add.length} projects`);
		console.log(`   Removed ${strategy.todoist.remove.length} projects`);
		console.log(`   Updated ${strategy.todoist.update.length} projects`);
	}
}
