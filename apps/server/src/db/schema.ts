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

		/** 项目在服务器上的部署路径，如 /home/teabos/redlind-apis；未填为空串 */
		deployPath: varchar('deploy_path', { length: 255 }).notNull().default(''),

		/** 运行端口，如 "3010"；多个端口用逗号分隔，未填为空串 */
		runPort: varchar('run_port', { length: 64 }).notNull().default(''),

		/** 项目线上地址（部署后可访问的 URL）；未填为空串 */
		projectUrl: varchar('project_url', { length: 255 }).notNull().default(''),

		/** 代码仓库地址（GitHub 等）；未填为空串 */
		repoUrl: varchar('repo_url', { length: 255 }).notNull().default(''),

		/** 项目发起人名字快照；未登录创建时为空串 */
		owner: varchar('owner', { length: 64 }).notNull().default(''),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('projects_label_unique').on(t.label), index('projects_tag_idx').on(t.tag)]
);

// ===== 项目成员 =====

/**
 * 项目成员关系。
 * (projectId, userId) 唯一：同一人在同一项目里只出现一条。
 * role 为 owner（发起人）/ member（成员）；发起人由创建项目时自动写入。
 */
export const projectMembers = pgTable(
	'project_members',
	{
		id: serial('id').primaryKey(),

		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),

		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),

		/** 项目身份：owner（发起人）/ member（成员） */
		role: varchar('role', { length: 16 }).notNull().default('member'),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('project_members_project_user_unique').on(t.projectId, t.userId),
		index('project_members_user_idx').on(t.userId)
	]
);

/**
 * 项目成员邀请。
 * 发起人发出邀请（pending），被邀请人同意后写入 project_members 并置 approved。
 * 同一人对同一项目同时只允许一条 pending（服务层校验）。
 */
export const projectInvites = pgTable(
	'project_invites',
	{
		id: serial('id').primaryKey(),

		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),

		/** 被邀请人 */
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),

		/** 邀请人（项目发起人）用户 id */
		inviterId: integer('inviter_id').references(() => users.id, { onDelete: 'set null' }),
		inviterName: varchar('inviter_name', { length: 64 }).notNull().default(''),

		/** 邀请留言 */
		message: varchar('message', { length: 255 }).notNull().default(''),

		/** pending（待回应）/ approved（已同意）/ rejected（已拒绝） */
		status: varchar('status', { length: 16 }).notNull().default('pending'),

		handledAt: timestamp('handled_at', { withTimezone: true }),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('project_invites_project_idx').on(t.projectId),
		index('project_invites_user_idx').on(t.userId),
		index('project_invites_status_idx').on(t.status)
	]
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

		/** 类别：功能 / 新模块 / 优化 / UI / 运维 / 设计 */
		category: varchar('category', { length: 16 }).notNull().default('功能'),

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

// ===== 代码托管 =====

/**
 * 项目代码托管记录。
 *
 * 每个项目至多一条：保存「上次上传」这类展示信息。
 * 实际文件落在服务器磁盘（HOSTING_ROOT/<项目id>-<slug>/），
 * 这里只存元数据，不存二进制。
 */
export const projectHostings = pgTable(
	'project_hostings',
	{
		id: serial('id').primaryKey(),

		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),

		/** 服务器上的托管目录绝对路径，便于排查与展示 */
		rootPath: varchar('root_path', { length: 512 }).notNull().default(''),

		/** 上次上传者显示名；未登录上传时为空串 */
		lastUploader: varchar('last_uploader', { length: 64 }).notNull().default(''),

		/** 首次上传时间 */
		firstUploadedAt: timestamp('first_uploaded_at', { withTimezone: true }),

		/** 上次上传时间，前端据此显示「上次上传 …」 */
		lastUploadedAt: timestamp('last_uploaded_at', { withTimezone: true }),

		/** 当前托管的文件数（不含目录） */
		fileCount: integer('file_count').notNull().default(0),

		/** 当前托管的原始字节数 */
		totalBytes: integer('total_bytes').notNull().default(0),

		/** 累计上传次数，每次覆盖 +1 */
		uploadCount: integer('upload_count').notNull().default(0),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('project_hostings_project_unique').on(t.projectId)]
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

// ===== 规划 =====

/**
 * 规划（一个计划 = 一张横向流程图）。
 * 用户可以同时开启多个计划，各自独立维护自己的步骤链。
 */
export const plans = pgTable(
	'plans',
	{
		id: serial('id').primaryKey(),

		/** 计划名 */
		title: varchar('title', { length: 96 }).notNull(),

		/** 一句话目标 */
		goal: varchar('goal', { length: 255 }).notNull().default(''),

		/** 是否进行中；false 表示已归档/暂停 */
		active: boolean('active').notNull().default(true),

		ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
		ownerName: varchar('owner_name', { length: 64 }).notNull().default(''),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('plans_active_idx').on(t.active)]
);

/**
 * 规划步骤（流程图里的一个节点）。
 * 顺序由 position 决定，前端按 position 升序横向排列。
 */
