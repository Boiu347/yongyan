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

const VOC_EXTRACTION_PROMPT = `你是一位专业的VOC（用户之声）数据分析专家。你的任务是从用户研究文档中【尽可能多地】提取所有VOC相关的数据。

## 文档结构说明
文档已被转换为带结构标记的文本：
- "#"、"##"、"###" 等开头的行是标题（对应品牌名或章节名）
- "**加粗文字**" 通常是小节标题、受访者编号或关键词
- "| 列1 | 列2 |" 格式是表格内容（表格中每个单元格可能包含用户原话）
- "- " 开头是列表项
请利用这些结构标记来准确识别品牌归属和用户原话边界。

## 重要
文档可能按「受访用户」分节，每个用户标题格式类似：
- "用户1-王女士：二年级-山东临沂-妙懂&十分通&NB实验室"
- "用户2-李先生：三年级-北京-学而思&洋葱"
你需要把当前章节所属的用户完整信息填入respondent字段（如"用户1-王女士：二年级-山东临沂"），这样就能知道每句话是谁说的。

文档也可能按品牌分节（如标题"万物指南"下面就是关于万物指南的所有用户反馈），你需要逐段逐句地扫描每个品牌/用户下的所有内容，不要遗漏任何一条用户表述。表格中的内容也要逐行扫描，每个单元格都可能包含独立的用户原话。

## 品牌枚举（brand字段只能填以下之一）
- 洋葱
- 妙懂
- 万物指南（物理十分通）（文本中提到"物理十分通"或"万物指南"都算这个品牌）
- NB虚拟实验室（NoBook）（文本中提到"NoBook"、"nobook"、"NB"都算这个品牌）
- 学而思
- 叫叫
- 赛先生科学课（文本中提到"赛先生"就算这个品牌）
- 南开大学AI物理课（文本中提到"南开"、"AI物理"就算这个品牌）

## 一级维度（dimension字段必须填以下三个之一，不能为空）
- 需求认知
- 购买决策
- 产品体验

## 二级维度（subDimension字段必须从对应一级维度下选择，不能为空）
- 需求认知下：「诉求是什么？」/「对启蒙的要求&态度」/「启蒙有效的标准&预期」
- 购买决策下：「触达渠道」/「吸引卖点」/「购前预期」
- 产品体验下：「使用场景」/「优势好评」/「劣势差评」

## 分类原则
- 用户谈到"为什么要给孩子学"、"希望孩子怎样"、"对教育的态度" → 需求认知
- 用户谈到"在哪看到的"、"什么吸引了我"、"买之前想的" → 购买决策
- 用户谈到"孩子怎么用的"、"好在哪"、"不好在哪"、"具体体验" → 产品体验

## 提取规则
1. **text字段为用户原始表述，必须从文档中逐字复制原话，不缩写、不改写、不合并、不润色**。如果原文写了"我家孩子特别喜欢看那个动画"，text就必须是"我家孩子特别喜欢看那个动画"，一个字都不能改
2. 情感倾向(sentiment)：positive（正面）/ neutral（中性）/ negative（负面）
3. respondent：必须填写当前内容所属的受访者身份信息。通常在章节标题中，格式如"用户1-王女士：二年级-山东临沂"。把用户编号+姓名+基本信息都填上（如"用户1-王女士：二年级-山东临沂"），而不是只填"用户1"。如果文档中有加粗的编号、"受访者X"等也可以用。如果实在无法判断属于哪位用户则填空字符串
4. 每条独立表述都单独作为一条记录，同一个人说了3句话就是3条记录
5. dimension和subDimension必须填写，根据内容语义判断属于哪个维度
6. 宁可多提取也不要遗漏，文档中每个品牌下的每一段用户反馈都要提取
7. 如果用户原话出现在表格中，也要完整提取该单元格内的原话

请以JSON数组格式输出，每个对象包含：
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

  async ocrDocument(
    fileBuffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<string> {
    this.logger.log(`OCR document via AI: ${fileName} (${mimeType}, ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

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
                text: '请将以下文档中的所有文字内容完整提取出来。保留原始的标题层级结构（用#标记）、表格（用|分隔列）和列表（用-标记）。完整保留每一句话，不要遗漏、不要概括、不要改写。只输出文档中的文字内容。',
              },
              {
                type: 'image_url',
                image_url: { url: dataUri },
              },
            ],
          },
        ],
        max_tokens: 32768,
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
    this.logger.log(`OCR complete for ${fileName}: ${text.length} chars`);
    return text;
  }

  async extractVOCs(textContent: string): Promise<VOCItem[]> {
    this.logger.log(
      `Extracting VOCs from text (${textContent.length} chars)`,
    );
    this.logger.log(
      `AI config: model=${this.aiModel}, baseUrl=${this.baseUrl}, apiKey=${this.apiKey ? '***' + this.apiKey.slice(-4) : 'EMPTY'}`,
    );

    const CHUNK_SIZE = 3000;
    const chunks = this.splitTextIntoChunks(textContent, CHUNK_SIZE);
    this.logger.log(`Split text into ${chunks.length} chunks (limit ${CHUNK_SIZE} chars each)`);

    const allVOCs: VOCItem[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      this.logger.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

      try {
        const vocItems = await this.extractVOCsFromChunk(chunk);
        allVOCs.push(...vocItems);
        this.logger.log(`Chunk ${i + 1} done: ${vocItems.length} VOC items`);
      } catch (err: any) {
        this.logger.error(`Chunk ${i + 1} failed: ${err.message}`);
      }
    }

    this.logger.log(`Total extracted: ${allVOCs.length} VOC items from ${chunks.length} chunks`);
    return allVOCs;
  }

  private splitTextIntoChunks(text: string, maxChars: number): string[] {
    if (text.length <= maxChars) return [text];

    const chunks: string[] = [];
    const lines = text.split('\n');
    let current = '';
    let lastContext = '';

    for (const line of lines) {
      // Track user/heading context
      if (/^#{1,4} /.test(line) || /^用户\d|^\*\*用户\d/.test(line)) {
        lastContext = line;
      }

      if (current.length + line.length + 1 > maxChars && current.length > 0) {
        chunks.push(current);
        current = lastContext ? lastContext + '\n' : '';
      }
      current += (current ? '\n' : '') + line;
    }
    if (current.trim()) chunks.push(current);

    return chunks;
  }

  private async extractVOCsFromChunk(chunkText: string): Promise<VOCItem[]> {
    const userMessage = `以下是用户研究文档的一个片段。请仔细阅读并逐条提取VOC。

注意：
- 文档中 # / ## / ### 标记的是标题，用于区分品牌或章节
- 标题中可能包含受访用户信息，格式如"用户1-王女士：二年级-山东临沂-妙懂&十分通"，该标题下的所有内容都属于这位用户
- **加粗** 的文字通常是小节标题、受访者编号或关键词
- "| xxx | yyy |" 格式是表格行，表格每行的各列都可能含有用户原话
- 请从文档原文中逐字复制用户原话到text字段，不要自己概括或改写
- respondent字段必须填写完整的用户身份（如"用户1-王女士：二年级-山东临沂"），不要只填编号
- 如果这个片段中没有可提取的VOC内容，返回空数组 []

文档片段：
${chunkText}`;

    let response: any;
    try {
      response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.aiModel,
          messages: [
            { role: 'system', content: VOC_EXTRACTION_PROMPT },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 16384,
          temperature: 0.1,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300_000,
        },
      );
    } catch (err: any) {
      const status = err?.response?.status ?? 'N/A';
      const data = err?.response?.data
        ? JSON.stringify(err.response.data).slice(0, 500)
        : err?.message ?? 'unknown';
      this.logger.error(`AI Gateway request FAILED: status=${status}, detail=${data}`);
      throw new Error(`AI 服务调用失败 (${status}): ${data}`);
    }

    const choice = response.data?.choices?.[0];
    const finishReason = choice?.finish_reason ?? 'unknown';
    const raw = choice?.message?.content?.trim() ?? '';
    this.logger.log(`AI response: ${raw.length} chars, finish_reason=${finishReason}`);

    if (!raw) {
      this.logger.warn('AI returned empty response for chunk');
      return [];
    }

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

    return vocItems;
  }

  async generateBrandReport(
    vocItems: VOCItem[],
  ): Promise<Record<string, { coreFindings: string[]; typicalAttitudes: string[]; strengths: string[]; painPoints: string[] }>> {
    this.logger.log(`Generating brand report from ${vocItems.length} VOC items`);

    const prompt = `你是一位用户研究专家。请根据以下VOC（用户之声）数据，按品牌进行横向对比分析，为每个品牌生成结构化总结。

输出格式为JSON对象，key为品牌名称，value为包含以下字段的对象：
- coreFindings: 核心发现（3-5条）
- typicalAttitudes: 用户典型态度（2-3条代表性引用或总结）
- strengths: 优势亮点（2-4条）
- painPoints: 痛点槽点（2-4条）

如果某个品牌的数据不足，可以标注"数据不足，无法充分分析"。
只输出JSON，不要其他文字。`;

    const vocText = vocItems.map(v => `[${v.brand}][${v.sentiment}][${v.dimension || ''}] ${v.respondent}: ${v.text}`).join('\n');

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.aiModel,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: vocText },
        ],
        max_tokens: 8192,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120_000,
      },
    );

    const raw = response.data?.choices?.[0]?.message?.content?.trim() ?? '{}';
    const parsed = this.parseJsonObjectFromResponse(raw);
    this.logger.log(`Brand report generated for ${Object.keys(parsed).length} brands`);
    return parsed;
  }

  async generateProjectSummary(
    vocItems: VOCItem[],
    projectName: string,
  ): Promise<{ coreFindings: string[]; actionItems: string[]; methodology: string }> {
    this.logger.log(`Generating project summary for "${projectName}"`);

    const prompt = `你是一位用户研究专家。请根据以下VOC数据，生成该研究项目的总结报告。

输出格式为JSON对象，包含以下字段：
- coreFindings: 核心发现（5-8条，按重要性排序）
- actionItems: 行动建议/Next Steps（3-5条具体可执行的建议）
- methodology: 研究方法简述（一段话）

只输出JSON，不要其他文字。`;

    const vocText = vocItems.map(v => `[${v.brand}][${v.sentiment}][${v.dimension || ''}] ${v.respondent}: ${v.text}`).join('\n');

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.aiModel,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `项目名称：${projectName}\n\nVOC数据：\n${vocText}` },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120_000,
      },
    );

    const raw = response.data?.choices?.[0]?.message?.content?.trim() ?? '{}';
    const parsed = this.parseJsonObjectFromResponse(raw);
    return {
      coreFindings: Array.isArray(parsed.coreFindings) ? parsed.coreFindings : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      methodology: typeof parsed.methodology === 'string' ? parsed.methodology : '深度访谈 + 问卷调研',
    };
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

    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1];
    }

    jsonStr = jsonStr.trim();

    // If it doesn't start with [ or {, try to find the first JSON array/object
    if (!jsonStr.startsWith('[') && !jsonStr.startsWith('{')) {
      const arrStart = jsonStr.indexOf('[');
      const objStart = jsonStr.indexOf('{');
      const start = arrStart >= 0 && objStart >= 0
        ? Math.min(arrStart, objStart)
        : Math.max(arrStart, objStart);
      if (start >= 0) {
        jsonStr = jsonStr.slice(start);
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const arrField = Object.values(parsed).find(v => Array.isArray(v));
        if (arrField) return arrField as Record<string, unknown>[];
        return [parsed];
      }
      return [];
    } catch (err) {
      // Try to find and extract a JSON array from the response
      const arrayMatch = raw.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const arr = JSON.parse(arrayMatch[0]);
          if (Array.isArray(arr)) {
            this.logger.log(`Recovered JSON array via fallback regex (${arr.length} items)`);
            return arr;
          }
        } catch { /* fall through */ }
      }

      this.logger.error(`Failed to parse AI response as JSON: ${err}`);
      this.logger.debug(`Raw response (first 500): ${raw.slice(0, 500)}`);
      this.logger.debug(`Raw response (last 500): ${raw.slice(-500)}`);
      return [];
    }
  }

  private parseJsonObjectFromResponse(raw: string): Record<string, any> {
    let jsonStr = raw;

    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1];
    }

    jsonStr = jsonStr.trim();

    try {
      return JSON.parse(jsonStr);
    } catch (err) {
      this.logger.error(`Failed to parse AI response as JSON object: ${err}`);
      this.logger.debug(`Raw response: ${raw.slice(0, 500)}`);
      return {};
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
