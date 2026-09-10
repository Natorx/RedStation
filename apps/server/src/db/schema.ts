import {
	pgTable,
	serial,
	integer,
	varchar,
	text,
	boolean,
	timestamp,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';

/**
 * 用户表
 *
 * 字段对齐前端 workspace.svelte.ts 的 ME / MEMBERS：
 * - 昵称 name、角色 role、内部 ID uid（登录用八位数）、头像色 color
 * - permissions 拆成 6 个布尔列（前端权限清单固定 6 项）
 */
export const users = pgTable(
	'users',
	{
		id: serial('id').primaryKey(),

		/** 登录用八位数用户 ID，展示为「ID 10248571」 */
		uid: varchar('uid', { length: 16 }).notNull(),

		/** 显示名，同时作为 @ 提及与任务发布者的标识 */
		name: varchar('name', { length: 64 }).notNull(),

		/** 头像文字，如 FW；为空时前端取 name 首字母 */
		initials: varchar('initials', { length: 8 }),

		/** 登录邮箱 */
		email: varchar('email', { length: 160 }).notNull(),

		/** bcrypt 哈希，绝不返回给前端 */
		passwordHash: varchar('password_hash', { length: 255 }).notNull(),

		/** 角色：负责人 / 前端 / 设计 / 后端 / 运维 / 服务端 */
		role: varchar('role', { length: 32 }).notNull().default('成员'),

		/** 职级，如「全栈工程师」 */
		title: varchar('title', { length: 64 }),

		/** 头像底色，hex */
		color: varchar('color', { length: 16 }).notNull().default('#dc2626'),

		/** 所在团队名，前端为 string[]，MVP 用逗号分隔存储 */
		teams: varchar('teams', { length: 255 }).notNull().default(''),

		/** 账号是否启用；停用后不允许登录 */
		active: boolean('active').notNull().default(true),

		// ===== 权限（前端 /me 页固定 6 项）=====
		permProject: boolean('perm_project').notNull().default(true),
		permTaskAssign: boolean('perm_task_assign').notNull().default(true),
		permPost: boolean('perm_post').notNull().default(true),
		permTeamManage: boolean('perm_team_manage').notNull().default(false),
		permReportExport: boolean('perm_report_export').notNull().default(false),
		permSystemSetting: boolean('perm_system_setting').notNull().default(false),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('users_uid_unique').on(t.uid),
		uniqueIndex('users_email_unique').on(t.email),
		index('users_name_idx').on(t.name)
	]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

// ===== 项目 =====

/**
 * 项目表
 *
 * 前端原先用项目名 label 当唯一键（查找/改名/弹窗定位全靠它），
 * 这里补上稳定自增 id，label 保留但改为「唯一约束 + 可改」，
 * 前端逐步改用 id 定位，避免改名牵连任务归属。
 */
export const projects = pgTable(
	'projects',
	{
		id: serial('id').primaryKey(),

		/** 项目名，全局唯一 */
		label: varchar('label', { length: 96 }).notNull(),

		/** 分类标签，如「桌面应用 / 自动化」 */
		tag: varchar('tag', { length: 32 }).notNull().default('未分类'),

		/** 标签配色：red / violet / amber / green / cyan / pink */
		color: varchar('color', { length: 16 }).notNull().default('red'),

		/** 是否有新任务（前端 NEW 角标），查看后置 false */
		unread: boolean('unread').notNull().default(false),

		/** 项目形态：GUI / TUI / CLI */
		ui: varchar('ui', { length: 8 }).notNull().default('GUI'),

		/** 一句话用途 */
		purpose: varchar('purpose', { length: 255 }).notNull().default(''),

		/** 项目介绍（多行文本） */
		intro: text('intro').notNull().default(''),

		/** 技术栈，逗号分隔（前端为 string[]） */
		stack: varchar('stack', { length: 255 }).notNull().default(''),

		/** 框架自由标签，逗号分隔 */
		frameworks: varchar('frameworks', { length: 255 }).notNull().default(''),

		/** 是否服务器部署 */
		deployed: boolean('deployed').notNull().default(false),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('projects_label_unique').on(t.label), index('projects_tag_idx').on(t.tag)]
);

// ===== 项目下的具体任务 =====

/**
 * 项目任务（前端 ProjectItem.tasks）。
 * 与全局待办 todos 是两套模型：这里必须挂在某个项目下。
 */
export const projectTasks = pgTable(
	'project_tasks',
	{
		id: serial('id').primaryKey(),

		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),

		title: varchar('title', { length: 255 }).notNull(),

		done: boolean('done').notNull().default(false),

		/** 发布者用户 id；用户被删除时置空，前端回退显示名字 */
		authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),

		/** 发布者名字快照，避免用户删除后任务失去归属显示 */
		authorName: varchar('author_name', { length: 64 }).notNull().default(''),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('project_tasks_project_idx').on(t.projectId),
		index('project_tasks_done_idx').on(t.done)
	]
);

