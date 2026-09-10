/**
 * RedStation 工作区共享数据
 * 概览页与项目页共用同一份 projects/tasks 状态，
 * 在任一页面勾选、增删任务都会同步反映到另一页面。
 *
 * 用户/会话/成员已对接后端（见 src/lib/api/client.ts）；
 * 项目与任务仍为 mock，待后端对应模块就绪后按同样方式替换。
 */

import { authApi, clearToken, getToken, setToken, usersApi } from '$lib/api/client';
import type { ApiMember, ApiUser, UpdateProfilePayload } from '$lib/api/client';

export type TaskItem = {
	title: string;
	done: boolean;
	date: string;
	ago: string;
	/** 任务发布者（对接后端后由服务端返回） */
	author: string;
};

/** 项目形态 */
export type ProjectUI = 'GUI' | 'TUI' | 'CLI';

/** 新建项目时的表单数据 */
export type NewProjectInput = {
	label: string;
	tag: string;
	color: string;
	ui: ProjectUI;
	purpose: string;
	intro: string;
	stack: string[];
	frameworks: string[];
	deployed: boolean;
};

export type ProjectItem = {
	label: string;
	tag: string;
	color: string;
	unread: boolean;
	tasks: TaskItem[];
	/** 项目形态：GUI / TUI / CLI */
	ui: ProjectUI;
	/** 用途 */
	purpose: string;
	/** 项目介绍 */
	intro: string;
	/** 技术栈（语言，可多选） */
	stack: string[];
	/** 框架（自由标签） */
	frameworks: string[];
	/** 是否服务器部署 */
	deployed: boolean;
};

/** 可选的技术栈语言 */
export const STACK_OPTIONS = [
	'Typescript',
	'Node',
	'Rust',
	'Go',
	'Python',
	'PostgreSQL',
	'SQLite',
	'Mysql',
	'MongoDB'
];

/** 可选的 UI 形态 */
export const UI_OPTIONS: ProjectUI[] = ['GUI', 'TUI', 'CLI'];

/** 新建项目时可选的标签配色 */
export const COLOR_OPTIONS = ['red', 'violet', 'amber', 'green', 'cyan', 'pink'];

/** 当前登录用户，新建任务的默认发布者 */
export const CURRENT_USER = 'Fofow';

// ===== 会话状态（对接后端 /api/auth/*）=====

/**
 * 会话容器：用对象包住可变字段，这样导出的是常量引用，
 * 但内部字段（loggedIn/loading/me/members）仍可自由赋值并保持响应式。
 */
export const session = $state({
	loggedIn: false,
	loading: true,
	/** 当前登录用户资料，来自 GET /api/auth/me；未登录为 null */
	me: null as ApiUser | null,
	/** 团队成员，来自 GET /api/users/members，供 @ 提及与发布者下拉使用 */
	members: [] as ApiMember[]
});

/**
 * 当前登录用户资料；未登录为 null。
 * 模块顶层不能导出 $derived 状态，故用 getter 函数暴露当前值。
 */
export function ME(): ApiUser | null {
	return session.me;
}

/** 团队成员列表（会话中的 members 字段） */
export function MEMBERS(): ApiMember[] {
	return session.members;
}

/** 登录：调后端换 token，并写入当前用户 */
export async function login(uid: string, password: string): Promise<void> {
	const { token, user } = await authApi.login(uid, password);
	setToken(token);
	session.me = user;
	session.loggedIn = true;
	session.loading = false;
}

/**
 * 退出登录：通知后端（无状态 JWT，失败也不阻塞）并清本地状态
 */
export async function logout(): Promise<void> {
	try {
		await authApi.logout();
	} finally {
		clearToken();
		session.me = null;
		session.members = [];
		session.loggedIn = false;
		session.loading = false;
	}
}

/**
 * 应用启动时恢复会话：有 token 就拉 /api/auth/me 验证并填充用户
 * token 失效（401）则静默清掉，交给路由守卫跳登录页
 */
