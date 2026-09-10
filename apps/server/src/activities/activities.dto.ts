/**
 * 动态模块的类型定义。
 *
 * 前端契约：概览页 activity 数组的元素
 * （apps/app/src/routes/+page.svelte）。
 */

/** 动态类型：工作汇报 / 通知 */
export const ACTIVITY_TYPES = ['report', 'notice'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** 可见范围：团队可见 / 仅自己 */
export const ACTIVITY_VISIBILITIES = ['team', 'private'] as const;
export type ActivityVisibility = (typeof ACTIVITY_VISIBILITIES)[number];

/** 正文最长字数，与 activities.content varchar(500) 对齐 */
export const ACTIVITY_CONTENT_MAX_LENGTH = 500;

/** 列表默认条数与上限 */
export const ACTIVITY_LIST_DEFAULT_LIMIT = 20;
export const ACTIVITY_LIST_MAX_LIMIT = 100;

/** 作者头像色兜底值（users 表查不到作者时使用） */
export const ACTIVITY_DEFAULT_COLOR = '#dc2626';

/**
 * 被 @ 的成员，兼容前端两种传法：
 * - number：用户自增 id
 * - string：用户昵称（前端 @ 提及目前传的是名字）
 * 混合数组也要能处理，查不到的项静默忽略。
 */
export type MentionInput = number | string;

/** 创建动态入参 */
export type CreateActivityDto = {
	content: string;
	type?: string;
	visibility?: string;
	projectId?: number | null;
	mentions?: MentionInput[];
};

/** 列表查询入参 */
export type ListActivitiesQuery = {
	limit?: number;
	offset?: number;
};

/**
 * 返回给前端的动态视图。
 * 字段名刻意沿用前端已有的 who/name/action/time 命名，
 * 让页面改动量最小。
 */
export type ActivityView = {
	id: number;
	/** 作者名字首字符（大写），用于头像 */
	who: string;
	/** 作者名 */
	name: string;
	/** 动态正文 */
	action: string;
	/** 展示时间，格式 "2026-9-10 14:30" */
	time: string;
	/** 作者头像色 */
	color: string;
	/** 关联项目名，未关联为空串 */
	project: string;
	type: string;
	visibility: string;
	/** 被 @ 的成员名字数组 */
	mentions: string[];
	/** ISO 时间，便于前端排序 */
	createdAt: string;
};

export type ActivityListResult = {
	total: number;
	items: ActivityView[];
};
