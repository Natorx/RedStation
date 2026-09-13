/**
 * RedStation 工作区共享数据
 * 概览页与项目页共用同一份 projects/tasks 状态，
 * 在任一页面勾选、增删任务都会同步反映到另一页面。
 *
 * 用户、会话、成员、项目、任务、动态均已对接后端
 * （接口封装见 src/lib/api/client.ts，本文件只做状态与缓存）。
 * 仅「消息」模块仍是前端 mock，待后端对应模块就绪后按同样方式替换。
 *
 * 状态暴露方式：Svelte 5 不允许从模块顶层导出 $derived，
 * 因此统一用 getter 函数（ME() / MEMBERS() / PROJECTS() / TODOS() / ACTIVITIES()）。
 */

import {
	ApiError,
	activitiesApi,
	authApi,
	clearToken,
	getToken,
	plansApi,
	projectsApi,
	setToken,
	todosApi,
	usersApi
} from '$lib/api/client';
import type {
	ApiActivity,
	ApiPlan,
	ApiStepStatus,
	ApiMember,
	ApiProject,
	ApiTaskCategory,
	ApiTodo,
	ApiUser,
	UpdateProfilePayload
} from '$lib/api/client';

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
	/** 运行端口，如 "3010"；多个用逗号分隔 */
	runPort: string;
	/** 项目发起人名字 */
	owner: string;
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
	/** 运行端口，如 "3010"；多个用逗号分隔 */
	runPort: string;
	/** 项目发起人名字 */
	owner: string;
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
export type TodoType = '开发' | '设计' | '文档' | '运维' | '调研' | '其他';

export const TODO_TYPES: TodoType[] = ['开发', '设计', '文档', '运维', '调研', '其他'];

/** 动态类型：工作汇报 / 通知 */
export type PostType = 'report' | 'notice';

export const POST_TYPES: { value: PostType; label: string }[] = [
	{ value: 'report', label: '工作汇报' },
	{ value: 'notice', label: '通知' }
];

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

// ===== 工作区数据（项目 / 待办 / 动态）=====
//
// 三者都来自后端，用「容器对象 + getter 函数」暴露：
// Svelte 5 不允许从模块顶层导出 $derived 状态，所以统一走函数。

export const workspace = $state({
	/** 项目列表（含各自的任务），来自 GET /api/projects */
	projects: [] as ApiProject[],
	/** 全局待办，来自 GET /api/todos */
	todos: [] as ApiTodo[],
	/** 动态，来自 GET /api/activities */
	activities: [] as ApiActivity[],
	/** 规划（每个计划 = 一张横向流程图），来自 GET /api/plans */
	plans: [] as ApiPlan[],
	/** 是否正在加载（页面可据此显示空态） */
	loading: false,
	/** 最近一次加载的错误信息，null 表示无错误 */
	error: null as string | null
});

/** 规划列表 */
export function PLANS(): ApiPlan[] {
	return workspace.plans;
}

/** 项目列表 */
export function PROJECTS(): ApiProject[] {
	return workspace.projects;
}

/** 全局待办列表 */
export function TODOS(): ApiTodo[] {
	return workspace.todos;
}

/** 动态列表 */
export function ACTIVITIES(): ApiActivity[] {
	return workspace.activities;
}

/** 按 id 找项目 */
export function findProjectById(id: number): ApiProject | undefined {
	return workspace.projects.find((p) => p.id === id);
}

/**
 * 按项目名找项目。
 * 前端历史上用名字定位，保留此入口；新代码建议用 findProjectById。
 */
export function findProject(label: string): ApiProject | undefined {
	return workspace.projects.find((p) => p.label === label);
}

/** 待办类型 -> 标签配色，与后端约定一致 */
export const TODO_COLORS: Record<TodoType, string> = {
	开发: 'red',
	设计: 'violet',
	文档: 'amber',
	运维: 'green',
	调研: 'cyan',
	其他: 'pink'
};

/** 取待办的展示色；后端不返回 color，由前端按 type 映射 */
export function todoColor(type: string): string {
	return TODO_COLORS[type as TodoType] ?? 'red';
}

// ===== 加载 =====

/** 拉取项目列表（含任务） */
export async function loadProjects(): Promise<void> {
	try {
		const res = await projectsApi.list();
		workspace.projects = res.items;
		workspace.error = null;
	} catch (err) {
		workspace.error = err instanceof ApiError ? err.message : '项目加载失败';
	}
}

