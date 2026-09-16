import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	Post,
	Req,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';

import { TeamsService } from './teams.service';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt-auth.guard';
import type {
	CreateTeamDto,
	JoinRequestView,
	JoinTeamDto,
	MyTeamsView,
	ReviewJoinRequestDto,
	TeamMembersView,
	TeamRequestsView,
	TeamView
} from './teams.dto';

/**
 * 团队模块。
 *
 * 所有接口都要求登录：团队身份必须由 JWT 判定，
 * 不接受前端传 userId —— 否则可以伪装成别人审核申请。
 */
@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
	constructor(private readonly teams: TeamsService) {}

	/** 从 request.user 取当前登录用户（JwtAuthGuard 注入） */
	private actor(req: AuthedRequest): { id: number; name: string } {
		const user = req.user;
		if (!user) throw new UnauthorizedException('缺少访问令牌');
		return { id: user.id, name: user.name };
	}

	/** GET /api/teams/my — 我所在的团队 + 我发出的待处理申请 */
	@Get('my')
	my(@Req() req: AuthedRequest): Promise<MyTeamsView> {
		return this.teams.myTeams(this.actor(req).id);
	}

	/** POST /api/teams — 创建团队，创建者自动成为队长 */
	@Post()
	create(@Req() req: AuthedRequest, @Body() dto: CreateTeamDto): Promise<TeamView> {
		return this.teams.createTeam(dto, this.actor(req));
	}

	/**
	 * POST /api/teams/join — 凭八位数团队 ID 提交入队申请。
	 * 注意：这是自助申请，入队要等队长在申请列表里批准。
	 */
	@Post('join')
	requestJoin(
		@Req() req: AuthedRequest,
		@Body() dto: JoinTeamDto
	): Promise<{ request: JoinRequestView; team: TeamView }> {
		return this.teams.requestJoin(this.actor(req).id, dto);
	}

	/** GET /api/teams/:id/members — 团队成员列表 */
	@Get(':id/members')
	members(
		@Param('id', ParseIntPipe) id: number,
		@Req() req: AuthedRequest
	): Promise<TeamMembersView> {
		return this.teams.members(id, this.actor(req).id);
	}

	/** GET /api/teams/:id/requests — 入队申请列表（仅队长） */
	@Get(':id/requests')
	requests(
		@Param('id', ParseIntPipe) id: number,
		@Req() req: AuthedRequest
	): Promise<TeamRequestsView> {
		return this.teams.requests(id, this.actor(req).id);
	}

	/** PATCH /api/teams/:id/requests/:requestId — 审核申请（仅队长） */
	@Post(':id/requests/:requestId/review')
	@HttpCode(200)
	review(
		@Param('id', ParseIntPipe) id: number,
		@Param('requestId', ParseIntPipe) requestId: number,
		@Req() req: AuthedRequest,
		@Body() dto: ReviewJoinRequestDto
	): Promise<JoinRequestView> {
		return this.teams.review(id, requestId, dto, this.actor(req));
	}

	/** DELETE /api/teams/:id/requests/:requestId — 撤回自己的申请 */
	@Delete(':id/requests/:requestId')
	cancelRequest(
		@Param('id', ParseIntPipe) id: number,
		@Param('requestId', ParseIntPipe) requestId: number,
		@Req() req: AuthedRequest
	): Promise<{ id: number; deleted: true }> {
		return this.teams.cancelRequest(id, requestId, this.actor(req).id);
	}

	/** DELETE /api/teams/:id/leave — 退出团队（队长不能用此接口） */
	@Delete(':id/leave')
	leave(
		@Param('id', ParseIntPipe) id: number,
		@Req() req: AuthedRequest
	): Promise<{ teamId: number; left: true }> {
		return this.teams.leave(id, this.actor(req).id);
	}

	/** DELETE /api/teams/:id — 解散团队（仅队长） */
	@Delete(':id')
	remove(
		@Param('id', ParseIntPipe) id: number,
		@Req() req: AuthedRequest
	): Promise<{ id: number; deleted: true }> {
		return this.teams.remove(id, this.actor(req).id);
	}
}
