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
	UseGuards
} from '@nestjs/common';

import { ProjectsService } from './projects.service';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt-auth.guard';
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
	constructor(private readonly projects: ProjectsService) {}

	/** 带了 JWT 就取当前用户，用于记录任务作者；未登录返回空 */
	private currentUser(req: AuthedRequest): { id: number | null; name: string } {
		return { id: req.user?.id ?? null, name: req.user?.name ?? '' };
	}

	// ===== 项目集合 =====

	/** GET /api/projects — 项目列表，支持 q/tag/unread/limit/offset */
	@Get()
	async list(@Query() query: Record<string, string>): Promise<{ total: number; items: ProjectView[] }> {
		const parsed: ListProjectsQuery = {
			q: query.q,
			tag: query.tag,
			limit: query.limit ? Number(query.limit) : undefined,
			offset: query.offset ? Number(query.offset) : undefined
		};
		if (query.unread === 'true' || query.unread === 'false') parsed.unread = query.unread === 'true';
		return this.projects.list(parsed);
	}

	/** POST /api/projects — 新建项目，项目名唯一 */
	@Post()
	create(@Body() dto: CreateProjectDto): Promise<ProjectView> {
		return this.projects.create(dto);
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
	findByLabel(@Param('label') label: string): Promise<ProjectView> {
		return this.projects.findByLabel(label);
	}

	// ===== 单个项目 =====

	/** GET /api/projects/:id — 项目详情（内联任务列表） */
	@Get(':id')
	findById(@Param('id', ParseIntPipe) id: number): Promise<ProjectView> {
		return this.projects.findById(id);
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
		@Body() body: { title?: string },
		@Req() req: AuthedRequest
	): Promise<ProjectTaskView> {
		const user = this.currentUser(req);
		return this.projects.addTask(id, body.title ?? '', user.id, user.name);
	}
}
