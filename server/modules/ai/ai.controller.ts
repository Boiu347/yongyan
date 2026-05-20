import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import * as mammoth from 'mammoth';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');
import { AiService, VOCItem } from './ai.service';

/**
 * Convert mammoth HTML output to structured plain text that preserves
 * document hierarchy (headings, tables, lists) so the AI can correctly
 * identify brand sections and user quotes.
 */
function htmlToStructuredText(html: string): string {
  let text = html;

  // Use [^<]* instead of [\s\S]*? to avoid catastrophic backtracking on large docs
  text = text.replace(/<h1[^>]*>([^<]*(?:<(?!\/h1)[^<]*)*)<\/h1>/gi, '\n\n# $1\n\n');
  text = text.replace(/<h2[^>]*>([^<]*(?:<(?!\/h2)[^<]*)*)<\/h2>/gi, '\n\n## $1\n\n');
  text = text.replace(/<h3[^>]*>([^<]*(?:<(?!\/h3)[^<]*)*)<\/h3>/gi, '\n\n### $1\n\n');
  text = text.replace(/<h4[^>]*>([^<]*(?:<(?!\/h4)[^<]*)*)<\/h4>/gi, '\n\n#### $1\n\n');
  text = text.replace(/<h[5-6][^>]*>([^<]*(?:<(?!\/h[5-6])[^<]*)*)<\/h[5-6]>/gi, '\n\n##### $1\n\n');

  text = text.replace(/<strong[^>]*>([^<]*(?:<(?!\/strong)[^<]*)*)<\/strong>/gi, '**$1**');
  text = text.replace(/<b[^>]*>([^<]*(?:<(?!\/b)[^<]*)*)<\/b>/gi, '**$1**');

  // Tables: process row by row, split cells by closing tags
  text = text.replace(/<tr[^>]*>(.*?)<\/tr>/gis, (_, row: string) => {
    const cells: string[] = [];
    row.replace(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis, (__, cell: string) => {
      cells.push(cell.replace(/<[^>]+>/g, '').trim());
      return '';
    });
    return cells.length > 0 ? cells.join(' | ') + '\n' : '';
  });
  text = text.replace(/<\/?(?:table|thead|tbody)[^>]*>/gi, '\n');

  text = text.replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n');
  text = text.replace(/<\/?[ou]l[^>]*>/gi, '\n');

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');

  text = text.replace(/<[^>]+>/g, '');

  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  text = text.replace(/\n{4,}/g, '\n\n\n');
  text = text.replace(/[ \t]+\n/g, '\n');

  return text.trim();
}

const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
  'video/mp4',
  'video/webm',
  'video/mpeg',
]);

const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'txt',
  'md',
]);

