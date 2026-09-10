import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { TodosController, OptionalJwtGuard } from './todos.controller';
import { TodosService } from './todos.service';

@Module({
	// JwtModule 与 AuthModule / UsersModule 中的配置保持一致，供 OptionalJwtGuard 校验令牌
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.get<string>('JWT_SECRET') ?? 'redstation-dev-secret'
			})
		})
	],
	controllers: [TodosController],
	providers: [TodosService, OptionalJwtGuard],
	exports: [TodosService]
})
export class TodosModule {}
