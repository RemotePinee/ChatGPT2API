"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ImageIcon,
  Infinity as InfinityIcon,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Ticket,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  batchCreateCDK,
  deleteCDK,
  fetchCDKList,
  fetchCDKStats,
  updateCDK,
  type AccountTier,
  type CDKCode,
  type CDKStats,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

// 账号等级选项
const ACCOUNT_TIER_OPTIONS: Array<{ value: AccountTier; label: string; hint: string }> = [
  { value: "free", label: "普通", hint: "仅使用 free 账号" },
  { value: "premium", label: "高级", hint: "可使用 Plus / Pro" },
];

// 配额类型定义
type QuotaKind =
  | "image_daily"
  | "image_monthly"
  | "image_total"
  | "chat_daily"
  | "chat_monthly"
  | "chat_total";

type QuotaMeta = {
  kind: QuotaKind;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

const IMAGE_QUOTA_KINDS: QuotaMeta[] = [
  {
    kind: "image_daily",
    label: "画图日限额",
    hint: "每日 0 点重置",
    icon: ImageIcon,
  },
  {
    kind: "image_monthly",
    label: "画图月限额",
    hint: "每月 1 日重置",
    icon: ImageIcon,
  },
  {
    kind: "image_total",
    label: "画图总额度",
    hint: "永久计数，需管理员追加",
    icon: ImageIcon,
  },
];

const CHAT_QUOTA_KINDS: QuotaMeta[] = [
  {
    kind: "chat_daily",
    label: "对话日限额",
    hint: "每日 0 点重置",
    icon: MessageSquare,
  },
  {
    kind: "chat_monthly",
    label: "对话月限额",
    hint: "每月 1 日重置",
    icon: MessageSquare,
  },
  {
    kind: "chat_total",
    label: "对话总额度",
    hint: "永久计数，需管理员追加",
    icon: MessageSquare,
  },
];

type QuotaFormState = Record<QuotaKind, { quota: string; unlimited: boolean }>;

function defaultQuotaForm(): QuotaFormState {
  return {
    image_daily: { quota: "", unlimited: true },
    image_monthly: { quota: "", unlimited: true },
    image_total: { quota: "100", unlimited: false },
    chat_daily: { quota: "", unlimited: true },
    chat_monthly: { quota: "", unlimited: true },
    chat_total: { quota: "", unlimited: true },
  };
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  } catch {
    toast.error("复制失败");
  }
}

