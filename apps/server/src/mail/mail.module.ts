import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** 邮件发送器；模块级单例，复用 SMTP 连接池 */
export const MAILER = Symbol('MAILER_TRANSPORTER');

/** createTransport 的返回值类型 */
export type MailerTransporter = Transporter;

/**
 * 邮件服务。
 *
 * 目前只有注册验证码一个场景，所以不做过度的模板系统，
 * 直接把正文拼好传进来；将来有更多邮件再抽模板。
 */
@Injectable()
export class MailService {
	private readonly logger = new Logger(MailService.name);
	private readonly from: string;

	constructor(
		@Inject(MAILER) private readonly transporter: MailerTransporter,
		private readonly config: ConfigService
	) {
		this.from = this.config.get<string>('SMTP_FROM') ?? this.config.get<string>('SMTP_USER') ?? '';
	}

	/**
	 * 发送一封 HTML 邮件。
	 *
	 * 不吞异常：SMTP 报错直接抛给调用方，由它决定给前端什么提示。
	 * 否则用户会看到「发送成功」却收不到信，是最难排查的一类问题。
	 */
	async send(to: string, subject: string, html: string): Promise<void> {
		await this.transporter.sendMail({ from: this.from, to, subject, html });
		this.logger.log(`邮件已发送至 ${to}`);
	}
}

@Global()
@Module({
	imports: [ConfigModule],
	providers: [
		{
			provide: MAILER,
			inject: [ConfigService],
			useFactory: (config: ConfigService): MailerTransporter => {
				const host = config.get<string>('SMTP_HOST');
				const user = config.get<string>('SMTP_USER');
				const pass = config.get<string>('SMTP_PASS');

				if (!host || !user || !pass) {
					new Logger('MailModule').warn(
						'缺少 SMTP_HOST / SMTP_USER / SMTP_PASS，注册验证码邮件将无法发送'
					);
				}

				return nodemailer.createTransport({
					host,
					port: Number(config.get<string>('SMTP_PORT') ?? 465),
					// QQ 邮箱 465 端口用 SSL；若换 587 应改为 false 走 STARTTLS
					secure: config.get<string>('SMTP_SECURE') !== 'false',
					auth: { user, pass }
				});
			}
		},
		MailService
	],
	exports: [MAILER, MailService]
})
export class MailModule {}
