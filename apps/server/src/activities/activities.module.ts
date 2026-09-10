import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
	// JwtModule 既供 JwtAuthGuard 校验令牌，也供控制器里的可选鉴权手动 verify
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.get<string>('JWT_SECRET') ?? 'redstation-dev-secret'
			})
		})
	],
	controllers: [ActivitiesController],
	providers: [ActivitiesService, JwtAuthGuard],
	exports: [ActivitiesService]
})
export class ActivitiesModule {}
