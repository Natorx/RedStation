/**
 * 项目成员 / 邀请的端到端验证脚本。
 *
 * 直接实例化 service 层 + 真实数据库，覆盖：
 *  1. 发起人创建项目后自动成为 owner
 *  2. 非成员看不到项目、成员能看到
 *  3. 发起人邀请 → 被邀请人同意 → 成为 member 并可见
 *  4. 重复邀请 / 非发起人邀请被拒
 *
 * 用法：npx tsx scripts/verify_project_members.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';

import * as schema from '../src/db/schema';
import { ProjectsService } from '../src/projects/projects.service';
import { ProjectMembersService } from '../src/projects/project-members.service';

const { projectInvites, projectMembers, projects, users } = schema;

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, extra = ''): void {
	if (ok) {
		pass += 1;
		console.log(`  ✓ ${name}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${name} ${extra}`);
	}
}

async function main(): Promise<void> {
	const url = process.env.DATABASE_URL ?? 'postgres://fofow@localhost:5432/redstation';
	const client = postgres(url, { max: 1, onnotice: () => undefined });
	const db = drizzle(client, { schema });

	const members = new ProjectMembersService(db as never);
	const projectsSvc = new ProjectsService(db as never, undefined, members);

	// 测试用户
	const [owner] = await db.select().from(users).where(eq(users.name, 'Fofow')).limit(1);
	const [other] = await db
		.select()
		.from(users)
		.where(inArray(users.name, ['Mo', 'Lily']))
		.limit(1);
	if (!owner || !other) throw new Error('缺少测试用户');

	console.log(`使用用户：owner=${owner.name}(${owner.id}) other=${other.name}(${other.id})`);

	// 清理上一轮残留：按名字找测试项目
	const label = `__成员验证_${Date.now()}`;
	const created = await projectsSvc.create({ label, tag: '验证' }, { id: owner.id, name: owner.name });

	console.log('\n1. 创建项目后自动成为发起人');
	check('创建返回 owner 角色', created.myRole === 'owner', `实际=${created.myRole}`);
	check('成员列表含发起人', created.members.some((m) => m.userId === owner.id));
	check('发起人 projectRole=owner', created.members.find((m) => m.userId === owner.id)?.projectRole === 'owner');

	console.log('\n2. 可见性：非成员不可见');
	const ownerList = await projectsSvc.list({}, owner.id);
	const otherList = await projectsSvc.list({}, other.id);
	check('发起人列表含该项目', ownerList.items.some((p) => p.id === created.id));
	check('非成员列表不含该项目', !otherList.items.some((p) => p.id === created.id));

	let forbidden = false;
	try {
		await projectsSvc.findById(created.id, other.id);
	} catch {
		forbidden = true;
	}
	check('非成员查详情被拒', forbidden);

	console.log('\n3. 非发起人不能邀请');
	let denied = false;
	try {
		await members.invite(created.id, { userId: owner.id }, { id: other.id, name: other.name });
	} catch {
		denied = true;
	}
	check('非发起人邀请被拒', denied);

	console.log('\n4. 发起人邀请 → 同意 → 成为成员');
	const invite = await members.invite(
		created.id,
		{ userId: other.id, message: '一起来' },
		{ id: owner.id, name: owner.name }
	);
	check('邀请已创建', invite.status === 'pending', `实际=${invite.status}`);

	let dup = false;
	try {
		await members.invite(created.id, { userId: other.id }, { id: owner.id, name: owner.name });
	} catch {
		dup = true;
	}
	check('重复邀请被拒', dup);

	const inbox = await members.myInvites(other.id);
	check('被邀请人收到邀请', inbox.some((i) => i.id === invite.id));

	const reviewed = await members.reviewInvite(invite.id, 'accept', {
		id: other.id,
		name: other.name
	});
	check('邀请状态变为 approved', reviewed.status === 'approved', `实际=${reviewed.status}`);

	const otherList2 = await projectsSvc.list({}, other.id);
	check('同意后项目对成员可见', otherList2.items.some((p) => p.id === created.id));

	const detail = await projectsSvc.findById(created.id, other.id);
	check('成员列表含被邀请人', detail.members.some((m) => m.userId === other.id));
	check('被邀请人角色为 member', detail.myRole === 'member', `实际=${detail.myRole}`);

	console.log('\n5. 移除成员');
	await members.removeMember(created.id, other.id, { id: owner.id, name: owner.name });
	const otherList3 = await projectsSvc.list({}, other.id);
	check('移除后项目不再可见', !otherList3.items.some((p) => p.id === created.id));

	// 清理
	await db.delete(projectInvites).where(eq(projectInvites.projectId, created.id));
	await db.delete(projectMembers).where(eq(projectMembers.projectId, created.id));
	await db.delete(projects).where(eq(projects.id, created.id));
	console.log('\n已清理测试项目');

	console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项`);
	await client.end();
	if (fail > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
