"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
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
  createUserKey,
  deleteUserKey,
  fetchUserKeys,
  updateUserKey,
  type UserKey,
  type UserKeyCreatePayload,
  type UserKeyUpdatePayload,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// 模块级缓存：组件在路由切换里会被反复 mount，命中缓存直接给出已有 items，
// 避免每次设置页打开都从 isLoading=true / items=[] 起跳让卡片塌缩成 spinner。
let cachedItems: UserKey[] | null = null;

type ImageQuotaKind = "image_daily" | "image_monthly" | "image_total";
type ChatQuotaKind = "chat_daily" | "chat_monthly" | "chat_total";
type QuotaKind = ImageQuotaKind | ChatQuotaKind;

type QuotaMeta = {
  kind: QuotaKind;
  label: string;
  shortLabel: string;
  hint: string;
  icon: typeof ImageIcon;
  quotaField: keyof UserKey;
  usedField: keyof UserKey;
  unlimitedField: keyof UserKey;
  remainingField: keyof UserKey;
  quotaPayload: QuotaSharedPayloadKey;
  unlimitedPayload: QuotaSharedPayloadKey;
  resetPayload: QuotaResetPayloadKey;
};

type QuotaSharedPayloadKey = keyof Pick<
  UserKeyCreatePayload,
  | "image_daily_quota"
  | "image_daily_unlimited"
  | "image_monthly_quota"
  | "image_monthly_unlimited"
  | "image_total_quota"
  | "image_total_unlimited"
  | "chat_daily_quota"
  | "chat_daily_unlimited"
  | "chat_monthly_quota"
  | "chat_monthly_unlimited"
  | "chat_total_quota"
  | "chat_total_unlimited"
>;
type QuotaResetPayloadKey = keyof Pick<
  UserKeyUpdatePayload,
  | "reset_image_daily_used"
  | "reset_image_monthly_used"
  | "reset_image_total_used"
  | "reset_chat_daily_used"
  | "reset_chat_monthly_used"
  | "reset_chat_total_used"
>;

const IMAGE_QUOTA_KINDS: QuotaMeta[] = [
  {
    kind: "image_daily",
    label: "画图日限额",
    shortLabel: "日",
    hint: "每日 00:00 自动重置",
    icon: CalendarDays,
    quotaField: "image_daily_quota",
    usedField: "image_daily_used",
    unlimitedField: "image_daily_unlimited",
    remainingField: "image_daily_remaining",
    quotaPayload: "image_daily_quota",
    unlimitedPayload: "image_daily_unlimited",
    resetPayload: "reset_image_daily_used",
  },
  {
    kind: "image_monthly",
    label: "画图月限额",
    shortLabel: "月",
    hint: "每月 1 号 00:00 自动重置",
    icon: CalendarClock,
    quotaField: "image_monthly_quota",
    usedField: "image_monthly_used",
    unlimitedField: "image_monthly_unlimited",
    remainingField: "image_monthly_remaining",
    quotaPayload: "image_monthly_quota",
    unlimitedPayload: "image_monthly_unlimited",
    resetPayload: "reset_image_monthly_used",
  },
  {
    kind: "image_total",
    label: "画图总额度",
    shortLabel: "总",
    hint: "永久计数，需管理员追加",
    icon: ImageIcon,
    quotaField: "image_total_quota",
    usedField: "image_total_used",
    unlimitedField: "image_total_unlimited",
    remainingField: "image_total_remaining",
    quotaPayload: "image_total_quota",
    unlimitedPayload: "image_total_unlimited",
    resetPayload: "reset_image_total_used",
  },
];

