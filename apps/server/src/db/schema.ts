import { pgTable, serial, varchar, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

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
