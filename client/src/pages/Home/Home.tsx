import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Sparkles,
  MessageSquareQuote,
  LayoutDashboard,
  FileText,
  ExternalLink,
  X,
  Loader2,
  Trash2,
  Upload,
  Mic,
  Video,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import QualitativeReport from '@/pages/QualitativeReport/QualitativeReport';
import QuantitativeReport from '@/pages/QuantitativeReport/QuantitativeReport';
import ProjectSummary from '@/pages/ProjectSummary/ProjectSummary';

// --- Types ---
type Brand = '洋葱' | '妙懂' | '万物指南（物理十分通）' | 'NB虚拟实验室（NoBook）' | '学而思' | '叫叫' | '赛先生科学课' | '南开大学AI物理课';

interface VOCItem {
  id: string;
  brand: Brand;
  text: string;
  respondent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  dimension?: string;
  subDimension?: string;
}

interface SubDimension {
  title: string;
  vocs: VOCItem[];
}

interface Dimension {
  id: string;
  name: string;
  subDimensions: SubDimension[];
}

interface ProjectFile {
  id: string;
  name: string;
  feishuLink?: string;
  type: 'document' | 'audio' | 'video';
}

interface Project {
  id: string;
  name: string;
  dateRange: string;
  files: ProjectFile[];
  parsedVOCs: VOCItem[];
}

// --- API helpers ---
async function apiTranscribe(file: File): Promise<{ text: string; vocList: VOCItem[] }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/ai/transcribe', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.message || `服务端错误 (${res.status})`);
  }
  return res.json();
}

async function apiParseDocument(file: File): Promise<{ text: string; vocList: VOCItem[] }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/ai/parse-document', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.message || `服务端错误 (${res.status})`);
  }
  return res.json();
}

async function apiExtractVocs(text: string): Promise<{ vocList: VOCItem[] }> {
  const res = await fetch('/api/ai/extract-vocs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.message || `服务端错误 (${res.status})`);
  }
  return res.json();
}

