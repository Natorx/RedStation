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
	teamJoinRequests,
	teamMembers,
	teams,
	users,
	type TeamJoinRequestRow,
	type TeamMemberRow,
	type TeamRow
} from '../db/schema';
import {
	JOIN_CODE_LENGTH,
	JOIN_CODE_MAX_ATTEMPTS,
	TEAM_DESC_MAX_LENGTH,
	TEAM_MESSAGE_MAX_LENGTH,
	TEAM_NAME_MAX_LENGTH,
	type CreateTeamDto,
	type JoinRequestView,
	type JoinTeamDto,
	type MyTeamsView,
	type ReviewJoinRequestDto,
	type TeamMembersView,
	type TeamRequestsView,
	type TeamRole,
	type TeamView
} from './teams.dto';

/** 一次事务内允许使用的 drizzle 连接类型（db 与 tx 通用） */
type Tx = Database;

@Injectable()
export class TeamsService {
	constructor(@Inject(DB) private readonly db: Database) {}

	// ===== 查询 =====

	/**
	 * 当前用户所在团队 + 自己发出的待处理申请。
	 * 团队成员页据此区分「已加入」与「无团队」两种形态。
	 */
	async myTeams(userId: number): Promise<MyTeamsView> {
		const memberships = await this.db
			.select({
				teamId: teamMembers.teamId,
				role: teamMembers.role
			})
			.from(teamMembers)
			.where(eq(teamMembers.userId, userId));

		const teamIds = memberships.map((m) => m.teamId);
		const roleByTeam = new Map(memberships.map((m) => [m.teamId, m.role as TeamRole]));

		const [rows, pending] = await Promise.all([
			teamIds.length
				? this.db.select().from(teams).where(inArray(teams.id, teamIds)).orderBy(asc(teams.id))
				: Promise.resolve([] as TeamRow[]),
			this.db
				.select()
				.from(teamJoinRequests)
				.where(and(eq(teamJoinRequests.userId, userId), eq(teamJoinRequests.status, 'pending')))
				.orderBy(desc(teamJoinRequests.createdAt))
		]);

		const stats = await this.teamStats(teamIds);

		return {
			teams: rows.map((row) => {
				const stat = stats.get(row.id) ?? { memberCount: 0, pendingCount: 0 };
				return this.toTeamView(row, stat, roleByTeam.get(row.id) ?? null);
			}),
			myRequests: pending.length ? await this.decorate(pending) : []
		};
	}

	/** 团队成员列表；仅成员可见 */
	async members(teamId: number, userId: number): Promise<TeamMembersView> {
		const team = await this.requireTeam(teamId);
		await this.requireMembership(team, userId);

		const rows = await this.db
			.select({
				userId: teamMembers.userId,
				teamRole: teamMembers.role,
				joinedAt: teamMembers.createdAt,
				uid: users.uid,
				name: users.name,
				initials: users.initials,
				role: users.role,
				title: users.title,
				color: users.color
			})
			.from(teamMembers)
			.innerJoin(users, eq(users.id, teamMembers.userId))
			.where(eq(teamMembers.teamId, teamId))
			// 队长排在最前，其余按加入时间
			.orderBy(desc(sql`(${teamMembers.role} = 'owner')`), asc(teamMembers.createdAt));

		return {
			teamId,
			items: rows.map((r) => ({
				userId: r.userId,
				uid: r.uid,
				name: r.name,
				initials: r.initials,
				role: r.role,
				title: r.title,
				color: r.color,
				teamRole: r.teamRole as TeamRole,
				joinedAt: r.joinedAt.toISOString()
			}))
		};
	}

	/** 入队申请列表；仅队长可见 */
	async requests(teamId: number, userId: number): Promise<TeamRequestsView> {
		const team = await this.requireTeam(teamId);
		this.requireOwner(team, userId);

		const [pending, handled] = await Promise.all([
			this.db
				.select()
				.from(teamJoinRequests)
				.where(and(eq(teamJoinRequests.teamId, teamId), eq(teamJoinRequests.status, 'pending')))
				.orderBy(asc(teamJoinRequests.createdAt)),
			this.db
				.select()
				.from(teamJoinRequests)
				.where(and(eq(teamJoinRequests.teamId, teamId), sql`${teamJoinRequests.status} <> 'pending'`))
				.orderBy(desc(teamJoinRequests.handledAt))
				.limit(20)
		]);

		return {
			teamId,
			items: await this.decorate(pending),
			handled: await this.decorate(handled)
		};
	}

