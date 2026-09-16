/**
 * 团队模块的请求 / 响应类型。
 *
 * 说明：项目当前使用 NestJS + Fastify + Drizzle，未引入 class-validator/class-transformer，
 * 因此这里只保留类型定义，校验逻辑放在 TeamsService 内手工完成，保证错误信息可控。
 */

/** 团队 ID 固定八位数字 */
export const JOIN_CODE_LENGTH = 8;
/** joinCode 随机生成的重试次数上限（撞库概率极低，留足余量即可） */
export const JOIN_CODE_MAX_ATTEMPTS = 30;

/** 团队名长度上限，与 schema 的 varchar(64) 对齐（超出会截断） */
export const TEAM_NAME_MAX_LENGTH = 64;
export const TEAM_DESC_MAX_LENGTH = 255;
export const TEAM_MESSAGE_MAX_LENGTH = 255;

/** 成员身份：队长 / 成员 */
export type TeamRole = 'owner' | 'member';

/** 申请状态 */
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

/** 新建团队入参 */
export type CreateTeamDto = {
	name?: string;
	description?: string;
};

/** 提交入队申请入参 */
export type JoinTeamDto = {
	/** 八位数团队 ID，前端会把空格一并去掉 */
	joinCode?: string;
	message?: string;
};

/** 审核入参：approve 批准，reject 拒绝 */
export type ReviewJoinRequestDto = {
	action?: string;
};

/** 团队视图：团队成员页顶部的团队卡片 */
export type TeamView = {
	id: number;
	name: string;
	/** 八位数团队 ID，仅成员可见 */
	joinCode: string;
	description: string;
	ownerId: number | null;
	ownerName: string;
	/** 成员总数（含队长） */
	memberCount: number;
	/** 待审核申请数，队长据此显示红点 */
	pendingCount: number;
	/** 当前登录用户在团队里的身份；非成员为 null */
	myRole: TeamRole | null;
	createdAt: string;
	updatedAt: string;
};

/** 团队成员条目 */
export type TeamMemberView = {
	userId: number;
	uid: string;
	name: string;
	initials: string | null;
	role: string;
	title: string | null;
	color: string;
	/** 团队内身份 */
	teamRole: TeamRole;
	joinedAt: string;
};

/** 入队申请条目 */
export type JoinRequestView = {
	id: number;
	teamId: number;
	userId: number;
	uid: string;
	name: string;
	initials: string | null;
	color: string;
	userRole: string;
	message: string;
	status: JoinRequestStatus;
	createdAt: string;
	handledBy: string;
	handledAt: string | null;
};

/** GET /api/teams/my —— 当前用户所在团队（含成员）+ 自己发出的申请 */
export type MyTeamsView = {
	/** 我已加入的团队，可能为空数组 */
	teams: TeamView[];
	/** 我提交过、且尚未被处理的申请 */
	myRequests: JoinRequestView[];
};

/** GET /api/teams/:id/members */
export type TeamMembersView = {
	teamId: number;
	items: TeamMemberView[];
};

/** GET /api/teams/:id/requests —— 仅队长可见 */
export type TeamRequestsView = {
	teamId: number;
	/** 待审核，按提交时间正序（先来先审） */
	items: JoinRequestView[];
	/** 最近已处理，按处理时间倒序，供队长回看 */
	handled: JoinRequestView[];
};
