import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module';
import { planSteps, plans, type NewPlanRow, type PlanRow, type PlanStepRow } from '../db/schema';
import {
	PLAN_DEFAULT_LIMIT,
	PLAN_MAX_LIMIT,
	STEP_STATUSES,
	type CreatePlanDto,
	type CreatePlanStepDto,
	type ListPlansQuery,
	type PlanStepView,
	type PlanView,
	type StepStatus,
	type UpdatePlanDto,
	type UpdatePlanStepDto
} from './plans.dto';

/** 标题字段上限，与 schema 的 varchar 保持一致 */
const TITLE_MAX_LENGTH = 96;
const STEP_TITLE_MAX_LENGTH = 255;
const GOAL_MAX_LENGTH = 255;

@Injectable()
export class PlansService {
	constructor(@Inject(DB) private readonly db: Database) {}

	// ===== 查询 =====

	/** 计划列表，含各自步骤；一次性查出步骤避免 N+1 */
	async list(query: ListPlansQuery = {}): Promise<{ total: number; items: PlanView[] }> {
		const limit = Math.min(Math.max(query.limit ?? PLAN_DEFAULT_LIMIT, 1), PLAN_MAX_LIMIT);
		const offset = Math.max(query.offset ?? 0, 0);

		const filters = [];
		if (query.q?.trim()) {
			const kw = `%${query.q.trim()}%`;
			filters.push(or(ilike(plans.title, kw), ilike(plans.goal, kw)));
		}
		if (typeof query.active === 'boolean') filters.push(eq(plans.active, query.active));

		const where = filters.length ? and(...filters) : undefined;

		const [rows, counted] = await Promise.all([
			this.db
				.select()
				.from(plans)
				.where(where)
				.orderBy(desc(plans.createdAt))
				.limit(limit)
				.offset(offset),
			this.db.select({ count: sql<number>`count(*)::int` }).from(plans).where(where)
		]);

		const ids = rows.map((r) => r.id);
		const steps = ids.length ? await this.stepsOfPlans(ids) : new Map<number, PlanStepView[]>();

		return {
			total: counted[0]?.count ?? 0,
			items: rows.map((r) => this.toView(r, steps.get(r.id) ?? []))
		};
	}

	/** 按 id 取单个计划（含步骤） */
	async findById(id: number): Promise<PlanView> {
		const row = await this.requirePlan(id);
		const steps = await this.stepsOfPlans([id]);
		return this.toView(row, steps.get(id) ?? []);
	}

	// ===== 计划写入 =====

	async create(dto: CreatePlanDto): Promise<PlanView> {
		const title = this.requireTitle(dto.title);
		const goal = this.optionalText(dto.goal, GOAL_MAX_LENGTH, '计划目标');

		const values: NewPlanRow = {
			title,
			goal,
			active: dto.active ?? true,
			ownerName: dto.owner?.trim() ?? ''
		};

		const [row] = await this.db.insert(plans).values(values).returning();

		// 初始步骤按数组顺序落库，position 从 0 递增
		const titles = (dto.steps ?? []).map((s) => s.trim()).filter(Boolean);
		if (titles.length) {
			await this.db.insert(planSteps).values(
				titles.map((t, i) => ({
					planId: row.id,
					title: t.slice(0, STEP_TITLE_MAX_LENGTH),
					status: 'todo' as const,
					position: i
				}))
			);
		}

		return this.findById(row.id);
	}

	async update(id: number, dto: UpdatePlanDto): Promise<PlanView> {
		await this.requirePlan(id);

		const patch: Partial<NewPlanRow> = { updatedAt: new Date() };
		if (dto.title !== undefined) patch.title = this.requireTitle(dto.title);
		if (dto.goal !== undefined) {
			patch.goal = this.optionalText(dto.goal, GOAL_MAX_LENGTH, '计划目标');
		}
		if (dto.active !== undefined) {
			if (typeof dto.active !== 'boolean') throw new BadRequestException('active 需为布尔值');
			patch.active = dto.active;
		}

		await this.db.update(plans).set(patch).where(eq(plans.id, id));
		return this.findById(id);
	}

	/** 删除计划；步骤由外键级联删除 */
	async remove(id: number): Promise<{ id: number; deleted: true }> {
		await this.requirePlan(id);
		await this.db.delete(plans).where(eq(plans.id, id));
		return { id, deleted: true };
	}

	// ===== 步骤写入 =====

