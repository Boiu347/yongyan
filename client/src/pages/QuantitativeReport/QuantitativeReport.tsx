import React from 'react';
import {
  LayoutDashboard,
  Upload,
  ExternalLink,
  Image as ImageIcon,
  BarChart3,
  PieChart,
  TrendingUp,
  Users,
  X,
  Plus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface QuantData {
  totalSample: number;
  validRate: string;
  researchPeriod: string;
  wjxLink: string;
  charts: { id: string; title: string; type: 'bar' | 'pie' | 'line'; imageUrl?: string; description: string }[];
}

interface Project {
  id: string;
  name: string;
  dateRange: string;
  files: any[];
  parsedVOCs: any[];
}

const DEFAULT_CHARTS = [
  { id: 'c1', title: '品牌满意度评分对比', type: 'bar' as const, description: '各品牌在整体满意度上的评分分布' },
  { id: 'c2', title: '用户画像分布', type: 'pie' as const, description: '受访者年龄、城市级别、孩子年级等基本信息分布' },
  { id: 'c3', title: '购买意愿趋势', type: 'line' as const, description: '不同产品体验阶段用户购买意愿的变化趋势' },
];

const ChartTypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'bar': return <BarChart3 size={20} className="text-blue-500" />;
    case 'pie': return <PieChart size={20} className="text-purple-500" />;
    case 'line': return <TrendingUp size={20} className="text-green-500" />;
    default: return <BarChart3 size={20} className="text-gray-500" />;
  }
};