// ===== 全局待办 =====

/**
 * 全局待办（前端 TodoItem）。
 * 与 project_tasks 相互独立：这是「不挂项目」的日常待办清单，
 * 概览页的「任务列表」与任务页共用同一份数据。
 */
export const todos = pgTable(
	'todos',
	{
		id: serial('id').primaryKey(),

		text: varchar('text', { length: 255 }).notNull(),

		done: boolean('done').notNull().default(false),

		/** 类型：开发 / 设计 / 文档 / 运维 / 调研（前端据此映射颜色） */
		type: varchar('type', { length: 16 }).notNull().default('开发'),

		/** 优先级：high / medium / low */
		priority: varchar('priority', { length: 8 }).notNull().default('medium'),

		/** 截止时间；null 表示不限期（前端原来用文案「今天/2 天」） */
		dueAt: timestamp('due_at', { withTimezone: true }),

		authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
		authorName: varchar('author_name', { length: 64 }).notNull().default(''),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('todos_done_idx').on(t.done),
		index('todos_type_idx').on(t.type),
		index('todos_priority_idx').on(t.priority),
		index('todos_created_idx').on(t.createdAt)
	]
);

// ===== 动态 =====

/**
 * 动态（工作汇报 / 通知）。
 * 前端发布抽屉里的「可见范围」原先只有 UI 没入库，这里补 visibility 字段。
 */
export const activities = pgTable(
	'activities',
	{
		id: serial('id').primaryKey(),

		/** 正文，前端限制 500 字 */
		content: varchar('content', { length: 500 }).notNull(),

		/** 类型：report（工作汇报）/ notice（通知） */
		type: varchar('type', { length: 16 }).notNull().default('report'),

		/** 可见范围：team（团队可见）/ private（仅自己） */
		visibility: varchar('visibility', { length: 16 }).notNull().default('team'),

		/** 关联项目；不关联为 null */
		projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),

		authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
		authorName: varchar('author_name', { length: 64 }).notNull().default(''),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('activities_created_idx').on(t.createdAt),
		index('activities_author_idx').on(t.authorId),
		index('activities_project_idx').on(t.projectId)
	]
);

/** 动态中被 @ 的成员 */
export const activityMentions = pgTable(
	'activity_mentions',
	{
		id: serial('id').primaryKey(),
		activityId: integer('activity_id')
			.notNull()
			.references(() => activities.id, { onDelete: 'cascade' }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('activity_mentions_unique').on(t.activityId, t.userId),
		index('activity_mentions_user_idx').on(t.userId)
	]
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type ProjectTaskRow = typeof projectTasks.$inferSelect;
export type NewProjectTaskRow = typeof projectTasks.$inferInsert;
export type TodoRow = typeof todos.$inferSelect;
export type NewTodoRow = typeof todos.$inferInsert;
export type ActivityRow = typeof activities.$inferSelect;
export type NewActivityRow = typeof activities.$inferInsert;
