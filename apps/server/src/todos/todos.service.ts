import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module';
import { todos, users, type NewTodoRow, type TodoRow } from '../db/schema';
import {
	TODO_DEFAULT_LIMIT,
	TODO_MAX_LIMIT,
	TODO_PRIORITIES,
	TODO_TYPES,
	type CreateTodoDto,
	type ListTodosQuery,
	type TodoStatsView,
	type TodoView,
	type UpdateTodoDto
} from './todos.dto';

/** text 字段上限，与 schema 的 varchar(255) 保持一致 */
const TEXT_MAX_LENGTH = 255;

@Injectable()
export class TodosService {
	constructor(@Inject(DB) private readonly db: Database) {}

	// ===== 查询 =====

	/**
	 * 待办列表。
	 *
	 * 支持 type / priority / done / since 四个筛选与 limit / offset 分页，
	 * 统一按 createdAt 倒序（最新在前），并返回筛选后的总数供前端分页显示。
	 */
	async list(query: ListTodosQuery = {}): Promise<{ total: number; items: TodoView[] }> {
		const limit = Math.min(Math.max(query.limit ?? TODO_DEFAULT_LIMIT, 1), TODO_MAX_LIMIT);
		const offset = Math.max(query.offset ?? 0, 0);

		const filters = [];
		if (query.type?.trim()) filters.push(eq(todos.type, this.requireType(query.type)));
		if (query.priority?.trim()) {
			filters.push(eq(todos.priority, this.requirePriority(query.priority)));
		}
		// done 只有显式传了 true/false 才参与筛选，不传表示全部
		if (typeof query.done === 'boolean') filters.push(eq(todos.done, query.done));
		if (typeof query.since === 'number' && Number.isFinite(query.since)) {
			filters.push(gte(todos.createdAt, new Date(query.since)));
		}

		const where = filters.length ? and(...filters) : undefined;

		const [rows, counted] = await Promise.all([
			this.db
				.select()
				.from(todos)
				.where(where)
				.orderBy(desc(todos.createdAt))
				.limit(limit)
				.offset(offset),
			this.db.select({ count: sql<number>`count(*)::int` }).from(todos).where(where)
		]);

		// 发布者名字以 users 表当前值为准：author_name 是发布时的快照，用户改名后要按 id 取新名
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

		return {
			total: counted[0]?.count ?? 0,
			items: rows.map((r) =>
				this.toView(r, r.authorId === null ? undefined : authorMap.get(r.authorId))
			)
		};
	}

	/** 统计：总数 / 未完成 / 已完成 / 未完成且高优先级 */
	async stats(): Promise<TodoStatsView> {
		const [row] = await this.db
			.select({
				total: sql<number>`count(*)::int`,
				open: sql<number>`count(*) filter (where not ${todos.done})::int`,
				done: sql<number>`count(*) filter (where ${todos.done})::int`,
				high: sql<number>`count(*) filter (where not ${todos.done} and ${todos.priority} = 'high')::int`
			})
			.from(todos);

		return {
			total: row?.total ?? 0,
			open: row?.open ?? 0,
			done: row?.done ?? 0,
			high: row?.high ?? 0
		};
	}

	async findById(id: number): Promise<TodoView> {
		const row = await this.requireRow(id);
		return this.toView(row, await this.liveAuthorName(row.authorId));
	}

	// ===== 写入 =====

	/**
	 * 新建待办。
	 *
	 * author 默认取 authorId 对应用户名字；若未登录则允许前端显式传 authorName，
	 * 两者都没有时存空字符串（前端会显示占位）。
	 */
	async create(dto: CreateTodoDto, author?: { id: number; name: string }): Promise<TodoView> {
		const text = this.requireText(dto.text);
		const values: NewTodoRow = {
			text,
			done: false,
			type: dto.type === undefined ? '开发' : this.requireType(dto.type),
			priority: dto.priority === undefined ? 'medium' : this.requirePriority(dto.priority),
			dueAt: this.parseDueAt(dto.dueAt),
			authorId: author?.id ?? null,
			authorName: (dto.authorName ?? author?.name ?? '').trim().slice(0, 64)
		};

		const [row] = await this.db.insert(todos).values(values).returning();
		return this.toView(row, await this.liveAuthorName(row.authorId));
	}

