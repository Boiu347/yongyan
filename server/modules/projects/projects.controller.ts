import { Controller, Get, Post, Put, Delete, Body, Param, Logger } from '@nestjs/common';
import { ProjectsService, Project } from './projects.service';

@Controller('api/projects')
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);

  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  getAll(): Project[] {
    return this.projectsService.getAll();
  }

  @Get(':id')
  getById(@Param('id') id: string): Project | { error: string } {
    const project = this.projectsService.getById(id);
    if (!project) return { error: 'Project not found' };
    return project;
  }

  @Post()
  create(@Body() body: Project): Project {
    this.logger.log(`Create project: ${body.name}`);
    return this.projectsService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Project>): Project | { error: string } {
    const updated = this.projectsService.update(id, body);
    if (!updated) return { error: 'Project not found' };
    return updated;
  }

  @Delete(':id')
  delete(@Param('id') id: string): { success: boolean } {
    return { success: this.projectsService.delete(id) };
  }

  @Post('sync')
  sync(@Body() body: { projects: Project[] }): { success: boolean; count: number } {
    this.projectsService.syncAll(body.projects || []);
    return { success: true, count: (body.projects || []).length };
  }
}
