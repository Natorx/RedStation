/**
 * 规划模块的请求 / 响应类型。
 *
 * 一个「计划」= 一张横向流程图，流程图的节点是「步骤」。
 * 用户可以同时开启多个计划，因此列表按 createdAt 倒序返回全部。
 */

/** 步骤状态，与前端配色映射保持一致 */
export const STEP_STATUSES = ['todo', 'doing', 'done'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** 列表默认返回条数与上限 */
export const PLAN_DEFAULT_LIMIT = 100;
export const PLAN_MAX_LIMIT = 200;

/** 规划步骤视图 */
export type PlanStepView = {
	id: number;
	planId: number;
	title: string;
	/** todo / doing / done */
	status: StepStatus;
	/** 横向排列顺序，从 0 开始 */
	position: number;
	createdAt: string;
	updatedAt: string;
};

/** 返回给前端的计划视图 */
export type PlanView = {
	id: number;
	title: string;
	goal: string;
	/** 是否进行中 */
	active: boolean;
	/** 发起人名字 */
	owner: string;
	/** 按 position 升序排列的步骤 */
	steps: PlanStepView[];
	stepTotal: number;
	stepDone: number;
	createdAt: string;
	updatedAt: string;
};

/** 列表查询入参 */
export type ListPlansQuery = {
	/** 按计划名 / 目标模糊搜索 */
	q?: string;
	/** true 只看进行中，false 只看已暂停 */
	active?: boolean;
	limit?: number;
	offset?: number;
};

/** 新建计划入参 */
export type CreatePlanDto = {
	title: string;
	goal?: string;
	/** 不传默认 true */
	active?: boolean;
	/** 不传时取当前登录用户 */
	owner?: string;
	/** 初始步骤标题，按数组顺序排列 */
	steps?: string[];
};

/** 更新计划入参，全部可选 */
export type UpdatePlanDto = {
	title?: string;
	goal?: string;
	active?: boolean;
};

/** 新建步骤入参 */
export type CreatePlanStepDto = {
	title: string;
	status?: string;
	/** 不传则追加到末尾 */
	position?: number;
};

/** 更新步骤入参，全部可选 */
export type UpdatePlanStepDto = {
	title?: string;
	status?: string;
	position?: number;
};
