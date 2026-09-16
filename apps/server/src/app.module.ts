import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ActivitiesModule } from './activities/activities.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health/health.controller';
import { HostingModule } from './hosting/hosting.module';
import { MailModule } from './mail/mail.module';
import { RedisModule } from './redis/redis.module';
import { PlansModule } from './plans/plans.module';
import { ProjectsModule } from './projects/projects.module';
import { TeamsModule } from './teams/teams.module';
import { TodosModule } from './todos/todos.module';
import { UsersModule } from './users/users.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
		DatabaseModule,
		RedisModule,
		MailModule,
		UsersModule,
		TodosModule,
		ProjectsModule,
		HostingModule,
		PlansModule,
		ActivitiesModule,
		TeamsModule,
		AuthModule
	],
	controllers: [HealthController]
})
export class AppModule {}
