import { Global, Inject, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS_CLIENT');

/**
 * Redis 客户端封装。
 *
 * 当前只服务注册验证码：按邮箱存取短时效的随机码。
 * 之所以走 Redis 而不是数据库，是因为验证码属于「过期即无意义」的临时数据，
 * 存库既要有清理任务，又会被高频读写污染业务表。
 */
@Injectable()
export class RedisService implements OnApplicationShutdown {
	private readonly logger = new Logger(RedisService.name);

	constructor(@Inject(REDIS) private readonly client: Redis) {}

	/** 写入并设置过期时间（秒）；验证码必须带 TTL，否则会永久堆积 */
	async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
		await this.client.set(key, value, 'EX', ttlSeconds);
	}

	async get(key: string): Promise<string | null> {
		return this.client.get(key);
	}

	async del(key: string): Promise<void> {
		await this.client.del(key);
	}

	/**
	 * 原子自增，用于发码频率限制。
	 * 首次调用时设置过期，保证窗口能自动滑出，不会永久锁死。
	 */
	async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
		const count = await this.client.incr(key);
		if (count === 1) await this.client.expire(key, ttlSeconds);
		return count;
	}

	/** 剩余有效期（秒）；-2 表示 key 不存在 */
	async ttl(key: string): Promise<number> {
		return this.client.ttl(key);
	}

	async onApplicationShutdown(): Promise<void> {
		await this.client.quit().catch(() => undefined);
		this.logger.log('Redis 连接已随应用关闭');
	}
}

@Global()
@Module({
	imports: [ConfigModule],
	providers: [
		{
			provide: REDIS,
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				const url = config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
				// lazyConnect 关掉：启动就连，连不上直接在日志里暴露，而不是等第一次发码才报错
				const client = new Redis(url, {
					maxRetriesPerRequest: 2,
					enableReadyCheck: true
				});
				client.on('error', (err: Error) => {
					new Logger('RedisModule').error(`Redis 连接异常：${err.message}`);
				});
				return client;
			}
		},
		RedisService
	],
	exports: [REDIS, RedisService]
})
export class RedisModule {}
