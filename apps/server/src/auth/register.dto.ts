/**
 * 注册模块的请求 / 响应类型。
 *
 * 与 users.dto.ts 一致：手工校验、不引入 class-validator，
 * 保证错误信息可控且与前端提示对得上。
 */

/** 验证码位数 */
export const CODE_LENGTH = 4;
/** 验证码有效期（秒），与邮件正文、前端提示保持一致 */
export const CODE_TTL_SECONDS = 300;
/** 同一邮箱的发码冷却（秒），防止被当作短信炮刷接口 */
export const CODE_RESEND_COOLDOWN = 60;
/** 同一邮箱每天最多发码次数 */
export const CODE_DAILY_LIMIT = 10;

/** 验证码在 Redis 里的 key 前缀 */
export const CODE_KEY_PREFIX = 'redstation:register:code:';
/** 发码冷却的 key 前缀 */
export const COOLDOWN_KEY_PREFIX = 'redstation:register:cooldown:';
/** 每日发码计数的 key 前缀 */
export const DAILY_KEY_PREFIX = 'redstation:register:daily:';

/** 发送验证码入参 */
export type SendEmailCodeDto = {
	email?: string;
};

/** 发送验证码返回 */
export type SendEmailCodeView = {
	/** 是否已发出；成功必然为 true（失败会抛异常） */
	sent: true;
	/** 验证码有效期（秒），前端据此显示倒计时 */
	expiresIn: number;
	/** 距下次可重发的秒数 */
	cooldown: number;
};

/** 注册入参：邮箱 + 密码 + 验证码（昵称由系统生成） */
export type RegisterDto = {
	email?: string;
	password?: string;
	/** 邮件里收到的 4 位验证码 */
	code?: string;
};

/** 注册成功返回：直接带 token，注册完即登录，不用再跳一次登录页 */
export type RegisterView = {
	token: string;
	/** 系统自动生成的显示昵称与登录 ID，返回给前端做欢迎提示 */
	name: string;
	uid: string;
};
