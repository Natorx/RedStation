import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module';
import {
	projectInvites,
	projectMembers,
	projects,
	teamMembers,
	users,
	type ProjectInviteRow,
	type ProjectMemberRow,
	type ProjectRow
} from '../db/schema';
import {
	PROJECT_INVITE_MESSAGE_MAX_LENGTH,
	type ProjectInviteStatus,
	type ProjectInviteView,
	type ProjectMemberRole,
	type ProjectMemberView,
	type ProjectMembersView
} from './project-members.dto';

/** 团队成员关系的操作者信息 */
export type ProjectActor = { id: number; name: string };

/**
 * 项目成员与邀请。
 *
 * 权限模型（与需求对齐）：
 * - 只有项目成员（owner / member）能看到该项目；
 * - 只有发起人（owner）能邀请成员；
 * - 被邀请人同意后写入 project_members，才进入项目列表。
 */
@Injectable()
export class ProjectMembersService {
	constructor(@Inject(DB) private readonly db: Database) {}

	// ===== 成员查询 =====

	/** 某项目的成员列表；仅项目成员可见 */
	async members(projectId: number, userId: number): Promise<ProjectMembersView> {
		await this.requireProject(projectId);
		const myRole = await this.roleOf(projectId, userId);
		if (!myRole) throw new ForbiddenException('你不是该项目成员');

		const rows = await this.db
			.select({
				userId: projectMembers.userId,
				projectRole: projectMembers.role,
				joinedAt: projectMembers.createdAt,
				uid: users.uid,
				name: users.name,
				initials: users.initials,
				title: users.title,
				role: users.role,
				color: users.color
			})
			.from(projectMembers)
			.innerJoin(users, eq(users.id, projectMembers.userId))
			.where(eq(projectMembers.projectId, projectId))
			// 发起人排最前，其余按加入时间
			.orderBy(desc(sql`(${projectMembers.role} = 'owner')`), asc(projectMembers.createdAt));

		return {
			projectId,
			items: rows.map((r) => ({
				userId: r.userId,
				uid: r.uid,
				name: r.name,
				initials: r.initials,
				title: r.title,
				role: r.role,
				color: r.color,
				projectRole: r.projectRole as ProjectMemberRole,
				joinedAt: r.joinedAt.toISOString()
			})),
			myRole
		};
	}

	/**
	 * 批量取各项目的成员（供项目列表一次拿全，避免 N+1）。
	 * 返回 projectId -> 成员视图数组。
	 */
	async membersOfProjects(projectIds: number[]): Promise<Map<number, ProjectMemberView[]>> {
		const map = new Map<number, ProjectMemberView[]>();
		if (!projectIds.length) return map;

		const rows = await this.db
			.select({
				projectId: projectMembers.projectId,
				userId: projectMembers.userId,
				projectRole: projectMembers.role,
				joinedAt: projectMembers.createdAt,
				uid: users.uid,
				name: users.name,
				initials: users.initials,
				title: users.title,
				role: users.role,
				color: users.color
			})
			.from(projectMembers)
			.innerJoin(users, eq(users.id, projectMembers.userId))
			.where(inArray(projectMembers.projectId, projectIds))
			.orderBy(desc(sql`(${projectMembers.role} = 'owner')`), asc(projectMembers.createdAt));

		for (const r of rows) {
			const list = map.get(r.projectId) ?? [];
			list.push({
				userId: r.userId,
				uid: r.uid,
				name: r.name,
				initials: r.initials,
				title: r.title,
				role: r.role,
				color: r.color,
				projectRole: r.projectRole as ProjectMemberRole,
				joinedAt: r.joinedAt.toISOString()
			});
			map.set(r.projectId, list);
		}
		return map;
	}

	/** 批量取用户在多个项目里的身份，返回 projectId -> role */
	async rolesOf(projectIds: number[], userId: number): Promise<Map<number, ProjectMemberRole>> {
		if (!projectIds.length) return new Map();
		const rows = await this.db
			.select({ projectId: projectMembers.projectId, role: projectMembers.role })
			.from(projectMembers)
			.where(and(inArray(projectMembers.projectId, projectIds), eq(projectMembers.userId, userId)));
		return new Map(rows.map((r) => [r.projectId, r.role as ProjectMemberRole]));
	}

