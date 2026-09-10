/**
 * 工作区种子数据：把前端最初的 mock 数据完整灌入数据库。
 *
 * 数据来源：仓库 commit 99a7475「Project UI Design」中
 *   - apps/app/src/lib/stores/workspace.svelte.ts 的 projects / todos
 *   - apps/app/src/routes/+page.svelte 的 activity
 *
 * 用法：
 *   pnpm seed:workspace          追加缺失的数据（幂等，已存在的跳过）
 *   pnpm seed:workspace --reset  先清空 projects/todos/activities 再灌
 *
 * 幂等策略：
 *   - 项目按 label 判重
 *   - 项目任务按 (项目, 标题) 判重
 *   - 待办按 text 判重
 *   - 动态按 content 判重
 */
import 'reflect-metadata';
import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { activities, activityMentions, projectTasks, projects, todos, users } from '../src/db/schema';

const RESET = process.argv.includes('--reset');

/** mock 里作者名 -> 用于反查用户 id 与头像色 */
type SeedTask = { title: string; done: boolean; author: string; agoDays: number };

type SeedProject = {
	label: string;
	tag: string;
	color: string;
	unread: boolean;
	ui: string;
	purpose: string;
	intro: string;
	stack: string[];
	frameworks: string[];
	deployed: boolean;
	tasks: SeedTask[];
};

type SeedTodo = {
	text: string;
	done: boolean;
	type: string;
	priority: string;
	author: string;
	agoDays: number;
	/** 剩余天数，用于生成 dueAt；null 表示不限期 */
	dueInDays: number | null;
};

type SeedActivity = {
	content: string;
	type: string;
	author: string;
	/** 关联项目名，空串表示不关联 */
	project: string;
	mentions: string[];
	agoMinutes: number;
};

// ===== 项目（来自 workspace.svelte.ts 的 mock）=====
const SEED_PROJECTS: SeedProject[] = [
	{
		label: 'Redlind',
		tag: '桌面应用',
		color: 'red',
		unread: true,
		ui: 'GUI',
		purpose: '跨平台桌面工作台',
		intro: 'Redlind 是 Red 系的桌面应用主应用，负责本地数据管理、打印与设备联动。',
		stack: ['Typescript', 'Rust'],
		frameworks: ['Tauri', 'Svelte'],
		deployed: false,
		tasks: [
			{ title: 'Android 适配', done: false, author: 'Fofow', agoDays: 0 },
			{ title: 'Windows 适配', done: true, author: 'Mo', agoDays: 1 },
			{ title: 'UI 优化', done: true, author: 'Lily', agoDays: 3 }
		]
	},
	{
		label: 'Redcloud',
		tag: '自动化',
		color: 'red',
		unread: false,
		ui: 'CLI',
		purpose: '部署与运维自动化',
		intro: 'Redcloud 汇总各类一键部署脚本，负责服务端环境的初始化与发布。',
		stack: ['Node', 'Python'],
		frameworks: ['Fastify'],
		deployed: true,
		tasks: [{ title: 'TuneOasis 自动部署脚本', done: false, author: '奇奇', agoDays: 0 }]
	},
	{
		label: 'RedLauncher',
		tag: '启动器',
		color: 'green',
		unread: true,
		ui: 'GUI',
		purpose: '统一应用启动入口',
		intro: 'RedLauncher 用统一入口拉起 Red 系各个工具，支持快速切换与更新。',
		stack: ['Typescript'],
		frameworks: ['Tauri'],
		deployed: false,
		tasks: [{ title: '加入 RedStation 项目', done: false, author: 'Fofow', agoDays: 0 }]
	},
	{
		label: 'Redocs',
		tag: '文档',
		color: 'amber',
		unread: false,
		ui: 'GUI',
		purpose: '文档库与知识沉淀',
		intro: 'Redocs 是基于 VitePress 的文档库，存放原理笔记、实践报告与任务记录。',
		stack: ['Typescript'],
		frameworks: ['VitePress'],
		deployed: true,
		tasks: []
	},
	{
		label: 'RedStation',
		tag: '工作台',
		color: 'violet',
		unread: true,
		ui: 'GUI',
		purpose: '一体化工作台',
		intro: 'RedStation 把项目、任务、进度汇报与报表收拢到一个界面里，作为日常入口。',
		stack: ['Typescript', 'Node'],
		frameworks: ['SvelteKit', 'Fastify'],
		deployed: true,
		tasks: [
			{ title: '后端接入', done: false, author: 'Mo', agoDays: 0 },
			{ title: '项目 UI 设计', done: false, author: 'Lily', agoDays: 1 },
			{ title: '项目部署', done: false, author: 'Fofow', agoDays: 2 }
		]
	}
];

// ===== 全局待办（来自 mock 的 todos）=====
const SEED_TODOS: SeedTodo[] = [
	{ text: '修复 Redlind 登出闪退', done: false, type: '开发', priority: 'high', author: 'Fofow', agoDays: 1, dueInDays: 0 },
	{ text: 'Q3 数据看板需求评审', done: false, type: '设计', priority: 'medium', author: 'Lily', agoDays: 3, dueInDays: 2 },
	{ text: '本周工作复盘周报', done: true, type: '文档', priority: 'low', author: 'Fofow', agoDays: 5, dueInDays: null },
	{ text: '部署文档整理与版本号升级', done: true, type: '运维', priority: 'medium', author: 'TuneOasis', agoDays: 9, dueInDays: null },
	{ text: '用户访谈纪要归档', done: false, type: '调研', priority: 'low', author: 'Mo', agoDays: 14, dueInDays: 3 }
];

