import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.module';
import { MailService } from '../mail/mail.module';
import type { JwtPayload } from './auth.service';
import {
	CODE_DAILY_LIMIT,
	CODE_KEY_PREFIX,
	CODE_LENGTH,
	CODE_RESEND_COOLDOWN,
	CODE_TTL_SECONDS,
	COOLDOWN_KEY_PREFIX,
	DAILY_KEY_PREFIX,
	type RegisterDto,
	type RegisterView,
	type SendEmailCodeDto,
	type SendEmailCodeView
} from './register.dto';

/** 简单的邮箱格式校验，与 users.service 里保持一致的判定口径 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 密码最短长度，与 users.service 的 MIN_PASSWORD_LENGTH 对齐 */
const MIN_PASSWORD_LENGTH = 6;

/**
 * 注册服务：邮箱验证码 + 邮箱密码建号。
 *
 * 流程分两步，且两步之间只靠 Redis 里的验证码关联：
 * 1. POST /api/auth/email-code  —— 生成 4 位码，存 Redis（5 分钟），SMTP 发出
 * 2. POST /api/auth/register    —— 校验验证码，建号并直接签发 token
 *
 * 不落库任何「待注册」中间态：验证码本身就代表了「这个邮箱刚被本人持有」，
 * 建号成功即消费掉，不需要额外的邀请表或草稿表。
 */
@Injectable()
export class RegisterService {
	private readonly logger = new Logger(RegisterService.name);
	private readonly ttl: number;

	constructor(
		private readonly users: UsersService,
		private readonly redis: RedisService,
		private readonly mail: MailService,
		private readonly jwt: JwtService,
		private readonly config: ConfigService
	) {
		// 允许用环境变量调整有效期，便于调试（默认 5 分钟）
		this.ttl = Number(this.config.get<string>('EMAIL_CODE_TTL') ?? CODE_TTL_SECONDS);
	}

	/**
	 * 发送注册验证码。
	 *
	 * 先做频率限制再发信：否则并发请求会把 SMTP 配额打满，
	 * 而且 QQ 邮箱对高频发信有封禁风险。
	 */
	async sendEmailCode(dto: SendEmailCodeDto): Promise<SendEmailCodeView> {
		const email = this.requireEmail(dto?.email);

		// 已被注册的邮箱直接拦掉，不必浪费一封邮件
		if (await this.users.existsByEmail(email)) {
			throw new ConflictException('该邮箱已被注册，请直接登录');
		}

		// 冷却 + 每日上限一起判掉；计数在 assertSendAllowed 里已自增
		await this.assertSendAllowed(email);

		const code = this.randomCode();
		await this.redis.setWithTtl(`${CODE_KEY_PREFIX}${email}`, code, this.ttl);
		// 冷却在发信前落盘：即便发信失败也算一次，避免失败重试被当成无限额度
		await this.redis.setWithTtl(`${COOLDOWN_KEY_PREFIX}${email}`, '1', CODE_RESEND_COOLDOWN);

		try {
			await this.mail.send(email, '【RedStation】注册验证码', this.buildMailHtml(code));
		} catch (err) {
			// 发信失败要清掉验证码，否则用户拿着一个没收到的码来注册
			await this.redis.del(`${CODE_KEY_PREFIX}${email}`);
			this.logger.error(`发送验证码失败：${email} — ${(err as Error).message}`);
			throw new BadRequestException('验证码发送失败，请稍后重试');
		}

		return { sent: true, expiresIn: this.ttl, cooldown: CODE_RESEND_COOLDOWN };
	}

	/**
	 * 注册建号并直接登录。
	 *
	 * 校验顺序刻意固定：先比验证码，再建号。
	 * 反过来的话，验证码错误也会在库里留下一个「建了一半」的账号。
	 */
	async register(dto: RegisterDto): Promise<RegisterView> {
		const email = this.requireEmail(dto?.email);
		const password: string = dto?.password ?? "";
		const code = (dto?.code ?? '').trim();

		if (!password || password.length < MIN_PASSWORD_LENGTH) {
			throw new BadRequestException(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
		}
		if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
			throw new BadRequestException(`验证码为 ${CODE_LENGTH} 位数字`);
		}

		const key = `${CODE_KEY_PREFIX}${email}`;
		const stored = await this.redis.get(key);
		if (!stored) throw new BadRequestException('验证码不存在或已过期，请重新获取');
		if (stored !== code) throw new BadRequestException('验证码错误');

		// 验证码一次性：校验通过立刻删除，杜绝同一码重复建号
		await this.redis.del(key);

		const user = await this.users.registerByEmail(email, password);
		const payload: JwtPayload = { sub: user.id, uid: user.uid, name: user.name };

		return {
			token: this.jwt.sign(payload),
			name: user.name,
			uid: user.uid
		};
	}

	// ===== 内部工具 =====

	/** 邮箱规范化 + 格式校验；与 users.service 的口径一致 */
	private requireEmail(raw?: string): string {
		const email = (raw ?? '').trim().toLowerCase();
		if (!email) throw new BadRequestException('请填写邮箱');
		if (!EMAIL_RE.test(email)) throw new BadRequestException('邮箱格式不正确');
		return email;
	}

	/**
	 * 冷却 + 每日上限，两道限制都用 Redis 的 TTL 自动滑出。
	 * 每日计数在这里自增（调用方不要再加一次），保证每封邮件只记一次。
	 */
	private async assertSendAllowed(email: string): Promise<void> {
		const cooldownKey = `${COOLDOWN_KEY_PREFIX}${email}`;
		if (await this.redis.get(cooldownKey)) {
			const left = await this.redis.ttl(cooldownKey);
			throw new BadRequestException(`发送过于频繁，请 ${Math.max(left, 1)} 秒后再试`);
		}

		const daily = await this.redis.incrWithTtl(`${DAILY_KEY_PREFIX}${email}`, 86400);
		if (daily > CODE_DAILY_LIMIT) {
			throw new BadRequestException('今日验证码发送次数已达上限，请明天再试');
		}
	}

	/**
	 * 生成 4 位数字验证码。
	 * 用 padStart 补零：1000 以下的随机数若不补零会变成 3 位，与前端校验对不上。
	 */
	private randomCode(): string {
		return String(Math.floor(Math.random() * 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
	}

	/** 邮件正文；内联样式而非外链 CSS，邮箱客户端才能正确渲染 */
	private buildMailHtml(code: string): string {
		const minutes = Math.round(this.ttl / 60);
		return `
<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="margin:0 0 8px;font-size:18px">RedStation 注册验证码</h2>
  <p style="margin:0 0 20px;color:#666;font-size:13px">你正在注册 RedStation 账号，请在页面中填写下方验证码完成注册。</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 20px;background:#f5f5f7;border-radius:10px;text-align:center;color:#dc2626">${code}</div>
  <p style="margin:20px 0 0;color:#666;font-size:13px">验证码 ${minutes} 分钟内有效。若非本人操作，请忽略本邮件。</p>
  <p style="margin:16px 0 0;color:#999;font-size:12px">请勿将验证码提供给他人，以免账号被盗。</p>
</div>`.trim();
	}
}
