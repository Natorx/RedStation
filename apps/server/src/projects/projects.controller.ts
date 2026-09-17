import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	Query,
	Req,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';

import { ProjectsService } from './projects.service';
import { ProjectMembersService } from './project-members.service';
import { JwtAuthGuard, OptionalJwtGuard, type AuthedRequest } from '../auth/jwt-auth.guard';
import type {
	CreateProjectInviteDto,
	ProjectInviteView,
	ProjectMembersView,
	ReviewProjectInviteDto
} from './project-members.dto';
import type {
	CreateProjectDto,
	ListProjectsQuery,
	ProjectTaskView,
	ProjectView,
	UpdateProjectDto
} from './projects.dto';

/**
 * 路由顺序说明：
 * NestJS 按声明顺序匹配，静态段必须排在参数段之前，
 * 否则 `/api/projects/tasks/5` 会被 `@Get(':id')` 抢先匹配，
 * 把 "tasks" 当成 id 传给 ParseIntPipe 导致 400。
 * 因此本文件顺序为：具体集合 → tasks 子路由 → :id 系列。
 */
@Controller('projects')
export class ProjectsController {
	constructor(
		private readonly projects: ProjectsService,
		private readonly members: ProjectMembersService
	) {}

	/** 带了 JWT 就取当前用户，用于记录任务作者；未登录返回空 */
	private currentUser(req: AuthedRequest): { id: number | null; name: string } {
		return { id: req.user?.id ?? null, name: req.user?.name ?? '' };
	}

	/** 当前用户 id；未登录返回 null（列表按未登录处理，不过滤可见范围） */
	private viewerId(req: AuthedRequest): number | null {
		return req.user?.id ?? null;
	}

	/** 必须登录的当前用户；供成员与邀请接口使用 */
	private actor(req: AuthedRequest): { id: number; name: string } {
		const user = req.user;
		if (!user) throw new UnauthorizedException('缺少访问令牌');
		return { id: user.id, name: user.name };
	}

	// ===== 项目集合 =====

	/**
	 * GET /api/projects — 项目列表，支持 q/tag/unread/limit/offset
	 *
	 * 可选登录：带 JWT 时只返回我参与的项目，并回 myRole（前端据此显示「邀请成员」等发起人操作）；
	 * 未登录则不过滤。
	 */
	@Get()
	@UseGuards(OptionalJwtGuard)
	async list(
		@Query() query: Record<string, string>,
		@Req() req: AuthedRequest
	): Promise<{ total: number; items: ProjectView[] }> {
		const parsed: ListProjectsQuery = {
			q: query.q,
			tag: query.tag,
			limit: query.limit ? Number(query.limit) : undefined,
			offset: query.offset ? Number(query.offset) : undefined
		};
		if (query.unread === 'true' || query.unread === 'false') parsed.unread = query.unread === 'true';
		// 带 JWT 时只返回我参与的项目
		return this.projects.list(parsed, this.viewerId(req));
	}

	/** POST /api/projects — 新建项目，项目名唯一 */
	@Post()
	@UseGuards(JwtAuthGuard)
	create(@Body() dto: CreateProjectDto, @Req() req: AuthedRequest): Promise<ProjectView> {
		// 未显式传发起人时，记为当前登录用户
		const user = this.currentUser(req);
		const actor = { id: user.id as number, name: user.name };
		return this.projects.create({ ...dto, owner: dto.owner?.trim() || user.name }, actor);
	}

	// ===== 项目任务（必须排在 :id 之前）=====

	/** PATCH /api/projects/tasks/:taskId — 更新任务（改标题或完成状态） */
	@Patch('tasks/:taskId')
	updateTask(
		@Param('taskId', ParseIntPipe) taskId: number,
		@Body() body: { title?: string; done?: boolean }
	): Promise<ProjectTaskView> {
		return this.projects.updateTask(taskId, body);
	}

	/** PATCH /api/projects/tasks/:taskId/toggle — 切换任务完成状态 */
	@Patch('tasks/:taskId/toggle')
	toggleTask(@Param('taskId', ParseIntPipe) taskId: number): Promise<ProjectTaskView> {
		return this.projects.toggleTask(taskId);
	}

	/** DELETE /api/projects/tasks/:taskId — 删除任务 */
	@Delete('tasks/:taskId')
	removeTask(@Param('taskId', ParseIntPipe) taskId: number) {
		return this.projects.removeTask(taskId);
	}

	/** GET /api/projects/label/:label — 按项目名查（兼容前端旧用法） */
	@Get('label/:label')
	@UseGuards(OptionalJwtGuard)
	findByLabel(@Param('label') label: string, @Req() req: AuthedRequest): Promise<ProjectView> {
		return this.projects.findByLabel(label, this.viewerId(req));
	}

	// ===== 单个项目 =====

