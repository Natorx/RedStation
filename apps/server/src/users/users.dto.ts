/**
 * 用户模块的请求 DTO。
 *
 * 说明：项目当前使用 NestJS + Fastify + Drizzle，未引入 class-validator/class-transformer，
 * 因此这里保留类型定义，校验逻辑放在 UsersService 内手工完成，保证错误信息可控。
 */

export const PERMISSION_KEYS = [
	'permProject',
	'permTaskAssign',
	'permPost',
	'permTeamManage',
	'permReportExport',
	'permSystemSetting'
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** 权限中文名与说明，与前端 /me 页硬编码的 6 项一致 */
export const PERMISSION_META: Record<PermissionKey, { name: string; desc: string }> = {
	permProject: { name: '项目管理', desc: '新建、编辑与归档项目' },
	permTaskAssign: { name: '任务分配', desc: '创建任务并指派给团队成员' },
	permPost: { name: '发布动态', desc: '发布工作汇报与通知' },
	permTeamManage: { name: '团队管理', desc: '邀请成员、调整角色' },
	permReportExport: { name: '报表导出', desc: '导出统计报表与原始数据' },
	permSystemSetting: { name: '系统设置', desc: '修改工作区与部署配置' }
};

/** 创建用户入参 */
export type CreateUserDto = {
	uid: string;
	name: string;
	email: string;
	password: string;
	initials?: string;
	role?: string;
	title?: string;
	color?: string;
	teams?: string[];
	active?: boolean;
	permissions?: Partial<Record<PermissionKey, boolean>>;
};

/** 更新用户入参，全部可选 */
export type UpdateUserDto = {
	name?: string;
	email?: string;
	password?: string;
	initials?: string | null;
	role?: string;
	title?: string | null;
	color?: string;
	teams?: string[];
	active?: boolean;
	permissions?: Partial<Record<PermissionKey, boolean>>;
};

/** 登录入参 */
export type LoginDto = {
	uid: string;
	password: string;
};

/**
 * 自助修改个人资料的入参。
 * 刻意不含 uid / active / permissions —— 这三项属于管理员权限：
 * 用户不能自行改登录 ID、不能自行启用停用账号、不能自行提权。
 */
export type UpdateProfileDto = {
	name?: string;
	email?: string;
	initials?: string | null;
	title?: string | null;
	color?: string;
	teams?: string[];
};

/** 自助改密码入参 */
export type ChangeOwnPasswordDto = {
	currentPassword: string;
	newPassword: string;
};

/** 列表查询入参 */
export type ListUsersQuery = {
	/** 按 uid / name / email 模糊搜索 */
	q?: string;
	role?: string;
	active?: boolean;
	limit?: number;
	offset?: number;
};

/** 返回给前端的用户视图，字段对齐前端 ME / Member */
export type UserView = {
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
	permissions: { name: string; desc: string; granted: boolean }[];
	createdAt: string;
	updatedAt: string;
};
