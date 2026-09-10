import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
	// JwtModule 与 AuthModule 中的配置保持一致，供 JwtAuthGuard 校验令牌
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.get<string>('JWT_SECRET') ?? 'redstation-dev-secret'
			})
		})
	],
	controllers: [UsersController],
	providers: [UsersService, JwtAuthGuard],
	exports: [UsersService]
})
export class UsersModule {}
