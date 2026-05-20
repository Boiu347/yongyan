import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as mammoth from 'mammoth';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import { AiService, VOCItem } from './ai.service';

/**
 * Convert mammoth HTML output to structured plain text that preserves
 * document hierarchy (headings, tables, lists) so the AI can correctly
 * identify brand sections and user quotes.
 */
function htmlToStructuredText(html: string): string {
  let text = html;

  // Headings → markdown-style markers so AI sees section boundaries
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');
  text = text.replace(/<h[5-6][^>]*>([\s\S]*?)<\/h[5-6]>/gi, '\n\n##### $1\n\n');

  // Bold/strong text — often used as section labels or speaker names in interview docs
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');

  // Table rows → pipe-separated so table content is readable
  text = text.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, row: string) => {
    const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
    const cellTexts = cells.map((c: string) =>
      c.replace(/<[^>]+>/g, '').trim(),
    );
    return cellTexts.join(' | ') + '\n';
  });
  text = text.replace(/<\/?table[^>]*>/gi, '\n');
  text = text.replace(/<\/?thead[^>]*>/gi, '');
  text = text.replace(/<\/?tbody[^>]*>/gi, '');

  // List items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<\/?[ou]l[^>]*>/gi, '\n');

  // Paragraphs and line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Collapse excessive blank lines but keep paragraph separation
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

  constructor(private readonly aiService: AiService) {}

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
  ): Promise<{ text: string; vocList: VOCItem[] }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `Transcribe request: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`,
    );

    const text = await this.aiService.transcribeAudio(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    const vocList = await this.aiService.extractVOCs(text);

    return { text, vocList };
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
  ): Promise<{ text: string; vocList: VOCItem[] }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `Parse document request: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`,
    );

    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    let text: string;

    try {
      if (ext === 'docx' || ext === 'doc') {
        // Use convertToHtml to preserve headings, tables, lists, and bold text,
        // then convert to structured plain text. extractRawText strips all
        // structure, making it impossible for the AI to locate brand sections
        // and verbatim user quotes.
        const htmlResult = await mammoth.convertToHtml({ buffer: file.buffer });

        if (htmlResult.messages?.length) {
          for (const msg of htmlResult.messages) {
            this.logger.warn(`mammoth [${msg.type}]: ${msg.message}`);
          }
        }

        if (htmlResult.value && htmlResult.value.trim().length > 0) {
          text = htmlToStructuredText(htmlResult.value);
        } else {
          // Fallback: try raw text extraction in case convertToHtml returned empty
          this.logger.warn('convertToHtml returned empty, falling back to extractRawText');
          const rawResult = await mammoth.extractRawText({ buffer: file.buffer });
          text = rawResult.value;
        }
      } else if (ext === 'pdf') {
        const result = await pdfParse(file.buffer);
        text = result.text;
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

    // Log a preview for debugging extraction issues
    this.logger.debug(`Document preview (first 500 chars): ${text.slice(0, 500)}`);

    const vocList = await this.aiService.extractVOCs(text);

    return { text, vocList };
  }

  @Post('extract-vocs')
  async extractVocs(
    @Body() body: { text: string },
  ): Promise<{ vocList: VOCItem[] }> {
    if (!body.text || typeof body.text !== 'string') {
      throw new BadRequestException('Request body must contain a "text" string');
    }

    this.logger.log(
      `Extract VOCs request: ${body.text.length} chars`,
    );

    const vocList = await this.aiService.extractVOCs(body.text);
    return { vocList };
  }

  @Post('generate-report')
  async generateReport(
    @Body() body: { vocItems: VOCItem[] },
  ): Promise<Record<string, { coreFindings: string[]; typicalAttitudes: string[]; strengths: string[]; painPoints: string[] }>> {
    if (!body.vocItems || !Array.isArray(body.vocItems)) {
      throw new BadRequestException('Request body must contain a "vocItems" array');
    }

    this.logger.log(`Generate report request: ${body.vocItems.length} VOC items`);
    return this.aiService.generateBrandReport(body.vocItems);
  }

  @Post('generate-summary')
  async generateSummary(
    @Body() body: { vocItems: VOCItem[]; projectName: string },
  ): Promise<{ coreFindings: string[]; actionItems: string[]; methodology: string }> {
    if (!body.vocItems || !Array.isArray(body.vocItems)) {
      throw new BadRequestException('Request body must contain a "vocItems" array');
    }

    this.logger.log(`Generate summary request: ${body.vocItems.length} VOC items for "${body.projectName}"`);
    return this.aiService.generateProjectSummary(body.vocItems, body.projectName || '未命名项目');
  }
}
