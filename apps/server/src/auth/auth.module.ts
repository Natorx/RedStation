import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersModule } from '../users/users.module';

@Module({
	imports: [
		UsersModule,
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
	controllers: [AuthController],
	providers: [AuthService, JwtAuthGuard],
	exports: [AuthService, JwtModule]
})
export class AuthModule {}
