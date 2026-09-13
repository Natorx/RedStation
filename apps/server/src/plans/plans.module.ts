import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { OptionalJwtGuard } from '../todos/todos.controller';

@Module({
	// JwtModule 与 AuthModule / TodosModule 中的配置保持一致，供 OptionalJwtGuard 校验令牌
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.get<string>('JWT_SECRET') ?? 'redstation-dev-secret',
				signOptions: { expiresIn: '7d' }
			})
		})
	],
	controllers: [PlansController],
	providers: [PlansService, OptionalJwtGuard],
	exports: [PlansService]
})
export class PlansModule {}
