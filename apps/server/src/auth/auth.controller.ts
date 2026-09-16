import { Body, Controller, Get, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
import { RegisterService } from './register.service';
import type { LoginDto, UserView } from '../users/users.dto';
import type {
	RegisterDto,
	RegisterView,
	SendEmailCodeDto,
	SendEmailCodeView
} from './register.dto';

@Controller('auth')
export class AuthController {
	constructor(
		private readonly auth: AuthService,
		private readonly register: RegisterService
	) {}

	/**
	 * POST /api/auth/login
	 * body: { uid, password }
	 * 返回：{ token, user }，token 为 JWT，前端存入 localStorage 后续请求携带
	 */
	@Post('login')
	@HttpCode(200)
	login(@Body() dto: LoginDto): Promise<{ token: string; user: UserView }> {
		return this.auth.login(dto);
	}

	/**
	 * POST /api/auth/email-code — 发送注册验证码
	 * body: { email }
	 *
	 * 公开接口（注册发生在登录之前），靠 Redis 的冷却与每日上限防刷。
	 */
	@Post('email-code')
	@HttpCode(200)
	sendEmailCode(@Body() dto: SendEmailCodeDto): Promise<SendEmailCodeView> {
		return this.register.sendEmailCode(dto);
	}

	/**
	 * POST /api/auth/register — 邮箱 + 密码 + 验证码 注册
	 * body: { email, password, code }
	 * 返回：{ token, name, uid }，注册成功即登录，前端直接写入 token 即可
	 */
	@Post('register')
	@HttpCode(201)
	registerByEmail(@Body() dto: RegisterDto): Promise<RegisterView> {
		return this.register.register(dto);
	}

	/** POST /api/auth/logout — 无状态 JWT，登出仅作语义占位 */
	@Post('logout')
	@HttpCode(200)
	logout() {
		return { ok: true };
	}

	/** GET /api/auth/me — 用 Authorization: Bearer <token> 换取当前用户 */
	@Get('me')
	me(@Headers('authorization') authorization?: string): Promise<UserView> {
		const token = this.extractBearer(authorization);
		return this.auth.me(token);
	}

	private extractBearer(header?: string): string {
		if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('缺少访问令牌');
		const token = header.slice('Bearer '.length).trim();
		if (!token) throw new UnauthorizedException('缺少访问令牌');
		return token;
	}
}
