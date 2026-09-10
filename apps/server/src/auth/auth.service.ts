import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../users/users.service';
import type { LoginDto, UserView } from '../users/users.dto';

/** JWT 载荷 */
export type JwtPayload = {
	sub: number;
	uid: string;
	name: string;
};

@Injectable()
export class AuthService {
	constructor(
		private readonly users: UsersService,
		private readonly jwt: JwtService
	) {}

	/** 校验账号密码并签发 JWT */
	async login(dto: LoginDto): Promise<{ token: string; user: UserView }> {
		const user = await this.users.validateCredentials(dto);
		const payload: JwtPayload = { sub: user.id, uid: user.uid, name: user.name };
		return { token: await this.jwt.signAsync(payload), user };
	}

	/** 从 token 反查当前用户；用户被删除或停用时视为未授权 */
	async me(token: string): Promise<UserView> {
		let payload: JwtPayload;
		try {
			payload = await this.jwt.verifyAsync<JwtPayload>(token);
		} catch {
			throw new UnauthorizedException('访问令牌无效或已过期');
		}

		const user = await this.users.findById(payload.sub);
		if (!user.active) throw new UnauthorizedException('账号已停用，请联系管理员');
		return user;
	}
}