	async addStep(planId: number, dto: CreatePlanStepDto): Promise<PlanView> {
		await this.requirePlan(planId);

		const title = this.requireStepTitle(dto.title);
		const status = this.requireStatus(dto.status ?? 'todo');

		// 不指定位置时追加到末尾
		let position = dto.position;
		if (typeof position !== 'number' || !Number.isFinite(position)) {
			const [maxRow] = await this.db
				.select({ max: sql<number>`coalesce(max(${planSteps.position}), -1)::int` })
				.from(planSteps)
				.where(eq(planSteps.planId, planId));
			position = (maxRow?.max ?? -1) + 1;
		}

		await this.db.insert(planSteps).values({
			planId,
			title,
			status,
			position: Math.max(Math.trunc(position), 0)
		});
		await this.touch(planId);

		return this.findById(planId);
	}

	async updateStep(stepId: number, dto: UpdatePlanStepDto): Promise<PlanView> {
		const row = await this.requireStep(stepId);

		const patch: Partial<PlanStepRow> = { updatedAt: new Date() };
		if (dto.title !== undefined) patch.title = this.requireStepTitle(dto.title);
		if (dto.status !== undefined) patch.status = this.requireStatus(dto.status);
		if (dto.position !== undefined) {
			if (!Number.isFinite(dto.position)) throw new BadRequestException('步骤顺序不合法');
			patch.position = Math.max(Math.trunc(dto.position), 0);
		}

		await this.db.update(planSteps).set(patch).where(eq(planSteps.id, stepId));
		await this.touch(row.planId);

		return this.findById(row.planId);
	}

	async removeStep(stepId: number): Promise<PlanView> {
		const row = await this.requireStep(stepId);
		await this.db.delete(planSteps).where(eq(planSteps.id, stepId));
		await this.touch(row.planId);
		return this.findById(row.planId);
	}

	// ===== 内部工具 =====

	/** 批量取多个计划的步骤，返回 planId -> 步骤数组 */
	private async stepsOfPlans(planIds: number[]): Promise<Map<number, PlanStepView[]>> {
		const map = new Map<number, PlanStepView[]>();
		if (!planIds.length) return map;

		const rows = await this.db
			.select()
			.from(planSteps)
			.where(inArray(planSteps.planId, planIds))
			.orderBy(asc(planSteps.position), asc(planSteps.id));

		for (const row of rows) {
			const list = map.get(row.planId) ?? [];
			list.push(this.toStepView(row));
			map.set(row.planId, list);
		}
		return map;
	}

	private async requirePlan(id: number): Promise<PlanRow> {
		const [row] = await this.db.select().from(plans).where(eq(plans.id, id)).limit(1);
		if (!row) throw new NotFoundException('计划不存在');
		return row;
	}

	private async requireStep(stepId: number): Promise<PlanStepRow> {
		const [row] = await this.db.select().from(planSteps).where(eq(planSteps.id, stepId)).limit(1);
		if (!row) throw new NotFoundException('步骤不存在');
		return row;
	}

	/** 步骤变动后刷新计划的 updatedAt */
	private async touch(planId: number): Promise<void> {
		await this.db.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, planId));
	}

	private requireTitle(raw: string): string {
		const v = (raw ?? '').trim();
		if (!v) throw new BadRequestException('计划名不能为空');
		if (v.length > TITLE_MAX_LENGTH) throw new BadRequestException('计划名过长');
		return v;
	}

	private requireStepTitle(raw: string): string {
		const v = (raw ?? '').trim();
		if (!v) throw new BadRequestException('步骤内容不能为空');
		if (v.length > STEP_TITLE_MAX_LENGTH) throw new BadRequestException('步骤内容过长');
		return v;
	}

	private optionalText(raw: string | undefined, max: number, label: string): string {
		const v = (raw ?? '').trim();
		if (v.length > max) throw new BadRequestException(`${label}过长`);
		return v;
	}

	private requireStatus(raw: string): StepStatus {
		const v = (raw ?? '').trim();
		if (!(STEP_STATUSES as readonly string[]).includes(v)) {
			throw new BadRequestException('步骤状态不合法');
		}
		return v as StepStatus;
	}

	private toStepView(row: PlanStepRow): PlanStepView {
		return {
			id: row.id,
			planId: row.planId,
			title: row.title,
			status: row.status as StepStatus,
			position: row.position,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString()
		};
	}

	private toView(row: PlanRow, steps: PlanStepView[]): PlanView {
		return {
			id: row.id,
			title: row.title,
			goal: row.goal,
			active: row.active,
			owner: row.ownerName,
			steps,
			stepTotal: steps.length,
			stepDone: steps.filter((s) => s.status === 'done').length,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString()
		};
	}
}
