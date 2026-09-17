import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMembersService } from './project-members.service';
import { JwtAuthGuard, OptionalJwtGuard } from '../auth/jwt-auth.guard';

@Module({
	// JwtModule 配置与 AuthModule / UsersModule 保持一致，供可选鉴权解析令牌
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.get<string>('JWT_SECRET') ?? 'redstation-dev-secret'
			})
		})
	],
	controllers: [ProjectsController],
	providers: [ProjectsService, ProjectMembersService, JwtAuthGuard, OptionalJwtGuard],
	exports: [ProjectsService, ProjectMembersService]
})
export class ProjectsModule {}