	// ===== 写入 =====

	/**
	 * 创建团队。
	 *
	 * 创建者直接成为队长并写入 team_members，
	 * 团队 ID 用随机八位数，撞库时重试，撞满次数抛错（正常不会发生）。
	 */
	async createTeam(dto: CreateTeamDto, actor: { id: number; name: string }): Promise<TeamView> {
		const name = this.requireName(dto.name);
		const description = (dto.description ?? '').trim().slice(0, TEAM_DESC_MAX_LENGTH);

		const existing = await this.db.select({ id: teams.id }).from(teams).where(eq(teams.name, name)).limit(1);
		if (existing.length) throw new ConflictException('该团队名已被使用');

		const team = await this.db.transaction(async (tx: Tx) => {
			const joinCode = await this.generateJoinCode(tx);
			const [row] = await tx
				.insert(teams)
				.values({ name, description, joinCode, ownerId: actor.id, ownerName: actor.name })
				.returning();

			await tx.insert(teamMembers).values({
				teamId: row.id,
				userId: actor.id,
				role: 'owner'
			});

			return row;
		});

		return this.toTeamView(team, { memberCount: 1, pendingCount: 0 }, 'owner');
	}

	/**
	 * 凭八位数团队 ID 申请加入。
	 *
	 * 这是自助申请，不直接入队 —— 落到 pending 等队长审核。
	 * 已在队内、或已有待处理申请时直接给出提示，不重复建单。
	 */
	async requestJoin(
		userId: number,
		dto: JoinTeamDto
	): Promise<{ request: JoinRequestView; team: TeamView }> {
		const joinCode = this.requireJoinCode(dto.joinCode);
		const message = (dto.message ?? '').trim().slice(0, TEAM_MESSAGE_MAX_LENGTH);

		const [team] = await this.db.select().from(teams).where(eq(teams.joinCode, joinCode)).limit(1);
		if (!team) throw new NotFoundException('团队 ID 不存在，请与团队发起人核对');

		const [member] = await this.db
			.select({ id: teamMembers.id })
			.from(teamMembers)
			.where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId)))
			.limit(1);
		if (member) throw new ConflictException('你已经是该团队成员');

		const [pending] = await this.db
			.select({ id: teamJoinRequests.id })
			.from(teamJoinRequests)
			.where(
				and(
					eq(teamJoinRequests.teamId, team.id),
					eq(teamJoinRequests.userId, userId),
					eq(teamJoinRequests.status, 'pending')
				)
			)
			.limit(1);
		if (pending) throw new ConflictException('申请已提交，等待队长审核');

		const [actor] = await this.db
			.select({ name: users.name })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		const [row] = await this.db
			.insert(teamJoinRequests)
			.values({
				teamId: team.id,
				userId,
				userName: actor?.name ?? '',
				message,
				status: 'pending'
			})
			.returning();

		const stats = await this.teamStats([team.id]);
		return {
			request: (await this.decorate([row]))[0],
			team: this.toTeamView(team, stats.get(team.id) ?? { memberCount: 0, pendingCount: 0 }, null)
		};
	}

	/**
	 * 审核申请：批准则把申请人写进 team_members，拒绝只改状态。
	 * 只有队长能操作，且只有 pending 的申请可被处理（避免重复点击导致重复入队）。
	 */
	async review(
		teamId: number,
		requestId: number,
		dto: ReviewJoinRequestDto,
		actor: { id: number; name: string }
	): Promise<JoinRequestView> {
		const action = this.requireAction(dto.action);
		const team = await this.requireTeam(teamId);
		this.requireOwner(team, actor.id);

		const [row] = await this.db
			.select()
			.from(teamJoinRequests)
			.where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.teamId, teamId)))
			.limit(1);
		if (!row) throw new NotFoundException('申请不存在');
		if (row.status !== 'pending') throw new BadRequestException('该申请已处理过');

		const approved = action === 'approve';

		const updated = await this.db.transaction(async (tx: Tx) => {
			if (approved) {
				// onConflictDoNothing：并发/重复批准时不会写坏唯一索引
				await tx
					.insert(teamMembers)
					.values({ teamId, userId: row.userId, role: 'member' })
					.onConflictDoNothing();
			}

			const [next] = await tx
				.update(teamJoinRequests)
				.set({
					status: approved ? 'approved' : 'rejected',
					handledBy: actor.name,
					handledAt: new Date(),
					updatedAt: new Date()
				})
				.where(eq(teamJoinRequests.id, requestId))
				.returning();

			return next;
		});

		return (await this.decorate([updated]))[0];
	}

	/** 提交申请后反悔，可撤回自己的待处理申请 */
	async cancelRequest(
		teamId: number,
		requestId: number,
		userId: number
	): Promise<{ id: number; deleted: true }> {
		const [row] = await this.db
			.select()
			.from(teamJoinRequests)
			.where(and(eq(teamJoinRequests.id, requestId), eq(teamJoinRequests.teamId, teamId)))
			.limit(1);
		if (!row) throw new NotFoundException('申请不存在');
		if (row.userId !== userId) throw new ForbiddenException('只能撤回自己的申请');
		if (row.status !== 'pending') throw new BadRequestException('该申请已处理过');

		await this.db.delete(teamJoinRequests).where(eq(teamJoinRequests.id, requestId));
		return { id: requestId, deleted: true };
	}

	/** 退出团队；队长需先转让或解散，避免团队失去管理者 */
	async leave(teamId: number, userId: number): Promise<{ teamId: number; left: true }> {
		const team = await this.requireTeam(teamId);
		this.requireMembership(team, userId);
		if (team.ownerId === userId) {
			throw new BadRequestException('队长不能直接退出，请先解散团队');
		}

		await this.db
			.delete(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

		return { teamId, left: true };
	}

	/** 解散团队：仅队长。成员与申请记录随外键级联删除 */
	async remove(teamId: number, userId: number): Promise<{ id: number; deleted: true }> {
		const team = await this.requireTeam(teamId);
		this.requireOwner(team, userId);

		await this.db.delete(teams).where(eq(teams.id, teamId));
		return { id: teamId, deleted: true };
	}

	// ===== 内部工具 =====

	/** 取出团队行，同时完成 id 合法性与存在性校验 */
	private async requireTeam(teamId: number): Promise<TeamRow> {
		if (!Number.isInteger(teamId) || teamId <= 0) throw new BadRequestException('非法的团队 id');
		const [row] = await this.db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
		if (!row) throw new NotFoundException('团队不存在或已解散');
		return row;
	}

	/** 要求当前用户是团队成员 */
	private async requireMembership(team: TeamRow, userId: number): Promise<TeamMemberRow> {
		const [row] = await this.db
			.select()
			.from(teamMembers)
			.where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId)))
			.limit(1);
		if (!row) throw new ForbiddenException('你不是该团队成员');
		return row;
	}

	/** 要求当前用户是队长 */
	private requireOwner(team: TeamRow, userId: number): void {
		if (team.ownerId !== userId) throw new ForbiddenException('只有团队发起人可以执行该操作');
	}

	/** 统计每个团队的成员数与待审核数（一次查询覆盖多个团队） */
	private async teamStats(
		teamIds: number[]
	): Promise<Map<number, { memberCount: number; pendingCount: number }>> {
		const stats = new Map<number, { memberCount: number; pendingCount: number }>();
		if (!teamIds.length) return stats;

		const [memberRows, pendingRows] = await Promise.all([
			this.db
				.select({ teamId: teamMembers.teamId, count: sql<number>`count(*)::int` })
				.from(teamMembers)
				.where(inArray(teamMembers.teamId, teamIds))
				.groupBy(teamMembers.teamId),
			this.db
				.select({ teamId: teamJoinRequests.teamId, count: sql<number>`count(*)::int` })
				.from(teamJoinRequests)
				.where(and(inArray(teamJoinRequests.teamId, teamIds), eq(teamJoinRequests.status, 'pending')))
				.groupBy(teamJoinRequests.teamId)
		]);

		for (const id of teamIds) stats.set(id, { memberCount: 0, pendingCount: 0 });
		for (const r of memberRows) stats.set(r.teamId, { ...stats.get(r.teamId)!, memberCount: r.count });
		for (const r of pendingRows) stats.set(r.teamId, { ...stats.get(r.teamId)!, pendingCount: r.count });

		return stats;
	}

	/** 给申请补上申请人资料（头像色/职级/uid），列表展示不必前端再查用户 */
	private async decorate(rows: TeamJoinRequestRow[]): Promise<JoinRequestView[]> {
		if (!rows.length) return [];

		const userIds = [...new Set(rows.map((r) => r.userId))];
		const profiles = await this.db
			.select({
				id: users.id,
				uid: users.uid,
				initials: users.initials,
				color: users.color,
				role: users.role
			})
			.from(users)
			.where(inArray(users.id, userIds));
		const byId = new Map(profiles.map((p) => [p.id, p]));

		return rows.map((row) => {
			const profile = byId.get(row.userId);
			return {
				id: row.id,
				teamId: row.teamId,
				userId: row.userId,
				uid: profile?.uid ?? '',
				name: row.userName || '未知用户',
				initials: profile?.initials ?? null,
				color: profile?.color ?? '#dc2626',
				userRole: profile?.role ?? '',
				message: row.message,
				status: row.status as JoinRequestView['status'],
				createdAt: row.createdAt.toISOString(),
				handledBy: row.handledBy,
				handledAt: row.handledAt ? row.handledAt.toISOString() : null
			};
		});
	}

	/** 行 -> 团队视图；joinCode 只回给团队成员，非成员一律空串 */
	private toTeamView(
		row: TeamRow,
		stat: { memberCount: number; pendingCount: number },
		myRole: TeamRole | null
	): TeamView {
		return {
			id: row.id,
			name: row.name,
			joinCode: myRole ? row.joinCode : '',
			description: row.description,
			ownerId: row.ownerId,
			ownerName: row.ownerName,
			memberCount: stat.memberCount,
			// 待审核数只对队长有意义，对普通成员不回
			pendingCount: myRole === 'owner' ? stat.pendingCount : 0,
			myRole,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString()
		};
	}

	/** 随机八位数团队 ID；与既有团队冲突时重试 */
	private async generateJoinCode(tx: Tx): Promise<string> {
		for (let i = 0; i < JOIN_CODE_MAX_ATTEMPTS; i++) {
			// 10000000 ~ 99999999：恒为八位，不会出现前导零
			const code = String(Math.floor(10000000 + Math.random() * 90000000));
			const [hit] = await tx
				.select({ id: teams.id })
				.from(teams)
				.where(eq(teams.joinCode, code))
				.limit(1);
			if (!hit) return code;
		}
		throw new ConflictException('团队 ID 生成失败，请重试');
	}

	private requireName(raw?: string): string {
		const v = (raw ?? '').trim();
		if (!v) throw new BadRequestException('团队名称不能为空');
		if (v.length > TEAM_NAME_MAX_LENGTH) {
			throw new BadRequestException(`团队名称不能超过 ${TEAM_NAME_MAX_LENGTH} 个字符`);
		}
		return v;
	}

	private requireJoinCode(raw?: string): string {
		const v = (raw ?? '').replace(/\s/g, '');
		if (!v) throw new BadRequestException('请填写团队 ID');
		if (!new RegExp(`^\\d{${JOIN_CODE_LENGTH}}$`).test(v)) {
			throw new BadRequestException(`团队 ID 为 ${JOIN_CODE_LENGTH} 位数字`);
		}
		return v;
	}

	private requireAction(raw?: string): 'approve' | 'reject' {
		const v = (raw ?? '').trim();
		if (v !== 'approve' && v !== 'reject') throw new BadRequestException('审核操作只能是 approve 或 reject');
		return v;
	}
}
