require('module-alias/register');
import {TodoistSyncApi} from '@lib/todoist';
import {extractSyncStamp, generateContentHash, stampToLink} from '@project/syncstamp';
import {config as configDotEnv} from 'dotenv';
configDotEnv();

//--------------------------------------------------------------------------------
// Configuration
//--------------------------------------------------------------------------------

const DEV_LOG_ONLY = process.argv.includes('--log-only');

const POSTPONED_SYMBOL = '⏸';

//--------------------------------------------------------------------------------
// Migration logic
//--------------------------------------------------------------------------------

async function migrate() {
	if (!process.env.TODOIST_TOKEN) {
		throw new Error('TODOIST_TOKEN environment variable is not set.');
	}

	const todoist = new TodoistSyncApi(process.env.TODOIST_TOKEN);
	await todoist.loadAll();

	const tasks = todoist.getTasks();
	const comments = todoist.getComments();

	const postponedPrefix = `${POSTPONED_SYMBOL} `;
	const postponedTasks = tasks.filter(t => t.content.startsWith(postponedPrefix));

	console.log(`Found ${postponedTasks.length} task(s) with ${POSTPONED_SYMBOL} prefix.`);

	if (DEV_LOG_ONLY) {
		console.log('Log-only mode: no changes will be made.');
		for (const task of postponedTasks) {
			const newContent = task.content.slice(postponedPrefix.length);
			console.log(`  - "${task.content}" → "${newContent}"`);
		}
		return;
	}

	for (const task of postponedTasks) {
		const newContent = task.content.slice(postponedPrefix.length);
		console.log(`  Migrating: "${task.content}" → "${newContent}"`);

		// Update the task content (remove the ⏸ prefix)
		todoist.updateTask(task.id, {content: newContent});

		// Find and update the sync stamp comment so the next regular sync
		// sees the new content as the last-known state (preventing the task
		// from being treated as altered in Todoist and overwriting Notion data).
		const syncComment = comments.find(c => {
			if (c.item_id !== task.id) return false;
			return !!extractSyncStamp(c.content);
		});

		if (syncComment) {
			// extractSyncStamp is guaranteed non-null here: we verified it above
			const stamp = extractSyncStamp(syncComment.content) as NonNullable<ReturnType<typeof extractSyncStamp>>;
			const newHash = generateContentHash({
				content: newContent,
				labels: task.labels,
				date: task.due?.date ? new Date(task.due.date) : undefined,
				deadline: task.deadline?.date
					? new Date(task.deadline.date)
					: undefined,
			});
			todoist.updateComment(
				syncComment.id,
				stampToLink({notionId: stamp.notionId, hash: newHash})
			);
		}
	}

	await todoist.commit();
	console.log('Migration complete.');
}

// Run

console.clear();
migrate().catch(console.error);
