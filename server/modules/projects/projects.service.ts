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
  audioClip?: string;
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
      if (existsSync(this.dataFile)) {
        const raw = readFileSync(this.dataFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.parsedVOCs?.length > 3) {
          this.projects = parsed;
          this.logger.log(`Loaded ${this.projects.length} projects from disk (${parsed[0]?.parsedVOCs?.length} VOCs)`);
          return;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to load from disk: ${err}`);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const seedData = require('../../seed-data/projects.seed.json');
      if (Array.isArray(seedData) && seedData.length > 0) {
        this.projects = seedData;
        this.saveToDisk();
        this.logger.log(`Loaded ${this.projects.length} projects from bundled seed data`);
        return;
      }
    } catch (err) {
      this.logger.warn(`Failed to load seed data: ${err}`);
    }

    this.projects = [];
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
