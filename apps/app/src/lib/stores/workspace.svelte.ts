/**
 * RedStation 工作区共享数据
 * 概览页与项目页共用同一份 projects/tasks 状态，
 * 在任一页面勾选、增删任务都会同步反映到另一页面。
 *
 * 目前数据为 mock；对接后端时把 projects 换成接口返回值、
 * 把下方几个变更函数改成对应的请求即可，字段结构保持不变。
 */

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

/** 团队成员（mock，用于 @ 提及）；对接后端后换成接口返回值 */
export type Member = {
	name: string;
	role: string;
	color: string;
};

export const MEMBERS: Member[] = [
	{ name: 'Fofow', role: '负责人', color: '#dc2626' },
	{ name: 'Mo', role: '前端', color: '#6366f1' },
	{ name: 'Lily', role: '设计', color: '#ec4899' },
	{ name: '奇奇', role: '后端', color: '#22c55e' },
	{ name: 'TuneOasis', role: '运维', color: '#06b6d4' },
	{ name: 'GameStorm', role: '服务端', color: '#f59e0b' }
];

/** 当前用户的资料（mock，对接后端后换成 /api/me 返回值） */
export const ME = {
	/** 八位数用户 ID */
	id: '10248571',
	name: 'Fofow',
	initials: 'FW',
	role: '负责人',
	title: '全栈工程师',
	color: '#dc2626',
	/** 所在团队 */
	teams: ['Red 系核心团队'],
	/** 邮箱 / 联系方式 */
	email: 'fofow@redstation.local',
	/** 加入时间 */
	joined: '2026-08-01',
	/** 权限清单 */
	permissions: [
		{ name: '项目管理', desc: '新建、编辑与归档项目', granted: true },
		{ name: '任务分配', desc: '创建任务并指派给团队成员', granted: true },
		{ name: '发布动态', desc: '发布工作汇报与通知', granted: true },
		{ name: '团队管理', desc: '邀请成员、调整角色', granted: true },
		{ name: '报表导出', desc: '导出统计报表与原始数据', granted: false },
		{ name: '系统设置', desc: '修改工作区与部署配置', granted: false }
	]
};

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
	return MEMBERS.filter((m) => text.includes('@' + m.name)).map((m) => m.name);
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
