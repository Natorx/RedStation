import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';

import type { JwtPayload } from './auth.service';

/** 挂在请求上的当前用户信息 */
export type AuthedRequest = FastifyRequest & {
	user?: { id: number; uid: string; name: string };
};

/**
 * JWT 守卫：校验 Authorization: Bearer <token>，
 * 通过后把当前用户（id/uid/name）挂到 request.user。
 *
 * 用于「改自己资料」这类必须知道调用者身份、且不能信任前端传 id 的接口。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(private readonly jwt: JwtService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<AuthedRequest>();
		const header = req.headers.authorization;

		if (!header?.startsWith('Bearer ')) {
			throw new UnauthorizedException('缺少访问令牌');
		}

		const token = header.slice('Bearer '.length).trim();
		if (!token) throw new UnauthorizedException('缺少访问令牌');

		try {
			const payload = await this.jwt.verifyAsync<JwtPayload>(token);
			req.user = { id: payload.sub, uid: payload.uid, name: payload.name };
		} catch {
			throw new UnauthorizedException('访问令牌无效或已过期');
		}

		return true;
	}
}