// ===== 动态（来自概览页 mock 的 activity）=====
const SEED_ACTIVITIES: SeedActivity[] = [
	{
		content: 'Tune Oasis 本地测试',
		type: 'report',
		author: 'TuneOasis',
		project: 'Redcloud',
		mentions: [],
		agoMinutes: 42
	},
	{
		content: 'RedStation 立项，@Mo 跟进前端',
		type: 'report',
		author: 'Fofow',
		project: 'RedStation',
		mentions: ['Mo'],
		agoMinutes: 24
	},
	{
		content: '今晚 22:00 服务端重启，请注意保存进度',
		type: 'notice',
		author: 'GameStorm',
		project: '',
		mentions: [],
		agoMinutes: 120
	}
];

/** 按天数偏移生成时间 */
function daysAgo(n: number): Date {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** 按分钟偏移生成时间 */
function minutesAgo(n: number): Date {
	return new Date(Date.now() - n * 60 * 1000);
}

async function main() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('缺少环境变量 DATABASE_URL');

	const client = postgres(url, { max: 1, onnotice: () => undefined });
	const db = drizzle(client);

	if (RESET) {
		console.log('--reset：清空 projects / todos / activities');
		// project_tasks 与 activity_mentions 由外键级联清理
		await db.delete(activities);
		await db.delete(todos);
		await db.delete(projects);
	}

	// 作者名 -> 用户，用于记录 authorId 与颜色
	const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
	const userIdByName = new Map(allUsers.map((u) => [u.name, u.id]));

	const stats = { projects: 0, tasks: 0, todos: 0, activities: 0, mentions: 0, skipped: 0 };

	// ===== 项目与项目任务 =====
	for (const p of SEED_PROJECTS) {
		const [existing] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(eq(projects.label, p.label))
			.limit(1);

		let projectId: number;
		if (existing) {
			projectId = existing.id;
			stats.skipped++;
			console.log(`跳过已存在项目：${p.label}`);
		} else {
			const [row] = await db
				.insert(projects)
				.values({
					label: p.label,
					tag: p.tag,
					color: p.color,
					unread: p.unread,
					ui: p.ui,
					purpose: p.purpose,
					intro: p.intro,
					stack: p.stack.join(','),
					frameworks: p.frameworks.join(','),
					deployed: p.deployed
				})
				.returning({ id: projects.id });
			projectId = row.id;
			stats.projects++;
			console.log(`已插入项目：${p.label}`);
		}

		// 项目任务：按标题判重
		const existingTasks = await db
			.select({ title: projectTasks.title })
			.from(projectTasks)
			.where(eq(projectTasks.projectId, projectId));
		const seen = new Set(existingTasks.map((t) => t.title));

		for (const t of p.tasks) {
			if (seen.has(t.title)) {
				stats.skipped++;
				continue;
			}
			await db.insert(projectTasks).values({
				projectId,
				title: t.title,
				done: t.done,
				authorId: userIdByName.get(t.author) ?? null,
				authorName: t.author,
				createdAt: daysAgo(t.agoDays)
			});
			stats.tasks++;
		}
	}

	// ===== 全局待办 =====
	for (const t of SEED_TODOS) {
		const [existing] = await db
			.select({ id: todos.id })
			.from(todos)
			.where(eq(todos.text, t.text))
			.limit(1);
		if (existing) {
			stats.skipped++;
			console.log(`跳过已存在待办：${t.text}`);
			continue;
		}

		await db.insert(todos).values({
			text: t.text,
			done: t.done,
			type: t.type,
			priority: t.priority,
			// mock 里的「今天 / 2 天」文案换算成具体时间
			dueAt:
				t.dueInDays === null
					? null
					: new Date(Date.now() + t.dueInDays * 24 * 60 * 60 * 1000),
			authorId: userIdByName.get(t.author) ?? null,
			authorName: t.author,
			createdAt: daysAgo(t.agoDays)
		});
		stats.todos++;
	}

	// ===== 动态 =====
	// 项目名 -> id，供「关联项目」字段使用
	const projectRows = await db.select({ id: projects.id, label: projects.label }).from(projects);
	const projectIdByName = new Map(projectRows.map((p) => [p.label, p.id]));

	for (const a of SEED_ACTIVITIES) {
		const [existing] = await db
			.select({ id: activities.id })
			.from(activities)
			.where(eq(activities.content, a.content))
			.limit(1);
		if (existing) {
			stats.skipped++;
			console.log(`跳过已存在动态：${a.content.slice(0, 20)}`);
			continue;
		}

		const created = daysAgo(0);
		created.setTime(minutesAgo(a.agoMinutes).getTime());

		const [row] = await db
			.insert(activities)
			.values({
				content: a.content,
				type: a.type,
				visibility: 'team',
				projectId: a.project ? (projectIdByName.get(a.project) ?? null) : null,
				authorId: userIdByName.get(a.author) ?? null,
				authorName: a.author,
				createdAt: created
			})
			.returning({ id: activities.id });
		stats.activities++;

		// @ 提及
		for (const name of a.mentions) {
			const uid = userIdByName.get(name);
			if (!uid) {
				console.warn(`  ⚠ 提及的用户不存在，已跳过：${name}`);
				continue;
			}
			await db
				.insert(activityMentions)
				.values({ activityId: row.id, userId: uid })
				.onConflictDoNothing();
			stats.mentions++;
		}
	}

	console.log(`
完成：
  新增项目 ${stats.projects} 个、项目任务 ${stats.tasks} 条
  新增待办 ${stats.todos} 条、动态 ${stats.activities} 条、提及 ${stats.mentions} 条
  跳过已存在 ${stats.skipped} 条`);

	await client.end();
}

main().catch((err) => {
	console.error('工作区种子数据写入失败：', err);
	process.exit(1);
});
