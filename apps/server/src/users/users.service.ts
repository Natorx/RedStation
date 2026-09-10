import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module';
import { users, type NewUserRow, type UserRow } from '../db/schema';
import {
	PERMISSION_KEYS,
	PERMISSION_META,
	type CreateUserDto,
	type ListUsersQuery,
	type LoginDto,
	type PermissionKey,
	type UpdateProfileDto,
	type UpdateUserDto,
	type UserView
} from './users.dto';

import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;
/** 密码最少长度；前端登录页放开后由后端统一校验 */
const MIN_PASSWORD_LENGTH = 6;

@Injectable()
export class UsersService {
	constructor(@Inject(DB) private readonly db: Database) {}

	// ===== 查询 =====

	async list(query: ListUsersQuery = {}): Promise<{ total: number; items: UserView[] }> {
		const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
		const offset = Math.max(query.offset ?? 0, 0);

		const filters = [];
		if (query.q?.trim()) {
			const kw = `%${query.q.trim()}%`;
			filters.push(or(ilike(users.uid, kw), ilike(users.name, kw), ilike(users.email, kw)));
		}
		if (query.role?.trim()) filters.push(eq(users.role, query.role.trim()));
		if (typeof query.active === 'boolean') filters.push(eq(users.active, query.active));

		const where = filters.length ? and(...filters) : undefined;

		const [rows, counted] = await Promise.all([
			this.db
				.select()
				.from(users)
				.where(where)
				.orderBy(asc(users.id))
				.limit(limit)
				.offset(offset),
			this.db.select({ count: sql<number>`count(*)::int` }).from(users).where(where)
		]);

		return { total: counted[0]?.count ?? 0, items: rows.map((r) => this.toView(r)) };
	}

	async findById(id: number): Promise<UserView> {
		return this.toView(await this.requireRow(id));
	}

	async findByUid(uid: string): Promise<UserView> {
		const row = await this.findRowByUid(uid);
		if (!row) throw new NotFoundException(`用户不存在：uid=${uid}`);
		return this.toView(row);
	}

	/** 团队成员列表，供前端 @ 提及与发布者下拉使用 */
	async listMembers(): Promise<Pick<UserView, 'id' | 'name' | 'role' | 'color'>[]> {
		const rows = await this.db
			.select({ id: users.id, name: users.name, role: users.role, color: users.color })
			.from(users)
			.where(eq(users.active, true))
			.orderBy(asc(users.id));
		return rows;
	}

	// ===== 写入 =====

	async create(dto: CreateUserDto): Promise<UserView> {
		const uid = this.normalizeUid(dto.uid);
		const name = this.requireText(dto.name, 'name', '用户昵称不能为空');
		const email = this.normalizeEmail(dto.email);
		const password = this.requirePassword(dto.password);

		await this.assertUnique(uid, email);

		const values: NewUserRow = {
			uid,
			name,
			email,
			passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
			initials: dto.initials?.trim() || this.deriveInitials(name),
			role: dto.role?.trim() || '成员',
			title: dto.title?.trim() || null,
			color: dto.color?.trim() || '#dc2626',
			teams: (dto.teams ?? []).map((t) => t.trim()).filter(Boolean).join(','),
			active: dto.active ?? true,
			...this.permissionColumns(dto.permissions)
		};

		const [row] = await this.db.insert(users).values(values).returning();
		return this.toView(row);
	}

	async update(id: number, dto: UpdateUserDto): Promise<UserView> {
		await this.requireRow(id);

		const patch: Partial<NewUserRow> = { updatedAt: new Date() };

		if (dto.name !== undefined) patch.name = this.requireText(dto.name, 'name', '用户昵称不能为空');
		if (dto.email !== undefined) {
			const email = this.normalizeEmail(dto.email);
			await this.assertUnique(null, email, id);
			patch.email = email;
		}
		if (dto.password !== undefined) {
			patch.passwordHash = await bcrypt.hash(this.requirePassword(dto.password), BCRYPT_ROUNDS);
		}
		if (dto.initials !== undefined) {
			patch.initials = dto.initials?.trim() || null;
		}
		if (dto.role !== undefined) patch.role = dto.role.trim() || '成员';
		if (dto.title !== undefined) patch.title = dto.title?.trim() || null;
		if (dto.color !== undefined) patch.color = dto.color.trim() || '#dc2626';
		if (dto.teams !== undefined) {
			patch.teams = dto.teams.map((t) => t.trim()).filter(Boolean).join(',');
		}
		if (dto.active !== undefined) patch.active = dto.active;
		if (dto.permissions !== undefined) Object.assign(patch, this.permissionColumns(dto.permissions));

		const [row] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
		return this.toView(row);
	}

	/** 移除用户；MVP 直接删除，后续接入项目/任务时改为软删除或外键约束 */
	async remove(id: number): Promise<{ id: number; deleted: true }> {
		await this.requireRow(id);
		await this.db.delete(users).where(eq(users.id, id));
		return { id, deleted: true };
	}

