/**
 * RedStation API 客户端
 *
 * 统一处理：
 * - baseURL 与 /api 前缀（开发期由 vite proxy 转发到 NestJS，见 vite.config.ts）
 * - JWT 存取（localStorage）
 * - 请求/响应序列化、错误归一化
 */

import { PUBLIC_API_BASE } from '$env/static/public';

const TOKEN_KEY = 'redstation.token';

/**
 * API 基址。
 * - 生产（adapter-node SSR / 独立端口直连）：构建期由 PUBLIC_API_BASE 注入后端地址
 * - 开发：.env 中不设该项，留空后走 vite proxy 的相对路径 /api/*
 */
const API_BASE: string = PUBLIC_API_BASE || '';

/** 后端错误统一结构 */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'ApiError';
	}
}

// ===== token 管理 =====

export function getToken(): string | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
	if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
	if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

// ===== 请求封装 =====

type RequestOptions = {
	method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
	body?: unknown;
	/** 查询参数，值会自动 URL 编码（中文角色名等必须编码） */
	query?: Record<string, string | number | boolean | undefined>;
	/** 是否跳过 Authorization 头 */
	skipAuth?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { method = 'GET', body, query, skipAuth = false } = options;

	const url = new URL(
		path,
		API_BASE || (typeof location !== 'undefined' ? location.origin : 'http://localhost')
	);
	if (query) {
		for (const [k, v] of Object.entries(query)) {
			if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
		}
	}

	const headers: Record<string, string> = {};
	if (body !== undefined) headers['Content-Type'] = 'application/json';

	if (!skipAuth) {
		const token = getToken();
		if (token) headers.Authorization = `Bearer ${token}`;
	}

	let res: Response;
	try {
		res = await fetch(url.href, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body)
		});
	} catch {
		throw new ApiError('无法连接后端服务，请确认服务已启动', 0);
	}

	// 204 或空响应体
	const text = await res.text();
	const data = text ? safeParse(text) : null;

	if (!res.ok) {
		const message =
			(data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
				? data.message
				: null) ?? `请求失败（${res.status}）`;
		throw new ApiError(message, res.status);
	}

	return data as T;
}

function safeParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

// ===== 类型定义（对齐后端 UserView）=====

export type ApiPermission = {
	name: string;
	desc: string;
	granted: boolean;
};

export type ApiUser = {
	id: number;
	uid: string;
	name: string;
	initials: string | null;
	email: string;
	role: string;
	title: string | null;
	color: string;
	teams: string[];
	active: boolean;
	permissions: ApiPermission[];
	createdAt: string;
	updatedAt: string;
};

export type ApiMember = {
	id: number;
	name: string;
	role: string;
	color: string;
};

export type UpdateUserPayload = {
	name?: string;
	email?: string;
	password?: string;
	initials?: string | null;
	role?: string;
	title?: string | null;
	color?: string;
	teams?: string[];
	active?: boolean;
	permissions?: Record<string, boolean>;
};

/**
 * 自助修改个人资料的字段，与后端 UpdateProfileDto 对齐。
 * 不含 uid / role / active / permissions —— 这些属管理员权限，后端会忽略。
 */
export type UpdateProfilePayload = {
	name?: string;
	email?: string;
	initials?: string | null;
	title?: string | null;
	color?: string;
	teams?: string[];
};

// ===== 业务接口 =====

export const authApi = {
	/** 登录，成功后 token 由调用方写入 */
	login(uid: string, password: string) {
		return request<{ token: string; user: ApiUser }>('/api/auth/login', {
			method: 'POST',
			body: { uid, password },
			skipAuth: true
		});
	},

	/** 用当前 token 换取用户资料；token 失效会抛 401 */
	me() {
		return request<ApiUser>('/api/auth/me');
	},

	/**
	 * 修改自己的资料。
	 * 走 PATCH /api/users/me —— 后端从 JWT 解析身份，前端不需要也不能传 id。
	 */
	updateMe(payload: UpdateProfilePayload) {
		return request<ApiUser>('/api/users/me', { method: 'PATCH', body: payload });
	},

	/** 修改自己的密码，必须提供当前密码 */
	changeMyPassword(currentPassword: string, newPassword: string) {
		return request<{ ok: boolean }>('/api/users/me/password', {
			method: 'PATCH',
			body: { currentPassword, newPassword }
		});
	},

	logout() {
		return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }).catch(() => ({ ok: true }));
	}
};

