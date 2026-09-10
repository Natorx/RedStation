import {
	BadRequestException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { desc, eq, inArray, or, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module';
import {
	activities,
	activityMentions,
	projects,
	users,
	type NewActivityRow
} from '../db/schema';
import {
	ACTIVITY_CONTENT_MAX_LENGTH,
	ACTIVITY_DEFAULT_COLOR,
	ACTIVITY_LIST_DEFAULT_LIMIT,
	ACTIVITY_LIST_MAX_LIMIT,
	ACTIVITY_TYPES,
	ACTIVITY_VISIBILITIES,
	type ActivityListResult,
	type ActivityView,
	type CreateActivityDto,
	type ListActivitiesQuery,
	type MentionInput
} from './activities.dto';

/** 展示时间：2026-9-10 14:30（月日不补零，与前端原有格式一致） */
function formatTime(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Injectable()
export class ActivitiesService {
	constructor(@Inject(DB) private readonly db: Database) {}

	// ===== 查询 =====

	/**
	 * 动态列表，按时间倒序。
	 *
	 * 可见性规则：
	 * - 带合法 token → team 的 + 自己发的 private
	 * - 匿名 → 只有 team 的
	 */
	async list(query: ListActivitiesQuery = {}, viewerId?: number): Promise<ActivityListResult> {
		const limit = Math.min(Math.max(query.limit ?? ACTIVITY_LIST_DEFAULT_LIMIT, 1), ACTIVITY_LIST_MAX_LIMIT);
		const offset = Math.max(query.offset ?? 0, 0);

		const where = viewerId
			? or(eq(activities.visibility, 'team'), eq(activities.authorId, viewerId))
			: eq(activities.visibility, 'team');

		const [rows, counted] = await Promise.all([
			this.db
				.select()
				.from(activities)
				.where(where)
				.orderBy(desc(activities.createdAt), desc(activities.id))
				.limit(limit)
				.offset(offset),
			this.db.select({ count: sql<number>`count(*)::int` }).from(activities).where(where)
		]);

		return { total: counted[0]?.count ?? 0, items: await this.toViews(rows) };
	}

	async findById(id: number, viewerId?: number): Promise<ActivityView> {
		const row = await this.requireRow(id);

		// private 动态只有作者本人能看
		if (row.visibility === 'private' && row.authorId !== viewerId) {
			throw new NotFoundException(`动态不存在：id=${id}`);
		}

		const [view] = await this.toViews([row]);
		return view;
	}

	// ===== 写入 =====

	async create(dto: CreateActivityDto, authorId: number, authorName: string): Promise<ActivityView> {
		const content = this.normalizeContent(dto.content);
		const type = this.normalizeType(dto.type);
		const visibility = this.normalizeVisibility(dto.visibility);

		// 关联项目校验
		let projectId: number | null = null;
		if (dto.projectId !== undefined && dto.projectId !== null) {
			const pid = Number(dto.projectId);
			if (!Number.isInteger(pid) || pid <= 0) throw new BadRequestException('非法的项目 id');
			const [proj] = await this.db
				.select({ id: projects.id })
				.from(projects)
				.where(eq(projects.id, pid))
				.limit(1);
			if (!proj) throw new NotFoundException(`关联项目不存在：id=${pid}`);
			projectId = pid;
		}

		const values: NewActivityRow = {
			content,
			type,
			visibility,
			projectId,
			authorId,
			authorName: authorName || ''
		};

		const [row] = await this.db.insert(activities).values(values).returning();

		// 处理 @ 提及：支持 id 或名字，查不到的忽略
		const mentionIds = await this.resolveMentions(dto.mentions);
		if (mentionIds.length) {
			await this.db
				.insert(activityMentions)
				.values(mentionIds.map((userId) => ({ activityId: row.id, userId })))
				.onConflictDoNothing();
		}

		const [view] = await this.toViews([row]);
		return view;
	}

	async remove(id: number, requesterId: number): Promise<{ id: number; deleted: true }> {
		const row = await this.requireRow(id);
		if (row.authorId !== requesterId) {
			throw new ForbiddenException('只能删除自己发布的动态');
		}
		// activity_mentions 已配 onDelete cascade，会一并清理
		await this.db.delete(activities).where(eq(activities.id, id));
		return { id, deleted: true };
	}

	// ===== 内部工具 =====

	private async requireRow(id: number) {
		if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('非法的动态 id');
		const [row] = await this.db.select().from(activities).where(eq(activities.id, id)).limit(1);
		if (!row) throw new NotFoundException(`动态不存在：id=${id}`);
		return row;
	}

	/**
	 * 把 mentions 输入统一解析成用户 id 数组。
	 * 元素可能是 id（number 或数字串）也可能是名字，两者混排也能处理。
	 */
	private async resolveMentions(input?: MentionInput[]): Promise<number[]> {
		if (!input?.length) return [];

		const ids = new Set<number>();
		const names = new Set<string>();

		for (const item of input) {
			if (typeof item === 'number') {
				if (Number.isInteger(item) && item > 0) ids.add(item);
				continue;
			}
			const raw = String(item ?? '').trim();
			if (!raw) continue;
			// 纯数字串按 id 处理
			if (/^\d+$/.test(raw)) {
				ids.add(Number(raw));
				continue;
			}
			names.add(raw);
		}

		// 名字反查 id
		if (names.size) {
			const rows = await this.db
				.select({ id: users.id })
				.from(users)
				.where(inArray(users.name, [...names]));
			for (const r of rows) ids.add(r.id);
		}

		return [...ids];
	}

	/**
	 * 批量把数据行转成前端视图。
	 * 作者名/头像色优先取 users 表实时值，查不到回退快照与默认色。
	 */
	private async toViews(rows: (typeof activities.$inferSelect)[]): Promise<ActivityView[]> {
		if (!rows.length) return [];

		const authorIds = [...new Set(rows.map((r) => r.authorId).filter((v): v is number => v !== null))];
		const projectIds = [...new Set(rows.map((r) => r.projectId).filter((v): v is number => v !== null))];
		const activityIds = rows.map((r) => r.id);

		const [authorRows, projectRows, mentionRows] = await Promise.all([
			authorIds.length
				? this.db
						.select({ id: users.id, name: users.name, color: users.color })
						.from(users)
						.where(inArray(users.id, authorIds))
				: Promise.resolve([]),
			projectIds.length
				? this.db
						.select({ id: projects.id, label: projects.label })
						.from(projects)
						.where(inArray(projects.id, projectIds))
				: Promise.resolve([]),
			this.db
				.select({ activityId: activityMentions.activityId, userId: activityMentions.userId })
				.from(activityMentions)
				.where(inArray(activityMentions.activityId, activityIds))
		]);

		const authorMap = new Map(authorRows.map((a) => [a.id, a]));
		const projectMap = new Map(projectRows.map((p) => [p.id, p.label]));

		// 提及的用户名
		const mentionUserIds = [...new Set(mentionRows.map((m) => m.userId))];
		const mentionUsers = mentionUserIds.length
			? await this.db
					.select({ id: users.id, name: users.name })
					.from(users)
					.where(inArray(users.id, mentionUserIds))
			: [];
		const userNameMap = new Map(mentionUsers.map((u) => [u.id, u.name]));

		const mentionsByActivity = new Map<number, string[]>();
		for (const m of mentionRows) {
			const name = userNameMap.get(m.userId);
			if (!name) continue;
			const list = mentionsByActivity.get(m.activityId) ?? [];
			list.push(name);
			mentionsByActivity.set(m.activityId, list);
		}

		return rows.map((row) => {
			const author = row.authorId !== null ? authorMap.get(row.authorId) : undefined;
			const name = author?.name ?? row.authorName ?? '';
			return {
				id: row.id,
				who: name ? name.slice(0, 1).toUpperCase() : '?',
				name,
				action: row.content,
				time: formatTime(row.createdAt),
				color: author?.color ?? ACTIVITY_DEFAULT_COLOR,
				project: row.projectId !== null ? (projectMap.get(row.projectId) ?? '') : '',
				type: row.type,
				visibility: row.visibility,
				mentions: mentionsByActivity.get(row.id) ?? [],
				createdAt: row.createdAt.toISOString()
			};
		});
	}

	private normalizeContent(raw: string): string {
		const content = (raw ?? '').trim();
		if (!content) throw new BadRequestException('动态内容不能为空');
		if (content.length > ACTIVITY_CONTENT_MAX_LENGTH) {
			throw new BadRequestException(`动态内容不能超过 ${ACTIVITY_CONTENT_MAX_LENGTH} 字`);
		}
		return content;
	}

	private normalizeType(raw?: string): string {
		const type = (raw ?? '').trim() || 'report';
		if (!(ACTIVITY_TYPES as readonly string[]).includes(type)) {
			throw new BadRequestException(`动态类型不合法，可选：${ACTIVITY_TYPES.join(' / ')}`);
		}
		return type;
	}

	private normalizeVisibility(raw?: string): string {
		const visibility = (raw ?? '').trim() || 'team';
		if (!(ACTIVITY_VISIBILITIES as readonly string[]).includes(visibility)) {
			throw new BadRequestException(`可见范围不合法，可选：${ACTIVITY_VISIBILITIES.join(' / ')}`);
		}
		return visibility;
	}
}
