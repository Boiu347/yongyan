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
  tag?: string;
}

const VOC_EXTRACTION_PROMPT = `你是一位专业的VOC（用户之声）数据分析专家。你的任务是从用户研究访谈文档中提取【用户的真实发言/原声】。

## 关键原则：只提取用户原声
- ✅ 提取：用户/家长亲口说的话（口语化、第一人称、带个人感受和具体经历）
- ❌ 不提取：研究员的总结（如"用研洞察：..."、"定位：..."、"需求细分：..."）
- ❌ 不提取：分析性描述（如"家长更看重X"、"可以从Y切入"）
- ❌ 不提取：建议性内容（如"洋葱可以先找一个优势切口"、"更合适的表达是..."）

判断方法：如果一句话读起来像是一个真实的人在聊天时会说的话，就是用户原声；如果像是写报告/做分析，就不是。

## 文档结构说明
- "#"、"##"、"###" 等开头的行是标题
- "**加粗文字**" 通常是小节标题或受访者编号
- 文档通常按「受访用户」分节，标题格式如："用户1-王女士：二年级-山东临沂-妙懂&十分通"
- 该标题下的所有用户发言都属于这位用户

## 品牌枚举（brand字段只能填以下之一）
- 洋葱
- 妙懂
- 万物指南（物理十分通）（文本中提到"物理十分通"或"万物指南"都算这个品牌）
- NB虚拟实验室（NoBook）（文本中提到"NoBook"、"nobook"、"NB"都算这个品牌）
- 学而思
- 叫叫
- 赛先生科学课（文本中提到"赛先生"就算这个品牌）
- 南开大学AI物理课（文本中提到"南开"、"AI物理"就算这个品牌）

## 一级维度 + 二级维度 + 细分标签（tag）

### 需求认知（dimension="需求认知"）
| 二级维度(subDimension) | 判断标准 | tag标签(从固定列表选，匹配不上可自拟) |
|---|---|---|
| 诉求是什么？ | 用户谈到"为什么给孩子学""想达到什么目的""我的需求是" | 学科启蒙 / 兴趣启蒙 / 衔接先修 / 校内同步学科学 |
| 对启蒙的要求&态度 | 用户谈到"我觉得启蒙应该怎样""对学习的看法""不着急/着急" | 学科启蒙态度 / 兴趣启蒙态度 |
| 启蒙有效的标准&预期 | 用户谈到"什么算学会了""我期望的效果""怎样才算有用" | （AI自拟） |

### 购买决策（dimension="购买决策"）
| 二级维度(subDimension) | 判断标准 | tag标签 |
|---|---|---|
| 触达渠道 | 用户谈到"在哪里看到的""怎么知道的""谁推荐的" | （AI自拟，如：小红书、学习群、朋友推荐） |
| 吸引卖点 | 用户谈到"什么吸引我买的""打动我的点""下单原因" | （AI自拟，如：永久有效、专业背书、动画形式） |
| 购前预期 | 用户谈到"买之前想的""希望买了以后""期望效果" | （AI自拟） |

### 产品体验（dimension="产品体验"）
| 二级维度(subDimension) | 判断标准 | tag标签 |
|---|---|---|
| 使用场景 | 用户谈到"什么时候用""怎么安排学习时间""在哪学" | （AI自拟，如：碎片时间、放假、睡前） |
| 优势好评 | 用户谈到具体的优点、喜欢的地方、孩子正面反馈 | （AI自拟，如：内容质量高、孩子喜欢、有体系） |
| 劣势差评 | 用户谈到不满、缺点、孩子不喜欢的地方、改进建议 | （AI自拟，如：内容太简单、没用过、不吸引） |

**维度判断反例**：
- "永久有效对我吸引力很大" → 购买决策 > 吸引卖点（不是产品体验）
- "希望孩子不落下就行" → 需求认知 > 诉求是什么？（不是购前预期）
- "在学习群里看到的" → 购买决策 > 触达渠道（不是使用场景）
- "孩子买了很久一眼没看过" → 产品体验 > 劣势差评（不是购买决策）

## 提取规则
1. **text字段为用户原始表述，必须从文档中逐字复制原话，不缩写、不改写、不合并**
2. sentiment：positive（正面）/ neutral（中性）/ negative（负面）
3. respondent：填写完整用户身份（如"用户1-王女士：二年级-山东临沂"）
4. 每条独立表述单独一条记录
5. dimension、subDimension、tag 必须填写
6. tag：优先从上表固定列表中选择，如果匹配不上可以自拟一个简短标签
7. 只提取用户的真实发言，不要提取研究员的分析和总结

请以JSON数组格式输出，每个对象包含：
{brand, text, respondent, sentiment, dimension, subDimension, tag}`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly aiModel: string;
  private readonly transcriptionModel: string;
  private readonly feishuAppId: string;
  private readonly feishuAppSecret: string;

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
    this.feishuAppId = this.configService.get<string>('FEISHU_APP_ID', '');
    this.feishuAppSecret = this.configService.get<string>('FEISHU_APP_SECRET', '');
  }

  async getFeishuTenantToken(): Promise<string> {
    if (!this.feishuAppId || !this.feishuAppSecret) {
      throw new Error('飞书应用凭证未配置（FEISHU_APP_ID / FEISHU_APP_SECRET）');
    }
    const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: this.feishuAppId,
      app_secret: this.feishuAppSecret,
    });
    if (res.data?.code !== 0) {
      throw new Error(`获取飞书 token 失败: ${res.data?.msg || 'unknown'}`);
    }
    return res.data.tenant_access_token;
  }

  async fetchFeishuDocContent(docToken: string, docType: 'docx' | 'wiki'): Promise<string> {
    const token = await this.getFeishuTenantToken();

    let realToken = docToken;
    if (docType === 'wiki') {
      const nodeRes = await axios.get(`https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${docToken}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      realToken = nodeRes.data?.data?.node?.obj_token || docToken;
    }

    const res = await axios.get(`https://open.feishu.cn/open-apis/docx/v1/documents/${realToken}/raw_content`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.data?.code !== 0) {
      throw new Error(`读取飞书文档失败: ${res.data?.msg || 'unknown'}`);
    }
    return res.data?.data?.content || '';
  }

  async fetchFeishuMinutesContent(minuteToken: string): Promise<string> {
    const token = await this.getFeishuTenantToken();
    this.logger.log(`Fetching Feishu minutes content: ${minuteToken}`);

    // Try to get minutes transcript via VC API
    try {
      const res = await axios.get(`https://open.feishu.cn/open-apis/minutes/v1/minutes/${minuteToken}/transcript`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30_000,
      });
      if (res.data?.code === 0 && res.data?.data?.transcript) {
        const blocks = res.data.data.transcript;
        const text = Array.isArray(blocks)
          ? blocks.map((b: any) => `${b.speaker || ''}: ${b.text || ''}`).join('\n')
          : String(blocks);
        this.logger.log(`Minutes transcript fetched: ${text.length} chars`);
        return text;
      }
    } catch (err: any) {
      this.logger.warn(`Transcript API failed, trying statistics: ${err.message}`);
    }

    // Fallback: get minutes AI summary
    try {
      const res = await axios.get(`https://open.feishu.cn/open-apis/minutes/v1/minutes/${minuteToken}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30_000,
      });
      if (res.data?.code === 0) {
        const data = res.data.data;
        const parts: string[] = [];
        if (data?.title) parts.push(`# ${data.title}`);
        if (data?.summary) parts.push(`## 总结\n${data.summary}`);
        if (data?.transcripts?.length) {
          parts.push('## 逐字稿');
          for (const t of data.transcripts) {
            parts.push(`${t.speaker || ''}:  ${t.text || ''}`);
          }
        }
        const text = parts.join('\n\n');
        this.logger.log(`Minutes info fetched: ${text.length} chars`);
        return text;
      }
    } catch (err: any) {
      this.logger.error(`Minutes info API also failed: ${err.message}`);
    }

    throw new Error('无法获取飞书妙记内容，请检查应用权限或链接是否正确');
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
        tag: item.tag ? String(item.tag) : undefined,
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

  async generateDimensionSummaries(
    vocItems: VOCItem[],
  ): Promise<{ summaries: Array<{ dimension: string; subDimension: string; summary: string; brandSummaries: Record<string, string> }>; overallSummary: string }> {
    this.logger.log(`Generating dimension summaries from ${vocItems.length} VOC items`);

    const brandNames = [...new Set(vocItems.map(v => v.brand).filter(Boolean))];
    const brandListStr = brandNames.length > 0 ? brandNames.join('、') : '洋葱、妙懂、万物指南（物理十分通）、NB虚拟实验室（NoBook）、学而思、叫叫、赛先生科学课、南开大学AI物理课';

    const prompt = `你是一位用户研究专家。请根据以下VOC数据，为【每一个】二级维度生成总结。

## 必须覆盖的所有二级维度（共9个，每个都必须输出，即使数据较少也要写）：
1. dimension="需求认知", subDimension="诉求是什么？"
2. dimension="需求认知", subDimension="对「启蒙」的要求&态度"
3. dimension="需求认知", subDimension="「启蒙有效」的标准&预期"
4. dimension="购买决策", subDimension="触达渠道：在哪看到的？"
5. dimension="购买决策", subDimension="吸引卖点：什么内容吸引促使购买？"
6. dimension="购买决策", subDimension="购前预期：买前希望孩子怎么学？"
7. dimension="产品体验", subDimension="使用场景：什么时候学？"
8. dimension="产品体验", subDimension="优势/好评"
9. dimension="产品体验", subDimension="劣势/差评"

## 每个维度生成：
- summary：该维度的整体发现（2-3句话概括核心洞察）。如果该维度数据不足，写"该维度数据较少，暂无充分洞察"
- brandSummaries：该维度下每个出现过的品牌的单独总结（1-2句话）。品牌名必须使用原始全称：${brandListStr}。品牌没有相关数据则不用写

## 另外生成：
- overallSummary：不分品牌、不分维度，从整体研究角度总结核心发现（3-5句话）

## 严格要求：
- summaries数组必须恰好包含9个条目，顺序与上面一致
- subDimension字段必须与上面列出的完全一致（包括标点符号「」、/、：等）
- brandSummaries的key必须使用品牌全称

输出格式为JSON：
{
  "summaries": [
    { "dimension": "需求认知", "subDimension": "诉求是什么？", "summary": "...", "brandSummaries": {"洋葱": "...", "学而思": "..."} },
    { "dimension": "需求认知", "subDimension": "对「启蒙」的要求&态度", "summary": "...", "brandSummaries": {...} },
    { "dimension": "需求认知", "subDimension": "「启蒙有效」的标准&预期", "summary": "...", "brandSummaries": {...} },
    { "dimension": "购买决策", "subDimension": "触达渠道：在哪看到的？", "summary": "...", "brandSummaries": {...} },
    { "dimension": "购买决策", "subDimension": "吸引卖点：什么内容吸引促使购买？", "summary": "...", "brandSummaries": {...} },
    { "dimension": "购买决策", "subDimension": "购前预期：买前希望孩子怎么学？", "summary": "...", "brandSummaries": {...} },
    { "dimension": "产品体验", "subDimension": "使用场景：什么时候学？", "summary": "...", "brandSummaries": {...} },
    { "dimension": "产品体验", "subDimension": "优势/好评", "summary": "...", "brandSummaries": {...} },
    { "dimension": "产品体验", "subDimension": "劣势/差评", "summary": "...", "brandSummaries": {...} }
  ],
  "overallSummary": "全局总结..."
}

只输出JSON，不要其他文字。`;

    const vocText = vocItems.map(v => `[${v.brand}][${v.sentiment}][${v.dimension || ''} > ${v.subDimension || ''}] ${v.respondent}: ${v.text}`).join('\n');

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
        timeout: 300_000,
      },
    );

    const raw = response.data?.choices?.[0]?.message?.content?.trim() ?? '{}';
    const parsed = this.parseJsonObjectFromResponse(raw);
    const rawSummaries: Array<{ dimension: string; subDimension: string; summary: string; brandSummaries: Record<string, string> }> = Array.isArray(parsed.summaries) ? parsed.summaries : [];
    this.logger.log(`Dimension summaries generated: ${rawSummaries.length} dimensions from AI`);

    const CANONICAL_DIMS = [
      { dimension: '需求认知', subDimension: '诉求是什么？' },
      { dimension: '需求认知', subDimension: '对「启蒙」的要求&态度' },
      { dimension: '需求认知', subDimension: '「启蒙有效」的标准&预期' },
      { dimension: '购买决策', subDimension: '触达渠道：在哪看到的？' },
      { dimension: '购买决策', subDimension: '吸引卖点：什么内容吸引促使购买？' },
      { dimension: '购买决策', subDimension: '购前预期：买前希望孩子怎么学？' },
      { dimension: '产品体验', subDimension: '使用场景：什么时候学？' },
      { dimension: '产品体验', subDimension: '优势/好评' },
      { dimension: '产品体验', subDimension: '劣势/差评' },
    ];

    const normalize = (s: string) => s.toLowerCase().replace(/[「」『』""''：:？?/／\s]/g, '');

    const BRAND_ALIASES: Record<string, string[]> = {
      '洋葱': ['洋葱', '洋葱学园'],
      '妙懂': ['妙懂'],
      '万物指南（物理十分通）': ['万物指南', '物理十分通'],
      'NB虚拟实验室（NoBook）': ['NB虚拟实验室', 'NoBook', 'NB'],
      '学而思': ['学而思'],
      '叫叫': ['叫叫'],
      '赛先生科学课': ['赛先生', '赛先生科学课'],
      '南开大学AI物理课': ['南开', 'AI物理', '南开大学AI物理课'],
    };

    const normalizeBrandSummaries = (raw: Record<string, string>): Record<string, string> => {
      if (!raw || typeof raw !== 'object') return {};
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (!value) continue;
        let matched = false;
        for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
          if (key === canonical || aliases.some(a => key.includes(a) || a.includes(key))) {
            result[canonical] = value;
            matched = true;
            break;
          }
        }
        if (!matched) result[key] = value;
      }
      return result;
    };

    const summaries = CANONICAL_DIMS.map(canonical => {
      const match = rawSummaries.find(r => {
        if (r.dimension !== canonical.dimension) return false;
        const a = normalize(r.subDimension || '');
        const b = normalize(canonical.subDimension);
        return a === b || a.includes(b) || b.includes(a);
      });
      return {
        dimension: canonical.dimension,
        subDimension: canonical.subDimension,
        summary: match?.summary || '该维度数据较少，暂无充分洞察',
        brandSummaries: normalizeBrandSummaries(match?.brandSummaries || {}),
      };
    });

    this.logger.log(`Dimension summaries normalized: ${summaries.length} dimensions output`);
    return {
      summaries,
      overallSummary: typeof parsed.overallSummary === 'string' ? parsed.overallSummary : '',
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
