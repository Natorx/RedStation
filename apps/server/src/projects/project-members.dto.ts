/**
 * 项目成员模块的请求 / 响应类型。
 *
 * 与团队模块保持一致的风格：NestJS + Fastify + Drizzle，未引入
 * class-validator/class-transformer，校验逻辑放在 ProjectsService 内手工完成。
 */

/** 项目内身份：发起人 / 成员 */
export type ProjectMemberRole = 'owner' | 'member';

/** 邀请状态 */
export type ProjectInviteStatus = 'pending' | 'approved' | 'rejected';

export const PROJECT_INVITE_MESSAGE_MAX_LENGTH = 255;

/** 项目成员条目 */
export type ProjectMemberView = {
	userId: number;
	uid: string;
	name: string;
	initials: string | null;
	/** 用户职级 / 头衔 */
	title: string | null;
	/** 用户角色（管理员 / 成员等） */
	role: string;
	/** 头像配色 */
	color: string;
	/** 项目内身份 */
	projectRole: ProjectMemberRole;
	joinedAt: string;
};

/** 项目邀请条目 */
export type ProjectInviteView = {
	id: number;
	projectId: number;
	/** 项目名，前端列表直接展示，省去再查一次项目 */
	projectLabel: string;
	userId: number;
	uid: string;
	name: string;
	initials: string | null;
	color: string;
	inviterName: string;
	message: string;
	status: ProjectInviteStatus;
	createdAt: string;
	handledAt: string | null;
};

/** POST /api/projects/:id/invites —— 发起人邀请成员 */
export type CreateProjectInviteDto = {
	/** 被邀请人用户 id；与 uid 二选一 */
	userId?: number;
	/** 被邀请人 uid（八位账号） */
	uid?: string;
	message?: string;
};

/** POST /api/projects/invites/:inviteId/review —— 被邀请人回应 */
export type ReviewProjectInviteDto = {
	/** accept 同意 / reject 拒绝 */
	action?: string;
};

/** GET /api/projects/:id/members */
export type ProjectMembersView = {
	projectId: number;
	items: ProjectMemberView[];
	/** 当前用户在该项目里的身份；非成员为 null */
	myRole: ProjectMemberRole | null;
};

/** GET /api/projects/invites/my —— 我收到的项目邀请 */
export type MyProjectInvitesView = {
	items: ProjectInviteView[];
};