export async function restoreSession(): Promise<void> {
	if (!getToken()) {
		session.loggedIn = false;
		session.loading = false;
		return;
	}

	try {
		session.me = await authApi.me();
		session.loggedIn = true;
	} catch {
		clearToken();
		session.me = null;
		session.loggedIn = false;
	} finally {
		session.loading = false;
	}
}

/** 拉取团队成员列表；未登录或失败时静默保留空数组 */
export async function loadMembers(): Promise<void> {
	try {
		session.members = await usersApi.members();
	} catch {
		session.members = [];
	}
}

/**
 * 修改自己的资料：成功后用后端返回的最新数据刷新 session.me，
 * 侧栏名片、/me 页等引用处会自动同步。
 */
export async function updateProfile(payload: UpdateProfilePayload): Promise<void> {
	const user = await authApi.updateMe(payload);
	session.me = user;
	// 昵称或头像色变了，成员列表也要跟着刷新
	await loadMembers();
}

/** 修改自己的密码；成功后原 token 仍有效，无需重新登录 */
export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
	await authApi.changeMyPassword(currentPassword, newPassword);
}

/** 任务优先级 */
export type Priority = 'high' | 'medium' | 'low';

export const PRIORITIES: { value: Priority; label: string }[] = [
	{ value: 'high', label: '高' },
	{ value: 'medium', label: '中' },
	{ value: 'low', label: '低' }
];

/** 任务类型（对应标签） */
export type TodoType = '开发' | '设计' | '文档' | '运维' | '调研';

export const TODO_TYPES: TodoType[] = ['开发', '设计', '文档', '运维', '调研'];

/** 待办任务（概览的「任务列表」与任务页共用同一份数据） */
export type TodoItem = {
	text: string;
	done: boolean;
	type: TodoType;
	color: string;
	/** 截止文案，空字符串表示不限期 */
	due: string;
	/** 发布者 */
	author: string;
	priority: Priority;
	/** 创建时间戳，用于按时间筛选 */
	createdAt: number;
};

/** 按天数偏移生成时间戳，方便构造 mock 数据 */
function daysAgo(n: number) {
	return Date.now() - n * 24 * 60 * 60 * 1000;
}

export const todos = $state<TodoItem[]>([
	{
		text: '修复 Redlind 登出闪退',
		done: false,
		type: '开发',
		color: 'red',
		due: '今天',
		author: 'Fofow',
		priority: 'high',
		createdAt: daysAgo(1)
	},
	{
		text: 'Q3 数据看板需求评审',
		done: false,
		type: '设计',
		color: 'violet',
		due: '2 天',
		author: 'Lily',
		priority: 'medium',
		createdAt: daysAgo(3)
	},
	{
		text: '本周工作复盘周报',
		done: true,
		type: '文档',
		color: 'amber',
		due: '',
		author: 'Fofow',
		priority: 'low',
		createdAt: daysAgo(5)
	},
	{
		text: '部署文档整理与版本号升级',
		done: true,
		type: '运维',
		color: 'green',
		due: '',
		author: 'TuneOasis',
		priority: 'medium',
		createdAt: daysAgo(9)
	},
	{
		text: '用户访谈纪要归档',
		done: false,
		type: '调研',
		color: 'cyan',
		due: '3 天',
		author: 'Mo',
		priority: 'low',
		createdAt: daysAgo(14)
	}
]);

/** 切换待办完成状态 */
export function toggleTodo(i: number) {
	if (todos[i]) todos[i].done = !todos[i].done;
}

/** 新增待办任务 */
export function addTodo(text: string, type: TodoType, author: string, priority: Priority) {
	const t = text.trim();
	if (!t) return;
	const palette: Record<TodoType, string> = {
		开发: 'red',
		设计: 'violet',
		文档: 'amber',
		运维: 'green',
		调研: 'cyan'
	};
	todos.unshift({
		text: t,
		done: false,
		type,
		color: palette[type],
		due: '',
		author,
		priority,
		createdAt: Date.now()
	});
}

/** 删除待办任务 */
export function removeTodo(i: number) {
	if (todos[i]) todos.splice(i, 1);
}

