import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { AiModule } from './modules/ai/ai.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ViewModule } from './modules/view/view.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AiModule,
    ProjectsModule,
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
