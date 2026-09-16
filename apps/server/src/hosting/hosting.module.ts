import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { HostingController } from './hosting.controller';
import { HostingService } from './hosting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
	// JwtModule 与 ProjectsModule 保持同一套密钥配置，托管接口需要登录身份
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
	controllers: [HostingController],
	providers: [HostingService, JwtAuthGuard],
	exports: [HostingService]
})
export class HostingModule {}