/** 拉取全局待办 */
export async function loadTodos(): Promise<void> {
	try {
		const res = await todosApi.list({ limit: 500 });
		workspace.todos = res.items;
		workspace.error = null;
	} catch (err) {
		workspace.error = err instanceof ApiError ? err.message : '任务加载失败';
	}
}

/** 拉取动态 */
export async function loadActivities(): Promise<void> {
	try {
		const res = await activitiesApi.list({ limit: 50 });
		workspace.activities = res.items;
		workspace.error = null;
	} catch (err) {
		workspace.error = err instanceof ApiError ? err.message : '动态加载失败';
	}
}

/** 一次性加载概览页需要的全部数据 */
export async function loadWorkspace(): Promise<void> {
	// 防重入：登录态变化可能触发多次，避免并发重复请求
	if (workspace.loading) return;
	workspace.loading = true;
	try {
		await Promise.all([loadProjects(), loadTodos(), loadActivities()]);
	} finally {
		workspace.loading = false;
	}
}

/** 拉取规划列表（每个计划含自己的步骤链） */
export async function loadPlans(): Promise<void> {
	try {
		const res = await plansApi.list({ limit: 200 });
		workspace.plans = res.items;
	} catch (err) {
		workspace.error = err instanceof ApiError ? err.message : '规划加载失败';
	}
}

// ===== 待办操作 =====

/** 切换待办完成状态 */
export async function toggleTodo(id: number): Promise<void> {
	// 乐观更新：先改本地，失败回滚
	const item = workspace.todos.find((t) => t.id === id);
	if (!item) return;
	const before = item.done;
	item.done = !before;
	try {
		const updated = await todosApi.toggle(id);
		item.done = updated.done;
	} catch (err) {
		item.done = before;
		throw err;
	}
}

/** 新建待办；返回新条目 */
export async function addTodo(
	text: string,
	type: TodoType,
	author: string,
	priority: Priority
): Promise<ApiTodo> {
	const created = await todosApi.create({
		text: text.trim(),
		type,
		priority,
		authorName: author
	});
	// 新任务插到最前，与后端 createdAt 倒序一致
	workspace.todos = [created, ...workspace.todos];
	return created;
}

/** 删除待办 */
export async function removeTodo(id: number): Promise<void> {
	await todosApi.remove(id);
	workspace.todos = workspace.todos.filter((t) => t.id !== id);
}

// ===== 项目操作 =====

/** 新建项目；业务错误（如重名）会抛 ApiError 供页面提示 */
export async function addProject(input: NewProjectInput): Promise<ApiProject> {
	const created = await projectsApi.create({
		label: input.label.trim(),
		tag: input.tag,
		color: input.color,
		ui: input.ui,
		purpose: input.purpose,
		intro: input.intro,
		stack: input.stack,
		frameworks: input.frameworks,
		deployed: input.deployed,
		runPort: input.runPort
	});
	workspace.projects = [...workspace.projects, created];
	return created;
}

/** 修改项目；originalId 为编辑前的项目 id */
export async function updateProject(originalId: number, input: NewProjectInput): Promise<ApiProject> {
	const updated = await projectsApi.update(originalId, {
		label: input.label.trim(),
		tag: input.tag,
		color: input.color,
		ui: input.ui,
		purpose: input.purpose,
		intro: input.intro,
		stack: input.stack,
		frameworks: input.frameworks,
		deployed: input.deployed,
		runPort: input.runPort
	});
	workspace.projects = workspace.projects.map((p) => (p.id === originalId ? updated : p));
	return updated;
}

/** 删除项目；项目下的任务由后端级联删除 */
export async function removeProject(id: number): Promise<void> {
	await projectsApi.remove(id);
	workspace.projects = workspace.projects.filter((p) => p.id !== id);
}

/** 清除项目的未读角标（打开详情/弹窗时调用） */
export async function markProjectRead(id: number): Promise<void> {
	const item = workspace.projects.find((p) => p.id === id);
	// 已是已读就不必再打一次请求
	if (!item || !item.unread) return;
	try {
		const updated = await projectsApi.markRead(id);
		workspace.projects = workspace.projects.map((p) => (p.id === id ? updated : p));
	} catch {
		// 角标清除失败不影响主流程，静默忽略
	}
}

// ===== 项目任务操作 =====

/** 给项目新增任务 */
export async function addProjectTask(
	projectId: number,
	title: string,
	category?: ApiTaskCategory
): Promise<void> {
	const text = title.trim();
	if (!text) return;
	const created = await projectsApi.addTask(projectId, text, category);
	workspace.projects = workspace.projects.map((p) =>
		p.id === projectId
			? { ...p, tasks: [...p.tasks, created], taskTotal: p.taskTotal + 1, unread: true }
			: p
	);
}

