import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
	// JwtModule 与 AuthModule 配置保持一致，供 JwtAuthGuard 校验令牌
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.get<string>('JWT_SECRET') ?? 'redstation-dev-secret',
				signOptions: {
					expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as `${number}${'s' | 'm' | 'h' | 'd'}`
				}
			})
		})
	],
	controllers: [TeamsController],
	providers: [TeamsService, JwtAuthGuard],
	exports: [TeamsService]
})
export class TeamsModule {}
