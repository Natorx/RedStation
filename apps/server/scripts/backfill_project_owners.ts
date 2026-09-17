/**
 * 一次性数据修补：把 projects.owner（名字快照）匹配成 users.name，
 * 为历史项目补写 project_members 的 owner 关系。
 *
 * 背景：项目可见性改为「仅成员可见」后，历史项目若没有成员关系，
 * 发起人也看不到自己的项目。执行一次即可，重复执行幂等。
 *
 * 用法：npx tsx scripts/backfill_project_owners.ts
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../src/db/schema';

const { projectMembers, projects, users } = schema;

async function main(): Promise<void> {
	const url = process.env.DATABASE_URL ?? 'postgres://fofow@localhost:5432/redstation';
	const client = postgres(url, { max: 1, onnotice: () => undefined });
	const db = drizzle(client, { schema });

	const rows = await db.select({ id: projects.id, owner: projects.owner, label: projects.label }).from(projects);

	let linked = 0;
	let skipped = 0;

	for (const row of rows) {
		const name = (row.owner ?? '').trim();
		if (!name) {
			console.log(`- 跳过 #${row.id} ${row.label}：owner 为空`);
			skipped += 1;
			continue;
		}

		const [user] = await db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
		if (!user) {
			console.log(`- 跳过 #${row.id} ${row.label}：找不到用户「${name}」`);
			skipped += 1;
			continue;
		}

		await db
			.insert(projectMembers)
			.values({ projectId: row.id, userId: user.id, role: 'owner' })
			.onConflictDoUpdate({
				target: [projectMembers.projectId, projectMembers.userId],
				set: { role: 'owner', updatedAt: new Date() }
			});
		console.log(`+ 关联 #${row.id} ${row.label} -> ${name}(id=${user.id})`);
		linked += 1;
	}

	console.log(`\n完成：关联 ${linked} 个，跳过 ${skipped} 个，共 ${rows.length} 个项目`);
	await client.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
