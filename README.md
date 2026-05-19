# VOC 洞察管理 (yongyan)

基于 NestJS + React + Tailwind CSS 的 VOC（用户之声）洞察管理平台。

## 功能

- 创建和管理研究项目
- 上传录音/视频文件，AI 自动转录并提取 VOC 数据
- 上传文档文件（PDF/Word/TXT），AI 自动解析
- 三维度 VOC 分类：需求认知、购买决策、产品体验
- 多品牌对比分析
- 情感倾向标注（正面/中性/负面）

## 技术栈

- **前端**：React 19, Tailwind CSS 4, Radix UI, Motion
- **后端**：NestJS, TypeScript
- **AI**：Claude Sonnet (VOC 分析), Gemini 2.5 Flash (音视频转录)

## 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 AI_API_KEY

# 启动开发服务器
npm run dev
```

## 部署到 Railway

1. Fork 此仓库到你的 GitHub
2. 登录 [railway.app](https://railway.app)
3. New Project → Deploy from GitHub → 选择此仓库
4. 在 Variables 中添加环境变量：
   - `AI_API_KEY` = 你的 API Key
   - `AI_GATEWAY_URL` = API 网关地址
5. Railway 会自动构建和部署
