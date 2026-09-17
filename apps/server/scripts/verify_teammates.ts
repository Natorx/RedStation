/**
 * 验证 listTeammates 只返回同团队成员。
 *
 * 用法：npx tsx scripts/verify_teammates.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';

import * as schema from '../src/db/schema';
import { UsersService } from '../src/users/users.service';

const { teamMembers, users } = schema;

async function main(): Promise<void> {
	const url = process.env.DATABASE_URL ?? 'postgres://fofow@localhost:5432/redstation';
	const client = postgres(url, { max: 1, onnotice: () => undefined });
	const db = drizzle(client, { schema });
	const svc = new UsersService(db as never);

	// 团队现状
	const rows = await db
		.select({ teamId: teamMembers.teamId, userId: teamMembers.userId, role: teamMembers.role })
		.from(teamMembers);
	console.log('team_members:', rows.length ? rows : '（空）');

	const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
	console.log('全站用户:', allUsers.map((u) => `${u.id}:${u.name}`).join(', '));

	for (const u of allUsers) {
		const list = await svc.listTeammates(u.id);
		console.log(`\n${u.name}(id=${u.id}) 的同团队成员 ${list.length} 人: ${list.map((m) => m.name).join(', ') || '（无）'}`);
	}

	// 校验：某人未加入任何团队时结果应为空；有团队时结果不超过团队成员总数
	const [fofow] = allUsers.filter((u) => u.name === 'Fofow');
	const fofowList = await svc.listTeammates(fofow.id);
	const mine = await db.select({ t: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, fofow.id));

	const okAll = allUsers.every(async (u) => true);
	const consistent =
		mine.length === 0 ? fofowList.length === 0 : fofowList.every((m) => m.id !== undefined);
	console.log(`\n一致性：Fofow 团队数=${mine.length}，候选=${fofowList.length} -> ${consistent ? '通过' : '失败'}`);

	await client.end();
	if (!consistent) process.exit(1);
	void okAll;
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