// 配额组组件（与用户密钥创建对话框相同）
function QuotaGroup({
  title,
  groupHint,
  kinds,
  form,
  onChange,
}: {
  title: string;
  groupHint: string;
  kinds: QuotaMeta[];
  form: QuotaFormState;
  onChange: (kind: QuotaKind, patch: Partial<QuotaFormState[QuotaKind]>) => void;
}) {
  const GroupIcon = kinds.some((meta) => meta.kind.startsWith("image")) ? ImageIcon : MessageSquare;

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-stone-200 bg-gradient-to-br from-stone-50 to-stone-100/50 px-5 py-4">
        <div className="flex size-10 items-center justify-center rounded-xl border border-stone-200 bg-white shadow-sm">
          <GroupIcon className="size-5 text-stone-700" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-stone-900">{title}</div>
          <div className="text-xs text-stone-600">{groupHint}</div>
        </div>
      </div>
      <div className="divide-y divide-stone-100">
        {kinds.map((meta) => {
          const Icon = meta.icon;
          const conf = form[meta.kind];
          return (
            <div
              key={meta.kind}
              className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(200px,1fr)_minmax(140px,180px)_140px] sm:items-center"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-stone-100">
                  <Icon className="size-4 text-stone-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-stone-900">{meta.label}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-stone-500">{meta.hint}</div>
                </div>
              </div>
              <Input
                type="number"
                min={0}
                value={conf.quota}
                onChange={(event) => onChange(meta.kind, { quota: event.target.value })}
                disabled={conf.unlimited}
                placeholder="例如：100"
                className="h-11 rounded-xl border-stone-300 bg-white font-mono text-sm tabular-nums shadow-sm transition-colors disabled:bg-stone-100 disabled:text-stone-400"
              />
              <label
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-between gap-2 rounded-xl border px-3.5 text-sm font-medium transition-all",
                  conf.unlimited
                    ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                    : "border-stone-300 bg-white text-stone-700 shadow-sm hover:border-stone-400 hover:bg-stone-50",
                )}
              >
                <Checkbox
                  checked={conf.unlimited}
                  onCheckedChange={(checked) => onChange(meta.kind, { unlimited: Boolean(checked) })}
                  className={cn(
                    "transition-colors",
                    conf.unlimited ? "border-white bg-white text-stone-900" : "border-stone-400 bg-white"
                  )}
                />
                <span>不限额</span>
                {conf.unlimited ? <InfinityIcon className="size-4" /> : null}
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// 账号等级选择器组件
function AccountTierSelect({
  value,
  onChange,
}: {
  value: AccountTier;
  onChange: (value: AccountTier) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold tracking-wide text-stone-500 uppercase">账号权限</label>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-1">
        {ACCOUNT_TIER_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-xl px-3 text-left transition",
                selected
                  ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
                  : "text-stone-500 hover:bg-white/70 hover:text-stone-800",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {selected ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : null}
                {option.label}
              </span>
              <span className="mt-0.5 line-clamp-1 text-[11px] leading-4">{option.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CDKManagementCard() {
  const [items, setItems] = useState<CDKCode[]>([]);
  const [stats, setStats] = useState<CDKStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 批量生成对话框
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [batchCount, setBatchCount] = useState("1");
  const [batchUsageType, setBatchUsageType] = useState<"single" | "multiple">("single");
  const [batchMaxUses, setBatchMaxUses] = useState("100");
  const [batchCustomCode, setBatchCustomCode] = useState("");
  const [batchAccountTier, setBatchAccountTier] = useState<AccountTier>("free");
  const [quotaForm, setQuotaForm] = useState<QuotaFormState>(defaultQuotaForm());
  const [isCreating, setIsCreating] = useState(false);

  const updateQuotaField = (kind: QuotaKind, patch: Partial<QuotaFormState[QuotaKind]>) => {
    setQuotaForm((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], ...patch },
    }));
  };

  // 生成结果对话框
  const [generatedCodes, setGeneratedCodes] = useState<CDKCode[]>([]);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);

  // 删除对话框
  const [deletingItem, setDeletingItem] = useState<CDKCode | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // 编辑对话框
  const [editingItem, setEditingItem] = useState<CDKCode | null>(null);
  const [editAccountTier, setEditAccountTier] = useState<AccountTier>("free");
  const [editQuotaForm, setEditQuotaForm] = useState<QuotaFormState>(defaultQuotaForm());
  const [editMaxUses, setEditMaxUses] = useState("0");
  const [editExpiresAt, setEditExpiresAt] = useState("");

  const updateEditQuotaField = (kind: QuotaKind, patch: Partial<QuotaFormState[QuotaKind]>) => {
    setEditQuotaForm((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], ...patch },
    }));
  };

  const filteredItems = items.filter((item) => {
    const matchQuery = query === "" || item.id.toLowerCase().includes(query.toLowerCase());
    const matchStatus = statusFilter === "all" || item.status === statusFilter;
    return matchQuery && matchStatus;
  });

  const paginatedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [listData, statsData] = await Promise.all([
        fetchCDKList({ limit: 500, offset: 0 }),
        fetchCDKStats(),
      ]);
      setItems(listData.items);
      setTotal(listData.total);
      setStats(statsData.stats);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载 CDK 列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleBatchCreate = async () => {
    const count = parseInt(batchCount, 10);
    if (isNaN(count) || count < 1 || count > 1000) {
      toast.error("CDK 数量必须在 1-1000 之间");
      return;
    }

    // 验证营销 CDK 参数
    if (batchUsageType === "multiple") {
      const maxUses = parseInt(batchMaxUses, 10);
      if (isNaN(maxUses) || maxUses < 0) {
        toast.error("请输入有效的最大使用次数（0=无限）");
        return;
      }

      if (batchCustomCode && count !== 1) {
        toast.error("自定义 CDK 码仅支持生成 1 个营销 CDK");
        return;
      }

      if (batchCustomCode) {
        const normalized = batchCustomCode.trim().toUpperCase();
        if (normalized.length < 4 || normalized.length > 32) {
          toast.error("自定义 CDK 码长度必须在 4-32 字符之间");
          return;
        }
        if (!/^[A-Z0-9]+$/.test(normalized)) {
          toast.error("自定义 CDK 码仅支持大写字母和数字");
          return;
        }
      }
    }

    // 构建配额配置
    const readQuota = (value: string) => Math.max(0, parseInt(value, 10) || 0);

    setIsCreating(true);
    try {
      const data = await batchCreateCDK({
        count,
        usage_type: batchUsageType,
        max_uses: batchUsageType === "multiple" ? parseInt(batchMaxUses, 10) : 0,
        custom_code: batchUsageType === "multiple" && batchCustomCode ? batchCustomCode.trim() : null,
        quota_config: {
          account_tier: batchAccountTier,
          image_daily_quota: readQuota(quotaForm.image_daily.quota),
          image_daily_unlimited: quotaForm.image_daily.unlimited,
          image_monthly_quota: readQuota(quotaForm.image_monthly.quota),
          image_monthly_unlimited: quotaForm.image_monthly.unlimited,
          image_total_quota: readQuota(quotaForm.image_total.quota),
          image_total_unlimited: quotaForm.image_total.unlimited,
          chat_daily_quota: readQuota(quotaForm.chat_daily.quota),
          chat_daily_unlimited: quotaForm.chat_daily.unlimited,
          chat_monthly_quota: readQuota(quotaForm.chat_monthly.quota),
          chat_monthly_unlimited: quotaForm.chat_monthly.unlimited,
          chat_total_quota: readQuota(quotaForm.chat_total.quota),
          chat_total_unlimited: quotaForm.chat_total.unlimited,
        },
      });

      setGeneratedCodes(data.items);
      setStats(data.stats);
      setIsBatchDialogOpen(false);
      setIsResultDialogOpen(true);
      void loadData();
      toast.success(`成功生成 ${count} 个 CDK`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成 CDK 失败");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;

    const isUsed = deletingItem.status === "used";
    setPendingIds((prev) => new Set(prev).add(deletingItem.id));
    try {
      const data = await deleteCDK(deletingItem.id, isUsed);
      setStats(data.stats);
      setDeletingItem(null);
      void loadData();
      toast.success("CDK 已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除 CDK 失败");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingItem.id);
        return next;
      });
    }
  };

  const handleEdit = (item: CDKCode) => {
    setEditingItem(item);

    // 设置账号等级
    setEditAccountTier((item.quota_config?.account_tier as AccountTier) || "free");

    // 设置最大使用次数
    setEditMaxUses(String(item.max_uses || 0));

    // 设置过期时间
    setEditExpiresAt(item.expires_at ? new Date(item.expires_at).toISOString().slice(0, 16) : "");

    // 设置配额表单
    const config = item.quota_config || {};
    setEditQuotaForm({
      image_daily: {
        quota: String(config.image_daily_quota || 0),
        unlimited: config.image_daily_unlimited || false,
      },
      image_monthly: {
        quota: String(config.image_monthly_quota || 0),
        unlimited: config.image_monthly_unlimited || false,
      },
      image_total: {
        quota: String(config.image_total_quota || 0),
        unlimited: config.image_total_unlimited || false,
      },
      chat_daily: {
        quota: String(config.chat_daily_quota || 0),
        unlimited: config.chat_daily_unlimited || false,
      },
      chat_monthly: {
        quota: String(config.chat_monthly_quota || 0),
        unlimited: config.chat_monthly_unlimited || false,
      },
      chat_total: {
        quota: String(config.chat_total_quota || 0),
        unlimited: config.chat_total_unlimited || false,
      },
    });
  };

  const handleUpdate = async () => {
    if (!editingItem) return;

    setPendingIds((prev) => new Set(prev).add(editingItem.id));
    try {
      // 构建配额配置
      const quota_config = {
        account_tier: editAccountTier,
        image_daily_quota: parseInt(editQuotaForm.image_daily.quota) || 0,
        image_daily_unlimited: editQuotaForm.image_daily.unlimited,
        image_monthly_quota: parseInt(editQuotaForm.image_monthly.quota) || 0,
        image_monthly_unlimited: editQuotaForm.image_monthly.unlimited,
        image_total_quota: parseInt(editQuotaForm.image_total.quota) || 0,
        image_total_unlimited: editQuotaForm.image_total.unlimited,
        chat_daily_quota: parseInt(editQuotaForm.chat_daily.quota) || 0,
        chat_daily_unlimited: editQuotaForm.chat_daily.unlimited,
        chat_monthly_quota: parseInt(editQuotaForm.chat_monthly.quota) || 0,
        chat_monthly_unlimited: editQuotaForm.chat_monthly.unlimited,
        chat_total_quota: parseInt(editQuotaForm.chat_total.quota) || 0,
        chat_total_unlimited: editQuotaForm.chat_total.unlimited,
      };

      const data = await updateCDK(editingItem.id, {
        expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
        max_uses: editingItem.usage_type === "multiple" ? parseInt(editMaxUses) || 0 : undefined,
        quota_config,
      });

      setStats(data.stats);
      setEditingItem(null);
      void loadData();
      toast.success("CDK 已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新 CDK 失败");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(editingItem.id);
        return next;
      });
    }
  };

  const handleCopyAll = () => {
    const codes = generatedCodes.map((c) => c.code).join("\n");
    void copyToClipboard(codes);
  };

  const handleExportCSV = () => {
    const csv = [
      "CDK兑换码,状态,账号等级,画图总额度,创建时间",
      ...generatedCodes.map((c) =>
        [
          c.code,
          c.status === "active" ? "未使用" : c.status === "used" ? "已使用" : "已过期",
          c.quota_config.account_tier === "premium" ? "高级" : "普通",
          c.quota_config.image_total_unlimited ? "不限" : c.quota_config.image_total_quota,
          new Date(c.created_at).toLocaleString("zh-CN"),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cdk-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("已导出 CSV 文件");
  };

  return (
    <>
      <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="space-y-5 p-6">
          {/* 头部 */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-stone-100">
                <Ticket className="size-5 text-stone-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">CDK 兑换码管理</h2>
                <p className="text-sm text-stone-500">批量生成兑换码，用户自助注册获取密钥。</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="h-9 rounded-xl bg-stone-950 px-4 text-white hover:bg-stone-800"
                onClick={() => setIsBatchDialogOpen(true)}
              >
                <Plus className="size-4" />
                生成 CDK
              </Button>
            </div>
          </div>

          {/* 统计卡片 */}
          {stats && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50/50 px-4 py-3">
                <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">总计</div>
                <div className="mt-1 text-2xl font-bold text-stone-900">{stats.total}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                <div className="text-xs font-semibold tracking-wide text-emerald-600 uppercase">未使用</div>
                <div className="mt-1 text-2xl font-bold text-emerald-700">{stats.active}</div>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3">
                <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase">已使用</div>
                <div className="mt-1 text-2xl font-bold text-blue-700">{stats.used}</div>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50/50 px-4 py-3">
                <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">已过期</div>
                <div className="mt-1 text-2xl font-bold text-stone-600">{stats.expired}</div>
              </div>
            </div>
          )}

          {/* 筛选 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-[200px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="按 ID 搜索"
                className="h-9 w-full rounded-xl border-stone-200 bg-white/85 pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}>
              <SelectTrigger className="h-9 w-[140px] rounded-xl border-stone-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">未使用</SelectItem>
                <SelectItem value="used">已使用</SelectItem>
                <SelectItem value="expired">已过期</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 列表 */}
          {isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-stone-400" />
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-stone-500">
              暂无 CDK 记录
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-stone-900">
                        {item.code || item.id}
                        {!item.code && <span className="ml-2 text-xs text-red-500">(no code)</span>}
                      </code>
                      {item.status === "active" && (
                        <Badge className="h-5 rounded-md bg-emerald-100 px-2 text-xs text-emerald-700">
                          <CheckCircle2 className="mr-1 size-3" />
                          未使用
                        </Badge>
                      )}
                      {item.status === "used" && (
                        <Badge className="h-5 rounded-md bg-blue-100 px-2 text-xs text-blue-700">
                          <CheckCircle2 className="mr-1 size-3" />
                          已使用
                        </Badge>
                      )}
                      {item.status === "expired" && (
                        <Badge className="h-5 rounded-md bg-stone-100 px-2 text-xs text-stone-600">
                          <XCircle className="mr-1 size-3" />
                          已过期
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                      <span>
                        类型：{item.usage_type === "multiple" ? "营销 CDK" : "普通 CDK"}
                      </span>
                      {item.usage_type === "multiple" && (
                        <span>
                          使用次数：{item.current_uses}
                          {item.max_uses > 0 ? ` / ${item.max_uses}` : " / 无限"}
                        </span>
                      )}
                      <span>
                        账号等级：
                        {item.quota_config.account_tier === "premium" ? "高级" : "普通"}
                      </span>
                      <span>
                        画图额度：
                        {item.quota_config.image_total_unlimited
                          ? "不限"
                          : item.quota_config.image_total_quota}
                      </span>
                      <span>
                        <CalendarClock className="mr-1 inline size-3" />
                        {new Date(item.created_at).toLocaleString("zh-CN")}
                      </span>
                      {item.used_at && item.usage_type === "single" && (
                        <span>使用：{new Date(item.used_at).toLocaleString("zh-CN")}</span>
                      )}
                      {item.used_by_name && item.usage_type === "single" && (
                        <span>用户：{item.used_by_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === "active" && item.code && (
                      <Button
                        variant="outline"
                        className="h-8 rounded-lg border-stone-200 px-3 text-xs text-stone-600 hover:bg-stone-50"
                        onClick={() => item.code && void copyToClipboard(item.code)}
                      >
                        <Copy className="size-3" />
                      </Button>
                    )}
                    {item.status === "active" && (
                      <Button
                        variant="outline"
                        className="h-8 rounded-lg border-blue-200 px-3 text-xs text-blue-600 hover:bg-blue-50"
                        onClick={() => handleEdit(item)}
                        disabled={pendingIds.has(item.id)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="h-8 rounded-lg border-rose-200 px-3 text-xs text-rose-600 hover:bg-rose-50"
                      onClick={() => setDeletingItem(item)}
                      disabled={pendingIds.has(item.id)}
                    >
                      {pendingIds.has(item.id) ? (
                        <LoaderCircle className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-stone-200 pt-4">
              <p className="text-sm text-stone-500">
                第 {page} / {totalPages} 页，共 {filteredItems.length} 条
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="h-8 rounded-lg px-3"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 rounded-lg px-3"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 批量生成对话框 */}
      <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
        <DialogContent className="w-[min(94vw,980px)] max-h-[90vh] gap-0 overflow-hidden rounded-[24px] bg-white p-0 sm:max-w-none">
          <DialogHeader className="border-b border-stone-200/80 bg-stone-50/70 px-6 py-5 pr-14 sm:px-7">
            <div className="flex items-start gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-stone-200 bg-white text-stone-800 shadow-sm">
                <Ticket className="size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[22px] leading-7">生成 CDK</DialogTitle>
                <DialogDescription className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
                  配置兑换码的使用规则和用户额度，生成后可分发给用户兑换
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="max-h-[calc(90vh-154px)] overflow-y-auto px-6 py-5 sm:px-7">
            <div className="space-y-5">
            {/* 基础设置 */}
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">基础设置</h3>
                <p className="mt-0.5 text-xs leading-5 text-stone-500">设置 CDK 类型、生成数量和账号权限</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold tracking-wide text-stone-500 uppercase">CDK 类型</label>
                  <Select
                    value={batchUsageType}
                    onValueChange={(v: "single" | "multiple") => {
                      setBatchUsageType(v);
                      if (v === "multiple") {
                        setBatchCount("1");
                      }
                    }}
                  >
                    <SelectTrigger className="h-12 rounded-2xl border-stone-200 bg-white shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">普通 CDK（单次使用）</SelectItem>
                      <SelectItem value="multiple">营销 CDK（多次使用）</SelectItem>
                    </SelectContent>
                  </Select>
                  {batchUsageType === "multiple" && (
                    <p className="text-xs text-stone-500">
                      营销 CDK 可被多人兑换，适用于推广活动
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold tracking-wide text-stone-500 uppercase">生成数量</label>
                  <Input
                    type="number"
                    value={batchCount}
                    onChange={(e) => setBatchCount(e.target.value)}
                    className="h-12 rounded-2xl border-stone-200 bg-white shadow-none"
                    min="1"
                    max="1000"
                    placeholder="1-1000"
                    disabled={batchUsageType === "multiple"}
                  />
                  {batchUsageType === "multiple" && (
                    <p className="text-xs text-amber-600">
                      营销 CDK 仅能生成 1 个
                    </p>
                  )}
                </div>
              </div>

              {batchUsageType === "multiple" && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold tracking-wide text-stone-500 uppercase">最大使用次数</label>
                    <Input
                      type="number"
                      value={batchMaxUses}
                      onChange={(e) => setBatchMaxUses(e.target.value)}
                      className="h-12 rounded-2xl border-stone-200 bg-white shadow-none"
                      min="0"
                      placeholder="0 表示无限次数"
                    />
                    <p className="text-xs text-stone-500">
                      设置为 0 表示不限次数，具体数字限制兑换次数
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold tracking-wide text-stone-500 uppercase">自定义 CDK 码（可选）</label>
                    <Input
                      type="text"
                      value={batchCustomCode}
                      onChange={(e) => setBatchCustomCode(e.target.value.toUpperCase())}
                      className="h-12 rounded-2xl border-stone-200 bg-white font-mono uppercase shadow-none"
                      placeholder="如：SUMMER2024"
                      maxLength={32}
                    />
                    <p className="text-xs text-stone-500">
                      仅支持大写字母和数字，长度 4-32 字符
                    </p>
                  </div>
                </div>
              )}

              <AccountTierSelect value={batchAccountTier} onChange={setBatchAccountTier} />
            </section>

            {/* 画图额度配置 */}
            <QuotaGroup
              title="画图额度"
              groupHint="设置兑换后用户的画图配额"
              kinds={IMAGE_QUOTA_KINDS}
              form={quotaForm}
              onChange={updateQuotaField}
            />

            {/* 对话额度配置 */}
            <QuotaGroup
              title="对话额度"
              groupHint="设置兑换后用户的对话配额"
              kinds={CHAT_QUOTA_KINDS}
              form={quotaForm}
              onChange={updateQuotaField}
            />
            </div>
          </div>
          <DialogFooter className="border-t border-stone-200/80 bg-white px-6 py-4 sm:px-7">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBatchDialogOpen(false)}
              disabled={isCreating}
              className="h-10 min-w-[100px] rounded-xl border-stone-300"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void handleBatchCreate()}
              disabled={isCreating}
              className="h-10 min-w-[120px] rounded-xl bg-stone-900 hover:bg-stone-800"
            >
              {isCreating ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  生成 CDK
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 生成结果对话框 */}
      <Dialog open={isResultDialogOpen} onOpenChange={setIsResultDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden rounded-2xl sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>CDK 生成成功</DialogTitle>
            <DialogDescription>
              已生成 {generatedCodes.length} 个 CDK，可在下方列表中查看和管理。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto py-4">
            {generatedCodes.map((code, index) => (
              <div
                key={code.id}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
              >
                <code className="text-sm font-mono">{code.code}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => code.code && void copyToClipboard(code.code)}
                  className="h-7 px-2"
                >
                  <Copy className="size-3" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleExportCSV}
              className="rounded-xl"
            >
              导出 CSV
            </Button>
            <Button
              variant="outline"
              onClick={handleCopyAll}
              className="rounded-xl"
            >
              <Copy className="size-4" />
              复制全部
            </Button>
            <Button
              onClick={() => setIsResultDialogOpen(false)}
              className="rounded-xl bg-stone-950 hover:bg-stone-800"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={Boolean(deletingItem)} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>删除 CDK</DialogTitle>
            <DialogDescription asChild>
              {deletingItem?.status === "used" ? (
                <div className="space-y-2">
                  <div className="text-amber-600 font-semibold">
                    ⚠️ 警告：此 CDK 已被使用
                  </div>
                  <div>
                    确认删除 CDK 「{deletingItem?.code || deletingItem?.id}」吗？
                  </div>
                  <div className="text-sm">
                    此操作不可撤销。删除已使用的 CDK 不会影响已创建的用户账号，但会清除 CDK 使用记录。
                  </div>
                  {deletingItem?.usage_type === "single" && deletingItem?.used_by_name && (
                    <div className="text-xs text-stone-600">
                      使用用户：{deletingItem.used_by_name} •
                      使用时间：{deletingItem.used_at ? new Date(deletingItem.used_at).toLocaleString("zh-CN") : "未知"}
                    </div>
                  )}
                  {deletingItem?.usage_type === "multiple" && (
                    <div className="text-xs text-stone-600">
                      已使用次数：{deletingItem.current_uses} 次
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  确认删除 CDK 「{deletingItem?.code || deletingItem?.id}」吗？此操作不可撤销。
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDeletingItem(null)}
              disabled={deletingItem ? pendingIds.has(deletingItem.id) : false}
              className="rounded-xl"
            >
              取消
            </Button>
            <Button
              onClick={() => void handleDelete()}
              disabled={deletingItem ? pendingIds.has(deletingItem.id) : false}
              className="rounded-xl bg-rose-600 hover:bg-rose-700"
            >
              {deletingItem && pendingIds.has(deletingItem.id) ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {deletingItem?.status === "used" ? "强制删除" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑 CDK 对话框 */}
      <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="w-[min(94vw,980px)] max-h-[90vh] gap-0 overflow-hidden rounded-[24px] bg-white p-0 sm:max-w-none">
          <DialogHeader className="border-b border-stone-200/80 bg-stone-50/70 px-6 py-5 pr-14 sm:px-7">
            <div className="flex items-start gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-stone-200 bg-white text-stone-800 shadow-sm">
                <Pencil className="size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[22px] leading-7">编辑 CDK</DialogTitle>
                <DialogDescription className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
                  修改兑换码 「{editingItem?.code || editingItem?.id}」 的使用规则和用户额度
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[calc(90vh-154px)] overflow-y-auto px-6 py-5 sm:px-7">
            <div className="space-y-5">
              {/* 基础设置 */}
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">基础设置</h3>
                  <p className="mt-0.5 text-xs leading-5 text-stone-500">修改 CDK 的基础配置和账号权限</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* CDK 类型（只读） */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold tracking-wide text-stone-500 uppercase">CDK 类型</label>
                    <div className="flex h-12 items-center rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm text-stone-600">
                      {editingItem?.usage_type === "multiple" ? "营销 CDK（多次使用）" : "普通 CDK（单次使用）"}
                    </div>
                    <p className="text-xs text-stone-500">
                      CDK 类型创建后无法修改
                    </p>
                  </div>

                  {/* 过期时间 */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold tracking-wide text-stone-500 uppercase">过期时间</label>
                    <Input
                      type="datetime-local"
                      value={editExpiresAt}
                      onChange={(e) => setEditExpiresAt(e.target.value)}
                      className="h-12 rounded-2xl border-stone-200 bg-white shadow-none"
                    />
                    <p className="text-xs text-stone-500">
                      留空表示永不过期
                    </p>
                  </div>
                </div>

                {/* 最大使用次数（仅多次使用类型） */}
                {editingItem?.usage_type === "multiple" && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold tracking-wide text-stone-500 uppercase">最大使用次数</label>
                    <Input
                      type="number"
                      value={editMaxUses}
                      onChange={(e) => setEditMaxUses(e.target.value)}
                      className="h-12 rounded-2xl border-stone-200 bg-white shadow-none"
                      min="0"
                      placeholder="0 表示无限次数"
                    />
                    <p className="text-xs text-stone-500">
                      当前已使用：{editingItem.current_uses} 次 • 设置为 0 表示不限次数
                    </p>
                  </div>
                )}

                <AccountTierSelect value={editAccountTier} onChange={setEditAccountTier} />
              </section>

              {/* 画图额度配置 */}
              <QuotaGroup
                title="画图额度"
                groupHint="设置兑换后用户的画图配额"
                kinds={IMAGE_QUOTA_KINDS}
                form={editQuotaForm}
                onChange={updateEditQuotaField}
              />

              {/* 对话额度配置 */}
              <QuotaGroup
                title="对话额度"
                groupHint="设置兑换后用户的对话配额"
                kinds={CHAT_QUOTA_KINDS}
                form={editQuotaForm}
                onChange={updateEditQuotaField}
              />
            </div>
          </div>

          <DialogFooter className="border-t border-stone-200/80 bg-white px-6 py-4 sm:px-7">
            <Button
              variant="outline"
              onClick={() => setEditingItem(null)}
              disabled={editingItem ? pendingIds.has(editingItem.id) : false}
              className="h-10 min-w-[100px] rounded-xl border-stone-300"
            >
              取消
            </Button>
            <Button
              onClick={() => void handleUpdate()}
              disabled={editingItem ? pendingIds.has(editingItem.id) : false}
              className="h-10 min-w-[120px] rounded-xl bg-blue-600 hover:bg-blue-700"
            >
              {editingItem && pendingIds.has(editingItem.id) ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Pencil className="size-4" />
                  保存修改
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
