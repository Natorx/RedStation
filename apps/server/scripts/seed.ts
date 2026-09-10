/**
 * 种子数据：把前端 mock 的 6 位团队成员写进 users 表。
 *
 * 用法：pnpm seed
 * 幂等：已存在的 uid 会被跳过，不会重复插入。
 */
import 'reflect-metadata';
import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as bcrypt from 'bcrypt';

import { users } from '../src/db/schema';

const DEFAULT_PASSWORD = 'redstation';
const BCRYPT_ROUNDS = 10;

type SeedUser = {
	uid: string;
	name: string;
	initials: string;
	email: string;
	role: string;
	title: string;
	color: string;
	teams: string[];
	permissions: {
		permProject: boolean;
		permTaskAssign: boolean;
		permPost: boolean;
		permTeamManage: boolean;
		permReportExport: boolean;
		permSystemSetting: boolean;
	};
};

/** 与前端 workspace.svelte.ts 的 MEMBERS / ME 对齐 */
const SEED: SeedUser[] = [
	{
		uid: '10248571',
		name: 'Fofow',
		initials: 'FW',
		email: 'fofow@redstation.local',
		role: '负责人',
		title: '全栈工程师',
		color: '#dc2626',
		teams: ['Red 系核心团队'],
		permissions: {
			permProject: true,
			permTaskAssign: true,
			permPost: true,
			permTeamManage: true,
			permReportExport: false,
			permSystemSetting: false
		}
	},
	{
		uid: '10248572',
		name: 'Mo',
		initials: 'MO',
		email: 'mo@redstation.local',
		role: '前端',
		title: '前端工程师',
		color: '#6366f1',
		teams: ['Red 系核心团队'],
		permissions: {
			permProject: true,
			permTaskAssign: true,
			permPost: true,
			permTeamManage: false,
			permReportExport: false,
			permSystemSetting: false
		}
	},
	{
		uid: '10248573',
		name: 'Lily',
		initials: 'LI',
		email: 'lily@redstation.local',
		role: '设计',
		title: '视觉设计师',
		color: '#ec4899',
		teams: ['Red 系核心团队'],
		permissions: {
			permProject: true,
			permTaskAssign: false,
			permPost: true,
			permTeamManage: false,
			permReportExport: false,
			permSystemSetting: false
		}
	},
	{
		uid: '10248574',
		name: '奇奇',
		initials: 'QQ',
		email: 'qiqi@redstation.local',
		role: '后端',
		title: '后端工程师',
		color: '#22c55e',
		teams: ['Red 系核心团队'],
		permissions: {
			permProject: true,
			permTaskAssign: true,
			permPost: true,
			permTeamManage: false,
			permReportExport: false,
			permSystemSetting: false
		}
	},
	{
		uid: '10248575',
		name: 'TuneOasis',
		initials: 'TU',
		email: 'tuneoasis@redstation.local',
		role: '运维',
		title: '运维工程师',
		color: '#06b6d4',
		teams: ['Red 系核心团队'],
		permissions: {
			permProject: false,
			permTaskAssign: false,
			permPost: true,
			permTeamManage: false,
			permReportExport: false,
			permSystemSetting: true
		}
	},
	{
		uid: '10248576',
		name: 'GameStorm',
		initials: 'GS',
		email: 'gamestorm@redstation.local',
		role: '服务端',
		title: '服务端工程师',
		color: '#f59e0b',
		teams: ['Red 系核心团队'],
		permissions: {
			permProject: true,
			permTaskAssign: true,
			permPost: true,
			permTeamManage: false,
			permReportExport: false,
			permSystemSetting: true
		}
	}
];

async function main() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('缺少环境变量 DATABASE_URL');

	const client = postgres(url, { max: 1, onnotice: () => undefined });
	const db = drizzle(client);

	const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

	let inserted = 0;
	let skipped = 0;

	for (const u of SEED) {
		const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.uid, u.uid)).limit(1);
		if (dup) {
			skipped++;
			console.log(`跳过已存在：${u.uid} ${u.name}`);
			continue;
		}

		await db.insert(users).values({
			uid: u.uid,
			name: u.name,
			initials: u.initials,
			email: u.email,
			passwordHash,
			role: u.role,
			title: u.title,
			color: u.color,
			teams: u.teams.join(','),
			active: true,
			...u.permissions
		});
		inserted++;
		console.log(`已插入：${u.uid} ${u.name}`);
	}

	console.log(`\n完成：新增 ${inserted} 条，跳过 ${skipped} 条。默认密码：${DEFAULT_PASSWORD}`);
	await client.end();
}

main().catch((err) => {
	console.error('种子数据写入失败：', err);
	process.exit(1);
});
