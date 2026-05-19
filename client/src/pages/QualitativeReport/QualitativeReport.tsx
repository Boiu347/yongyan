import React from 'react';
import { Sparkles, Loader2, RefreshCw, CheckCircle2, AlertTriangle, ThumbsUp, ThumbsDown } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Brand = '洋葱' | '妙懂' | '学而思' | '万物指南' | 'NB虚拟实验室' | '赛先生';

interface VOCItem {
  id: string;
  brand: Brand;
  text: string;
  respondent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  dimension?: string;
  subDimension?: string;
}

interface BrandReport {
  coreFindings: string[];
  typicalAttitudes: string[];
  strengths: string[];
  painPoints: string[];
}

interface Project {
  id: string;
  name: string;
  dateRange: string;
  files: any[];
  parsedVOCs: VOCItem[];
}

const BRANDS: { name: Brand; color: string; bg: string; border: string }[] = [
  { name: '洋葱', color: '#f97316', bg: '#fff7ed', border: '#fdba74' },
  { name: '妙懂', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d' },
  { name: '学而思', color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd' },
  { name: '万物指南', color: '#22c55e', bg: '#f0fdf4', border: '#86efac' },
  { name: 'NB虚拟实验室', color: '#a855f7', bg: '#faf5ff', border: '#d8b4fe' },
  { name: '赛先生', color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
];

async function apiGenerateReport(vocItems: VOCItem[]): Promise<Record<string, BrandReport>> {
  const res = await fetch('/api/ai/generate-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vocItems }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `服务端错误 (${res.status})`);
  }
  return res.json();
}

const QualitativeReport = ({ project }: { project: Project }) => {
  const [report, setReport] = React.useState<Record<string, BrandReport> | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedBrands, setSelectedBrands] = React.useState<Brand[]>(BRANDS.map(b => b.name));

  const cachedReportKey = `report_${project.id}`;

  React.useEffect(() => {
    const saved = localStorage.getItem(cachedReportKey);
    if (saved) {
      try { setReport(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, [project.id]);

  const handleGenerate = async () => {
    if (project.parsedVOCs.length === 0) {
      toast.error('当前项目没有VOC数据，请先在「定性洞察」中添加数据');
      return;
    }
    setIsLoading(true);
    try {
      const result = await apiGenerateReport(project.parsedVOCs);
      setReport(result);
      localStorage.setItem(cachedReportKey, JSON.stringify(result));
      toast.success('报告生成成功');
    } catch (err) {
      toast.error(`生成失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (!report && project.parsedVOCs.length > 0) {
      handleGenerate();
    }
  }, [project.id]);

  const filteredBrands = BRANDS.filter(b => selectedBrands.includes(b.name));

  return (
    <div className="p-8 pb-20">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-gray-900">定性报告</h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 text-xs font-medium rounded-full">
              <Sparkles size={12} />AI 自动生成
            </span>
          </div>
          <p className="text-gray-500">基于VOC数据的品牌横向对比分析</p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={isLoading || project.parsedVOCs.length === 0}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {isLoading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" />重新生成</>
          )}
        </Button>
      </div>

      <div className="mb-6 bg-gray-50 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">显示品牌</span>
        <div className="flex gap-3">
          {BRANDS.map(brand => (
            <label key={brand.name} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedBrands.includes(brand.name)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedBrands([...selectedBrands, brand.name]);
                  else setSelectedBrands(selectedBrands.filter(b => b !== brand.name));
                }}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-900">{brand.name}</span>
            </label>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mb-4" />
          <p className="text-gray-600 font-medium">AI 正在分析 {project.parsedVOCs.length} 条VOC数据...</p>
          <p className="text-gray-400 text-sm mt-1">请稍候，通常需要 15-30 秒</p>
        </div>
      )}

      {!isLoading && !report && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mb-6">
            <Sparkles size={40} className="text-purple-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">尚未生成报告</h3>
          <p className="text-gray-500 mb-6">
            {project.parsedVOCs.length === 0
              ? '请先在「定性洞察」中添加VOC数据'
              : '点击上方按钮，AI将为您生成品牌对比分析报告'
            }
          </p>
        </div>
      )}

      {!isLoading && report && (
        <div className="overflow-x-auto">
          <div className="flex gap-6 min-w-max">
            {filteredBrands.map(brand => {
              const brandData = report[brand.name];
              if (!brandData) return null;
              return (
                <motion.div
                  key={brand.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-80 flex-shrink-0 bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
                >
                  <div className="p-4 border-b" style={{ backgroundColor: brand.bg, borderColor: brand.border }}>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-8 rounded-full" style={{ backgroundColor: brand.color }} />
                      <h3 className="text-lg font-bold" style={{ color: brand.color }}>{brand.name}</h3>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 size={16} className="text-indigo-500" />
                        <h4 className="text-sm font-bold text-gray-700">核心发现</h4>
                      </div>
                      <ul className="space-y-2">
                        {brandData.coreFindings.map((finding, i) => (
                          <li key={i} className="text-sm text-gray-600 leading-relaxed pl-4 border-l-2 border-indigo-100">
                            {finding}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={16} className="text-amber-500" />
                        <h4 className="text-sm font-bold text-gray-700">用户典型态度</h4>
                      </div>
                      <ul className="space-y-2">
                        {brandData.typicalAttitudes.map((attitude, i) => (
                          <li key={i} className="text-sm text-gray-600 leading-relaxed italic bg-gray-50 p-3 rounded-lg">
                            "{attitude}"
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <ThumbsUp size={16} className="text-green-500" />
                        <h4 className="text-sm font-bold text-gray-700">优势亮点</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {brandData.strengths.map((s, i) => (
                          <span key={i} className="px-3 py-1.5 bg-green-50 text-green-700 text-xs rounded-lg">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <ThumbsDown size={16} className="text-red-500" />
                        <h4 className="text-sm font-bold text-gray-700">痛点/槽点</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {brandData.painPoints.map((p, i) => (
                          <span key={i} className="px-3 py-1.5 bg-red-50 text-red-700 text-xs rounded-lg">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default QualitativeReport;