export const usersApi = {
	/** 按 uid 查用户 */
	findByUid(uid: string) {
		return request<ApiUser>(`/api/users/uid/${encodeURIComponent(uid)}`);
	},

	findById(id: number) {
		return request<ApiUser>(`/api/users/${id}`);
	},

	/** 团队成员列表，供 @ 提及与发布者下拉使用 */
	members() {
		return request<ApiMember[]>('/api/users/members');
	},

	list(query: { q?: string; role?: string; active?: boolean; limit?: number; offset?: number } = {}) {
		return request<{ total: number; items: ApiUser[] }>('/api/users', { query });
	},

	update(id: number, payload: UpdateUserPayload) {
		return request<ApiUser>(`/api/users/${id}`, { method: 'PATCH', body: payload });
	},

	changePassword(id: number, currentPassword: string, newPassword: string) {
		return request<{ ok: boolean }>(`/api/users/${id}/password`, {
			method: 'PATCH',
			body: { currentPassword, newPassword }
		});
	}
};

export const healthApi = {
	check() {
		return request<{ status: string; database: string; time: string }>('/api/health', {
			skipAuth: true
		});
	}
};

// ===== 项目模块 =====

export type ApiProjectTask = {
	id: number;
	projectId: number;
	title: string;
	done: boolean;
	/** 类别：功能 / 新模块 / 优化 / UI / 运维 / 设计 */
	category: ApiTaskCategory;
	author: string;
	/** 后端算好的日期文案，如 2026-9-10 */
	date: string;
	/** 后端算好的相对时间，如「12 分钟前」 */
	ago: string;
	createdAt: string;
};

/** 项目任务的类别，与后端 TASK_CATEGORIES 保持一致 */
export const TASK_CATEGORIES = ['功能', '新模块', '优化', 'UI', '运维', '设计'] as const;
export type ApiTaskCategory = (typeof TASK_CATEGORIES)[number];

export type ApiProject = {
	id: number;
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
	/** 运行端口，如 "3010"；多个用逗号分隔，未填为空串 */
	runPort: string;
	/** 项目发起人名字；未记录时为空串 */
	owner: string;
	tasks: ApiProjectTask[];
	taskTotal: number;
	taskDone: number;
	createdAt: string;
	updatedAt: string;
};

