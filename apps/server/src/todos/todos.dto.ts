/**
 * 全局待办模块的请求 / 响应类型。
 *
 * 说明：项目当前使用 NestJS + Fastify + Drizzle，未引入 class-validator/class-transformer，
 * 因此这里只保留类型定义，校验逻辑放在 TodosService 内手工完成，保证错误信息可控。
 */

/** 允许的任务类型，与前端颜色映射保持一致 */
export const TODO_TYPES = ['开发', '设计', '文档', '运维', '调研'] as const;
export type TodoType = (typeof TODO_TYPES)[number];

/** 允许的优先级 */
export const TODO_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

/** 列表默认返回条数与上限 */
export const TODO_DEFAULT_LIMIT = 100;
export const TODO_MAX_LIMIT = 500;

/** 列表查询入参 */
export type ListTodosQuery = {
	/** 类型筛选：开发 / 设计 / 文档 / 运维 / 调研 */
	type?: string;
	/** 优先级筛选：high / medium / low */
	priority?: string;
	/** 完成状态筛选；不传表示全部 */
	done?: boolean;
	/** 毫秒时间戳，筛选 createdAt >= since（前端「近 1/3/7/30 天」） */
	since?: number;
	limit?: number;
	offset?: number;
};

/** 新建待办入参 */
export type CreateTodoDto = {
	text: string;
	type?: string;
	priority?: string;
	/** ISO 字符串；null 表示不限期 */
	dueAt?: string | null;
	/** 不传时回退到当前登录用户名字 */
	authorName?: string;
};

/** 更新待办入参，全部可选，只更新传了的字段 */
export type UpdateTodoDto = {
	text?: string;
	done?: boolean;
	type?: string;
	priority?: string;
	/** null 表示清除截止时间 */
	dueAt?: string | null;
};

/** 统计结果 */
export type TodoStatsView = {
	total: number;
	open: number;
	done: number;
	/** 未完成且 priority=high 的数量 */
	high: number;
};

/** 返回给前端的待办视图，字段严格对齐前端 TodoItem 契约 */
export type TodoView = {
	id: number;
	text: string;
	done: boolean;
	/** 开发 / 设计 / 文档 / 运维 / 调研 */
	type: string;
	/** high / medium / low */
	priority: string;
	/** ISO 字符串；不限期为 null */
	dueAt: string | null;
	/** 取 authorName 快照 */
	author: string;
	/** 毫秒时间戳；前端用它做筛选与排序，必须是数字 */
	createdAt: number;
	/** ISO 字符串 */
	updatedAt: string;
};