	/** 我参与的项目 id 列表（含发起人与成员） */
	async projectIdsFor(userId: number): Promise<number[]> {
		const rows = await this.db
			.select({ projectId: projectMembers.projectId })
			.from(projectMembers)
			.where(eq(projectMembers.userId, userId));
		return rows.map((r) => r.projectId);
	}

	/** 单项目身份；非成员返回 null */
	async roleOf(projectId: number, userId: number): Promise<ProjectMemberRole | null> {
		const [row] = await this.db
			.select({ role: projectMembers.role })
			.from(projectMembers)
			.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
			.limit(1);
		return (row?.role as ProjectMemberRole) ?? null;
	}

	// ===== 成员写入 =====

	/**
	 * 把用户加为项目发起人。
	 * 创建项目时调用；已存在则跳过，保证幂等。
	 */
	async addOwner(projectId: number, user: ProjectActor): Promise<void> {
		await this.db
			.insert(projectMembers)
			.values({ projectId, userId: user.id, role: 'owner' })
			.onConflictDoNothing({ target: [projectMembers.projectId, projectMembers.userId] });
	}

	/** 项目发起人已有成员关系时，把其角色提升为 owner（历史项目补写用） */
	async ensureOwner(projectId: number, user: ProjectActor): Promise<void> {
		await this.db
			.insert(projectMembers)
			.values({ projectId, userId: user.id, role: 'owner' })
			.onConflictDoUpdate({
				target: [projectMembers.projectId, projectMembers.userId],
				set: { role: 'owner', updatedAt: new Date() }
			});
	}

	// ===== 邀请 =====

	/**
	 * 发起人邀请成员。
	 * 校验：调用者是发起人；被邀请人存在、不是已有成员；同一项目同一人没有 pending。
	 */
	async invite(
		projectId: number,
		dto: { userId?: number; uid?: string; message?: string },
		actor: ProjectActor
	): Promise<ProjectInviteView> {
		const project = await this.requireProject(projectId);
		await this.requireOwner(projectId, actor.id);

		const target = await this.resolveTarget(dto);
		if (target.id === actor.id) throw new BadRequestException('不能邀请自己');

		// 只能邀请与发起人同团队的人（前端下拉已限制，这里兜底防止绕过 UI 直接调接口）
		if (!(await this.sharesTeam(actor.id, target.id))) {
			throw new ForbiddenException('只能邀请与你同团队的成员');
		}

		const already = await this.roleOf(projectId, target.id);
		if (already) throw new ConflictException(`${target.name} 已经是该项目成员`);

		const pending = await this.db
			.select({ id: projectInvites.id })
			.from(projectInvites)
			.where(
				and(
					eq(projectInvites.projectId, projectId),
					eq(projectInvites.userId, target.id),
					eq(projectInvites.status, 'pending')
				)
			)
			.limit(1);
		if (pending.length) throw new ConflictException(`已向 ${target.name} 发出邀请，等待对方回应`);

		const message = (dto.message ?? '').trim().slice(0, PROJECT_INVITE_MESSAGE_MAX_LENGTH);

		const [row] = await this.db
			.insert(projectInvites)
			.values({
				projectId,
				userId: target.id,
				inviterId: actor.id,
				inviterName: actor.name,
				message,
				status: 'pending'
			})
			.returning();

		return this.toInviteView(row, project.label, target);
	}

