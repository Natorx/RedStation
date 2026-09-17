import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';

import type { JwtPayload } from './auth.service';
import { tokenFromRawUrl } from './token-from-url';

/** 挂在请求上的当前用户信息 */
export type AuthedRequest = FastifyRequest & {
	user?: { id: number; uid: string; name: string };
};

/**
 * JWT 守卫：校验 Authorization: [redacted]
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

		let raw: string | undefined;
		if (header?.startsWith('Bearer ')) raw = header.slice('Bearer '.length).trim();
		// 浏览器直接点链接下载时带不了自定义头，允许用 ?token= 兜底
		if (!raw) raw = tokenFromRawUrl(req.raw?.url);
		if (!raw) throw new UnauthorizedException('缺少访问令牌');

		try {
			const payload = await this.jwt.verifyAsync<JwtPayload>(raw);
			req.user = { id: payload.sub, uid: payload.uid, name: payload.name };
		} catch {
			throw new UnauthorizedException('访问令牌无效或已过期');
		}

		return true;
	}
}

/**
 * 「可选登录」守卫：
 * - 带了 Authorization: Bearer <token> 就解析并挂到 request.user；
 * - 没带或令牌无效时直接放行（不抛 401）。
 *
 * 用于「未登录也能调、登录后行为更强」的接口，例如项目列表
 * （带 JWT 时按成员收窄可见范围并回 myRole，未登录则返回全量）。
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
	constructor(private readonly jwt: JwtService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<AuthedRequest>();
		const header = req.headers.authorization;

		let raw: string | undefined;
		if (header?.startsWith('Bearer ')) raw = header.slice('Bearer '.length).trim();
		if (!raw) raw = tokenFromRawUrl(req.raw?.url);
		if (!raw) return true;

		try {
			const payload = await this.jwt.verifyAsync<JwtPayload>(raw);
			req.user = { id: payload.sub, uid: payload.uid, name: payload.name };
		} catch {
			// 令牌无效视为匿名访问，不阻断请求
			req.user = undefined;
		}

		return true;
	}
}