const QuantitativeReport = ({ project }: { project: Project }) => {
  const storageKey = `quant_${project.id}`;
  const [data, setData] = React.useState<QuantData>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    return {
      totalSample: 0,
      validRate: '',
      researchPeriod: project.dateRange,
      wjxLink: '',
      charts: DEFAULT_CHARTS,
    };
  });
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [editData, setEditData] = React.useState<QuantData>(data);
  const fileInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  React.useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data]);

  const handleSave = () => {
    setData(editData);
    setIsEditDialogOpen(false);
    toast.success('定量报告数据已更新');
  };

  const handleChartImageUpload = (chartId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setData(prev => ({
        ...prev,
        charts: prev.charts.map(c => c.id === chartId ? { ...c, imageUrl: url } : c),
      }));
      toast.success('图表已上传');
    };
    reader.readAsDataURL(file);
  };

  const handleAddChart = () => {
    setEditData(prev => ({
      ...prev,
      charts: [...prev.charts, { id: `c-${Date.now()}`, title: '', type: 'bar', description: '' }],
    }));
  };

  const handleRemoveChart = (id: string) => {
    setEditData(prev => ({
      ...prev,
      charts: prev.charts.filter(c => c.id !== id),
    }));
  };

  const hasData = data.totalSample > 0 || data.wjxLink || data.charts.some(c => c.imageUrl);

  return (
    <div className="p-8 pb-20">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-gray-900">定量报告</h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
              <LayoutDashboard size={12} />问卷数据
            </span>
          </div>
          <p className="text-gray-500">问卷星调研数据统计与可视化</p>
        </div>
        <Button onClick={() => { setEditData(data); setIsEditDialogOpen(true); }} variant="outline">
          编辑数据
        </Button>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
            <LayoutDashboard size={40} className="text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">尚未添加定量数据</h3>
          <p className="text-gray-500 mb-6">点击「编辑数据」添加问卷统计信息和图表截图</p>
          <Button onClick={() => { setEditData(data); setIsEditDialogOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" />添加数据
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <Users size={20} className="text-indigo-500" />
                <span className="text-sm text-gray-500">总样本数</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{data.totalSample || '-'}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 size={20} className="text-green-500" />
                <span className="text-sm text-gray-500">有效回收率</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{data.validRate || '-'}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp size={20} className="text-purple-500" />
                <span className="text-sm text-gray-500">调研时间</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{data.researchPeriod || project.dateRange}</p>
            </motion.div>
          </div>

          {data.wjxLink && (
            <div className="bg-white p-4 rounded-xl border border-gray-100">
              <a href={data.wjxLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                <ExternalLink size={16} />查看问卷星原始数据
              </a>
            </div>
          )}

          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900">数据图表</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.charts.map((chart) => (
                <motion.div
                  key={chart.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
                >
                  <div className="p-4 border-b border-gray-50 flex items-center gap-3">
                    <ChartTypeIcon type={chart.type} />
                    <div>
                      <h4 className="font-semibold text-gray-800">{chart.title || '未命名图表'}</h4>
                      {chart.description && <p className="text-xs text-gray-400 mt-0.5">{chart.description}</p>}
                    </div>
                  </div>
                  <div className="p-4">
                    {chart.imageUrl ? (
                      <img src={chart.imageUrl} alt={chart.title} className="w-full rounded-lg" />
                    ) : (
                      <div className="aspect-[4/3] bg-gray-50 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-gray-200">
                        <input
                          ref={(el) => { fileInputRefs.current[chart.id] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleChartImageUpload(chart.id, file);
                          }}
                        />
                        <ImageIcon size={32} className="text-gray-300 mb-2" />
                        <p className="text-sm text-gray-400 mb-3">上传图表截图</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRefs.current[chart.id]?.click()}
                        >
                          <Upload size={14} className="mr-1" />上传图片
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑定量报告数据</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>总样本数</Label>
                <Input
                  type="number"
                  value={editData.totalSample || ''}
                  onChange={(e) => setEditData({ ...editData, totalSample: parseInt(e.target.value) || 0 })}
                  placeholder="例如：500"
                />
              </div>
              <div className="space-y-2">
                <Label>有效回收率</Label>
                <Input
                  value={editData.validRate}
                  onChange={(e) => setEditData({ ...editData, validRate: e.target.value })}
                  placeholder="例如：92.3%"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>调研时间段</Label>
              <Input
                value={editData.researchPeriod}
                onChange={(e) => setEditData({ ...editData, researchPeriod: e.target.value })}
                placeholder="例如：2024.03 - 2024.05"
              />
            </div>
            <div className="space-y-2">
              <Label>问卷星数据链接</Label>
              <Input
                value={editData.wjxLink}
                onChange={(e) => setEditData({ ...editData, wjxLink: e.target.value })}
                placeholder="https://www.wjx.cn/..."
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>图表配置</Label>
                <Button size="sm" variant="outline" onClick={handleAddChart}>
                  <Plus size={14} className="mr-1" />添加图表
                </Button>
              </div>
              {editData.charts.map((chart, index) => (
                <div key={chart.id} className="p-4 bg-gray-50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">图表 {index + 1}</span>
                    <Button size="sm" variant="ghost" onClick={() => handleRemoveChart(chart.id)}>
                      <X size={14} />
                    </Button>
                  </div>
                  <Input
                    value={chart.title}
                    onChange={(e) => {
                      const charts = [...editData.charts];
                      charts[index] = { ...charts[index], title: e.target.value };
                      setEditData({ ...editData, charts });
                    }}
                    placeholder="图表标题"
                  />
                  <div className="flex gap-2">
                    {(['bar', 'pie', 'line'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => {
                          const charts = [...editData.charts];
                          charts[index] = { ...charts[index], type };
                          setEditData({ ...editData, charts });
                        }}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${chart.type === type ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-white text-gray-500 hover:text-gray-700'}`}
                      >
                        {type === 'bar' ? '柱状图' : type === 'pie' ? '饼图' : '折线图'}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={chart.description}
                    onChange={(e) => {
                      const charts = [...editData.charts];
                      charts[index] = { ...charts[index], description: e.target.value };
                      setEditData({ ...editData, charts });
                    }}
                    placeholder="图表说明（可选）"
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuantitativeReport;