/** 动态类型 */
export type PostType = 'report' | 'notice';

export const POST_TYPES: { value: PostType; label: string }[] = [
	{ value: 'report', label: '工作汇报' },
	{ value: 'notice', label: '通知' }
];

/** 从正文里提取被 @ 的成员名 */
export function extractMentions(text: string) {
	return MEMBERS().filter((m) => text.includes('@' + m.name)).map((m) => m.name);
}

/** 今天的日期与“刚刚”文案，用于新建任务 */
export function nowStamp() {
	const d = new Date();
	return {
		date: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
		ago: '刚刚'
	};
}

/** 所有页面共享的项目清单（模块级 $state，跨组件共享同一引用） */
export const projects = $state<ProjectItem[]>([
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
			{ title: 'Android 适配', done: false, date: '2026-9-9', ago: '12 分钟前', author: 'Fofow' },
			{ title: 'Windows 适配', done: true, date: '2026-9-8', ago: '昨天', author: 'Mo' },
			{ title: 'UI 优化', done: true, date: '2026-9-6', ago: '3 天前', author: 'Lily' }
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
		tasks: [
			{ title: 'TuneOasis 自动部署脚本', done: false, date: '2026-9-9', ago: '41 分钟前', author: '奇奇' }
		]
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
		tasks: [
			{ title: '加入 RedStation 项目', done: false, date: '2026-9-9', ago: '2 小时前', author: 'Fofow' }
		]
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
			{ title: '后端接入', done: false, date: '2026-9-9', ago: '26 分钟前', author: 'Mo' },
			{ title: '项目 UI 设计', done: false, date: '2026-9-8', ago: '昨天', author: 'Lily' },
			{ title: '项目部署', done: false, date: '2026-9-7', ago: '前天', author: 'Fofow' }
		]
	}
]);

/** 按名称查找项目；名称唯一，找不到返回 undefined */
export function findProject(label: string) {
	return projects.find((p) => p.label === label);
}

/** 新建项目；名称重复则返回 false */
export function addProject(input: NewProjectInput) {
	const label = input.label.trim();
	if (!label || findProject(label)) return false;
	projects.push({
		label,
		tag: input.tag.trim() || '未分类',
		color: input.color,
		unread: false,
		ui: input.ui,
		purpose: input.purpose.trim(),
		intro: input.intro.trim(),
		stack: [...input.stack],
		frameworks: input.frameworks.map((f) => f.trim()).filter(Boolean),
		deployed: input.deployed,
		tasks: []
	});
	return true;
}

/** 修改已有项目的信息；项目名改动会同步（新名字重复则返回 false） */
export function updateProject(originalLabel: string, input: NewProjectInput) {
	const proj = findProject(originalLabel);
	if (!proj) return false;
	const label = input.label.trim();
	if (!label) return false;
	// 改名时不能与其它项目重名
	if (label !== originalLabel && findProject(label)) return false;

	proj.label = label;
	proj.tag = input.tag.trim() || '未分类';
	proj.color = input.color;
	proj.ui = input.ui;
	proj.purpose = input.purpose.trim();
	proj.intro = input.intro.trim();
	proj.stack = [...input.stack];
	proj.frameworks = input.frameworks.map((f) => f.trim()).filter(Boolean);
	proj.deployed = input.deployed;
	return true;
}

/** 给指定项目新增一条任务 */
export function addProjectTask(label: string, title: string, author: string = CURRENT_USER) {
	const proj = findProject(label);
	if (!proj) return;
	const text = title.trim();
	if (!text) return;
	proj.tasks.push({ title: text, done: false, author, ...nowStamp() });
}

/** 切换指定项目第 i 条任务的完成状态 */
export function toggleProjectTask(label: string, i: number) {
	const proj = findProject(label);
	if (proj?.tasks[i]) proj.tasks[i].done = !proj.tasks[i].done;
}

/** 删除指定项目第 i 条任务 */
export function removeProjectTask(label: string, i: number) {
	const proj = findProject(label);
	if (proj) proj.tasks.splice(i, 1);
}