export type ProjectPayload = {
	label: string;
	tag?: string;
	color?: string;
	ui?: string;
	purpose?: string;
	intro?: string;
	stack?: string[];
	frameworks?: string[];
	deployed?: boolean;
	/** 运行端口，如 "3010"；多个用逗号分隔 */
	runPort?: string;
};
export const projectsApi = {
	list(query: { q?: string; tag?: string; unread?: boolean; limit?: number; offset?: number } = {}) {
		return request<{ total: number; items: ApiProject[] }>('/api/projects', { query });
	},

	findById(id: number) {
		return request<ApiProject>(`/api/projects/${id}`);
	},

	findByLabel(label: string) {
		return request<ApiProject>(`/api/projects/label/${encodeURIComponent(label)}`);
	},

	create(payload: ProjectPayload) {
		return request<ApiProject>('/api/projects', { method: 'POST', body: payload });
	},

	update(id: number, payload: Partial<ProjectPayload>) {
		return request<ApiProject>(`/api/projects/${id}`, { method: 'PATCH', body: payload });
	},

	remove(id: number) {
		return request<{ id: number; deleted: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
	},

	/** 清除未读角标 */
	markRead(id: number) {
		return request<ApiProject>(`/api/projects/${id}/read`, { method: 'POST' });
	},

	// ===== 项目下的任务 =====

	listTasks(projectId: number) {
		return request<ApiProjectTask[]>(`/api/projects/${projectId}/tasks`);
	},

	addTask(projectId: number, title: string, category?: ApiTaskCategory) {
		return request<ApiProjectTask>(`/api/projects/${projectId}/tasks`, {
			method: 'POST',
			body: { title, category }
		});
	},

	updateTask(taskId: number, patch: { title?: string; done?: boolean; category?: ApiTaskCategory }) {
		return request<ApiProjectTask>(`/api/projects/tasks/${taskId}`, {
			method: 'PATCH',
			body: patch
		});
	},

	toggleTask(taskId: number) {
		return request<ApiProjectTask>(`/api/projects/tasks/${taskId}/toggle`, { method: 'PATCH' });
	},

	removeTask(taskId: number) {
		return request<{ id: number; deleted: boolean }>(`/api/projects/tasks/${taskId}`, {
			method: 'DELETE'
		});
	}
};

// ===== 全局待办模块 =====

export type ApiTodo = {
	id: number;
	text: string;
	done: boolean;
	type: string;
	priority: string;
	dueAt: string | null;
	author: string;
	/** 毫秒时间戳，前端用于筛选与排序 */
	createdAt: number;
	updatedAt: string;
};

export type TodoPayload = {
	text?: string;
	done?: boolean;
	type?: string;
	priority?: string;
	dueAt?: string | null;
	authorName?: string;
};

export const todosApi = {
	list(
		query: {
			type?: string;
			priority?: string;
			done?: boolean;
			since?: number;
			limit?: number;
			offset?: number;
		} = {}
	) {
		return request<{ total: number; items: ApiTodo[] }>('/api/todos', { query });
	},

	stats() {
		return request<{ total: number; open: number; done: number; high: number }>('/api/todos/stats');
	},

	findById(id: number) {
		return request<ApiTodo>(`/api/todos/${id}`);
	},

	create(payload: TodoPayload & { text: string }) {
		return request<ApiTodo>('/api/todos', { method: 'POST', body: payload });
	},

	update(id: number, payload: TodoPayload) {
		return request<ApiTodo>(`/api/todos/${id}`, { method: 'PATCH', body: payload });
	},

	toggle(id: number) {
		return request<ApiTodo>(`/api/todos/${id}/toggle`, { method: 'PATCH' });
	},

	remove(id: number) {
		return request<{ id: number; deleted: boolean }>(`/api/todos/${id}`, { method: 'DELETE' });
	}
};

// ===== 动态模块 =====

export type ApiActivity = {
	id: number;
	/** 作者名字首字符，用于头像 */
	who: string;
	name: string;
	/** 正文 */
	action: string;
	/** 展示时间文案 */
	time: string;
	color: string;
	/** 关联项目名，未关联为空串 */
	project: string;
	type: string;
	visibility: string;
	mentions: string[];
	createdAt: string;
};

export type ActivityPayload = {
	content: string;
	type?: string;
	visibility?: string;
	projectId?: number | null;
	/** 支持用户 id 或名字 */
	mentions?: (number | string)[];
};

export const activitiesApi = {
	list(query: { limit?: number; offset?: number } = {}) {
		return request<{ total: number; items: ApiActivity[] }>('/api/activities', { query });
	},

	findById(id: number) {
		return request<ApiActivity>(`/api/activities/${id}`);
	},

	create(payload: ActivityPayload) {
		return request<ApiActivity>('/api/activities', { method: 'POST', body: payload });
	},

	remove(id: number) {
		return request<{ id: number; deleted: boolean }>(`/api/activities/${id}`, { method: 'DELETE' });
	}
};

// ===== 规划 =====

/** 步骤状态 */
export type ApiStepStatus = 'todo' | 'doing' | 'done';

export type ApiPlanStep = {
	id: number;
	planId: number;
	title: string;
	status: ApiStepStatus;
	/** 横向排列顺序，从 0 开始 */
	position: number;
	createdAt: string;
	updatedAt: string;
};

export type ApiPlan = {
	id: number;
	title: string;
	goal: string;
	active: boolean;
	owner: string;
	steps: ApiPlanStep[];
	stepTotal: number;
	stepDone: number;
	createdAt: string;
	updatedAt: string;
};

export type PlanPayload = {
	title: string;
	goal?: string;
	active?: boolean;
	steps?: string[];
};

export const plansApi = {
	list(query: { q?: string; active?: boolean; limit?: number; offset?: number } = {}) {
		return request<{ total: number; items: ApiPlan[] }>('/api/plans', { query });
	},

	findById(id: number) {
		return request<ApiPlan>(`/api/plans/${id}`);
	},

	create(payload: PlanPayload) {
		return request<ApiPlan>('/api/plans', { method: 'POST', body: payload });
	},

	update(id: number, payload: Partial<PlanPayload>) {
		return request<ApiPlan>(`/api/plans/${id}`, { method: 'PATCH', body: payload });
	},

	remove(id: number) {
		return request<{ id: number; deleted: boolean }>(`/api/plans/${id}`, { method: 'DELETE' });
	},

	/** 追加步骤；返回更新后的整个计划 */
	addStep(planId: number, title: string, status?: ApiStepStatus) {
		return request<ApiPlan>(`/api/plans/${planId}/steps`, {
			method: 'POST',
			body: { title, status }
		});
	},

	/** 改步骤内容 / 状态 / 顺序 */
	updateStep(
		stepId: number,
		payload: { title?: string; status?: ApiStepStatus; position?: number }
	) {
		return request<ApiPlan>(`/api/plans/steps/${stepId}`, { method: 'PATCH', body: payload });
	},

	removeStep(stepId: number) {
		return request<ApiPlan>(`/api/plans/steps/${stepId}`, { method: 'DELETE' });
	}
};
