/**
 * RedStation API 客户端
 *
 * 统一处理：
 * - baseURL 与 /api 前缀（开发期由 vite proxy 转发到 NestJS，见 vite.config.ts）
 * - JWT 存取（localStorage）
 * - 请求/响应序列化、错误归一化
 */

const TOKEN_KEY = 'redstation.token';

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

	const url = new URL(path, typeof location !== 'undefined' ? location.origin : 'http://localhost');
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
		res = await fetch(url.pathname + url.search, {
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
