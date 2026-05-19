import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';

export interface VOCItem {
  id: string;
  brand: string;
  text: string;
  respondent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  dimension?: string;
  subDimension?: string;
}

const VOC_EXTRACTION_PROMPT = `你是一位专业的VOC（用户之声）数据分析专家，请从以下文本内容中提取所有VOC相关的数据，输出为结构化的JSON数组。

提取规则：
1. 品牌(brand)只能是以下枚举值之一：洋葱、妙懂、学而思、万物指南、NB虚拟实验室、赛先生
2. 情感倾向(sentiment)只能是以下枚举值之一：positive（正面）、neutral（中性）、negative（负面）
3. text字段为用户原始表述的完整内容，需完整保留
4. dimension为问题所属的一级分类维度（需求认知/购买决策/产品体验）
5. subDimension为维度下的二级子分类
6. 如果没有明确对应的受访者ID，respondent字段填空字符串
7. 如果文本中包含多条VOC记录，请全部提取，每条对应数组中的一个对象
8. 未明确的字段填空字符串，不要臆造内容

请以JSON数组格式输出，每个对象包含以下字段：
{brand, text, respondent, sentiment, dimension, subDimension}`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly aiModel: string;
  private readonly transcriptionModel: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'AI_GATEWAY_URL',
      'https://ops-ai-gateway.yc345.tv/v1',
    );
    this.apiKey = this.configService.get<string>('AI_API_KEY', '');
    this.aiModel = this.configService.get<string>(
      'AI_MODEL',
      'claude-sonnet-4-6',
    );
    this.transcriptionModel = this.configService.get<string>(
      'TRANSCRIPTION_MODEL',
      'gemini-2.5-flash',
    );
  }

  async transcribeAudio(
    fileBuffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<string> {
    this.logger.log(`Transcribing audio file: ${fileName} (${mimeType})`);

    const base64Content = fileBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Content}`;

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.transcriptionModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请将以下音频/视频内容转录为文字。只输出转录后的中文文本，不要添加任何额外说明、标题或格式。',
              },
              {
                type: 'image_url',
                image_url: { url: dataUri },
              },
            ],
          },
        ],
        max_tokens: 16384,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 300_000,
      },
    );

    const text = response.data?.choices?.[0]?.message?.content?.trim() ?? '';
    this.logger.log(
      `Transcription complete for ${fileName}: ${text.length} chars`,
    );
    return text;
  }

  async extractVOCs(textContent: string): Promise<VOCItem[]> {
    this.logger.log(
      `Extracting VOCs from text (${textContent.length} chars)`,
    );

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.aiModel,
        messages: [
          { role: 'system', content: VOC_EXTRACTION_PROMPT },
          { role: 'user', content: textContent },
        ],
        max_tokens: 16384,
        temperature: 0.1,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120_000,
      },
    );

    const raw = response.data?.choices?.[0]?.message?.content?.trim() ?? '[]';
    const parsed = this.parseJsonFromResponse(raw);

    const vocItems: VOCItem[] = parsed.map(
      (item: Record<string, unknown>) => ({
        id: randomUUID(),
        brand: String(item.brand ?? ''),
        text: String(item.text ?? ''),
        respondent: String(item.respondent ?? ''),
        sentiment: this.normalizeSentiment(item.sentiment),
        dimension: item.dimension ? String(item.dimension) : undefined,
        subDimension: item.subDimension ? String(item.subDimension) : undefined,
      }),
    );

    this.logger.log(`Extracted ${vocItems.length} VOC items`);
    return vocItems;
  }

  async parseDocument(textContent: string): Promise<string> {
    this.logger.log(
      `Parsing document text (${textContent.length} chars)`,
    );

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.aiModel,
        messages: [
          {
            role: 'system',
            content:
              '你是一位文档处理专家。请清理和整理以下文档内容，去除无关格式和噪音，保留所有有意义的文本内容。输出整理后的纯文本。',
          },
          { role: 'user', content: textContent },
        ],
        max_tokens: 16384,
        temperature: 0.1,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120_000,
      },
    );

    const text = response.data?.choices?.[0]?.message?.content?.trim() ?? '';
    this.logger.log(`Document parsed: ${text.length} chars`);
    return text;
  }

  private parseJsonFromResponse(raw: string): Record<string, unknown>[] {
    let jsonStr = raw;

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1];
    }

    jsonStr = jsonStr.trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (err) {
      this.logger.error(`Failed to parse AI response as JSON: ${err}`);
      this.logger.debug(`Raw response: ${raw.slice(0, 500)}`);
      return [];
    }
  }

  private normalizeSentiment(
    value: unknown,
  ): 'positive' | 'neutral' | 'negative' {
    const s = String(value ?? '').toLowerCase();
    if (s === 'positive' || s === '正面') return 'positive';
    if (s === 'negative' || s === '负面') return 'negative';
    return 'neutral';
  }
}
