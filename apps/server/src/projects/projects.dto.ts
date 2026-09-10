/**
 * 项目模块的请求/响应类型。
 *
 * 前端契约：ProjectItem（apps/app/src/lib/stores/workspace.svelte.ts）
 * - 前端原来用项目名 label 当唯一键，现在补上稳定 id；
 *   label 仍返回，前端可平滑迁移到 id 定位。
 */

/** 项目形态 */
export const UI_FORMS = ['GUI', 'TUI', 'CLI'] as const;
export type ProjectUI = (typeof UI_FORMS)[number];

/** 可选标签配色，与前端 COLOR_OPTIONS 一致 */
export const COLOR_OPTIONS = ['red', 'violet', 'amber', 'green', 'cyan', 'pink'] as const;

/** 可选技术栈，与前端 STACK_OPTIONS 一致 */
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
] as const;

/** 新建项目入参 */
export type CreateProjectDto = {
	label: string;
	tag?: string;
	color?: string;
	ui?: ProjectUI;
	purpose?: string;
	intro?: string;
	stack?: string[];
	frameworks?: string[];
	deployed?: boolean;
};

/** 更新项目入参，全部可选（支持改名） */
export type UpdateProjectDto = {
	label?: string;
	tag?: string;
	color?: string;
	ui?: ProjectUI;
	purpose?: string;
	intro?: string;
	stack?: string[];
	frameworks?: string[];
	deployed?: boolean;
};

/** 列表查询入参 */
export type ListProjectsQuery = {
	/** 按项目名 / 标签模糊搜索 */
	q?: string;
	tag?: string;
	/** true 只看有未读新任务的 */
	unread?: boolean;
	limit?: number;
	offset?: number;
};

/** 项目下的任务 */
export type ProjectTaskView = {
	id: number;
	projectId: number;
	title: string;
	done: boolean;
	/** 发布者名字 */
	author: string;
	/** 前端展示用的日期文案，如 2026-9-10 */
	date: string;
	/** 前端展示用的相对时间，如「12 分钟前」 */
	ago: string;
	createdAt: string;
};

/** 返回给前端的项目视图，字段对齐前端 ProjectItem */
export type ProjectView = {
	id: number;
	label: string;
	tag: string;
	color: string;
	unread: boolean;
	ui: ProjectUI;
	purpose: string;
	intro: string;
	stack: string[];
	frameworks: string[];
	deployed: boolean;
	tasks: ProjectTaskView[];
	/** 任务总数与已完成数，供列表页统计，免去前端遍历 */
	taskTotal: number;
	taskDone: number;
	createdAt: string;
	updatedAt: string;
};
