import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface ProjectFile {
  id: string;
  name: string;
  feishuLink?: string;
  type: 'document' | 'audio' | 'video';
}

export interface VOCItem {
  id: string;
  brand: string;
  text: string;
  respondent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  dimension?: string;
  subDimension?: string;
  tag?: string;
  sourceFileId?: string;
}

export interface DimensionSummary {
  dimension: string;
  subDimension: string;
  summary: string;
  brandSummaries: Record<string, string>;
}

export interface Project {
  id: string;
  name: string;
  dateRange: string;
  files: ProjectFile[];
  parsedVOCs: VOCItem[];
  dimensionSummaries?: DimensionSummary[];
  overallSummary?: string;
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly dataDir = join(process.cwd(), 'data');
  private readonly dataFile = join(this.dataDir, 'projects.json');
  private projects: Project[] = [];

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      const seedPaths = [
        join(process.cwd(), 'server', 'seed-data', 'projects.seed.json'),
        join(process.cwd(), 'dist', 'server', 'seed-data', 'projects.seed.json'),
        join(__dirname, '..', '..', 'seed-data', 'projects.seed.json'),
      ];

      if (existsSync(this.dataFile)) {
        const raw = readFileSync(this.dataFile, 'utf-8');
        this.projects = JSON.parse(raw);
        this.logger.log(`Loaded ${this.projects.length} projects from disk`);
      }

      for (const seedFile of seedPaths) {
        if (existsSync(seedFile)) {
          this.logger.log(`Found seed file at: ${seedFile}`);
          const seedRaw = readFileSync(seedFile, 'utf-8');
          const seedProjects: Project[] = JSON.parse(seedRaw);
          this.projects = seedProjects;
          this.saveToDisk();
          this.logger.log(`Loaded ${seedProjects.length} projects from seed data (overwrite)`);
          break;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to load projects from disk: ${err}`);
      this.projects = [];
    }
  }

  private saveToDisk() {
    try {
      if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(this.dataFile, JSON.stringify(this.projects, null, 2));
    } catch (err) {
      this.logger.error(`Failed to save projects to disk: ${err}`);
    }
  }

  getAll(): Project[] {
    return this.projects;
  }

  getById(id: string): Project | undefined {
    return this.projects.find(p => p.id === id);
  }

  create(project: Project): Project {
    this.projects.push(project);
    this.saveToDisk();
    return project;
  }

  update(id: string, updates: Partial<Project>): Project | undefined {
    const index = this.projects.findIndex(p => p.id === id);
    if (index === -1) return undefined;
    this.projects[index] = { ...this.projects[index], ...updates, id };
    this.saveToDisk();
    return this.projects[index];
  }

  delete(id: string): boolean {
    const len = this.projects.length;
    this.projects = this.projects.filter(p => p.id !== id);
    if (this.projects.length < len) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  syncAll(projects: Project[]): void {
    this.projects = projects;
    this.saveToDisk();
    this.logger.log(`Synced ${projects.length} projects`);
  }
}