	/** GET /api/projects/:id — 项目详情（内联任务列表） */
	@Get(':id')
	@UseGuards(OptionalJwtGuard)
	findById(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest): Promise<ProjectView> {
		return this.projects.findById(id, this.viewerId(req));
	}

	/** PATCH /api/projects/:id — 更新项目，支持改名 */
	@Patch(':id')
	update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProjectDto): Promise<ProjectView> {
		return this.projects.update(id, dto);
	}

	/** DELETE /api/projects/:id — 删除项目（其下任务级联删除） */
	@Delete(':id')
	remove(@Param('id', ParseIntPipe) id: number) {
		return this.projects.remove(id);
	}

	/** POST /api/projects/:id/read — 清除未读角标 */
	@Post(':id/read')
	@HttpCode(200)
	markRead(@Param('id', ParseIntPipe) id: number): Promise<ProjectView> {
		return this.projects.markRead(id);
	}

	// ===== 项目成员与邀请 =====

	/** GET /api/projects/invites/my — 我收到的项目邀请（待回应在前） */
	@Get('invites/my')
	@UseGuards(JwtAuthGuard)
	myInvites(@Req() req: AuthedRequest): Promise<{ items: ProjectInviteView[] }> {
		return this.members
			.myInvites(this.actor(req).id)
			.then((items) => ({ items }));
	}

	/** POST /api/projects/invites/:inviteId/review — 被邀请人同意 / 拒绝 */
	@Post('invites/:inviteId/review')
	@HttpCode(200)
	@UseGuards(JwtAuthGuard)
	reviewInvite(
		@Param('inviteId', ParseIntPipe) inviteId: number,
		@Body() dto: ReviewProjectInviteDto,
		@Req() req: AuthedRequest
	): Promise<ProjectInviteView> {
		return this.members.reviewInvite(inviteId, dto.action ?? '', this.actor(req));
	}

	/** DELETE /api/projects/invites/:inviteId — 发起人撤回邀请 */
	@Delete('invites/:inviteId')
	@UseGuards(JwtAuthGuard)
	cancelInvite(
		@Param('inviteId', ParseIntPipe) inviteId: number,
		@Req() req: AuthedRequest
	): Promise<{ id: number; deleted: true }> {
		return this.members.cancelInvite(inviteId, this.actor(req));
	}

	/** GET /api/projects/:id/members — 项目成员列表（仅成员） */
	@Get(':id/members')
	@UseGuards(JwtAuthGuard)
	projectMembers(
		@Param('id', ParseIntPipe) id: number,
		@Req() req: AuthedRequest
	): Promise<ProjectMembersView> {
		return this.members.members(id, this.actor(req).id);
	}

	/** POST /api/projects/:id/invites — 发起人邀请成员 */
	@Post(':id/invites')
	@UseGuards(JwtAuthGuard)
	invite(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: CreateProjectInviteDto,
		@Req() req: AuthedRequest
	): Promise<ProjectInviteView> {
		return this.members.invite(id, dto, this.actor(req));
	}

	/** GET /api/projects/:id/invites — 该项目已发出的邀请（仅发起人） */
	@Get(':id/invites')
	@UseGuards(JwtAuthGuard)
	projectInvites(
		@Param('id', ParseIntPipe) id: number,
		@Req() req: AuthedRequest
	): Promise<{ items: ProjectInviteView[] }> {
		return this.members
			.invitesOfProject(id, this.actor(req).id)
			.then((items) => ({ items }));
	}

	/** DELETE /api/projects/:id/members/:userId — 发起人移除成员 */
	@Delete(':id/members/:userId')
	@UseGuards(JwtAuthGuard)
	removeMember(
		@Param('id', ParseIntPipe) id: number,
		@Param('userId', ParseIntPipe) userId: number,
		@Req() req: AuthedRequest
	): Promise<{ projectId: number; userId: number; removed: true }> {
		return this.members.removeMember(id, userId, this.actor(req));
	}

	// ===== 某项目下的任务 =====

	/** GET /api/projects/:id/tasks — 项目任务列表 */
	@Get(':id/tasks')
	listTasks(@Param('id', ParseIntPipe) id: number): Promise<ProjectTaskView[]> {
		return this.projects.listTasks(id);
	}

	/**
	 * POST /api/projects/:id/tasks — 新增任务
	 * body: { title }
	 * 需登录，作者取当前用户
	 */
	@Post(':id/tasks')
	@UseGuards(JwtAuthGuard)
	addTask(
		@Param('id', ParseIntPipe) id: number,
		@Body() body: { title?: string; category?: string },
		@Req() req: AuthedRequest
	): Promise<ProjectTaskView> {
		const user = this.currentUser(req);
		return this.projects.addTask(id, body.title ?? '', user.id, user.name, body.category);
	}
}
