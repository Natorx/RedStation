import { Module, Global, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export const DB = Symbol('DB_CONNECTION');
export const PG_CLIENT = Symbol('PG_CLIENT');

export type Database = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
	providers: [
		{
			provide: PG_CLIENT,
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				const url = config.get<string>('DATABASE_URL');
				if (!url) throw new Error('缺少环境变量 DATABASE_URL');
				return postgres(url, {
					max: config.get<number>('DB_POOL_MAX') ?? 10,
					onnotice: () => undefined
				});
			}
		},
		{
			provide: DB,
			inject: [PG_CLIENT],
			useFactory: (client: ReturnType<typeof postgres>): Database => drizzle(client, { schema })
		}
	],
	exports: [DB, PG_CLIENT]
})
export class DatabaseModule implements OnApplicationShutdown {
	private readonly logger = new Logger(DatabaseModule.name);

	constructor() {}

	async onApplicationShutdown() {
		this.logger.log('数据库连接已随应用关闭');
	}
}