	/** 我收到的邀请（待回应在前，含最近已处理） */
	async myInvites(userId: number): Promise<ProjectInviteView[]> {
		const rows = await this.db
			.select()
			.from(projectInvites)
			.where(eq(projectInvites.userId, userId))
			.orderBy(desc(sql`(${projectInvites.status} = 'pending')`), desc(projectInvites.createdAt));

		if (!rows.length) return [];

		const projectIds = [...new Set(rows.map((r) => r.projectId))];
		const projectRows = await this.db
			.select({ id: projects.id, label: projects.label })
			.from(projects)
			.where(inArray(projects.id, projectIds));
		const labelMap = new Map(projectRows.map((p) => [p.id, p.label]));

		// 被邀请人就是自己，名字/头像取当前用户
		const me = await this.userBrief(userId);
		return rows.map((r) => this.toInviteView(r, labelMap.get(r.projectId) ?? '', me));
	}

	/** 某项目发出的邀请记录（仅发起人可见） */
	async invitesOfProject(projectId: number, userId: number): Promise<ProjectInviteView[]> {
		await this.requireProject(projectId);
		await this.requireOwner(projectId, userId);

		const rows = await this.db
			.select()
			.from(projectInvites)
			.where(eq(projectInvites.projectId, projectId))
			.orderBy(desc(projectInvites.createdAt));
		if (!rows.length) return [];

		const userIds = [...new Set(rows.map((r) => r.userId))];
		const userRows = await this.db
			.select({
				id: users.id,
				uid: users.uid,
				name: users.name,
				initials: users.initials,
				color: users.color
			})
			.from(users)
			.where(inArray(users.id, userIds));
		const userMap = new Map(userRows.map((u) => [u.id, u]));

		const [project] = await this.db
			.select({ label: projects.label })
			.from(projects)
			.where(eq(projects.id, projectId))
			.limit(1);

		return rows.map((r) => this.toInviteView(r, project?.label ?? '', userMap.get(r.userId)));
	}

	/**
	 * 被邀请人回应邀请。
	 * accept 写入项目成员（member 角色）并把邀请置 approved；
	 * reject 仅把邀请置 rejected。
	 */
	async reviewInvite(
		inviteId: number,
		action: string,
		actor: ProjectActor
	): Promise<ProjectInviteView> {
		const act = (action ?? '').trim();
		if (act !== 'accept' && act !== 'reject') {
			throw new BadRequestException('action 只能是 accept 或 reject');
		}

		const [row] = await this.db
			.select()
			.from(projectInvites)
			.where(eq(projectInvites.id, inviteId))
			.limit(1);
		if (!row) throw new NotFoundException(`邀请不存在：id=${inviteId}`);
		if (row.userId !== actor.id) throw new ForbiddenException('只能回应发给自己的邀请');
		if (row.status !== 'pending') throw new BadRequestException('该邀请已处理过');

		const project = await this.requireProject(row.projectId);

		if (act === 'accept') {
			await this.db
				.insert(projectMembers)
				.values({ projectId: row.projectId, userId: actor.id, role: 'member' })
				.onConflictDoNothing({
					target: [projectMembers.projectId, projectMembers.userId]
				});
		}

		const [updated] = await this.db
			.update(projectInvites)
			.set({ status: act === 'accept' ? 'approved' : 'rejected', handledAt: new Date() })
			.where(eq(projectInvites.id, inviteId))
			.returning();

		return this.toInviteView(updated, project.label, await this.userBrief(actor.id));
	}

	/** 撤回邀请：发起人可撤回 pending 的邀请 */
	async cancelInvite(inviteId: number, actor: ProjectActor): Promise<{ id: number; deleted: true }> {
		const [row] = await this.db
			.select()
			.from(projectInvites)
			.where(eq(projectInvites.id, inviteId))
			.limit(1);
		if (!row) throw new NotFoundException(`邀请不存在：id=${inviteId}`);
		await this.requireOwner(row.projectId, actor.id);

		await this.db.delete(projectInvites).where(eq(projectInvites.id, inviteId));
		return { id: inviteId, deleted: true };
	}