/** 切换项目任务完成状态（按任务 id，不再靠数组下标） */
export async function toggleProjectTask(taskId: number): Promise<void> {
	const updated = await projectsApi.toggleTask(taskId);
	workspace.projects = workspace.projects.map((p) => {
		if (!p.tasks.some((t) => t.id === taskId)) return p;
		const tasks = p.tasks.map((t) => (t.id === taskId ? updated : t));
		return { ...p, tasks, taskDone: tasks.filter((t) => t.done).length };
	});
}

/**
 * 更新项目任务的标题 / 类别。
 * 只改传入的字段，createdAt（发布时间）由后端保留，不受影响。
 */
export async function updateProjectTask(
	taskId: number,
	patch: { title?: string; category?: ApiTaskCategory }
): Promise<void> {
	const updated = await projectsApi.updateTask(taskId, patch);
	workspace.projects = workspace.projects.map((p) => {
		if (!p.tasks.some((t) => t.id === taskId)) return p;
		const tasks = p.tasks.map((t) => (t.id === taskId ? updated : t));
		return { ...p, tasks };
	});
}

/** 删除项目任务 */
export async function removeProjectTask(taskId: number): Promise<void> {
	await projectsApi.removeTask(taskId);
	workspace.projects = workspace.projects.map((p) => {
		if (!p.tasks.some((t) => t.id === taskId)) return p;
		const tasks = p.tasks.filter((t) => t.id !== taskId);
		return { ...p, tasks, taskTotal: tasks.length, taskDone: tasks.filter((t) => t.done).length };
	});
}

// ===== 动态操作 =====

/** 发布动态；mentions 传成员名字数组即可，后端会反查成用户 */
export async function publishActivity(input: {
	content: string;
	type: PostType;
	visibility: 'team' | 'private';
	projectId: number | null;
	mentions: string[];
}): Promise<ApiActivity> {
	const created = await activitiesApi.create({
		content: input.content,
		type: input.type,
		visibility: input.visibility,
		projectId: input.projectId,
		mentions: input.mentions
	});
	workspace.activities = [created, ...workspace.activities];
	return created;
}

/** 删除动态 */
export async function removeActivity(id: number): Promise<void> {
	await activitiesApi.remove(id);
	workspace.activities = workspace.activities.filter((a) => a.id !== id);
}

/** 从正文里提取被 @ 的成员名 */
export function extractMentions(text: string) {
	return MEMBERS()
		.filter((m) => text.includes('@' + m.name))
		.map((m) => m.name);
}

// ===== 规划操作 =====

/** 用后端返回值替换本地计划，保持列表与步骤同步 */
function replacePlan(plan: ApiPlan): void {
	workspace.plans = workspace.plans.map((p) => (p.id === plan.id ? plan : p));
}

/** 新建计划；可带一串初始步骤标题 */
export async function addPlan(input: {
	title: string;
	goal?: string;
	steps?: string[];
}): Promise<ApiPlan> {
	const created = await plansApi.create({
		title: input.title.trim(),
		goal: input.goal?.trim() ?? '',
		steps: (input.steps ?? []).map((s) => s.trim()).filter(Boolean)
	});
	workspace.plans = [created, ...workspace.plans];
	return created;
}

/** 更新计划：改名 / 目标 / 启停 */
export async function updatePlan(
	id: number,
	payload: { title?: string; goal?: string; active?: boolean }
): Promise<ApiPlan> {
	const updated = await plansApi.update(id, payload);
	replacePlan(updated);
	return updated;
}

/** 删除计划；步骤由后端级联删除 */
export async function removePlan(id: number): Promise<void> {
	await plansApi.remove(id);
	workspace.plans = workspace.plans.filter((p) => p.id !== id);
}

/** 给计划追加一步，追加到流程末尾 */
export async function addPlanStep(planId: number, title: string): Promise<void> {
	replacePlan(await plansApi.addStep(planId, title.trim()));
}

/** 改步骤内容 / 状态 / 顺序 */
export async function updatePlanStep(
	stepId: number,
	payload: { title?: string; status?: ApiStepStatus; position?: number }
): Promise<void> {
	replacePlan(await plansApi.updateStep(stepId, payload));
}

/** 删除步骤 */
export async function removePlanStep(stepId: number): Promise<void> {
	replacePlan(await plansApi.removeStep(stepId));
}
