/**
 * 验证 OptionalJwtGuard 生效后，项目列表/详情在带 JWT 时会返回 myRole。
 *
 * 用法：npx tsx scripts/verify_optional_guard.ts
 */
import 'dotenv/config';
import { JwtService } from '@nestjs/jwt';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';

import * as schema from '../src/db/schema';
import { ProjectsService } from '../src/projects/projects.service';
import { ProjectMembersService } from '../src/projects/project-members.service';

const { users } = schema;

async function main(): Promise<void> {
	const url = process.env.DATABASE_URL ?? 'postgres://fofow@localhost:5432/redstation';
	const client = postgres(url, { max: 1, onnotice: () => undefined });
	const db = drizzle(client, { schema });

	const members = new ProjectMembersService(db as never);
	const svc = new ProjectsService(db as never, undefined, members);

	const [owner] = await db.select().from(users).where(eq(users.name, 'Fofow')).limit(1);
	if (!owner) throw new Error('缺少 Fofow 用户');

	// 模拟带 JWT 的请求：viewerId = 当前用户
	const list = await svc.list({}, owner.id);
	console.log(`列表项目数（带身份）：${list.total}`);
	const withRole = list.items.filter((p) => p.myRole !== null);
	console.log(`其中 myRole 非空：${withRole.length} / ${list.items.length}`);
	for (const p of list.items) {
		console.log(`  #${p.id} ${p.label} myRole=${p.myRole} members=${p.members.length}`);
	}

	// 模拟不带 JWT：viewerId = null
	const anon = await svc.list({}, null);
	console.log(`\n列表项目数（匿名）：${anon.total}`);
	console.log(`匿名时 myRole 全为 null：${anon.items.every((p) => p.myRole === null)}`);

	// 校验 JWT 签发可用（与守卫内 verify 一致）
	const jwt = new JwtService({ secret: process.env.JWT_SECRET });
	const token = jwt.sign({ sub: owner.id, uid: owner.uid, name: owner.name });
	const payload = await jwt.verifyAsync(token);
	console.log(`\nJWT 自检：sub=${payload.sub} name=${payload.name}`);

	const ok = withRole.length > 0 && anon.items.every((p) => p.myRole === null);
	console.log(`\n结果：${ok ? '通过' : '失败'}`);
	await client.end();
	if (!ok) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