	/** 移除成员：仅发起人，且不能移除自己 */
	async removeMember(
		projectId: number,
		memberUserId: number,
		actor: ProjectActor
	): Promise<{ projectId: number; userId: number; removed: true }> {
		await this.requireProject(projectId);
		await this.requireOwner(projectId, actor.id);
		if (memberUserId === actor.id) throw new BadRequestException('发起人不能移除自己');

		await this.db
			.delete(projectMembers)
			.where(
				and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId))
			);
		return { projectId, userId: memberUserId, removed: true };
	}

	// ===== 内部工具 =====

	/** 把 leader/owner 不在成员表里的历史项目补上发起人关系（按 projects.owner 名字匹配） */
	async backfillOwners(): Promise<number> {
		const rows = await this.db
			.select({ id: projects.id, owner: projects.owner })
			.from(projects)
			.where(sql`${projects.owner} <> ''`);

		let count = 0;
		for (const r of rows) {
			const [u] = await this.db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.name, r.owner))
				.limit(1);
			if (!u) continue;
			const existing = await this.roleOf(r.id, u.id);
			if (existing === 'owner') continue;
			await this.ensureOwner(r.id, { id: u.id, name: r.owner });
			count += 1;
		}
		return count;
	}

	/**
	 * 两人是否至少同属一个团队。
	 * 分两步查（各自的团队 id 取交集）而不做自连接，避免同表别名带来的歧义。
	 */
	private async sharesTeam(a: number, b: number): Promise<boolean> {
		const rows = await this.db
			.select({ userId: teamMembers.userId, teamId: teamMembers.teamId })
			.from(teamMembers)
			.where(inArray(teamMembers.userId, [a, b]));

		const teamsOfA = new Set(rows.filter((r) => r.userId === a).map((r) => r.teamId));
		const teamsOfB = rows.filter((r) => r.userId === b).map((r) => r.teamId);
		return teamsOfB.some((id) => teamsOfA.has(id));
	}

	private async requireProject(id: number): Promise<ProjectRow> {
		if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('非法的项目 id');
		const [row] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
		if (!row) throw new NotFoundException(`项目不存在：id=${id}`);
		return row;
	}

	private async requireOwner(projectId: number, userId: number): Promise<void> {
		const role = await this.roleOf(projectId, userId);
		if (role !== 'owner') throw new ForbiddenException('只有项目发起人可执行此操作');
	}

	/** 按 userId 或 uid 找被邀请人 */
	private async resolveTarget(dto: {
		userId?: number;
		uid?: string;
	}): Promise<{ id: number; uid: string; name: string; initials: string | null; color: string }> {
		const uid = (dto.uid ?? '').trim();

		if (dto.userId !== undefined) {
			const id = Number(dto.userId);
			if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('非法的用户 id');
			const brief = await this.userBrief(id);
			if (!brief) throw new NotFoundException(`用户不存在：id=${id}`);
			return brief;
		}

		if (!uid) throw new BadRequestException('请提供被邀请人的用户 id 或 uid');
		const [row] = await this.db
			.select({
				id: users.id,
				uid: users.uid,
				name: users.name,
				initials: users.initials,
				color: users.color
			})
			.from(users)
			.where(eq(users.uid, uid))
			.limit(1);
		if (!row) throw new NotFoundException(`用户不存在：uid=${uid}`);
		return row;
	}

	private async userBrief(
		userId: number
	): Promise<{ id: number; uid: string; name: string; initials: string | null; color: string } | undefined> {
		const [row] = await this.db
			.select({
				id: users.id,
				uid: users.uid,
				name: users.name,
				initials: users.initials,
				color: users.color
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		return row;
	}

	private toInviteView(
		row: ProjectInviteRow,
		projectLabel: string,
		target?: { uid: string; name: string; initials: string | null; color: string }
	): ProjectInviteView {
		return {
			id: row.id,
			projectId: row.projectId,
			projectLabel,
			userId: row.userId,
			uid: target?.uid ?? '',
			name: target?.name ?? '',
			initials: target?.initials ?? null,
			color: target?.color ?? '#dc2626',
			inviterName: row.inviterName,
			message: row.message,
			status: row.status as ProjectInviteStatus,
			createdAt: row.createdAt.toISOString(),
			handledAt: row.handledAt ? row.handledAt.toISOString() : null
		};
	}
}

export type { ProjectMemberRow };