// --- Constants ---
const BRANDS: { name: Brand; color: string; bg: string; border: string }[] = [
  { name: '洋葱', color: '#f97316', bg: '#fff7ed', border: '#fdba74' },
  { name: '妙懂', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d' },
  { name: '万物指南（物理十分通）', color: '#22c55e', bg: '#f0fdf4', border: '#86efac' },
  { name: 'NB虚拟实验室（NoBook）', color: '#a855f7', bg: '#faf5ff', border: '#d8b4fe' },
  { name: '学而思', color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd' },
  { name: '叫叫', color: '#ec4899', bg: '#fdf2f8', border: '#f9a8d4' },
  { name: '赛先生科学课', color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
  { name: '南开大学AI物理课', color: '#06b6d4', bg: '#ecfeff', border: '#67e8f9' },
];

const DIMENSIONS: Dimension[] = [
  {
    id: 'level1',
    name: '需求认知',
    subDimensions: [
      { title: '诉求是什么？', vocs: [] },
      { title: '对「启蒙」的要求&态度', vocs: [] },
      { title: '「启蒙有效」的标准&预期', vocs: [] },
    ]
  },
  {
    id: 'level2',
    name: '购买决策',
    subDimensions: [
      { title: '触达渠道：在哪看到的？', vocs: [] },
      { title: '吸引卖点：什么内容吸引促使购买？', vocs: [] },
      { title: '购前预期：买前希望孩子怎么学？', vocs: [] },
    ]
  },
  {
    id: 'level3',
    name: '产品体验',
    subDimensions: [
      { title: '使用场景：什么时候学？', vocs: [] },
      { title: '优势/好评', vocs: [] },
      { title: '劣势/差评', vocs: [] },
    ]
  },
];

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mpeg', 'mov']);
const DOC_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'md']);

function getFileType(name: string): 'audio' | 'video' | 'document' {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'document';
}

const ACCEPTED_FILES = [
  ...Array.from(DOC_EXTENSIONS).map(e => `.${e}`),
  ...Array.from(AUDIO_EXTENSIONS).map(e => `.${e}`),
  ...Array.from(VIDEO_EXTENSIONS).map(e => `.${e}`),
].join(',');

const DEFAULT_PROJECTS: Project[] = [
  {
    id: 'proj1',
    name: '2024年启蒙教育品牌对比研究',
    dateRange: '2024.03 - 2024.05',
    files: [],
    parsedVOCs: [
      { id: 'v1', brand: '洋葱', text: '主要是不想让孩子输在起跑线上，希望通过这种比较生动的形式让他先接触一下科学。', respondent: '家长#A01', sentiment: 'positive' },
      { id: 'v2', brand: '学而思', text: '学而思比较体系化，虽然有点难，但感觉对以后幼升小有帮助。', respondent: '家长#B12', sentiment: 'neutral' },
      { id: 'v3', brand: '万物指南（物理十分通）', text: '更看重体验，让孩子自己动手做实验，比单纯看视频好。', respondent: '家长#C05', sentiment: 'positive' },
    ]
  },
];

// --- Components ---

const DeleteConfirmDialog = ({
  open, onOpenChange, onConfirm, projectName
}: {
  open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void; projectName: string;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-red-600">
          <Trash2 className="w-5 h-5" />
          删除项目
        </DialogTitle>
      </DialogHeader>
      <div className="py-4">
        <p className="text-gray-600">
          确定要删除项目「<span className="font-semibold text-gray-900">{projectName}</span>」吗？
        </p>
        <p className="text-sm text-gray-400 mt-2">此操作不可恢复，相关数据将被永久删除。</p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
        <Button onClick={onConfirm} className="bg-red-600 hover:bg-red-700 text-white">确认删除</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const CreateProjectDialog = ({
  open, onOpenChange, onCreate, isParsing, onParseAndCreate
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (project: Omit<Project, 'id' | 'parsedVOCs'>) => void;
  isParsing?: boolean;
  onParseAndCreate?: (project: Omit<Project, 'id' | 'parsedVOCs'>, files: File[]) => Promise<void>;
}) => {
  const [name, setName] = React.useState('');
  const [dateRange, setDateRange] = React.useState('');
  const [files, setFiles] = React.useState<{ name: string; link?: string; file?: File }[]>([]);
  const [uploadMode, setUploadMode] = React.useState<'file' | 'link'>('file');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selectedFiles.map(f => ({ name: f.name, file: f }))]);
  };

  const handleRemoveFile = (index: number) => setFiles(files.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('请输入项目名称'); return; }

    const projectFiles: ProjectFile[] = files.map((f, i) => ({
      id: `file-${Date.now()}-${i}`,
      name: f.name,
      feishuLink: f.link,
      type: f.file ? getFileType(f.file.name) : 'document' as const,
    }));

    const projectData: Omit<Project, 'id' | 'parsedVOCs'> = {
      name: name.trim(),
      dateRange: dateRange.trim() || new Date().toISOString().slice(0, 7),
      files: projectFiles,
    };

    const realFiles = files.filter(f => f.file).map(f => f.file!);
    if (realFiles.length > 0 && onParseAndCreate) {
      await onParseAndCreate(projectData, realFiles);
    } else {
      onCreate(projectData);
    }

    setName(''); setDateRange(''); setFiles([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5" />新建研究项目</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>项目名称</Label>
            <Input placeholder="例如：2024年启蒙教育品牌对比研究" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>研究周期</Label>
            <Input placeholder="例如：2024.03 - 2024.05" value={dateRange} onChange={(e) => setDateRange(e.target.value)} />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>关联文件</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setUploadMode('file')} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${uploadMode === 'file' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>上传文件</button>
                <button type="button" onClick={() => setUploadMode('link')} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${uploadMode === 'link' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>飞书链接</button>
              </div>
            </div>

            {uploadMode === 'file' && (
              <div className="space-y-3">
                <input ref={fileInputRef} type="file" accept={ACCEPTED_FILES} multiple onChange={handleFileSelect} className="hidden" />
                <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                  <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 font-medium">点击或拖拽上传文件</p>
                  <p className="text-xs text-gray-400 mt-1">支持录音（MP3/WAV/M4A）、视频（MP4）、文档（PDF/Word/TXT）</p>
                </div>
                {files.filter(f => f.file).length > 0 && (
                  <div className="space-y-2">
                    {files.filter(f => f.file).map((file, index) => {
                      const ft = getFileType(file.name);
                      const Icon = ft === 'audio' ? Mic : ft === 'video' ? Video : FileText;
                      return (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Icon size={18} className="text-indigo-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-700">{file.name}</p>
                              <p className="text-xs text-gray-400">{(file.file!.size / 1024 / 1024).toFixed(2)} MB · {ft === 'audio' ? '录音' : ft === 'video' ? '视频' : '文档'}</p>
                            </div>
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveFile(files.indexOf(file))}><X className="w-4 h-4 text-gray-400" /></Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {uploadMode === 'link' && (
              <div className="space-y-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setFiles([...files, { name: '', link: '' }])}><Plus className="w-4 h-4 mr-1" />添加链接</Button>
                {files.filter(f => f.link !== undefined).map((file, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <Input placeholder="文件名称" value={file.name} onChange={(e) => { const nf = [...files]; nf[files.indexOf(file)].name = e.target.value; setFiles(nf); }} />
                      <Input placeholder="飞书妙记链接" value={file.link || ''} onChange={(e) => { const nf = [...files]; nf[files.indexOf(file)].link = e.target.value; setFiles(nf); }} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveFile(files.indexOf(file))} className="mt-1"><X className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isParsing}>取消</Button>
          <Button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-700" disabled={isParsing || !name.trim()}>
            {isParsing ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />AI解析中...</>) : files.filter(f => f.file).length > 0 ? (<><Sparkles className="w-4 h-4 mr-2" />创建并AI解析</>) : '创建项目'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddFileDialog = ({
  open, onOpenChange, projectName, onAddFiles, isParsing
}: {
  open: boolean; onOpenChange: (open: boolean) => void; projectName: string;
  onAddFiles: (files: File[], links: { name: string; link: string }[], parseImmediately: boolean) => void;
  isParsing?: boolean;
}) => {
  const [files, setFiles] = React.useState<{ name: string; link?: string; file?: File }[]>([]);
  const [uploadMode, setUploadMode] = React.useState<'file' | 'link'>('file');
  const [parseImmediately, setParseImmediately] = React.useState(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const realFiles = files.filter(f => f.file).map(f => f.file!);
    const links = files.filter(f => f.link && f.name).map(f => ({ name: f.name, link: f.link! }));
    if (realFiles.length === 0 && links.length === 0) { toast.error('请至少添加一个文件'); return; }
    onAddFiles(realFiles, links, parseImmediately);
    setFiles([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5" />添加文件到「{projectName}」</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setUploadMode('file')} className={`flex-1 py-2 text-sm rounded-lg transition-colors ${uploadMode === 'file' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>上传文件</button>
            <button type="button" onClick={() => setUploadMode('link')} className={`flex-1 py-2 text-sm rounded-lg transition-colors ${uploadMode === 'link' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>飞书链接</button>
          </div>

          {uploadMode === 'file' && (
            <div className="space-y-3">
              <input ref={fileInputRef} type="file" accept={ACCEPTED_FILES} multiple onChange={(e) => { const sf = Array.from(e.target.files || []); setFiles(prev => [...prev, ...sf.map(f => ({ name: f.name, file: f }))]); }} className="hidden" />
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600 font-medium">点击或拖拽上传文件</p>
                <p className="text-xs text-gray-400 mt-1">支持录音（MP3/WAV/M4A）、视频（MP4）、文档（PDF/Word/TXT）</p>
              </div>
              {files.filter(f => f.file).length > 0 && (
                <div className="space-y-2">
                  {files.filter(f => f.file).map((file, index) => {
                    const ft = getFileType(file.name);
                    const Icon = ft === 'audio' ? Mic : ft === 'video' ? Video : FileText;
                    return (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Icon size={18} className="text-indigo-500" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">{file.name}</p>
                            <p className="text-xs text-gray-400">{(file.file!.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setFiles(files.filter((_, i) => i !== index))}><X className="w-4 h-4 text-gray-400" /></Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {uploadMode === 'link' && (
            <div className="space-y-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setFiles([...files, { name: '', link: '' }])}><Plus className="w-4 h-4 mr-1" />添加链接</Button>
              {files.filter(f => f.link !== undefined).map((file, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input placeholder="文件名称" value={file.name} onChange={(e) => { const nf = [...files]; nf[files.indexOf(file)].name = e.target.value; setFiles(nf); }} />
                    <Input placeholder="飞书妙记链接" value={file.link || ''} onChange={(e) => { const nf = [...files]; nf[files.indexOf(file)].link = e.target.value; setFiles(nf); }} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setFiles(files.filter((_, i) => i !== index))} className="mt-1"><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
            <input type="checkbox" id="parse-immediately" checked={parseImmediately} onChange={(e) => setParseImmediately(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            <label htmlFor="parse-immediately" className="text-sm text-gray-700 cursor-pointer">添加后立即进行AI解析</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isParsing}>取消</Button>
          <Button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-700" disabled={isParsing || files.length === 0}>
            {isParsing ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />AI解析中...</>) : (<><Plus className="w-4 h-4 mr-2" />添加文件</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Sidebar = ({
  projects, activeProject, onProjectChange, onCreateProject, onDeleteProject, activeTab, onTabChange
}: {
  projects: Project[]; activeProject: Project; onProjectChange: (p: Project) => void; onCreateProject: () => void; onDeleteProject: (p: Project) => void; activeTab: string; onTabChange: (tab: string) => void;
}) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <div className="w-64 bg-white border-r border-gray-100 flex flex-col h-screen fixed left-0 top-0 z-10">
      <div className="p-6 border-b border-gray-50 text-center">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center justify-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <LayoutDashboard size={18} />
          </div>
          洞察管理
        </h1>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {[
          { icon: MessageSquareQuote, label: '定性洞察', id: 'qualitative-insights' },
          { icon: Sparkles, label: '定性报告', id: 'qualitative-report' },
          { icon: LayoutDashboard, label: '定量报告', id: 'quantitative-report' },
          { icon: FileText, label: '项目总结', id: 'project-summary' },
        ].map(item => {
          const isActive = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => onTabChange(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-indigo-50 text-indigo-700 font-bold shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
              <item.icon size={20} className={isActive ? 'text-indigo-600' : 'text-gray-400'} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-50 space-y-3">
        <button onClick={onCreateProject} className="w-full flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all font-medium">
          <Plus size={18} /> 新建项目
        </button>
        <div className="relative">
          <AnimatePresence>
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsMenuOpen(false)} />
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-30 overflow-hidden">
                  <div className="p-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 mb-1">选择研究项目</div>
                  {projects.map(proj => (
                    <div key={proj.id} className={`group flex items-center justify-between p-3 rounded-xl transition-colors ${activeProject.id === proj.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}>
                      <button onClick={() => { onProjectChange(proj); setIsMenuOpen(false); }} className="flex-1 text-left">
                        <div className="text-sm line-clamp-1">{proj.name}</div>
                        <div className="text-[10px] opacity-60 mt-0.5">{proj.dateRange}</div>
                      </button>
                      <button onClick={() => onDeleteProject(proj)} className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="删除项目">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`w-full bg-gray-50 rounded-2xl p-4 text-left transition-all border group ${isMenuOpen ? 'border-indigo-200 bg-indigo-50/30' : 'border-transparent hover:border-gray-200'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">当前项目</p>
              <ChevronDown size={14} className={`text-gray-400 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
            </div>
            <p className="text-sm font-bold text-gray-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">{activeProject.name}</p>
          </button>
        </div>
      </div>
    </div>
  );
};

const InsightsPage = ({ project, onParseFiles, onAddFiles, onDeleteFile }: { project: Project; onParseFiles: () => void; onAddFiles: () => void; onDeleteFile: (fileId: string) => void }) => {
  const [activeDimension, setActiveDimension] = React.useState(0);
  const [expandedSubDimensions, setExpandedSubDimensions] = React.useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = React.useState<Brand[]>(BRANDS.map(b => b.name));

  const toggleSubDimension = (title: string) => {
    setExpandedSubDimensions(prev => prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]);
  };

  const currentDimension = DIMENSIONS[activeDimension];

  const getVOCsForSubDimension = (subDimensionTitle: string): VOCItem[] => {
    return project.parsedVOCs.filter(voc => {
      if (voc.dimension !== currentDimension.name) return false;
      if (!voc.subDimension) return false;
      const vocSub = voc.subDimension.toLowerCase();
      const targetSub = subDimensionTitle.toLowerCase();
      if (targetSub.includes(vocSub) || vocSub.includes(targetSub)) return true;
      const keywords: Record<string, string[]> = {
        '诉求是什么？': ['诉求', '为什么', '需求', '想要'],
        '对「启蒙」的要求&态度': ['启蒙', '态度', '要求', '看法'],
        '「启蒙有效」的标准&预期': ['有效', '标准', '预期', '效果'],
        '触达渠道：在哪看到的？': ['渠道', '看到', '了解', '触达', '知道'],
        '吸引卖点：什么内容吸引促使购买？': ['吸引', '卖点', '购买', '打动'],
        '购前预期：买前希望孩子怎么学？': ['购前', '买前', '希望', '预期'],
        '使用场景：什么时候学？': ['场景', '什么时候', '使用', '时间'],
        '优势/好评': ['优势', '好评', '优点', '好', '满意', '喜欢'],
        '劣势/差评': ['劣势', '差评', '缺点', '不好', '不满', '问题'],
      };
      const kws = keywords[subDimensionTitle] || [];
      return kws.some(kw => vocSub.includes(kw));
    });
  };

  return (
    <div className="p-8 pb-20">
      <div className="mb-6 bg-white border border-gray-100 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
            <p className="text-gray-500 mt-1">研究周期：{project.dateRange} · {project.parsedVOCs.length} 条VOC数据</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={onAddFiles} variant="outline" className="flex items-center gap-2"><Plus size={18} />添加文件</Button>
            <Button onClick={onParseFiles} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"><Sparkles size={18} />AI解析文件</Button>
          </div>
        </div>

        {project.files.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">关联文件：</p>
            <div className="flex flex-wrap gap-2">
              {project.files.map(file => {
                const Icon = file.type === 'audio' ? Mic : file.type === 'video' ? Video : FileText;
                return (
                  <div key={file.id} className="relative group">
                    {file.feishuLink ? (
                      <a href={file.feishuLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                        <Icon size={14} /> {file.name} <ExternalLink size={12} className="text-gray-400" />
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700">
                        <Icon size={14} /> {file.name}
                      </div>
                    )}
                    <button
                      onClick={() => onDeleteFile(file.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mb-8 flex justify-between items-end">
        <div>
          <h3 className="text-xl font-bold text-gray-900">定性洞察</h3>
          <p className="text-gray-500 mt-1">基于用户原声的深度分析</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          {DIMENSIONS.map((dim, index) => (
            <button key={dim.id} onClick={() => setActiveDimension(index)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeDimension === index ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {dim.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 bg-gray-50 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">显示品牌</span>
        <div className="flex gap-3">
          {BRANDS.map(brand => (
            <label key={brand.name} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={selectedBrands.includes(brand.name)} onChange={(e) => { if (e.target.checked) setSelectedBrands([...selectedBrands, brand.name]); else setSelectedBrands(selectedBrands.filter(b => b !== brand.name)); }} className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <span className="text-sm text-gray-600 group-hover:text-gray-900">{brand.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {currentDimension.subDimensions.map((subDim) => {
          const vocs = getVOCsForSubDimension(subDim.title);
          const isExpanded = expandedSubDimensions.includes(subDim.title);

          return (
            <div key={subDim.title} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <button onClick={() => toggleSubDimension(subDim.title)} className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isExpanded ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>
                  <span className="text-lg font-semibold text-gray-800">{subDim.title}</span>
                  <span className="px-2 py-1 bg-gray-100 text-xs text-gray-500 rounded-full">{vocs.length} 条</span>
                </div>
              </button>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-gray-50">
                    <div className="p-6 overflow-x-auto">
                      <div className="flex gap-6 min-w-max">
                        {BRANDS.filter(b => selectedBrands.includes(b.name)).map(brand => {
                          const brandVOCs = vocs.filter(v => v.brand === brand.name);
                          return (
                            <div key={brand.name} className="w-80 flex-shrink-0">
                              <div className="flex items-center gap-2 mb-4">
                                <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: brand.color }} />
                                <h4 className="font-bold text-gray-900">{brand.name}</h4>
                                <span className="text-xs text-gray-400">({brandVOCs.length})</span>
                              </div>
                              <div className="space-y-4">
                                {brandVOCs.map(voc => (
                                  <div key={voc.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-indigo-100 transition-all">
                                    <p className="text-sm text-gray-700 leading-relaxed mb-3">{voc.text}</p>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{voc.respondent}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${voc.sentiment === 'positive' ? 'bg-green-50 text-green-600' : voc.sentiment === 'negative' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                                          {voc.sentiment === 'positive' ? '正面' : voc.sentiment === 'negative' ? '负面' : '中性'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {brandVOCs.length === 0 && (
                                  <div className="py-8 flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-xl">
                                    <MessageSquareQuote size={24} className="mb-2" /><span className="text-xs">暂无数据</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="flex flex-col items-center justify-center h-full py-20">
    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
      <LayoutDashboard size={40} className="text-indigo-400" />
    </div>
    <h3 className="text-xl font-bold text-gray-900 mb-2">暂无项目</h3>
    <p className="text-gray-500 mb-6">创建一个新项目开始管理VOC洞察</p>
    <Button onClick={onCreate} className="bg-indigo-600 hover:bg-indigo-700"><Plus size={18} className="mr-2" />新建项目</Button>
  </div>
);

// --- Main ---
const Home = () => {
  const [projects, setProjects] = React.useState<Project[]>(DEFAULT_PROJECTS);
  const [activeProject, setActiveProject] = React.useState<Project>(DEFAULT_PROJECTS[0]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [projectToDelete, setProjectToDelete] = React.useState<Project | null>(null);
  const [isParsing, setIsParsing] = React.useState(false);
  const [isAddFileDialogOpen, setIsAddFileDialogOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('qualitative-insights');

  React.useEffect(() => {
    const saved = localStorage.getItem('insight_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProjects(parsed);
        if (parsed.length > 0) setActiveProject(parsed[0]);
      } catch { /* ignore */ }
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem('insight_projects', JSON.stringify(projects));
  }, [projects]);

  // keep activeProject in sync when projects change
  React.useEffect(() => {
    const fresh = projects.find(p => p.id === activeProject.id);
    if (fresh && fresh !== activeProject) setActiveProject(fresh);
  }, [projects]);

  const handleCreateProject = (newProject: Omit<Project, 'id' | 'parsedVOCs'>) => {
    const project: Project = { ...newProject, id: `proj-${Date.now()}`, parsedVOCs: [] };
    setProjects(prev => [...prev, project]);
    setActiveProject(project);
    toast.success('项目创建成功');
  };

  const handleDeleteProject = (project: Project) => { setProjectToDelete(project); setIsDeleteDialogOpen(true); };

  const confirmDeleteProject = () => {
    if (!projectToDelete) return;
    const newProjects = projects.filter(p => p.id !== projectToDelete.id);
    setProjects(newProjects);
    if (activeProject.id === projectToDelete.id && newProjects.length > 0) setActiveProject(newProjects[0]);
    toast.success('项目已删除');
    setIsDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  const parseFilesWithAI = async (filesToParse: File[]): Promise<VOCItem[]> => {
    const allVOCs: VOCItem[] = [];
    for (const file of filesToParse) {
      toast.info(`正在AI解析: ${file.name}...`);
      try {
        const ft = getFileType(file.name);
        const result = ft === 'audio' || ft === 'video'
          ? await apiTranscribe(file)
          : await apiParseDocument(file);
        allVOCs.push(...(result.vocList as VOCItem[]));
        toast.success(`"${file.name}" 解析完成，提取 ${result.vocList.length} 条VOC`);
      } catch (err) {
        toast.error(`"${file.name}" 解析失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    }
    return allVOCs;
  };

  const handleParseAndCreate = async (projectData: Omit<Project, 'id' | 'parsedVOCs'>, realFiles: File[]) => {
    setIsParsing(true);
    try {
      const parsedVOCs = await parseFilesWithAI(realFiles);
      const project: Project = { ...projectData, id: `proj-${Date.now()}`, parsedVOCs };
      setProjects(prev => [...prev, project]);
      setActiveProject(project);
      toast.success(`项目创建成功，共解析 ${parsedVOCs.length} 条VOC数据`);
    } catch {
      const project: Project = { ...projectData, id: `proj-${Date.now()}`, parsedVOCs: [] };
      setProjects(prev => [...prev, project]);
      setActiveProject(project);
    } finally {
      setIsParsing(false);
    }
  };

  const handleAddFilesToProject = async (realFiles: File[], links: { name: string; link: string }[], parseImmediately: boolean) => {
    const newProjectFiles: ProjectFile[] = [
      ...realFiles.map((f, i) => ({ id: `file-${Date.now()}-${i}`, name: f.name, type: getFileType(f.name) as const })),
      ...links.map((l, i) => ({ id: `link-${Date.now()}-${i}`, name: l.name, feishuLink: l.link, type: 'document' as const })),
    ];

    setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, files: [...p.files, ...newProjectFiles] } : p));
    toast.success(`已添加 ${newProjectFiles.length} 个文件`);

    if (parseImmediately && realFiles.length > 0) {
      setIsParsing(true);
      try {
        const newVOCs = await parseFilesWithAI(realFiles);
        setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, parsedVOCs: [...p.parsedVOCs, ...newVOCs] } : p));
        toast.success(`解析完成，共提取 ${newVOCs.length} 条VOC数据`);
      } finally {
        setIsParsing(false);
      }
    }
  };

  const handleDeleteFile = (fileId: string) => {
    setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, files: p.files.filter(f => f.id !== fileId) } : p));
    toast.success('文件已删除');
  };

  const handleParseFiles = async () => {
    toast.info('请通过「添加文件」上传需要解析的文件');
    setIsAddFileDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex">
      <Sidebar projects={projects} activeProject={activeProject} onProjectChange={setActiveProject} onCreateProject={() => setIsCreateDialogOpen(true)} onDeleteProject={handleDeleteProject} activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 ml-64 overflow-y-auto h-screen bg-gray-50/50">
        {projects.length === 0 ? (
          <EmptyState onCreate={() => setIsCreateDialogOpen(true)} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={`${activeProject.id}-${activeTab}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.3 }}>
              {activeTab === 'qualitative-insights' && (
                <InsightsPage project={activeProject} onParseFiles={handleParseFiles} onAddFiles={() => setIsAddFileDialogOpen(true)} onDeleteFile={handleDeleteFile} />
              )}
              {activeTab === 'qualitative-report' && (
                <QualitativeReport project={activeProject} />
              )}
              {activeTab === 'quantitative-report' && (
                <QuantitativeReport project={activeProject} />
              )}
              {activeTab === 'project-summary' && (
                <ProjectSummary project={activeProject} />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
      <CreateProjectDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onCreate={handleCreateProject} isParsing={isParsing} onParseAndCreate={handleParseAndCreate} />
      <DeleteConfirmDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen} onConfirm={confirmDeleteProject} projectName={projectToDelete?.name || ''} />
      <AddFileDialog open={isAddFileDialogOpen} onOpenChange={setIsAddFileDialogOpen} projectName={activeProject.name} onAddFiles={handleAddFilesToProject} isParsing={isParsing} />
    </div>
  );
};

export default Home;