export const planSteps = pgTable(
	'plan_steps',
	{
		id: serial('id').primaryKey(),

		planId: integer('plan_id')
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),

		title: varchar('title', { length: 255 }).notNull(),

		/** 步骤状态：todo / doing / done */
		status: varchar('status', { length: 16 }).notNull().default('todo'),

		/** 横向排列顺序，从 0 开始 */
		position: integer('position').notNull().default(0),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('plan_steps_plan_idx').on(t.planId)]
);

// ===== 团队 =====

/**
 * 团队表。
 *
 * 取代 users.teams 那个逗号分隔的展示用字段：那边只存名字、表达不了成员关系，
 * 这里给团队一个稳定的八位数 joinCode，别人凭它申请加入，队长审核后成为成员。
 *
 * 除 ownerId 外的成员关系一律看 team_members，不做冗余快照 ——
 * 退队或解散后不必回头同步旧数据。
 */
export const teams = pgTable(
	'teams',
	{
		id: serial('id').primaryKey(),

		/** 团队名，全局唯一 */
		name: varchar('name', { length: 64 }).notNull(),

		/** 八位数团队 ID，成员凭它申请加入 */
		joinCode: varchar('join_code', { length: 8 }).notNull(),

		/** 一句话介绍 */
		description: varchar('description', { length: 255 }).notNull().default(''),

		/** 队长用户 id；队长注销后置空，团队保留 */
		ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
		/** 队长名字快照，避免用户删除后团队失去归属显示 */
		ownerName: varchar('owner_name', { length: 64 }).notNull().default(''),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('teams_name_unique').on(t.name),
		uniqueIndex('teams_join_code_unique').on(t.joinCode),
		index('teams_owner_idx').on(t.ownerId)
	]
);

/**
 * 团队成员关系。
 * (teamId, userId) 唯一：同一人不会在同一团队里出现两条。
 */
export const teamMembers = pgTable(
	'team_members',
	{
		id: serial('id').primaryKey(),

		teamId: integer('team_id')
			.notNull()
			.references(() => teams.id, { onDelete: 'cascade' }),

		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),

		/** 团队身份：owner（队长）/ member（成员） */
		role: varchar('role', { length: 16 }).notNull().default('member'),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('team_members_team_user_unique').on(t.teamId, t.userId),
		index('team_members_user_idx').on(t.userId)
	]
);

/**
 * 入队申请。提交后为 pending，队长批准 / 拒绝后落成终态。
 * 同一人对同一团队同时只允许一条 pending（服务层校验，避免重复申请刷屏）。
 */
export const teamJoinRequests = pgTable(
	'team_join_requests',
	{
		id: serial('id').primaryKey(),

		teamId: integer('team_id')
			.notNull()
			.references(() => teams.id, { onDelete: 'cascade' }),

		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),

		/** 申请人名字快照，列表展示不必再 join users */
		userName: varchar('user_name', { length: 64 }).notNull().default(''),

		/** 申请留言 */
		message: varchar('message', { length: 255 }).notNull().default(''),

		/** pending（待审核）/ approved（已批准）/ rejected（已拒绝） */
		status: varchar('status', { length: 16 }).notNull().default('pending'),

		/** 审批人名字快照 */
		handledBy: varchar('handled_by', { length: 64 }).notNull().default(''),
		handledAt: timestamp('handled_at', { withTimezone: true }),

		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('team_join_requests_team_idx').on(t.teamId),
		index('team_join_requests_user_idx').on(t.userId),
		index('team_join_requests_status_idx').on(t.status)
	]
);

export type TeamRow = typeof teams.$inferSelect;
export type NewTeamRow = typeof teams.$inferInsert;
export type TeamMemberRow = typeof teamMembers.$inferSelect;
export type NewTeamMemberRow = typeof teamMembers.$inferInsert;
export type TeamJoinRequestRow = typeof teamJoinRequests.$inferSelect;
export type NewTeamJoinRequestRow = typeof teamJoinRequests.$inferInsert;

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type ProjectMemberRow = typeof projectMembers.$inferSelect;
export type NewProjectMemberRow = typeof projectMembers.$inferInsert;
export type ProjectInviteRow = typeof projectInvites.$inferSelect;
export type NewProjectInviteRow = typeof projectInvites.$inferInsert;
export type ProjectTaskRow = typeof projectTasks.$inferSelect;
export type NewProjectTaskRow = typeof projectTasks.$inferInsert;
export type ProjectHostingRow = typeof projectHostings.$inferSelect;
export type NewProjectHostingRow = typeof projectHostings.$inferInsert;
export type TodoRow = typeof todos.$inferSelect;
export type NewTodoRow = typeof todos.$inferInsert;
export type ActivityRow = typeof activities.$inferSelect;
export type NewActivityRow = typeof activities.$inferInsert;
export type PlanRow = typeof plans.$inferSelect;
export type NewPlanRow = typeof plans.$inferInsert;
export type PlanStepRow = typeof planSteps.$inferSelect;
export type NewPlanStepRow = typeof planSteps.$inferInsert;