	/** 局部更新；只有显式传入的字段才会被写入 */
	async update(id: number, dto: UpdateTodoDto): Promise<TodoView> {
		await this.requireRow(id);

		const patch: Partial<NewTodoRow> = { updatedAt: new Date() };

		if (dto.text !== undefined) patch.text = this.requireText(dto.text);
		if (dto.done !== undefined) patch.done = this.requireBoolean(dto.done, 'done');
		if (dto.type !== undefined) patch.type = this.requireType(dto.type);
		if (dto.priority !== undefined) patch.priority = this.requirePriority(dto.priority);
		if (dto.dueAt !== undefined) patch.dueAt = this.parseDueAt(dto.dueAt);

		const [row] = await this.db.update(todos).set(patch).where(eq(todos.id, id)).returning();
		return this.toView(row, await this.liveAuthorName(row.authorId));
	}

	/** 切换完成状态，返回更新后的对象 */
	async toggle(id: number): Promise<TodoView> {
		const current = await this.requireRow(id);
		const [row] = await this.db
			.update(todos)
			.set({ done: !current.done, updatedAt: new Date() })
			.where(eq(todos.id, id))
			.returning();
		return this.toView(row, await this.liveAuthorName(row.authorId));
	}

	/** 删除待办 */
	async remove(id: number): Promise<{ id: number; deleted: true }> {
		await this.requireRow(id);
		await this.db.delete(todos).where(eq(todos.id, id));
		return { id, deleted: true };
	}

	// ===== 内部工具 =====

	/** 取出待办行，同时完成 id 合法性与存在性校验 */
	private async requireRow(id: number): Promise<TodoRow> {
		if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('非法的待办 id');
		const [row] = await this.db.select().from(todos).where(eq(todos.id, id)).limit(1);
		if (!row) throw new NotFoundException('任务不存在');
		return row;
	}

	/** text 去空格后不能为空，且不超长 */
	private requireText(raw: string): string {
		const v = (raw ?? '').trim();
		if (!v) throw new BadRequestException('任务内容不能为空');
		return v.slice(0, TEXT_MAX_LENGTH);
	}

	private requireType(raw: string): string {
		const v = (raw ?? '').trim();
		if (!(TODO_TYPES as readonly string[]).includes(v)) {
			throw new BadRequestException('任务类型不合法');
		}
		return v;
	}

	private requirePriority(raw: string): string {
		const v = (raw ?? '').trim();
		if (!(TODO_PRIORITIES as readonly string[]).includes(v)) {
			throw new BadRequestException('优先级不合法');
		}
		return v;
	}

	private requireBoolean(raw: boolean, field: string): boolean {
		if (typeof raw !== 'boolean') throw new BadRequestException(`${field} 需为布尔值`);
		return raw;
	}

	/** null/空串 -> 清除截止时间；字符串 -> Date；解析失败 400 */
	private parseDueAt(raw: string | null | undefined): Date | null {
		if (raw === null || raw === undefined) return null;
		const v = String(raw).trim();
		if (!v) return null;
		const date = new Date(v);
		if (Number.isNaN(date.getTime())) throw new BadRequestException('截止时间格式不正确');
		return date;
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

	/** 行 -> 前端视图；createdAt 转为毫秒时间戳，dueAt/updatedAt 转为 ISO 字符串 */
	private toView(row: TodoRow, liveAuthorName?: string): TodoView {
		return {
			id: row.id,
			text: row.text,
			done: row.done,
			type: row.type,
			priority: row.priority,
			dueAt: row.dueAt ? row.dueAt.toISOString() : null,
			author: liveAuthorName || row.authorName,
			createdAt: row.createdAt.getTime(),
			updatedAt: row.updatedAt.toISOString()
		};
	}
}