const CHAT_QUOTA_KINDS: QuotaMeta[] = [
  {
    kind: "chat_daily",
    label: "对话日限额",
    shortLabel: "日",
    hint: "每日 00:00 自动重置",
    icon: CalendarDays,
    quotaField: "chat_daily_quota",
    usedField: "chat_daily_used",
    unlimitedField: "chat_daily_unlimited",
    remainingField: "chat_daily_remaining",
    quotaPayload: "chat_daily_quota",
    unlimitedPayload: "chat_daily_unlimited",
    resetPayload: "reset_chat_daily_used",
  },
  {
    kind: "chat_monthly",
    label: "对话月限额",
    shortLabel: "月",
    hint: "每月 1 号 00:00 自动重置",
    icon: CalendarClock,
    quotaField: "chat_monthly_quota",
    usedField: "chat_monthly_used",
    unlimitedField: "chat_monthly_unlimited",
    remainingField: "chat_monthly_remaining",
    quotaPayload: "chat_monthly_quota",
    unlimitedPayload: "chat_monthly_unlimited",
    resetPayload: "reset_chat_monthly_used",
  },
  {
    kind: "chat_total",
    label: "对话总额度",
    shortLabel: "总",
    hint: "永久计数，需管理员追加",
    icon: MessageSquare,
    quotaField: "chat_total_quota",
    usedField: "chat_total_used",
    unlimitedField: "chat_total_unlimited",
    remainingField: "chat_total_remaining",
    quotaPayload: "chat_total_quota",
    unlimitedPayload: "chat_total_unlimited",
    resetPayload: "reset_chat_total_used",
  },
];

const ALL_QUOTA_KINDS: QuotaMeta[] = [...IMAGE_QUOTA_KINDS, ...CHAT_QUOTA_KINDS];

type CreateFormState = Record<QuotaKind, { quota: string; unlimited: boolean }>;
type EditFormState = Record<
  QuotaKind,
  { quota: string; mode: "add" | "set"; unlimited: boolean; resetUsed: boolean }
>;

function defaultCreateForm(): CreateFormState {
  return {
    image_daily: { quota: "", unlimited: true },
    image_monthly: { quota: "", unlimited: true },
    image_total: { quota: "100", unlimited: false },
    chat_daily: { quota: "", unlimited: true },
    chat_monthly: { quota: "", unlimited: true },
    chat_total: { quota: "", unlimited: true },
  };
}