@Controller('api/ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  healthCheck() {
    const gateway = this.configService.get<string>('AI_GATEWAY_URL', '');
    const apiKey = this.configService.get<string>('AI_API_KEY', '');
    const model = this.configService.get<string>('AI_MODEL', '');
    return {
      status: 'ok',
      config: {
        AI_GATEWAY_URL: gateway || '(empty)',
        AI_API_KEY: apiKey ? `***${apiKey.slice(-4)}` : '(empty)',
        AI_MODEL: model || '(empty)',
        TRANSCRIPTION_MODEL: this.configService.get<string>('TRANSCRIPTION_MODEL', '') || '(empty)',
      },
    };
  }

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (AUDIO_MIME_TYPES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Unsupported audio/video type: ${file.mimetype}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async transcribe(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `Transcribe request: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`,
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Accel-Buffering', 'no');

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(' ');
    }, 10_000);

    try {
      const text = await this.aiService.transcribeAudio(
        file.buffer,
        file.mimetype,
        file.originalname,
      );

      const vocList = await this.aiService.extractVOCs(text);
      clearInterval(keepAlive);
      res.end(JSON.stringify({ text, vocList }));
    } catch (err: any) {
      clearInterval(keepAlive);
      if (!res.writableEnded) {
        const msg = err?.response?.message || err?.message || '转录失败';
        res.end(JSON.stringify({ error: { message: msg }, text: '', vocList: [] }));
      }
    }
  }

  @Post('parse-document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
        if (DOCUMENT_EXTENSIONS.has(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Unsupported document type: .${ext}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async parseDocument(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `Parse document request: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`,
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Accel-Buffering', 'no');

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(' ');
    }, 10_000);

    try {
      const text = await this.extractTextFromFile(file);
      const vocList = await this.aiService.extractVOCs(text);
      clearInterval(keepAlive);
      res.end(JSON.stringify({ text, vocList }));
    } catch (err: any) {
      clearInterval(keepAlive);
      if (!res.writableEnded) {
        const msg = err?.response?.message || err?.message || '解析失败';
        res.end(JSON.stringify({ error: { message: msg }, text: '', vocList: [] }));
      }
    }
  }

  @Post('parse-document-text')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
        if (DOCUMENT_EXTENSIONS.has(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Unsupported document type: .${ext}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async parseDocumentTextOnly(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ text: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `Parse document (text-only) request: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`,
    );

    const text = await this.extractTextFromFile(file);
    return { text };
  }

  private async extractTextFromFile(file: Express.Multer.File): Promise<string> {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    let text = '';

    try {
      if (ext === 'docx' || ext === 'doc') {
        const htmlResult = await mammoth.convertToHtml({ buffer: file.buffer });

        if (htmlResult.messages?.length) {
          for (const msg of htmlResult.messages) {
            this.logger.warn(`mammoth [${msg.type}]: ${msg.message}`);
          }
        }

        if (htmlResult.value && htmlResult.value.trim().length > 0) {
          text = htmlToStructuredText(htmlResult.value);
        } else {
          this.logger.warn('convertToHtml returned empty, falling back to extractRawText');
          const rawResult = await mammoth.extractRawText({ buffer: file.buffer });
          text = rawResult.value;
        }
      } else if (ext === 'pdf') {
        const parser = new PDFParse({ data: file.buffer });
        const result = await parser.getText();
        text = result.text;
        if (parser.destroy) await parser.destroy();
      } else {
        text = file.buffer.toString('utf-8');
      }
    } catch (err) {
      this.logger.error(`Failed to parse .${ext} file "${file.originalname}": ${err}`);
      throw new BadRequestException(
        `文档解析失败，请确认文件格式正确（.doc 格式建议另存为 .docx 后重新上传）`,
      );
    }

    this.logger.log(`Document parsed: ${text.length} chars from .${ext} file`);

    if (!text || text.trim().length === 0) {
      throw new BadRequestException('文档内容为空，无法提取VOC数据');
    }

    this.logger.debug(`Document preview (first 500 chars): ${text.slice(0, 500)}`);
    return text;
  }

  @Post('extract-vocs')
  async extractVocs(
    @Res() res: Response,
    @Body() body: { text: string },
  ) {
    if (!body.text || typeof body.text !== 'string') {
      throw new BadRequestException('Request body must contain a "text" string');
    }

    this.logger.log(
      `Extract VOCs request: ${body.text.length} chars`,
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Accel-Buffering', 'no');

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(' ');
    }, 10_000);

    try {
      const vocList = await this.aiService.extractVOCs(body.text);
      clearInterval(keepAlive);
      res.end(JSON.stringify({ vocList }));
    } catch (err: any) {
      clearInterval(keepAlive);
      if (!res.writableEnded) {
        res.end(JSON.stringify({ vocList: [], error: err.message || 'AI extraction failed' }));
      }
    }
  }

  @Post('generate-report')
  async generateReport(
    @Res() res: Response,
    @Body() body: { vocItems: VOCItem[] },
  ) {
    if (!body.vocItems || !Array.isArray(body.vocItems)) {
      throw new BadRequestException('Request body must contain a "vocItems" array');
    }

    this.logger.log(`Generate report request: ${body.vocItems.length} VOC items`);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Accel-Buffering', 'no');

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(' ');
    }, 10_000);

    try {
      const report = await this.aiService.generateBrandReport(body.vocItems);
      clearInterval(keepAlive);
      res.end(JSON.stringify(report));
    } catch (err: any) {
      clearInterval(keepAlive);
      if (!res.writableEnded) {
        res.end(JSON.stringify({ error: { message: err.message || '生成报告失败' } }));
      }
    }
  }

  @Post('generate-summary')
  async generateSummary(
    @Res() res: Response,
    @Body() body: { vocItems: VOCItem[]; projectName: string },
  ) {
    if (!body.vocItems || !Array.isArray(body.vocItems)) {
      throw new BadRequestException('Request body must contain a "vocItems" array');
    }

    this.logger.log(`Generate summary request: ${body.vocItems.length} VOC items for "${body.projectName}"`);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Accel-Buffering', 'no');

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(' ');
    }, 10_000);

    try {
      const summary = await this.aiService.generateProjectSummary(body.vocItems, body.projectName || '未命名项目');
      clearInterval(keepAlive);
      res.end(JSON.stringify(summary));
    } catch (err: any) {
      clearInterval(keepAlive);
      if (!res.writableEnded) {
        res.end(JSON.stringify({ error: { message: err.message || '生成总结失败' } }));
      }
    }
  }
}
