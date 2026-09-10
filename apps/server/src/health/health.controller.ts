import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DB, type Database } from '../db/database.module';

@Controller()
export class HealthController {
	constructor(@Inject(DB) private readonly db: Database) {}

	/** GET /api/health — 存活探针，附带数据库连通性 */
	@Get('health')
	async health() {
		let database = 'down';
		try {
			await this.db.execute(sql`select 1`);
			database = 'up';
		} catch {
			database = 'down';
		}
		return {
			status: database === 'up' ? 'ok' : 'degraded',
			service: 'redstation-server',
			database,
			time: new Date().toISOString()
		};
	}

	/** GET /api — 接口索引 */
	@Get()
	index() {
		return {
			name: 'RedStation API',
			version: '0.1.0',
			routes: ['/api/health', '/api/users', '/api/users/members', '/api/auth/login', '/api/auth/me']
		};
	}
}
