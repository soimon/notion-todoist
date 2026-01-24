require('module-alias/register');
import {TodoistSyncApi as NewAPI} from '@lib/todoist';
import {ApiTask, TodoistSyncApi as OldAPI} from '@lib/todoist/old';
import {config as configDotEnv} from 'dotenv';
configDotEnv();

async function test() {
	console.clear();
	const [oldTask, newTask] = await Promise.all([
		testApi(new OldAPI(process.env.TODOIST_TOKEN!)),
		testApi(new NewAPI(process.env.TODOIST_TOKEN!)),
	]);

	console.log('\n--- New ---\n');
	console.log(newTask);
	console.log('\n--- Old ---\n');
	console.log(oldTask);
	console.log();

	const diffs = compareValues(oldTask, newTask, '');
	for (const d of diffs) console.log('- ' + d);
}

async function testApi(api: OldAPI | NewAPI): Promise<ApiTask | {}> {
	await api.loadAll();
	const items = api.getTasks();
	const firstItem = items.find(({content}) => content === 'Debug') || items[0];
	if (firstItem) return expandTask(firstItem);
	else return {};
}

function expandTask(task: ApiTask) {
	const {
		id,
		project_id,
		parent_id,
		section_id,
		content,
		checked,
		description,
		due,
		deadline,
		completed_at,
		updated_at,
		added_at,
		is_deleted,
		labels,
	} = task;
	return {
		id,
		project_id,
		parent_id,
		section_id,
		content,
		checked,
		description,
		due,
		deadline,
		completed_at,
		updated_at,
		added_at,
		is_deleted,
		labels,
	};
}

function compareValues(a: any, b: any, path: string): string[] {
	const out: string[] = [];
	if (a === b) return out;
	if (a == null || b == null) {
		out.push(`${path || '<root>'}: ${String(a)} !== ${String(b)}`);
		return out;
	}
	const ta = typeof a,
		tb = typeof b;
	if (ta !== tb) {
		out.push(`${path || '<root>'}: type ${ta} !== ${tb}`);
		return out;
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		const len = Math.max(a.length, b.length);
		for (let i = 0; i < len; i++) {
			out.push(...compareValues(a[i], b[i], `${path || '<root>'}[${i}]`));
		}
		return out;
	}
	if (ta === 'object') {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const k of keys) {
			const p = path ? `${path}.${k}` : k;
			if (!(k in a)) {
				out.push(`${p}: missing in old`);
				continue;
			}
			if (!(k in b)) {
				out.push(`${p}: missing in new`);
				continue;
			}
			out.push(...compareValues(a[k], b[k], p));
		}
		return out;
	}
	// primitive (number/string/boolean/symbol)
	if (String(a) !== String(b))
		out.push(`${path || '<root>'}: ${String(a)} !== ${String(b)}`);
	return out;
}

test();
