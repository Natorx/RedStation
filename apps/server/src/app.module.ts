import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ActivitiesModule } from './activities/activities.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health/health.controller';
import { PlansModule } from './plans/plans.module';
import { ProjectsModule } from './projects/projects.module';
import { TodosModule } from './todos/todos.module';
import { UsersModule } from './users/users.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
		DatabaseModule,
		UsersModule,
		TodosModule,
		ProjectsModule,
		PlansModule,
		ActivitiesModule,
		AuthModule
	],
	controllers: [HealthController]
})
export class AppModule {}