	/**
	 * 用户自助修改个人资料。
	 *
	 * 只接受展示型字段（昵称/邮箱/头像字/职级/配色/团队）；
	 * uid、active、permissions、role 一律忽略，防止普通用户自行提权或改登录标识。
	 * 昵称为空视为非法，邮箱会做格式与唯一性校验。
	 */
	async updateOwnProfile(id: number, dto: UpdateProfileDto): Promise<UserView> {
		const patch: Partial<NewUserRow> = { updatedAt: new Date() };
		const current = await this.requireRow(id);

		if (dto.name !== undefined) patch.name = this.requireText(dto.name, 'name', '昵称不能为空');
		if (dto.email !== undefined) {
			const email = this.normalizeEmail(dto.email);
			await this.assertUnique(null, email, id);
			patch.email = email;
		}
		if (dto.initials !== undefined) {
			patch.initials =
				dto.initials?.trim() || this.deriveInitials(patch.name ?? current.name);
		}
		if (dto.title !== undefined) patch.title = dto.title?.trim() || null;
		if (dto.color !== undefined) patch.color = dto.color.trim() || '#dc2626';
		if (dto.teams !== undefined) {
			patch.teams = dto.teams.map((t) => t.trim()).filter(Boolean).join(',');
		}

		const [row] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
		return this.toView(row);
	}

	// ===== 认证 =====

	/** 校验账号密码，成功返回用户视图；失败统一抛 401，避免暴露账号是否存在 */
	async validateCredentials(dto: LoginDto): Promise<UserView> {
		const uid = (dto?.uid ?? '').trim();
		const password = dto?.password ?? '';
		if (!uid || !password) throw new BadRequestException('请填写用户 ID 和密码');

		const row = await this.findRowByUid(uid);
		if (!row) throw new UnauthorizedException('用户 ID 或密码不正确');
		if (!row.active) throw new UnauthorizedException('账号已停用，请联系管理员');

		const ok = await bcrypt.compare(password, row.passwordHash);
		if (!ok) throw new UnauthorizedException('用户 ID 或密码不正确');

		return this.toView(row);
	}

	async changePassword(id: number, currentPassword: string, newPassword: string): Promise<{ ok: true }> {
		const row = await this.requireRow(id);
		const ok = await bcrypt.compare(currentPassword ?? '', row.passwordHash);
		if (!ok) throw new UnauthorizedException('当前密码不正确');

		const hash = await bcrypt.hash(this.requirePassword(newPassword), BCRYPT_ROUNDS);
		await this.db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, id));
		return { ok: true };
	}

	// ===== 内部工具 =====

	private async requireRow(id: number): Promise<UserRow> {
		if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('非法的用户 id');
		const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
		if (!row) throw new NotFoundException(`用户不存在：id=${id}`);
		return row;
	}

	private async findRowByUid(uid: string): Promise<UserRow | undefined> {
		const [row] = await this.db.select().from(users).where(eq(users.uid, uid)).limit(1);
		return row;
	}

	/** uid 与 email 唯一性校验；excludeId 用于更新时排除自身 */
	private async assertUnique(uid: string | null, email: string, excludeId?: number) {
		if (uid) {
			const [dup] = await this.db.select({ id: users.id }).from(users).where(eq(users.uid, uid)).limit(1);
			if (dup && dup.id !== excludeId) throw new ConflictException(`用户 ID 已存在：${uid}`);
		}
		const [dupEmail] = await this.db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);
		if (dupEmail && dupEmail.id !== excludeId) throw new ConflictException(`邮箱已被占用：${email}`);
	}

	private normalizeUid(raw: string): string {
		const uid = (raw ?? '').trim();
		if (!/^\d{4,16}$/.test(uid)) throw new BadRequestException('用户 ID 需为 4-16 位数字');
		return uid;
	}

	private normalizeEmail(raw: string): string {
		const email = (raw ?? '').trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('邮箱格式不正确');
		return email;
	}

	private requireText(raw: string, field: string, message: string): string {
		const v = (raw ?? '').trim();
		if (!v) throw new BadRequestException(`${message}（${field}）`);
		return v;
	}

	private requirePassword(raw: string): string {
		const pwd = raw ?? '';
		if (pwd.length < MIN_PASSWORD_LENGTH) {
			throw new BadRequestException(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
		}
		return pwd;
	}

	private deriveInitials(name: string): string {
		return name.slice(0, 2).toUpperCase();
	}

	/** 把 permissions 对象转成 6 个布尔列 */
	private permissionColumns(
		permissions?: Partial<Record<PermissionKey, boolean>>
	): Partial<Record<PermissionKey, boolean>> {
		if (!permissions) return {};
		const patch: Partial<Record<PermissionKey, boolean>> = {};
		for (const key of PERMISSION_KEYS) {
			if (permissions[key] !== undefined) patch[key] = permissions[key]!;
		}
		return patch;
	}

	/** 行 -> 前端视图；绝不返回 passwordHash */
	private toView(row: UserRow): UserView {
		return {
			id: row.id,
			uid: row.uid,
			name: row.name,
			initials: row.initials,
			email: row.email,
			role: row.role,
			title: row.title,
			color: row.color,
			teams: row.teams ? row.teams.split(',').map((t) => t.trim()).filter(Boolean) : [],
			active: row.active,
			permissions: PERMISSION_KEYS.map((key) => ({
				name: PERMISSION_META[key].name,
				desc: PERMISSION_META[key].desc,
				granted: row[key]
			})),
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString()
		};
	}
}
