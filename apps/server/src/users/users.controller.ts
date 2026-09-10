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
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';

import { UsersService } from './users.service';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt-auth.guard';
import type {
	ChangeOwnPasswordDto,
	CreateUserDto,
	ListUsersQuery,
	UpdateProfileDto,
	UpdateUserDto,
	UserView
} from './users.dto';

@Controller('users')
export class UsersController {
	constructor(private readonly users: UsersService) {}

	/**
	 * 从 request.user 取出当前登录用户 id（由 JwtAuthGuard 注入）。
	 * 不依赖任何前端传入的 id，避免越权改他人资料。
	 */
	private currentUserId(req: AuthedRequest): number {
		const id = req.user?.id;
		if (!id) throw new UnauthorizedException('缺少访问令牌');
		return id;
	}

	/** GET /api/users/me — 当前登录用户资料（等价于 /api/auth/me） */
	@Get('me')
	@UseGuards(JwtAuthGuard)
	me(@Req() req: AuthedRequest): Promise<UserView> {
		return this.users.findById(this.currentUserId(req));
	}

	/** PATCH /api/users/me — 修改自己的资料（昵称/邮箱/头像字/职级/配色/团队） */
	@Patch('me')
	@UseGuards(JwtAuthGuard)
	updateMe(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto): Promise<UserView> {
		return this.users.updateOwnProfile(this.currentUserId(req), dto);
	}

	/** PATCH /api/users/me/password — 修改自己的密码，需验证当前密码 */
	@Patch('me/password')
	@UseGuards(JwtAuthGuard)
	@HttpCode(200)
	changeMyPassword(@Req() req: AuthedRequest, @Body() dto: ChangeOwnPasswordDto) {
		return this.users.changePassword(
			this.currentUserId(req),
			dto.currentPassword ?? '',
			dto.newPassword ?? ''
		);
	}

	/** GET /api/users — 用户列表，支持 q/role/active/limit/offset */
	@Get()
	async list(@Query() query: Record<string, string>): Promise<{ total: number; items: UserView[] }> {
		const parsed: ListUsersQuery = {
			q: query.q,
			role: query.role,
			limit: query.limit ? Number(query.limit) : undefined,
			offset: query.offset ? Number(query.offset) : undefined
		};
		if (query.active === 'true' || query.active === 'false') parsed.active = query.active === 'true';
		return this.users.list(parsed);
	}

	/** GET /api/users/members — 团队成员精简列表，供 @ 提及与发布者下拉使用 */
	@Get('members')
	listMembers() {
		return this.users.listMembers();
	}

	/** GET /api/users/uid/:uid — 按八位数用户 ID 查询 */
	@Get('uid/:uid')
	findByUid(@Param('uid') uid: string): Promise<UserView> {
		return this.users.findByUid(uid);
	}

	/** GET /api/users/:id — 按自增主键查询 */
	@Get(':id')
	findById(@Param('id', ParseIntPipe) id: number): Promise<UserView> {
		return this.users.findById(id);
	}

	/** POST /api/users — 新建用户 */
	@Post()
	create(@Body() dto: CreateUserDto): Promise<UserView> {
		return this.users.create(dto);
	}

	/** PATCH /api/users/:id — 更新用户（含权限调整） */
	@Patch(':id')
	update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto): Promise<UserView> {
		return this.users.update(id, dto);
	}

	/** PATCH /api/users/:id/password — 修改密码，需提供当前密码 */
	@Patch(':id/password')
	@HttpCode(200)
	changePassword(
		@Param('id', ParseIntPipe) id: number,
		@Body() body: { currentPassword?: string; newPassword?: string }
	) {
		return this.users.changePassword(id, body.currentPassword ?? '', body.newPassword ?? '');
	}

	/** DELETE /api/users/:id — 删除用户 */
	@Delete(':id')
	remove(@Param('id', ParseIntPipe) id: number) {
		return this.users.remove(id);
	}
}
