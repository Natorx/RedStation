import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException,
	Optional
} from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module';
import { HostingService } from '../hosting/hosting.service';
import {
	ProjectMembersService,
	type ProjectActor
} from './project-members.service';
import type { ProjectMemberRole, ProjectMemberView } from './project-members.dto';
import {
	projectTasks,
	projects,
	users,
	type NewProjectRow,
	type ProjectRow,
	type ProjectTaskRow
} from '../db/schema';
import {
	COLOR_OPTIONS,
	TASK_CATEGORIES,
	type TaskCategory,
	UI_FORMS,
	type CreateProjectDto,
	type ListProjectsQuery,
	type ProjectTaskView,
	type ProjectUI,
	type ProjectView,
	type UpdateProjectDto
} from './projects.dto';

/** 逗号分隔字符串 <-> 数组 */
function toList(raw: string | null | undefined): string[] {
	return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function toCsv(items: string[] | undefined): string {
	return (items ?? []).map((s) => s.trim()).filter(Boolean).join(',');
}

/** 相对时间文案，与前端展示风格一致 */
function humanAgo(created: Date, now = new Date()): string {
	const diff = now.getTime() - created.getTime();
	const min = Math.floor(diff / 60000);
	if (min < 1) return '刚刚';
	if (min < 60) return `${min} 分钟前`;
	const hour = Math.floor(min / 60);
	if (hour < 24) return `${hour} 小时前`;
	const day = Math.floor(hour / 24);
	if (day === 1) return '昨天';
	return `${day} 天前`;
}

/** 前端展示的日期，如 2026-9-10（不补零，与前端原格式一致） */
function humanDate(d: Date): string {
	return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

@Injectable()
export class ProjectsService {
	constructor(
		@Inject(DB) private readonly db: Database,
		// 可选注入：删除项目时顺带清理磁盘上的托管目录。
		// @Optional 让本服务在缺少 HostingModule 的场景（单测等）仍能实例化。
		@Optional() private readonly hosting?: HostingService,
		// 项目成员 / 邀请；单测未挂载模块时允许缺省，成员相关逻辑自动降级为「不限制」
		@Optional() private readonly members?: ProjectMembersService
	) {}

	// ===== 项目查询 =====

	async list(
		query: ListProjectsQuery = {},
		viewerId: number | null = null
	): Promise<{ total: number; items: ProjectView[] }> {
		const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
		const offset = Math.max(query.offset ?? 0, 0);

		const filters = [];
		// 只有项目成员能看到该项目：按成员关系收窄可见范围
		if (this.members && viewerId !== null) {
			const visible = await this.members.projectIdsFor(viewerId);
			if (!visible.length) return { total: 0, items: [] };
			filters.push(inArray(projects.id, visible));
		}
		if (query.q?.trim()) {
			const kw = `%${query.q.trim()}%`;
			filters.push(or(ilike(projects.label, kw), ilike(projects.tag, kw)));
		}
		if (query.tag?.trim()) filters.push(eq(projects.tag, query.tag.trim()));
		if (typeof query.unread === 'boolean') filters.push(eq(projects.unread, query.unread));

		const where = filters.length ? and(...filters) : undefined;

		const [rows, counted] = await Promise.all([
			this.db
				.select()
				.from(projects)
				.where(where)
				.orderBy(asc(projects.id))
				.limit(limit)
				.offset(offset),
			this.db.select({ count: sql<number>`count(*)::int` }).from(projects).where(where)
		]);

		// 一次性把所有相关项目的任务/成员查出来，避免 N+1
		const ids = rows.map((r) => r.id);
		const tasks = ids.length ? await this.tasksOfProjects(ids) : new Map<number, ProjectTaskView[]>();
		const memberMap = await this.membersOf(ids);
		const roleMap = await this.rolesOf(ids, viewerId);

		return {
			total: counted[0]?.count ?? 0,
			items: rows.map((r) =>
				this.toView(r, tasks.get(r.id) ?? [], memberMap.get(r.id) ?? [], roleMap.get(r.id) ?? null)
			)
		};
	}

	async findById(id: number, viewerId: number | null = null): Promise<ProjectView> {
		const row = await this.requireRow(id);
		await this.assertVisible(id, viewerId);
		const tasks = await this.tasksOfProjects([id]);
		const memberMap = await this.membersOf([id]);
		const role = viewerId === null ? null : await this.members?.roleOf(id, viewerId);
		return this.toView(row, tasks.get(id) ?? [], memberMap.get(id) ?? [], role ?? null);
	}

	/**
	 * 按项目名查找；前端历史上用 label 定位，保留此入口方便迁移。
	 */
	async findByLabel(label: string, viewerId: number | null = null): Promise<ProjectView> {
		const [row] = await this.db.select().from(projects).where(eq(projects.label, label)).limit(1);
		if (!row) throw new NotFoundException(`项目不存在：${label}`);
		await this.assertVisible(row.id, viewerId);
		const tasks = await this.tasksOfProjects([row.id]);
		const memberMap = await this.membersOf([row.id]);
		const role = viewerId === null ? null : await this.members?.roleOf(row.id, viewerId);
		return this.toView(row, tasks.get(row.id) ?? [], memberMap.get(row.id) ?? [], role ?? null);
	}

	// ===== 项目写入 =====

	async create(dto: CreateProjectDto, actor: ProjectActor | null = null): Promise<ProjectView> {
		const label = this.requireLabel(dto.label);
		await this.assertLabelFree(label);

		const values: NewProjectRow = {
			label,
			tag: dto.tag?.trim() || '未分类',
			color: this.normalizeColor(dto.color),
			ui: this.normalizeUi(dto.ui),
			purpose: dto.purpose?.trim() ?? '',
			intro: dto.intro?.trim() ?? '',
			stack: toCsv(dto.stack),
			frameworks: toCsv(dto.frameworks),
			deployed: dto.deployed ?? false,
			deployPath: dto.deployPath?.trim() ?? '',
			runPort: dto.runPort?.trim() ?? '',
			projectUrl: this.normalizeUrl(dto.projectUrl, '项目地址'),
			repoUrl: this.normalizeUrl(dto.repoUrl, '代码仓库地址'),
			owner: dto.owner?.trim() ?? '',
			unread: false
		};

		const [row] = await this.db.insert(projects).values(values).returning();

		// 创建者即项目发起人，写入成员关系，否则项目对他自己也不可见
		if (this.members && actor) await this.members.ensureOwner(row.id, actor);

		const memberMap = await this.membersOf([row.id]);
		return this.toView(row, [], memberMap.get(row.id) ?? [], actor ? 'owner' : null);
	}

	async update(id: number, dto: UpdateProjectDto): Promise<ProjectView> {
		await this.requireRow(id);

		const patch: Partial<NewProjectRow> = { updatedAt: new Date() };

		if (dto.label !== undefined) {
			const label = this.requireLabel(dto.label);
			await this.assertLabelFree(label, id);
			patch.label = label;
		}
		if (dto.tag !== undefined) patch.tag = dto.tag.trim() || '未分类';
		if (dto.color !== undefined) patch.color = this.normalizeColor(dto.color);
		if (dto.ui !== undefined) patch.ui = this.normalizeUi(dto.ui);
		if (dto.purpose !== undefined) patch.purpose = dto.purpose.trim();
		if (dto.intro !== undefined) patch.intro = dto.intro.trim();
		if (dto.stack !== undefined) patch.stack = toCsv(dto.stack);
		if (dto.frameworks !== undefined) patch.frameworks = toCsv(dto.frameworks);
		if (dto.deployed !== undefined) patch.deployed = dto.deployed;
		if (dto.deployPath !== undefined) patch.deployPath = dto.deployPath.trim();
		if (dto.runPort !== undefined) patch.runPort = dto.runPort.trim();
		if (dto.projectUrl !== undefined) patch.projectUrl = this.normalizeUrl(dto.projectUrl, '项目地址');
		if (dto.repoUrl !== undefined) patch.repoUrl = this.normalizeUrl(dto.repoUrl, '代码仓库地址');
		if (dto.owner !== undefined && dto.owner.trim()) patch.owner = dto.owner.trim();

		const [row] = await this.db.update(projects).set(patch).where(eq(projects.id, id)).returning();
		const tasks = await this.tasksOfProjects([id]);
		return this.toView(row, tasks.get(id) ?? []);
	}

	async remove(id: number): Promise<{ id: number; deleted: true }> {
		const row = await this.requireRow(id);
		// project_tasks / project_hostings 已配 onDelete cascade，会一并删除；
		// 托管目录在磁盘上，删库不会带走，交给 HostingService 清理
		await this.db.delete(projects).where(eq(projects.id, id));
		await this.hosting?.purge(id, row.label);
		return { id, deleted: true };
	}

	/** 清除未读角标：前端打开项目详情/弹窗时调用 */
	async markRead(id: number): Promise<ProjectView> {
		await this.requireRow(id);
		const [row] = await this.db
			.update(projects)
			.set({ unread: false, updatedAt: new Date() })
			.where(eq(projects.id, id))
			.returning();
		const tasks = await this.tasksOfProjects([id]);
		const memberMap = await this.membersOf([id]);
		return this.toView(row, tasks.get(id) ?? [], memberMap.get(id) ?? [], null);
	}

	// ===== 项目任务 =====

	async listTasks(projectId: number): Promise<ProjectTaskView[]> {
		await this.requireRow(projectId);
		const tasks = await this.tasksOfProjects([projectId]);
		return tasks.get(projectId) ?? [];
	}

	async addTask(
		projectId: number,
		title: string,
		authorId: number | null,
		authorName: string,
		category?: string
	): Promise<ProjectTaskView> {
		await this.requireRow(projectId);

		const text = (title ?? '').trim();
		if (!text) throw new BadRequestException('任务标题不能为空');
		if (text.length > 255) throw new BadRequestException('任务标题不能超过 255 字');

		const [row] = await this.db
			.insert(projectTasks)
			.values({
				projectId,
				title: text,
				done: false,
				category: this.normalizeCategory(category),
				authorId: authorId ?? null,
				authorName: authorName || ''
			})
			.returning();

		// 有新任务了，给项目打上未读角标
		await this.db
			.update(projects)
			.set({ unread: true, updatedAt: new Date() })
			.where(eq(projects.id, projectId));

		return this.toTaskView(row, await this.liveAuthorName(row.authorId));
	}

	/** 更新任务：支持改标题与切换完成状态 */
	async updateTask(
		taskId: number,
		patch: { title?: string; done?: boolean; category?: string }
	): Promise<ProjectTaskView> {
		const current = await this.requireTask(taskId);

		const values: Partial<ProjectTaskRow> = { updatedAt: new Date() };
		if (patch.title !== undefined) {
			const title = patch.title.trim();
			if (!title) throw new BadRequestException('任务标题不能为空');
			values.title = title;
		}
		if (patch.done !== undefined) values.done = patch.done;
		if (patch.category !== undefined) values.category = this.normalizeCategory(patch.category);

		const [row] = await this.db
			.update(projectTasks)
			.set(values)
			.where(eq(projectTasks.id, taskId))
			.returning();

		await this.touchProject(current.projectId);
		return this.toTaskView(row, await this.liveAuthorName(row.authorId));
	}

	/** 切换完成状态，返回更新后的任务 */
	async toggleTask(taskId: number): Promise<ProjectTaskView> {
		const current = await this.requireTask(taskId);
		const [row] = await this.db
			.update(projectTasks)
			.set({ done: !current.done, updatedAt: new Date() })
			.where(eq(projectTasks.id, taskId))
			.returning();
		await this.touchProject(current.projectId);
		return this.toTaskView(row, await this.liveAuthorName(row.authorId));
	}

	async removeTask(taskId: number): Promise<{ id: number; deleted: true }> {
		const current = await this.requireTask(taskId);
		await this.db.delete(projectTasks).where(eq(projectTasks.id, taskId));
		await this.touchProject(current.projectId);
		return { id: taskId, deleted: true };
	}

	// ===== 内部工具 =====

	/** 批量取多个项目的任务，按项目分组，避免 N+1 查询 */
	private async tasksOfProjects(projectIds: number[]): Promise<Map<number, ProjectTaskView[]>> {
		const map = new Map<number, ProjectTaskView[]>();
		if (!projectIds.length) return map;

		const rows = await this.db
			.select()
			.from(projectTasks)
			.where(inArray(projectTasks.projectId, projectIds))
			.orderBy(asc(projectTasks.id));

		// 发布者名字以 users 表当前值为准：author_name 只是发布时的快照，用户改名后按 id 取新名
		const authorIds = [
			...new Set(rows.map((r) => r.authorId).filter((v): v is number => v !== null))
		];
		const authorRows = authorIds.length
			? await this.db
					.select({ id: users.id, name: users.name })
					.from(users)
					.where(inArray(users.id, authorIds))
			: [];
		const authorMap = new Map(authorRows.map((a) => [a.id, a.name]));

		for (const r of rows) {
			const list = map.get(r.projectId) ?? [];
			const name = r.authorId === null ? undefined : authorMap.get(r.authorId);
			list.push(this.toTaskView(r, name));
			map.set(r.projectId, list);
		}
		return map;
	}

	private async requireRow(id: number): Promise<ProjectRow> {
		if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('非法的项目 id');
		const [row] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
		if (!row) throw new NotFoundException(`项目不存在：id=${id}`);
		return row;
	}

	private async requireTask(taskId: number): Promise<ProjectTaskRow> {
		if (!Number.isInteger(taskId) || taskId <= 0) throw new BadRequestException('非法的任务 id');
		const [row] = await this.db
			.select()
			.from(projectTasks)
			.where(eq(projectTasks.id, taskId))
			.limit(1);
		if (!row) throw new NotFoundException(`任务不存在：id=${taskId}`);
		return row;
	}

	private async assertLabelFree(label: string, excludeId?: number) {
		const [dup] = await this.db
			.select({ id: projects.id })
			.from(projects)
			.where(eq(projects.label, label))
			.limit(1);
		if (dup && dup.id !== excludeId) throw new ConflictException(`项目名已存在：${label}`);
	}

	/** 任务变动后刷新项目的 updatedAt，便于前端排序 */
	private async touchProject(projectId: number) {
		await this.db
			.update(projects)
			.set({ updatedAt: new Date() })
			.where(eq(projects.id, projectId));
	}

	private requireLabel(raw: string): string {
		const label = (raw ?? '').trim();
		if (!label) throw new BadRequestException('项目名不能为空');
		if (label.length > 96) throw new BadRequestException('项目名不能超过 96 字');
		return label;
	}

	/**
	 * 规范化项目地址 / 仓库地址。
	 *
	 * 空串表示「未填写」，直接放行。非空时必须是 http/https 绝对地址：
	 * 前端会把这两个值渲染成 <a href>，若放任 javascript: 这类协议进来，
	 * 点一下就能执行脚本，所以协议白名单必须放在服务端。
	 * 顺手补全裸域名（github.com/x/y -> https://github.com/x/y），省得用户被格式卡住。
	 */
	private normalizeUrl(raw: string | undefined, field: string): string {
		const v = (raw ?? '').trim();
		if (!v) return '';
		if (v.length > 255) throw new BadRequestException(`${field}不能超过 255 字`);

		const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v) ? v : `https://${v}`;

		let parsed: URL;
		try {
			parsed = new URL(withScheme);
		} catch {
			throw new BadRequestException(`${field}格式不正确`);
		}
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			throw new BadRequestException(`${field}必须以 http:// 或 https:// 开头`);
		}
		return parsed.href;
	}

	private normalizeColor(raw?: string): string {
		const color = (raw ?? '').trim() || 'red';
		if (!(COLOR_OPTIONS as readonly string[]).includes(color)) {
			throw new BadRequestException(`标签配色不合法，可选：${COLOR_OPTIONS.join(' / ')}`);
		}
		return color;
	}

	/** 类别：空值回退到「功能」，非法值报 400 */
	private normalizeCategory(raw?: string): TaskCategory {
		const v = (raw ?? '').trim() || '功能';
		if (!(TASK_CATEGORIES as readonly string[]).includes(v)) {
			throw new BadRequestException(`任务类别不合法，可选：${TASK_CATEGORIES.join(' / ')}`);
		}
		return v as TaskCategory;
	}

	private normalizeUi(raw?: string): ProjectUI {
		const ui = (raw ?? '').trim() || 'GUI';
		if (!(UI_FORMS as readonly string[]).includes(ui)) {
			throw new BadRequestException(`项目形态不合法，可选：${UI_FORMS.join(' / ')}`);
		}
		return ui as ProjectUI;
	}

	/** 批量取项目的成员；成员服务缺省时返回空表 */
	private async membersOf(ids: number[]): Promise<Map<number, ProjectMemberView[]>> {
		if (!this.members || !ids.length) return new Map();
		return this.members.membersOfProjects(ids);
	}

	/** 批量取当前用户在若干项目里的身份 */
	private async rolesOf(
		ids: number[],
		viewerId: number | null
	): Promise<Map<number, ProjectMemberRole>> {
		if (!this.members || viewerId === null || !ids.length) return new Map();
		return this.members.rolesOf(ids, viewerId);
	}

	/** 非成员不得查看项目详情；未登录或成员服务缺省时不拦截 */
	private async assertVisible(projectId: number, viewerId: number | null): Promise<void> {
		if (!this.members || viewerId === null) return;
		const role = await this.members.roleOf(projectId, viewerId);
		if (!role) throw new ForbiddenException('你不是该项目成员，无权查看');
	}

	/** 单个用户改名后的实时名字；无作者或用户已删除时返回 undefined，回退到快照 */
	private async liveAuthorName(authorId: number | null): Promise<string | undefined> {
		if (authorId === null) return undefined;
		const [row] = await this.db
			.select({ name: users.name })
			.from(users)
			.where(eq(users.id, authorId))
			.limit(1);
		return row?.name;
	}

	private toTaskView(row: ProjectTaskRow, liveAuthorName?: string): ProjectTaskView {
		// 前端原格式是 date + ago 两个现成字符串，这里在后端算好，避免前端各处重复格式化
		const created = row.createdAt;
		return {
			id: row.id,
			projectId: row.projectId,
			title: row.title,
			done: row.done,
			category: row.category as TaskCategory,
			author: liveAuthorName || row.authorName,
			date: humanDate(created),
			ago: humanAgo(created),
			createdAt: created.toISOString()
		};
	}

	private toView(
		row: ProjectRow,
		tasks: ProjectTaskView[],
		members: ProjectMemberView[] = [],
		myRole: ProjectMemberRole | null = null
	): ProjectView {
		return {
			id: row.id,
			label: row.label,
			tag: row.tag,
			color: row.color,
			unread: row.unread,
			ui: row.ui as ProjectUI,
			purpose: row.purpose,
			intro: row.intro,
			stack: toList(row.stack),
			frameworks: toList(row.frameworks),
			deployed: row.deployed,
			deployPath: row.deployPath,
			owner: row.owner,
			runPort: row.runPort,
			projectUrl: row.projectUrl,
			repoUrl: row.repoUrl,
			tasks,
			taskTotal: tasks.length,
			taskDone: tasks.filter((t) => t.done).length,
			members,
			memberCount: members.length,
			myRole,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString()
		};
	}
}
