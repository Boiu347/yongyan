import React from 'react';
import {
  FileText,
  Sparkles,
  Loader2,
  RefreshCw,
  Lightbulb,
  ArrowRight,
  Calendar,
  Users,
  BookOpen,
  Download,
  Edit3,
  Save,
  Plus,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface VOCItem {
  id: string;
  brand: string;
  text: string;
  respondent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  dimension?: string;
  subDimension?: string;
}

interface Project {
  id: string;
  name: string;
  dateRange: string;
  files: any[];
  parsedVOCs: VOCItem[];
}

interface SummaryData {
  coreFindings: string[];
  actionItems: string[];
  methodology: string;
  qualSampleSize: number;
  quantSampleSize: number;
  customNotes: string;
}

async function apiGenerateSummary(vocItems: VOCItem[], projectName: string): Promise<{ coreFindings: string[]; actionItems: string[]; methodology: string }> {
  const res = await fetch('/api/ai/generate-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vocItems, projectName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `服务端错误 (${res.status})`);
  }
  return res.json();
}

const ProjectSummary = ({ project }: { project: Project }) => {
  const storageKey = `summary_${project.id}`;
  const [summaryData, setSummaryData] = React.useState<SummaryData | null>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    return null;
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editForm, setEditForm] = React.useState<SummaryData | null>(null);

  React.useEffect(() => {
    if (summaryData) {
      localStorage.setItem(storageKey, JSON.stringify(summaryData));
    }
  }, [summaryData]);

  const handleGenerate = async () => {
    if (project.parsedVOCs.length === 0) {
      toast.error('当前项目没有VOC数据，请先在「定性洞察」中添加数据');
      return;
    }
    setIsLoading(true);
    try {
      const result = await apiGenerateSummary(project.parsedVOCs, project.name);
      const newData: SummaryData = {
        ...result,
        qualSampleSize: summaryData?.qualSampleSize || project.parsedVOCs.length,
        quantSampleSize: summaryData?.quantSampleSize || 0,
        customNotes: summaryData?.customNotes || '',
      };
      setSummaryData(newData);
      toast.success('项目总结生成成功');
    } catch (err) {
      toast.error(`生成失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    setEditForm(summaryData);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editForm) {
      setSummaryData(editForm);
      toast.success('已保存修改');
    }
    setIsEditing(false);
  };

  React.useEffect(() => {
    if (!summaryData && project.parsedVOCs.length > 0) {
      handleGenerate();
    }
  }, [project.id]);

  return (
    <div className="p-8 pb-20 max-w-4xl mx-auto">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-gray-900">项目总结</h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
              <FileText size={12} />研究报告
            </span>
          </div>
          <p className="text-gray-500">汇总定性定量数据，生成项目研究总结</p>
        </div>
        <div className="flex gap-2">
          {summaryData && !isEditing && (
            <Button onClick={handleEdit} variant="outline">
              <Edit3 className="w-4 h-4 mr-2" />编辑
            </Button>
          )}
          {isEditing && (
            <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
              <Save className="w-4 h-4 mr-2" />保存
            </Button>
          )}
          <Button
            onClick={handleGenerate}
            disabled={isLoading || project.parsedVOCs.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" />{summaryData ? '重新生成' : 'AI生成总结'}</>
            )}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mb-4" />
          <p className="text-gray-600 font-medium">AI 正在生成项目总结...</p>
          <p className="text-gray-400 text-sm mt-1">请稍候，通常需要 15-30 秒</p>
        </div>
      )}

      {!isLoading && !summaryData && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
            <FileText size={40} className="text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">尚未生成总结</h3>
          <p className="text-gray-500 mb-6">
            {project.parsedVOCs.length === 0
              ? '请先在「定性洞察」中添加VOC数据'
              : '点击上方按钮，AI将为您生成项目研究总结'
            }
          </p>
        </div>
      )}

      {!isLoading && summaryData && (
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4">项目基本信息</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-start gap-3">
                <BookOpen size={18} className="text-indigo-500 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400">项目名称</p>
                  <p className="text-sm font-medium text-gray-800">{project.name}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar size={18} className="text-indigo-500 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400">研究时间</p>
                  <p className="text-sm font-medium text-gray-800">{project.dateRange}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users size={18} className="text-indigo-500 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400">定性样本</p>
                  {isEditing ? (
                    <Input
                      type="number"
                      value={editForm?.qualSampleSize || ''}
                      onChange={(e) => setEditForm(prev => prev ? { ...prev, qualSampleSize: parseInt(e.target.value) || 0 } : prev)}
                      className="h-7 text-sm w-20"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-800">{summaryData.qualSampleSize} 人</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users size={18} className="text-green-500 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400">定量样本</p>
                  {isEditing ? (
                    <Input
                      type="number"
                      value={editForm?.quantSampleSize || ''}
                      onChange={(e) => setEditForm(prev => prev ? { ...prev, quantSampleSize: parseInt(e.target.value) || 0 } : prev)}
                      className="h-7 text-sm w-20"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-800">{summaryData.quantSampleSize || '-'} 份</p>
                  )}
                </div>
              </div>
            </div>
            {isEditing ? (
              <div className="mt-4 space-y-2">
                <Label className="text-xs text-gray-400">研究方法</Label>
                <Input
                  value={editForm?.methodology || ''}
                  onChange={(e) => setEditForm(prev => prev ? { ...prev, methodology: e.target.value } : prev)}
                />
              </div>
            ) : (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">研究方法</p>
                <p className="text-sm text-gray-700">{summaryData.methodology}</p>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Lightbulb size={20} className="text-amber-500" />
              <h3 className="text-lg font-bold text-gray-900">核心发现</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-full">
                <Sparkles size={10} />AI生成
              </span>
              {isEditing && (
                <button
                  onClick={() => setEditForm(prev => prev ? { ...prev, coreFindings: [...prev.coreFindings, ''] } : prev)}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                  <Plus size={14} />添加一条
                </button>
              )}
            </div>
            <div className="space-y-4">
              {(isEditing ? editForm?.coreFindings : summaryData.coreFindings)?.map((finding, index) => (
                <div key={index} className="flex gap-4 items-start">
                  <span className="flex-shrink-0 w-7 h-7 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  {isEditing ? (
                    <>
                      <Input
                        value={finding}
                        onChange={(e) => {
                          const findings = [...(editForm?.coreFindings || [])];
                          findings[index] = e.target.value;
                          setEditForm(prev => prev ? { ...prev, coreFindings: findings } : prev);
                        }}
                        className="flex-1"
                      />
                      <button
                        onClick={() => {
                          const findings = (editForm?.coreFindings || []).filter((_, i) => i !== index);
                          setEditForm(prev => prev ? { ...prev, coreFindings: findings } : prev);
                        }}
                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <p className="text-gray-700 leading-relaxed pt-0.5">{finding}</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <ArrowRight size={20} className="text-green-500" />
              <h3 className="text-lg font-bold text-gray-900">行动建议 / Next Steps</h3>
              {isEditing && (
                <button
                  onClick={() => setEditForm(prev => prev ? { ...prev, actionItems: [...prev.actionItems, ''] } : prev)}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                >
                  <Plus size={14} />添加一条
                </button>
              )}
            </div>
            <div className="space-y-3">
              {(isEditing ? editForm?.actionItems : summaryData.actionItems)?.map((item, index) => (
                <div key={index} className="flex gap-3 items-start p-3 bg-green-50/50 rounded-xl border border-green-100">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                    {index + 1}
                  </span>
                  {isEditing ? (
                    <>
                      <Input
                        value={item}
                        onChange={(e) => {
                          const items = [...(editForm?.actionItems || [])];
                          items[index] = e.target.value;
                          setEditForm(prev => prev ? { ...prev, actionItems: items } : prev);
                        }}
                        className="flex-1"
                      />
                      <button
                        onClick={() => {
                          const items = (editForm?.actionItems || []).filter((_, i) => i !== index);
                          setEditForm(prev => prev ? { ...prev, actionItems: items } : prev);
                        }}
                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <p className="text-gray-700 text-sm leading-relaxed">{item}</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {(isEditing || summaryData.customNotes) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">补充说明</h3>
              {isEditing ? (
                <textarea
                  value={editForm?.customNotes || ''}
                  onChange={(e) => setEditForm(prev => prev ? { ...prev, customNotes: e.target.value } : prev)}
                  className="w-full min-h-[120px] p-3 border border-gray-200 rounded-lg text-sm"
                  placeholder="可以添加项目的其他补充说明..."
                />
              ) : (
                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{summaryData.customNotes}</p>
              )}
            </motion.div>
          )}

          {project.files.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Download size={20} className="text-gray-500" />
                <h3 className="text-lg font-bold text-gray-900">项目附件</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {project.files.map(file => (
                  <div key={file.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700">
                    <FileText size={14} /> {file.name}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectSummary;