function buildEditForm(item: UserKey): EditFormState {
  return ALL_QUOTA_KINDS.reduce<EditFormState>((acc, meta) => {
    acc[meta.kind] = {
      quota: "",
      mode: "add",
      unlimited: Boolean(item[meta.unlimitedField]),
      resetUsed: false,
    };
    return acc;
  }, {} as EditFormState);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readNumber(value: unknown): number {
  return Math.max(0, Math.floor(Number(value || 0)));
}

const PAGE_SIZE_OPTIONS = ["10", "20", "50", "100"] as const;

export function UserKeysCard() {
  const didLoadRef = useRef(false);
  const [items, setItemsState] = useState<UserKey[]>(() => cachedItems ?? []);
  const [isLoading, setIsLoading] = useState(() => cachedItems === null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>("10");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [createForm, setCreateForm] = useState<CreateFormState>(defaultCreateForm);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [revealedKey, setRevealedKey] = useState("");
  const [deletingItem, setDeletingItem] = useState<UserKey | null>(null);
  const [editingItem, setEditingItem] = useState<UserKey | null>(null);
  const [editName, setEditName] = useState("");
  const [editKey, setEditKey] = useState("");
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  const setItems = (next: UserKey[]) => {
    cachedItems = next;
    setItemsState(next);
  };

  const load = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchUserKeys();
      setItems(data.items);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "加载用户密钥失败");
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    // 命中缓存时静默后台刷新，避免闪烁；首次进入则 spinner。
    // load 是组件作用域里每次渲染都会重建的闭包，但只在 mount 跑一次，
    // 这里有意省略依赖，用 ref 自守保证只跑一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void load(cachedItems !== null);
  }, []);

  // 搜索防抖：250ms 比较接近 SaaS 表格的体感最佳值，再短会让长名输入抖动一次。
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const filteredItems = useMemo(() => {
    if (!debouncedQuery) return items;
    return items.filter((item) => item.name.toLowerCase().includes(debouncedQuery));
  }, [items, debouncedQuery]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / Number(pageSize)));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * Number(pageSize);
  const currentRows = filteredItems.slice(startIndex, startIndex + Number(pageSize));

  const paginationItems = useMemo(() => {
    const items: (number | "...")[] = [];
    const start = Math.max(1, safePage - 1);
    const end = Math.min(pageCount, safePage + 1);
    if (start > 1) items.push(1);
    if (start > 2) items.push("...");
    for (let current = start; current <= end; current += 1) items.push(current);
    if (end < pageCount - 1) items.push("...");
    if (end < pageCount) items.push(pageCount);
    return items;
  }, [pageCount, safePage]);

  const updateCreateField = (kind: QuotaKind, patch: Partial<CreateFormState[QuotaKind]>) => {
    setCreateForm((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
  };

  const updateEditField = (kind: QuotaKind, patch: Partial<EditFormState[QuotaKind]>) => {
    setEditForm((prev) => (prev ? { ...prev, [kind]: { ...prev[kind], ...patch } } : prev));
  };

  const handleCreate = async () => {
    // 至少一档可用：要么不限，要么 quota>0；否则用户拿到一把"什么都干不了"的钥匙没意义。
    const hasAnyUsable = ALL_QUOTA_KINDS.some((meta) => {
      const conf = createForm[meta.kind];
      return conf.unlimited || readNumber(conf.quota) > 0;
    });
    if (!hasAnyUsable) {
      toast.error("请至少为画图或对话开启一个可用额度");
      return;
    }
    const payload: UserKeyCreatePayload = { name: name.trim() };
    const view = payload as Record<string, unknown>;
    ALL_QUOTA_KINDS.forEach((meta) => {
      const conf = createForm[meta.kind];
      view[meta.unlimitedPayload] = conf.unlimited;
      view[meta.quotaPayload] = conf.unlimited ? 0 : readNumber(conf.quota);
    });
    setIsCreating(true);
    try {
      const data = await createUserKey(payload);
      setItems(data.items);
      setRevealedKey(data.key);
      setName("");
      setCreateForm(defaultCreateForm());
      setIsDialogOpen(false);
      toast.success("用户密钥已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建用户密钥失败");
    } finally {
      setIsCreating(false);
    }
  };

  const setItemPending = (id: string, isPending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (isPending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleToggle = async (item: UserKey) => {
    setItemPending(item.id, true);
    try {
      const data = await updateUserKey(item.id, { enabled: !item.enabled });
      setItems(data.items);
      toast.success(item.enabled ? "用户密钥已禁用" : "用户密钥已启用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新用户密钥失败");
    } finally {
      setItemPending(item.id, false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    const item = deletingItem;
    setItemPending(item.id, true);
    try {
      const data = await deleteUserKey(item.id);
      setItems(data.items);
      setDeletingItem(null);
      toast.success("用户密钥已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除用户密钥失败");
    } finally {
      setItemPending(item.id, false);
    }
  };

  const openEditDialog = (item: UserKey) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditKey("");
    setEditForm(buildEditForm(item));
  };

  const closeEditDialog = () => {
    setEditingItem(null);
    setEditKey("");
    setEditForm(null);
  };

  const handleEdit = async () => {
    if (!editingItem || !editForm) return;
    const item = editingItem;
    const trimmedName = editName.trim();
    const trimmedKey = editKey.trim();
    const payload: UserKeyUpdatePayload = {};
    const view = payload as Record<string, unknown>;
    if (trimmedName !== item.name) payload.name = trimmedName;
    if (trimmedKey) payload.key = trimmedKey;

    let quotaTouched = false;
    // 取消"不限额"但没填新值的字段：聚合后统一报错，避免用户额度被静默改成 0。
    const missingValueLabels: string[] = [];
    for (const meta of ALL_QUOTA_KINDS) {
      const conf = editForm[meta.kind];
      const currentUnlimited = Boolean(item[meta.unlimitedField]);
      const currentQuota = readNumber(item[meta.quotaField]);
      const inputRaw = conf.quota.trim();
      const inputNum = inputRaw === "" ? 0 : readNumber(inputRaw);

      // 计算保存后的最终 quota：unlimited 档语义上 quota 不参与判断，统一记 0；
      // 否则根据 add / set 模式 + 是否填值，落到具体 quota 数。
      // 这一层的语义重点是"只看保存后是不是真的变了"，避免覆盖模式下输入与当前值相同也被判作改动而误丢弃。
      const nextUnlimited = conf.unlimited;
      let nextQuota = currentQuota;
      if (!conf.unlimited) {
        if (inputRaw === "") {
          // 留空：跟随当前；只有从不限切到限额且没填值才需要警告。
          nextQuota = currentQuota;
        } else if (conf.mode === "add") {
          nextQuota = Math.max(0, currentQuota + inputNum);
        } else {
          nextQuota = inputNum;
        }
      }

      if (nextUnlimited && !currentUnlimited) {
        // 切到不限：明确发 unlimited=true；quota 由后端忽略，不需要再发。
        view[meta.unlimitedPayload] = true;
        quotaTouched = true;
      } else if (!nextUnlimited && currentUnlimited) {
        // 切到限额：必须给一个 > 0 的具体值，否则用户拿到的是 0 额度，立刻不可用。
        if (inputRaw === "" || nextQuota <= 0) {
          missingValueLabels.push(meta.label);
          continue;
        }
        view[meta.unlimitedPayload] = false;
        view[meta.quotaPayload] = nextQuota;
        quotaTouched = true;
      } else if (!nextUnlimited && nextQuota !== currentQuota) {
        // 同样限额、quota 真的变了才发；覆盖模式下输入与当前值相同会落到这里被忽略，符合预期。
        view[meta.quotaPayload] = nextQuota;
        quotaTouched = true;
      }

      if (conf.resetUsed) {
        view[meta.resetPayload] = true;
        quotaTouched = true;
      }
    }

    if (missingValueLabels.length > 0) {
      toast.error(`${missingValueLabels.join("、")}：取消「不限额」时必须填一个大于 0 的额度`);
      return;
    }

    if (!payload.name && !payload.key && !quotaTouched) {
      // 真没改任何东西：静默关闭，不打扰用户。
      // 上面如果只是覆盖模式输入了与当前值相同的数字，也会落到这里——这是预期行为。
      closeEditDialog();
      return;
    }

    setItemPending(item.id, true);
    try {
      const data = await updateUserKey(item.id, payload);
      setItems(data.items);
      closeEditDialog();
      toast.success("用户密钥已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新用户密钥失败");
    } finally {
      setItemPending(item.id, false);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <>
      <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-stone-100">
                <KeyRound className="size-5 text-stone-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">用户密钥管理</h2>
                <p className="text-sm text-stone-500">
                  画图与对话各自支持日限额、月限额、总额度三档；任一档可独立勾选「不限额」。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    // 搜索条件改变即回到首页，避免在第 N 页搜出 1 条结果只能看到空白。
                    setPage(1);
                  }}
                  placeholder="按名称搜索"
                  className="h-9 w-full rounded-xl border-stone-200 bg-white/85 pl-10"
                />
              </div>
              <Button
                className="h-9 rounded-xl bg-stone-950 px-4 text-white hover:bg-stone-800"
                onClick={() => setIsDialogOpen(true)}
              >
                <Plus className="size-4" />
                创建用户密钥
              </Button>
            </div>
          </div>

          {revealedKey ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
              <div className="font-medium">新密钥仅展示一次，请立即保存：</div>
              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-white/80 p-3 md:flex-row md:items-center md:justify-between">
                <code className="break-all font-mono text-[13px]">{revealedKey}</code>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-xl border-emerald-200 bg-white px-4 text-emerald-700"
                  onClick={() => void handleCopy(revealedKey)}
                >
                  <Copy className="size-4" />
                  复制
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-stone-200">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <LoaderCircle className="size-5 animate-spin text-stone-400" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-left">
                    <thead className="border-b border-stone-200 bg-stone-50 text-[12px] font-medium text-stone-500">
                      <tr>
                        <th className="w-56 px-4 py-2.5 font-medium">名称</th>
                        <th className="w-24 px-4 py-2.5 font-medium">状态</th>
                        <th className="w-72 px-4 py-2.5 font-medium">画图额度</th>
                        <th className="w-72 px-4 py-2.5 font-medium">对话额度</th>
                        <th className="w-36 px-4 py-2.5 font-medium">创建时间</th>
                        <th className="w-36 px-4 py-2.5 font-medium">最近使用</th>
                        <th className="w-32 px-4 py-2.5 text-right font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRows.map((item) => (
                        <KeyRow
                          key={item.id}
                          item={item}
                          pending={pendingIds.has(item.id)}
                          onEdit={() => openEditDialog(item)}
                          onToggle={() => void handleToggle(item)}
                          onDelete={() => setDeletingItem(item)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {currentRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                    <div className="rounded-xl bg-stone-100 p-3 text-stone-500">
                      <Search className="size-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-stone-700">
                        {debouncedQuery ? "没有匹配的密钥" : "暂无普通用户密钥"}
                      </p>
                      <p className="text-sm text-stone-500">
                        {debouncedQuery
                          ? "调整搜索关键字后重试。"
                          : "点击右上角按钮即可创建并分发给其他人。"}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-4 py-3">
                  <div className="text-sm text-stone-500">
                    显示第 {filteredItems.length === 0 ? 0 : startIndex + 1} -{" "}
                    {Math.min(startIndex + Number(pageSize), filteredItems.length)} 条，共{" "}
                    {filteredItems.length} 条
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={pageSize}
                      onValueChange={(value) => {
                        setPageSize(value as (typeof PAGE_SIZE_OPTIONS)[number]);
                        // 切换页大小后第 N 页可能不存在，统一回到第 1 页。
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="h-9 w-[108px] rounded-lg border-stone-200 bg-white text-sm leading-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option} / 页
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 rounded-lg border-stone-200 bg-white"
                      disabled={safePage <= 1}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    {paginationItems.map((entry, index) =>
                      entry === "..." ? (
                        <span key={`ellipsis-${index}`} className="px-1 text-sm text-stone-400">
                          ...
                        </span>
                      ) : (
                        <Button
                          key={entry}
                          variant={entry === safePage ? "default" : "outline"}
                          className={cn(
                            "h-9 min-w-9 rounded-lg px-3",
                            entry === safePage
                              ? "bg-stone-950 text-white hover:bg-stone-800"
                              : "border-stone-200 bg-white text-stone-700",
                          )}
                          onClick={() => setPage(entry)}
                        >
                          {entry}
                        </Button>
                      ),
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 rounded-lg border-stone-200 bg-white"
                      disabled={safePage >= pageCount}
                      onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setName("");
            setCreateForm(defaultCreateForm());
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl p-6 sm:max-w-3xl">
          <DialogHeader className="gap-2">
            <DialogTitle>创建用户密钥</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              画图与对话独立计费，各支持日限额、月限额、总额度三档；任一档可单独勾选「不限额」。
              创建后会生成一条只能查看一次的原始密钥。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">名称（可选）</label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：设计同学 A、运营临时账号"
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
            </div>
            <QuotaGroupCreate
              title="画图额度"
              groupHint="按生成图片张数计数；与画图工作台、/v1/images/* 共享。"
              kinds={IMAGE_QUOTA_KINDS}
              form={createForm}
              onChange={updateCreateField}
            />
            <QuotaGroupCreate
              title="对话额度"
              groupHint="POST /api/chat/stream 每次请求扣 1。"
              kinds={CHAT_QUOTA_KINDS}
              form={createForm}
              onChange={updateCreateField}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-xl bg-stone-100 px-5 text-stone-700 hover:bg-stone-200"
              onClick={() => setIsDialogOpen(false)}
              disabled={isCreating}
            >
              取消
            </Button>
            <Button
              type="button"
              className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800"
              onClick={() => void handleCreate()}
              disabled={isCreating}
            >
              {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingItem)} onOpenChange={(open) => (!open ? setDeletingItem(null) : null)}>
        <DialogContent className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>删除用户密钥</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              确认删除用户密钥「{deletingItem?.name}」吗？删除后该密钥将无法继续调用接口。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-xl bg-stone-100 px-5 text-stone-700 hover:bg-stone-200"
              onClick={() => setDeletingItem(null)}
              disabled={deletingItem ? pendingIds.has(deletingItem.id) : false}
            >
              取消
            </Button>
            <Button
              type="button"
              className="h-10 rounded-xl bg-rose-600 px-5 text-white hover:bg-rose-700"
              onClick={() => void handleDelete()}
              disabled={deletingItem ? pendingIds.has(deletingItem.id) : false}
            >
              {deletingItem && pendingIds.has(deletingItem.id) ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingItem)} onOpenChange={(open) => (!open ? closeEditDialog() : null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl p-6 sm:max-w-3xl">
          <DialogHeader className="gap-2">
            <DialogTitle>编辑用户密钥</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              可以修改备注名称、各档额度、不限额开关，或更换专用密钥。空白栏位保持当前值不变。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">名称</label>
              <Input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="例如：设计同学 A、运营临时账号"
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
            </div>
            {editingItem && editForm ? (
              <>
                <QuotaGroupEdit
                  title="画图额度"
                  groupHint="按生成图片张数计数。"
                  kinds={IMAGE_QUOTA_KINDS}
                  item={editingItem}
                  form={editForm}
                  onChange={updateEditField}
                />
                <QuotaGroupEdit
                  title="对话额度"
                  groupHint="POST /api/chat/stream 每次请求扣 1。"
                  kinds={CHAT_QUOTA_KINDS}
                  item={editingItem}
                  form={editForm}
                  onChange={updateEditField}
                />
              </>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">新的专用密钥（可选）</label>
              <Input
                value={editKey}
                onChange={(event) => setEditKey(event.target.value)}
                placeholder="例如：sk-your-custom-user-key"
                className="h-11 rounded-xl border-stone-200 bg-white font-mono"
              />
              <p className="text-xs leading-5 text-stone-500">
                保存后旧密钥会立即失效，新密钥生效。系统仍只保存哈希，不会回显当前密钥。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-xl bg-stone-100 px-5 text-stone-700 hover:bg-stone-200"
              onClick={closeEditDialog}
              disabled={editingItem ? pendingIds.has(editingItem.id) : false}
            >
              取消
            </Button>
            <Button
              type="button"
              className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800"
              onClick={() => void handleEdit()}
              disabled={editingItem ? pendingIds.has(editingItem.id) : false}
            >
              {editingItem && pendingIds.has(editingItem.id) ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KeyRow({
  item,
  pending,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: UserKey;
  pending: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b border-stone-100 align-top text-sm even:bg-stone-50/40 hover:bg-stone-50">
      <td className="px-4 py-3">
        <div className="font-medium text-stone-800">{item.name}</div>
        <div className="mt-0.5 font-data text-[11px] text-stone-400">ID {item.id}</div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={item.enabled ? "success" : "secondary"} className="rounded-md">
          {item.enabled ? "已启用" : "已禁用"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <QuotaGroupSummary kinds={IMAGE_QUOTA_KINDS} item={item} />
      </td>
      <td className="px-4 py-3">
        <QuotaGroupSummary kinds={CHAT_QUOTA_KINDS} item={item} />
      </td>
      <td className="px-4 py-3 font-data text-xs text-stone-700">{formatDateTime(item.created_at)}</td>
      <td className="px-4 py-3 font-data text-xs text-stone-500">{formatDateTime(item.last_used_at)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-0.5 text-stone-500">
          <button
            type="button"
            className="cursor-pointer rounded-md p-1.5 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
            onClick={onEdit}
            disabled={pending}
            title="编辑"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Pencil className="size-4" />}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-md p-1.5 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
            onClick={onToggle}
            disabled={pending}
            title={item.enabled ? "禁用" : "启用"}
          >
            {item.enabled ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-md p-1.5 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            onClick={onDelete}
            disabled={pending}
            title="删除"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function QuotaGroupSummary({ kinds, item }: { kinds: QuotaMeta[]; item: UserKey }) {
  return (
    <div className="space-y-1">
      {kinds.map((meta) => {
        const unlimited = Boolean(item[meta.unlimitedField]);
        const quota = readNumber(item[meta.quotaField]);
        const used = readNumber(item[meta.usedField]);
        const remaining = unlimited ? null : Math.max(0, quota - used);
        const exhausted = !unlimited && remaining === 0;
        return (
          <div
            key={meta.kind}
            className="flex items-center justify-between gap-2 font-data text-[11.5px] text-stone-600"
          >
            <span className="inline-flex w-7 shrink-0 items-center justify-center rounded bg-stone-100 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-stone-500">
              {meta.shortLabel}
            </span>
            {unlimited ? (
              <span className="ml-auto inline-flex items-center gap-1.5 tabular-nums">
                <span className="text-stone-700">已用 {used}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                  <InfinityIcon className="size-3" />
                  不限
                </span>
              </span>
            ) : exhausted ? (
              <span className="ml-auto rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                已用完
              </span>
            ) : (
              <span className="ml-auto tabular-nums">
                <span className="text-stone-700">
                  {used}/{quota}
                </span>
                <span className="ml-1 text-stone-400">剩 {remaining}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QuotaGroupCreate({
  title,
  groupHint,
  kinds,
  form,
  onChange,
}: {
  title: string;
  groupHint: string;
  kinds: QuotaMeta[];
  form: CreateFormState;
  onChange: (kind: QuotaKind, patch: Partial<CreateFormState[QuotaKind]>) => void;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-stone-800">{title}</div>
        <span className="text-xs text-stone-500">{groupHint}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {kinds.map((meta) => {
          const Icon = meta.icon;
          const conf = form[meta.kind];
          return (
            <div key={meta.kind} className="space-y-2 rounded-lg border border-stone-200 bg-white px-3 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-800">
                <Icon className="size-4 text-stone-500" />
                {meta.label}
              </div>
              <p className="text-xs leading-5 text-stone-500">{meta.hint}</p>
              <Input
                type="number"
                min={0}
                value={conf.quota}
                onChange={(event) => onChange(meta.kind, { quota: event.target.value })}
                disabled={conf.unlimited}
                placeholder="例如：100"
                className="h-10 rounded-lg border-stone-200 bg-white font-data tabular-nums"
              />
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700">
                <Checkbox
                  checked={conf.unlimited}
                  onCheckedChange={(checked) => onChange(meta.kind, { unlimited: Boolean(checked) })}
                />
                <span>不限额度</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuotaGroupEdit({
  title,
  groupHint,
  kinds,
  item,
  form,
  onChange,
}: {
  title: string;
  groupHint: string;
  kinds: QuotaMeta[];
  item: UserKey;
  form: EditFormState;
  onChange: (kind: QuotaKind, patch: Partial<EditFormState[QuotaKind]>) => void;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-stone-800">{title}</div>
        <span className="text-xs text-stone-500">{groupHint}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {kinds.map((meta) => (
          <EditQuotaCell
            key={meta.kind}
            meta={meta}
            item={item}
            value={form[meta.kind]}
            onChange={(patch) => onChange(meta.kind, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function EditQuotaCell({
  meta,
  item,
  value,
  onChange,
}: {
  meta: QuotaMeta;
  item: UserKey;
  value: EditFormState[QuotaKind];
  onChange: (patch: Partial<EditFormState[QuotaKind]>) => void;
}) {
  const Icon = meta.icon;
  const currentUnlimited = Boolean(item[meta.unlimitedField]);
  const currentQuota = readNumber(item[meta.quotaField]);
  const currentUsed = readNumber(item[meta.usedField]);
  const currentRemaining = currentUnlimited ? null : Math.max(0, currentQuota - currentUsed);
  const inputNum = readNumber(value.quota);
  const previewNext = value.mode === "add" ? currentQuota + inputNum : inputNum;

  return (
    <div className="space-y-2 rounded-lg border border-stone-200 bg-white px-3 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-800">
        <Icon className="size-4 text-stone-500" />
        {meta.label}
      </div>
      <div className="font-data tabular-nums text-[11px] text-stone-500">
        {currentUnlimited ? (
          <>已用 {currentUsed} · 当前不限</>
        ) : (
          <>
            已用 {currentUsed} / 当前 {currentQuota}
            <span className="ml-1 text-stone-400">（剩 {currentRemaining}）</span>
          </>
        )}
      </div>
      {!value.unlimited ? (
        <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onChange({ mode: "add", quota: "" })}
            className={cn(
              "cursor-pointer rounded-md px-2 py-1 transition",
              value.mode === "add"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700",
            )}
          >
            追加
          </button>
          <button
            type="button"
            onClick={() => onChange({ mode: "set", quota: String(currentQuota) })}
            className={cn(
              "cursor-pointer rounded-md px-2 py-1 transition",
              value.mode === "set"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700",
            )}
          >
            覆盖
          </button>
        </div>
      ) : null}
      <Input
        type="number"
        min={0}
        value={value.quota}
        onChange={(event) => onChange({ quota: event.target.value })}
        disabled={value.unlimited}
        placeholder={value.mode === "add" ? "再追加多少" : "新的上限"}
        className="h-10 rounded-lg border-stone-200 bg-white font-data tabular-nums"
      />
      {!value.unlimited && value.quota.trim() !== "" ? (
        <p className="font-data tabular-nums text-[11px] text-stone-500">
          保存后 →{" "}
          <span className="font-semibold text-stone-700">{previewNext}</span>
        </p>
      ) : null}
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700">
        <Checkbox
          checked={value.unlimited}
          onCheckedChange={(checked) => onChange({ unlimited: Boolean(checked) })}
        />
        <span>不限额度</span>
      </label>
      <button
        type="button"
        onClick={() => onChange({ resetUsed: !value.resetUsed })}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition",
          value.resetUsed
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50",
        )}
      >
        <RotateCcw className="size-3" />
        {value.resetUsed ? "保存时重置已用" : "重置已用"}
      </button>
    </div>
  );
}
