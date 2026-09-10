import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
	Query,
	Req,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ActivitiesService } from './activities.service';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.service';
import type { ActivityListResult, ActivityView, CreateActivityDto } from './activities.dto';

@Controller('activities')
export class ActivitiesController {
	constructor(
		private readonly activities: ActivitiesService,
		private readonly jwt: JwtService
	) {}

	/** 取当前登录用户 id（守卫已保证存在） */
	private currentUserId(req: AuthedRequest): number {
		const id = req.user?.id;
		if (!id) throw new UnauthorizedException('缺少访问令牌');
		return id;
	}

	/**
	 * 可选鉴权：带合法 token 就返回调用者 id，匿名或令牌无效都返回 undefined。
	 * 用于列表接口——匿名只能看 team 动态，登录后还能看到自己的 private 动态。
	 * 这里手动解析而不是用 JwtAuthGuard，因为守卫会直接拒绝无 token 的请求。
	 */
	private async optionalUserId(authorization?: string): Promise<number | undefined> {
		if (!authorization?.startsWith('Bearer ')) return undefined;
		const token = authorization.slice('Bearer '.length).trim();
		if (!token) return undefined;
		try {
			const payload = await this.jwt.verifyAsync<JwtPayload>(token);
			return payload.sub;
		} catch {
			return undefined;
		}
	}

	/** GET /api/activities — 动态列表，按时间倒序 */
	@Get()
	async list(
		@Query() query: Record<string, string>,
		@Headers('authorization') authorization?: string
	): Promise<ActivityListResult> {
		const viewerId = await this.optionalUserId(authorization);
		return this.activities.list(
			{
				limit: query.limit ? Number(query.limit) : undefined,
				offset: query.offset ? Number(query.offset) : undefined
			},
			viewerId
		);
	}

	/** GET /api/activities/:id — 单条详情（private 仅作者可见） */
	@Get(':id')
	async findById(
		@Param('id', ParseIntPipe) id: number,
		@Headers('authorization') authorization?: string
	): Promise<ActivityView> {
		const viewerId = await this.optionalUserId(authorization);
		return this.activities.findById(id, viewerId);
	}

	/** POST /api/activities — 发布动态，需登录 */
	@Post()
	@UseGuards(JwtAuthGuard)
	create(@Req() req: AuthedRequest, @Body() dto: CreateActivityDto): Promise<ActivityView> {
		return this.activities.create(dto, this.currentUserId(req), req.user?.name ?? '');
	}

	/** DELETE /api/activities/:id — 删除自己的动态，需登录 */
	@Delete(':id')
	@UseGuards(JwtAuthGuard)
	remove(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
		return this.activities.remove(id, this.currentUserId(req));
	}
}
