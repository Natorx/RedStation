import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	Query,
	Req,
	UseGuards
} from '@nestjs/common';

import { PlansService } from './plans.service';
import { OptionalJwtGuard } from '../todos/todos.controller';
import type { AuthedRequest } from '../auth/jwt-auth.guard';
import type {
	CreatePlanDto,
	CreatePlanStepDto,
	ListPlansQuery,
	PlanView,
	UpdatePlanDto,
	UpdatePlanStepDto
} from './plans.dto';

/**
 * 路由顺序说明：
 * NestJS 按声明顺序匹配，静态段必须排在参数段之前，
 * 否则 `/api/plans/steps/5` 会被 `@Get(':id')` 抢先匹配。
 * 因此顺序为：计划集合 → steps 子路由 → :id 系列。
 */
@Controller('plans')
export class PlansController {
	constructor(private readonly plans: PlansService) {}

	/** 带了 JWT 就取当前用户，用于记录计划发起人；未登录返回空 */
	private currentUser(req: AuthedRequest): { id: number | null; name: string } {
		return { id: req.user?.id ?? null, name: req.user?.name ?? '' };
	}

	// ===== 计划集合 =====

	/** GET /api/plans — 计划列表，支持 q/active/limit/offset */
	@Get()
	async list(
		@Query() query: Record<string, string>
	): Promise<{ total: number; items: PlanView[] }> {
		const parsed: ListPlansQuery = {
			q: query.q,
			limit: query.limit ? Number(query.limit) : undefined,
			offset: query.offset ? Number(query.offset) : undefined
		};
		if (query.active === 'true' || query.active === 'false') {
			parsed.active = query.active === 'true';
		}
		return this.plans.list(parsed);
	}

	/** POST /api/plans — 新建计划，可选带初始步骤 */
	@Post()
	@UseGuards(OptionalJwtGuard)
	create(@Body() dto: CreatePlanDto, @Req() req: AuthedRequest): Promise<PlanView> {
		const user = this.currentUser(req);
		return this.plans.create({ ...dto, owner: dto.owner?.trim() || user.name });
	}

	// ===== 步骤（必须排在 :id 之前）=====

	/** POST /api/plans/:id/steps — 给计划追加一步 */
	@Post(':id/steps')
	addStep(
		@Param('id', ParseIntPipe) id: number,
		@Body() body: CreatePlanStepDto
	): Promise<PlanView> {
		return this.plans.addStep(id, body);
	}

	/** PATCH /api/plans/steps/:stepId — 改步骤内容或状态 */
	@Patch('steps/:stepId')
	updateStep(
		@Param('stepId', ParseIntPipe) stepId: number,
		@Body() body: UpdatePlanStepDto
	): Promise<PlanView> {
		return this.plans.updateStep(stepId, body);
	}

	/** DELETE /api/plans/steps/:stepId — 删除步骤 */
	@Delete('steps/:stepId')
	removeStep(@Param('stepId', ParseIntPipe) stepId: number): Promise<PlanView> {
		return this.plans.removeStep(stepId);
	}

	// ===== 单个计划 =====

	/** GET /api/plans/:id — 计划详情（含步骤） */
	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number): Promise<PlanView> {
		return this.plans.findById(id);
	}

	/** PATCH /api/plans/:id — 更新计划（改名 / 目标 / 启停） */
	@Patch(':id')
	update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdatePlanDto): Promise<PlanView> {
		return this.plans.update(id, body);
	}

	/** DELETE /api/plans/:id — 删除计划，步骤级联删除 */
	@Delete(':id')
	remove(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; deleted: true }> {
		return this.plans.remove(id);
	}
}
