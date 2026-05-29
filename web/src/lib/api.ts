import { httpRequest, request } from "@/lib/request";
import webConfig from "@/constants/common-env";
import { getStoredAuthKey } from "@/store/auth";

export type AccountType = string;
export type AccountStatus = "正常" | "限流" | "异常" | "禁用";
export type ImageModel = "gpt-image-2" | "codex-gpt-image-2";
export type AuthRole = "admin" | "user";

export type Account = {
  access_token: string;
  type: AccountType;
  status: AccountStatus;
  quota: number;
  initial_quota?: number;
  image_quota_unknown?: boolean;
  email?: string | null;
  user_id?: string | null;
  limits_progress?: Array<{
    feature_name?: string;
    remaining?: number;
    reset_after?: string;
  }>;
  default_model_slug?: string | null;
  restore_at?: string | null;
  success: number;
  fail: number;
  last_used_at?: string | null;
};

type AccountListResponse = {
  items: Account[];
};

type AccountMutationResponse = {
  items: Account[];
  added?: number;
  skipped?: number;
  removed?: number;
  refreshed?: number;
  errors?: Array<{ access_token: string; error: string }>;
};

type AccountRefreshResponse = {
  items: Account[];
  refreshed: number;
  errors: Array<{ access_token: string; error: string }>;
};

type AccountUpdateResponse = {
  item: Account;
  items: Account[];
};

export type SettingsConfig = {
  proxy: string;
  base_url?: string;
  global_system_prompt?: string;
  sensitive_words?: string[];
  ai_review?: {
    enabled?: boolean;
    base_url?: string;
    api_key?: string;
    model?: string;
    prompt?: string;
  };
  refresh_account_interval_minute?: number | string;
  image_retention_days?: number | string;
  cleanup_protect_gallery?: boolean;
  cleanup_protect_user_images?: boolean;
  image_poll_timeout_secs?: number | string;
  image_account_concurrency?: number | string;
  auto_remove_invalid_accounts?: boolean;
  auto_remove_rate_limited_accounts?: boolean;
  log_levels?: string[];
  backup?: BackupSettings;
  backup_state?: BackupState;
  [key: string]: unknown;
};

export type BackupInclude = {
  config: boolean;
  register: boolean;
  cpa: boolean;
  sub2api: boolean;
  logs: boolean;
  image_tasks: boolean;
  accounts_snapshot: boolean;
  auth_keys_snapshot: boolean;
  chat_conversations_snapshot: boolean;
  images: boolean;
};

export type BackupSettings = {
  enabled: boolean;
  provider: "cloudflare_r2" | string;
  account_id: string;
  access_key_id: string;
  secret_access_key: string;
  bucket: string;
  prefix: string;
  interval_minutes: number | string;
  rotation_keep: number | string;
  encrypt: boolean;
  passphrase: string;
  include: BackupInclude;
};

export type BackupState = {
  running: boolean;
  last_started_at?: string | null;
  last_finished_at?: string | null;
  last_status?: string;
  last_error?: string | null;
  last_object_key?: string | null;
};

export type BackupItem = {
  key: string;
  name: string;
  size: number;
  updated_at?: string | null;
  encrypted: boolean;
};

export type BackupDetail = {
  key: string;
  name: string;
  encrypted: boolean;
  created_at?: string | null;
  trigger?: string | null;
  app_version?: string | null;
  storage_backend?: Record<string, unknown> | null;
  files: Array<{
    name: string;
    exists: boolean;
    content_type?: string;
    size: number;
    sha256?: string;
  }>;
  snapshots: Array<{
    name: string;
    count: number;
  }>;
};

export type ManagedImage = {
  rel: string;
  path?: string;
  name: string;
  date: string;
  size: number;
  url: string;
  thumbnail_url?: string;
  created_at: string;
  width?: number;
  height?: number;
  tags?: string[];
  owner_id?: string;
  // 后端在 list_images 里打的标记：true 表示该 owner_id 落在 admin 集合里。
  // 前端用它把 badge 显示成"管理员"，避免暴露具体 admin 密钥 id。
  is_admin_owner?: boolean;
  // 生成时记下来的 prompt 原文（image_prompts.json）。老数据为空字符串。
  // 给"我的作品"页一键复用 / 发布画廊用；为空时前端弹窗手填。
  prompt?: string;
};

export type ImageOwner = {
  id: string;
  name: string;
  deleted: boolean;
  count: number;
};

export type SystemLog = {
  id: string;
  time: string;
  type: "call" | "account" | string;
  summary?: string;
  detail?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ImageResponse = {
  created: number;
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
};

export type ImageTask = {
  id: string;
  status: "queued" | "running" | "success" | "error" | "canceled";
  mode: "generate" | "edit";
  model?: ImageModel;
  size?: string;
  created_at: string;
  updated_at: string;
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: string;
};

type ImageTaskListResponse = {
  items: ImageTask[];
  missing_ids: string[];
};

type ImageTaskCancelResponse = {
  canceled: string[];
  skipped: string[];
  missing_ids: string[];
};

export type LoginResponse = {
  ok: boolean;
  version: string;
  role: AuthRole;
  subject_id: string;
  name: string;
};

export type UserKey = {
  id: string;
  name: string;
  role: "user";
  enabled: boolean;
  created_at: string | null;
  last_used_at: string | null;
  image_daily_quota: number;
  image_daily_used: number;
  image_daily_unlimited: boolean;
  image_daily_remaining: number | null;
  image_monthly_quota: number;
  image_monthly_used: number;
  image_monthly_unlimited: boolean;
  image_monthly_remaining: number | null;
  image_total_quota: number;
  image_total_used: number;
  image_total_unlimited: boolean;
  image_total_remaining: number | null;
  chat_daily_quota: number;
  chat_daily_used: number;
  chat_daily_unlimited: boolean;
  chat_daily_remaining: number | null;
  chat_monthly_quota: number;
  chat_monthly_used: number;
  chat_monthly_unlimited: boolean;
  chat_monthly_remaining: number | null;
  chat_total_quota: number;
  chat_total_used: number;
  chat_total_unlimited: boolean;
  chat_total_remaining: number | null;
};

export type AuthIdentity = {
  id: string;
  name: string;
  role: AuthRole;
  image_daily_quota: number;
  image_daily_used: number;
  image_daily_unlimited: boolean;
  image_daily_remaining: number | null;
  image_monthly_quota: number;
  image_monthly_used: number;
  image_monthly_unlimited: boolean;
  image_monthly_remaining: number | null;
  image_total_quota: number;
  image_total_used: number;
  image_total_unlimited: boolean;
  image_total_remaining: number | null;
  chat_daily_quota: number;
  chat_daily_used: number;
  chat_daily_unlimited: boolean;
  chat_daily_remaining: number | null;
  chat_monthly_quota: number;
  chat_monthly_used: number;
  chat_monthly_unlimited: boolean;
  chat_monthly_remaining: number | null;
  chat_total_quota: number;
  chat_total_used: number;
  chat_total_unlimited: boolean;
  chat_total_remaining: number | null;
};

export type RegisterConfig = {
  enabled: boolean;
  mail: {
    request_timeout: number;
    wait_timeout: number;
    wait_interval: number;
    providers: Array<Record<string, unknown>>;
  };
  proxy: string;
  total: number;
  threads: number;
  mode: "total" | "quota" | "available";
  target_quota: number;
  target_available: number;
  check_interval: number;
  fixed_password: string;
  stats: {
    job_id?: string;
    success: number;
    fail: number;
    done: number;
    running: number;
    threads: number;
    elapsed_seconds?: number;
    avg_seconds?: number;
    success_rate?: number;
    current_quota?: number;
    current_available?: number;
    started_at?: string;
    updated_at?: string;
    finished_at?: string;
  };
  logs?: Array<{
    time: string;
    text: string;
    level: string;
  }>;
};

export async function login(authKey: string) {
  const normalizedAuthKey = String(authKey || "").trim();
  return httpRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: {},
    headers: {
      Authorization: `Bearer ${normalizedAuthKey}`,
    },
    redirectOnUnauthorized: false,
  });
}

export async function fetchAccounts() {
  return httpRequest<AccountListResponse>("/api/accounts");
}

export async function createAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "POST",
    body: { tokens },
  });
}

export async function deleteAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "DELETE",
    body: { tokens },
  });
}

export async function refreshAccounts(accessTokens: string[]) {
  return httpRequest<AccountRefreshResponse>("/api/accounts/refresh", {
    method: "POST",
    body: { access_tokens: accessTokens },
  });
}

export async function updateAccount(
  accessToken: string,
  updates: {
    type?: AccountType;
    status?: AccountStatus;
    quota?: number;
  },
) {
  return httpRequest<AccountUpdateResponse>("/api/accounts/update", {
    method: "POST",
    body: {
      access_token: accessToken,
      ...updates,
    },
  });
}

export async function generateImage(prompt: string, model?: ImageModel, size?: string) {
  return httpRequest<ImageResponse>(
    "/v1/images/generations",
    {
      method: "POST",
      body: {
        prompt,
        ...(model ? { model } : {}),
        ...(size ? { size } : {}),
        n: 1,
        response_format: "b64_json",
      },
    },
  );
}

export async function editImage(files: File | File[], prompt: string, model?: ImageModel, size?: string) {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  if (size) {
    formData.append("size", size);
  }
  formData.append("n", "1");

  return httpRequest<ImageResponse>(
    "/v1/images/edits",
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function createImageGenerationTask(clientTaskId: string, prompt: string, model?: ImageModel, size?: string) {
  return httpRequest<ImageTask>("/api/image-tasks/generations", {
    method: "POST",
    body: {
      client_task_id: clientTaskId,
      prompt,
      ...(model ? { model } : {}),
      ...(size ? { size } : {}),
    },
  });
}

export async function createImageEditTask(
  clientTaskId: string,
  files: File | File[],
  prompt: string,
  model?: ImageModel,
  size?: string,
) {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("client_task_id", clientTaskId);
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  if (size) {
    formData.append("size", size);
  }

  return httpRequest<ImageTask>("/api/image-tasks/edits", {
    method: "POST",
    body: formData,
  });
}

export async function fetchImageTasks(ids: string[]) {
  const params = new URLSearchParams();
  if (ids.length > 0) {
    params.set("ids", ids.join(","));
  }
  return httpRequest<ImageTaskListResponse>(`/api/image-tasks${params.toString() ? `?${params.toString()}` : ""}`);
}

export async function cancelImageTasks(ids: string[]) {
  return httpRequest<ImageTaskCancelResponse>("/api/image-tasks/cancel", {
    method: "POST",
    body: { ids },
  });
}

export async function fetchSettingsConfig() {
  return httpRequest<{ config: SettingsConfig }>("/api/settings");
}

export async function updateSettingsConfig(settings: SettingsConfig) {
  return httpRequest<{ config: SettingsConfig }>("/api/settings", {
    method: "POST",
    body: settings,
  });
}

export async function testBackupConnection() {
  return httpRequest<{ result: { ok: boolean; status: number } }>("/api/backup/test", {
    method: "POST",
    body: {},
  });
}

export async function fetchBackups() {
  return httpRequest<{ items: BackupItem[]; state: BackupState; settings: BackupSettings }>("/api/backups");
}

export async function runBackupNow() {
  return httpRequest<{ result: { key: string; size: number; encrypted: boolean } }>("/api/backups/run", {
    method: "POST",
    body: {},
  });
}

export async function deleteBackup(key: string) {
  return httpRequest<{ ok: boolean }>("/api/backups/delete", {
    method: "POST",
    body: { key },
  });
}

export async function fetchBackupDetail(key: string) {
  const params = new URLSearchParams();
  params.set("key", key);
  return httpRequest<{ item: BackupDetail }>(`/api/backups/detail?${params.toString()}`);
}

export function getBackupDownloadUrl(key: string) {
  const params = new URLSearchParams();
  params.set("key", key);
  return `/api/backups/download?${params.toString()}`;
}

export async function fetchManagedImages(filters: { start_date?: string; end_date?: string; owner?: string }) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.owner) params.set("owner", filters.owner);
  return httpRequest<{ items: ManagedImage[]; groups: Array<{ date: string; items: ManagedImage[] }> }>(
    `/api/images${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

/**
 * 拉登录用户自己的图。后端按 identity.id 自动过滤 image_owners.json：
 *  - user 角色：只返回 owner == 自己的图
 *  - admin 角色：返回所有 admin 生成的图（owner=__admin__ 桶）
 * 给 web "我的作品" 页用，跟 Android 端 listMyImages 同一接口。
 */
export async function fetchMyWorks(filters: { start_date?: string; end_date?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  return httpRequest<{ items: ManagedImage[]; groups: Array<{ date: string; items: ManagedImage[] }> }>(
    `/api/me/images${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

export async function fetchImageOwners() {
  return httpRequest<{ items: ImageOwner[] }>("/api/images/owners");
}

export async function deleteManagedImages(body: { paths?: string[]; start_date?: string; end_date?: string; owner?: string; all_matching?: boolean }) {
  return httpRequest<{ removed: number }>("/api/images/delete", { method: "POST", body });
}

export async function downloadImages(paths: string[]) {
  const response = await request.post("/api/images/download", { paths }, { responseType: "blob" });
  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "images.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadSingleImage(path: string) {
  const response = await request.get(`/api/images/download/${path}`, { responseType: "blob" });
  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || "image.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fetchImageTags() {
  return httpRequest<{ tags: string[] }>("/api/images/tags");
}

export async function setImageTags(path: string, tags: string[]) {
  return httpRequest<{ ok: boolean; tags: string[] }>("/api/images/tags", {
    method: "POST",
    body: { path, tags },
  });
}

export async function deleteImageTag(tag: string) {
  return httpRequest<{ ok: boolean; removed_from: number }>(`/api/images/tags/${encodeURIComponent(tag)}`, {
    method: "DELETE",
  });
}

export async function fetchSystemLogs(filters: { type?: string; start_date?: string; end_date?: string }) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  return httpRequest<{ items: SystemLog[] }>(`/api/logs${params.toString() ? `?${params.toString()}` : ""}`);
}

export async function deleteSystemLogs(ids: string[]) {
  return httpRequest<{ removed: number }>("/api/logs/delete", {
    method: "POST",
    body: { ids },
  });
}

export async function fetchUserKeys() {
  return httpRequest<{ items: UserKey[] }>("/api/auth/users");
}

export async function fetchMyIdentity() {
  return httpRequest<{ identity: AuthIdentity }>("/api/auth/me");
}

export type UserKeyCreatePayload = {
  name?: string;
  image_daily_quota?: number;
  image_daily_unlimited?: boolean;
  image_monthly_quota?: number;
  image_monthly_unlimited?: boolean;
  image_total_quota?: number;
  image_total_unlimited?: boolean;
  chat_daily_quota?: number;
  chat_daily_unlimited?: boolean;
  chat_monthly_quota?: number;
  chat_monthly_unlimited?: boolean;
  chat_total_quota?: number;
  chat_total_unlimited?: boolean;
};

export type UserKeyUpdatePayload = {
  enabled?: boolean;
  name?: string;
  key?: string;
  image_daily_quota?: number;
  image_daily_unlimited?: boolean;
  image_monthly_quota?: number;
  image_monthly_unlimited?: boolean;
  image_total_quota?: number;
  image_total_unlimited?: boolean;
  chat_daily_quota?: number;
  chat_daily_unlimited?: boolean;
  chat_monthly_quota?: number;
  chat_monthly_unlimited?: boolean;
  chat_total_quota?: number;
  chat_total_unlimited?: boolean;
  reset_image_daily_used?: boolean;
  reset_image_monthly_used?: boolean;
  reset_image_total_used?: boolean;
  reset_chat_daily_used?: boolean;
  reset_chat_monthly_used?: boolean;
  reset_chat_total_used?: boolean;
};

export async function createUserKey(payload: UserKeyCreatePayload) {
  return httpRequest<{ item: UserKey; key: string; items: UserKey[] }>("/api/auth/users", {
    method: "POST",
    body: {
      name: payload.name ?? "",
      image_daily_quota: Math.max(0, Number(payload.image_daily_quota ?? 0) || 0),
      image_daily_unlimited: payload.image_daily_unlimited ?? true,
      image_monthly_quota: Math.max(0, Number(payload.image_monthly_quota ?? 0) || 0),
      image_monthly_unlimited: payload.image_monthly_unlimited ?? true,
      image_total_quota: Math.max(0, Number(payload.image_total_quota ?? 0) || 0),
      image_total_unlimited: Boolean(payload.image_total_unlimited),
      chat_daily_quota: Math.max(0, Number(payload.chat_daily_quota ?? 0) || 0),
      chat_daily_unlimited: payload.chat_daily_unlimited ?? true,
      chat_monthly_quota: Math.max(0, Number(payload.chat_monthly_quota ?? 0) || 0),
      chat_monthly_unlimited: payload.chat_monthly_unlimited ?? true,
      chat_total_quota: Math.max(0, Number(payload.chat_total_quota ?? 0) || 0),
      chat_total_unlimited: payload.chat_total_unlimited ?? true,
    },
  });
}

export async function updateUserKey(keyId: string, updates: UserKeyUpdatePayload) {
  return httpRequest<{ item: UserKey; items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteUserKey(keyId: string) {
  return httpRequest<{ items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "DELETE",
  });
}

export async function fetchRegisterConfig() {
  return httpRequest<{ register: RegisterConfig }>("/api/register");
}

export async function updateRegisterConfig(updates: Partial<RegisterConfig>) {
  return httpRequest<{ register: RegisterConfig }>("/api/register", {
    method: "POST",
    body: updates,
  });
}

export async function startRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/start", { method: "POST" });
}

export async function stopRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/stop", { method: "POST" });
}

export async function resetRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/reset", { method: "POST" });
}

// ── CPA (CLIProxyAPI) ──────────────────────────────────────────────

export type CPAPool = {
  id: string;
  name: string;
  base_url: string;
  import_job?: CPAImportJob | null;
};

export type CPARemoteFile = {
  name: string;
  email: string;
};

export type CPAImportJob = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  total: number;
  completed: number;
  added: number;
  skipped: number;
  refreshed: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
};

export async function fetchCPAPools() {
  return httpRequest<{ pools: CPAPool[] }>("/api/cpa/pools");
}

export async function createCPAPool(pool: { name: string; base_url: string; secret_key: string }) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>("/api/cpa/pools", {
    method: "POST",
    body: pool,
  });
}

export async function updateCPAPool(
  poolId: string,
  updates: { name?: string; base_url?: string; secret_key?: string },
) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteCPAPool(poolId: string) {
  return httpRequest<{ pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "DELETE",
  });
}

export async function fetchCPAPoolFiles(poolId: string) {
  return httpRequest<{ pool_id: string; files: CPARemoteFile[] }>(`/api/cpa/pools/${poolId}/files`);
}

export async function startCPAImport(poolId: string, names: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`, {
    method: "POST",
    body: { names },
  });
}

export async function fetchCPAPoolImportJob(poolId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`);
}

// ── Sub2API ────────────────────────────────────────────────────────

export type Sub2APIServer = {
  id: string;
  name: string;
  base_url: string;
  email: string;
  has_api_key: boolean;
  group_id: string;
  import_job?: CPAImportJob | null;
};

export type Sub2APIRemoteAccount = {
  id: string;
  name: string;
  email: string;
  plan_type: string;
  status: string;
  expires_at: string;
  has_refresh_token: boolean;
};

export type Sub2APIRemoteGroup = {
  id: string;
  name: string;
  description: string;
  platform: string;
  status: string;
  account_count: number;
  active_account_count: number;
};

export async function fetchSub2APIServers() {
  return httpRequest<{ servers: Sub2APIServer[] }>("/api/sub2api/servers");
}

export async function createSub2APIServer(server: {
  name: string;
  base_url: string;
  email: string;
  password: string;
  api_key: string;
  group_id: string;
}) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>("/api/sub2api/servers", {
    method: "POST",
    body: server,
  });
}

export async function updateSub2APIServer(
  serverId: string,
  updates: {
    name?: string;
    base_url?: string;
    email?: string;
    password?: string;
    api_key?: string;
    group_id?: string;
  },
) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "POST",
    body: updates,
  });
}

export async function fetchSub2APIServerGroups(serverId: string) {
  return httpRequest<{ server_id: string; groups: Sub2APIRemoteGroup[] }>(
    `/api/sub2api/servers/${serverId}/groups`,
  );
}

export async function deleteSub2APIServer(serverId: string) {
  return httpRequest<{ servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "DELETE",
  });
}

export async function fetchSub2APIServerAccounts(serverId: string) {
  return httpRequest<{ server_id: string; accounts: Sub2APIRemoteAccount[] }>(
    `/api/sub2api/servers/${serverId}/accounts`,
  );
}

export async function startSub2APIImport(serverId: string, accountIds: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`, {
    method: "POST",
    body: { account_ids: accountIds },
  });
}

export async function fetchSub2APIImportJob(serverId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`);
}

// ── Upstream proxy ────────────────────────────────────────────────

export type ProxySettings = {
  enabled: boolean;
  url: string;
};

export type ProxyTestResult = {
  ok: boolean;
  status: number;
  latency_ms: number;
  error: string | null;
};

export async function fetchProxy() {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy");
}

export async function updateProxy(updates: { enabled?: boolean; url?: string }) {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy", {
    method: "POST",
    body: updates,
  });
}

export async function testProxy(url?: string) {
  return httpRequest<{ result: ProxyTestResult }>("/api/proxy/test", {
    method: "POST",
    body: { url: url ?? "" },
  });
}

/* ───────── 公共画廊 ───────── */

export type GalleryItem = {
  id: string;
  url: string;
  image_rel: string;
  prompt: string;
  model: string;
  size: string;
  width: number;
  height: number;
  publisher_name: string;
  created_at: number;
  status: "visible" | "hidden" | string;
  /**
   * 图生图标记。后端在 publish 时检测 image_edits set，命中就强制把 prompt
   * 落空并置 is_edit=true。前端据此把 prompt 区换成"提示词依赖参考图"提示卡，
   * 避免别人复制了一段对参考图的修改指令以为能复现，结果完全跑偏。
   */
  is_edit?: boolean;
  /**
   * 后端 _public_view 派生：当前请求者是否就是这条画廊的发布者。
   * 用于在画廊详情里给「我的发布」额外暴露撤回入口；admin 不依赖这个字段，
   * 走自己那套 hide/unhide/permanent delete 流程。
   * 后端只在 viewer_id 非空且与 publisher_id 一致时才置 true，绝不暴露 publisher_id 本身。
   */
  is_mine?: boolean;
};

export type GalleryFeedResponse = {
  items: GalleryItem[];
  next_cursor: string;
};

export async function fetchGalleryFeed(opts: {
  cursor?: string | null;
  limit?: number;
  includeHidden?: boolean;
}) {
  const params = new URLSearchParams();
  if (opts.cursor) params.set("cursor", opts.cursor);
  params.set("limit", String(opts.limit ?? 24));
  if (opts.includeHidden) params.set("include_hidden", "true");
  return httpRequest<GalleryFeedResponse>(`/api/gallery/feed?${params.toString()}`);
}

export async function fetchGalleryItem(id: string) {
  return httpRequest<{ item: GalleryItem }>(`/api/gallery/items/${id}`);
}

export async function publishGalleryItem(body: {
  image_rel: string;
  prompt: string;
  model?: string;
  size?: string;
  width?: number;
  height?: number;
}) {
  return httpRequest<{ item: GalleryItem }>("/api/gallery/publish", {
    method: "POST",
    body,
  });
}

/**
 * 批量查"哪些 rel 发过画廊"。给"我的作品"页 / admin 图片管理页 reload 时
 * 一次播种 publishStates，否则刷新后角标会丢（state 是前端 Map，重 mount 即清空）。
 *
 * 后端只返回查到记录的 rel，未发布的 rel 不在 items key 里。
 *
 * admin 调用时后端自动按 check_any_publisher=True 跨用户查询，并在每条记录
 * 附带 publisher_name；普通 user 查到的永远是自己发的，publisher_name 也会填。
 */
export async function getMyPublishedBatch(image_rels: string[]) {
  return httpRequest<{
    items: Record<
      string,
      { published: boolean; id: string; status: string; publisher_name?: string }
    >;
  }>("/api/gallery/published/batch", {
    method: "POST",
    body: { image_rels },
  });
}

export async function unpublishGalleryItem(id: string) {
  return httpRequest<{ ok: boolean }>(`/api/gallery/items/${id}`, {
    method: "DELETE",
  });
}

export async function hideGalleryItem(id: string) {
  return httpRequest<{ ok: boolean }>(`/api/gallery/items/${id}/hide`, {
    method: "POST",
  });
}

export async function unhideGalleryItem(id: string) {
  return httpRequest<{ ok: boolean }>(`/api/gallery/items/${id}/unhide`, {
    method: "POST",
  });
}

export type ChatStreamMessage = { role: "user" | "assistant" | "system"; content: string };
export type ChatPersistedMessage = ChatStreamMessage;

export type ChatStreamEvent =
  | { type: "conversation.id"; conversation_id: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type ChatConversation = {
  id: string;
  title: string;
  messages: ChatPersistedMessage[];
  upstream_conversation_id: string;
  created_at: number;
  updated_at: number;
};

export async function listChatConversations() {
  return httpRequest<{ items: ChatConversation[] }>("/api/chat/conversations");
}

export async function saveChatConversation(payload: {
  id?: string;
  title?: string;
  messages: ChatPersistedMessage[];
  upstream_conversation_id?: string;
}) {
  return httpRequest<{ item: ChatConversation }>("/api/chat/conversations", {
    method: "POST",
    body: {
      ...(payload.id ? { id: payload.id } : {}),
      title: payload.title ?? "",
      messages: payload.messages,
      ...(payload.upstream_conversation_id ? { upstream_conversation_id: payload.upstream_conversation_id } : {}),
    },
  });
}

export async function deleteChatConversation(conversationId: string) {
  return httpRequest<{ ok: boolean }>(`/api/chat/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
}

/**
 * /api/chat/stream 直读：fetch + ReadableStream 解 SSE。
 * 不走 axios 是因为 axios 默认全量缓冲，没法做流式增量渲染。
 * 调用方拿到 AsyncIterable<ChatStreamEvent>，按事件类型自己派发。
 * abortSignal 透传：用户按"停止生成"时上层 controller.abort() 即可。
 */
export async function* streamChat(
  body: { model: string; messages: ChatStreamMessage[]; conversation_id?: string; force_switch_account?: boolean },
  abortSignal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent, void, void> {
  const authKey = await getStoredAuthKey();
  const baseUrl = webConfig.apiUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authKey ? { Authorization: `Bearer ${authKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });
  if (!response.ok || !response.body) {
    let message = `请求失败 (${response.status})`;
    try {
      const payload = await response.json();
      const detail = payload?.detail ?? payload?.error ?? payload?.message;
      if (typeof detail === "string" && detail.trim()) message = detail;
      else if (detail && typeof detail === "object" && typeof detail.error === "string") message = detail.error;
    } catch {
      // 非 JSON 错误体走默认 message
    }
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE 用空行分帧；data: 行可能跨 chunk 到达，所以攒到双换行再切。
      let separator = buffer.indexOf("\n\n");
      while (separator >= 0) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
        if (dataLine) {
          const raw = dataLine.slice(5).trim();
          if (raw) {
            try {
              yield JSON.parse(raw) as ChatStreamEvent;
            } catch {
              // 异常 payload 跳过即可，正常流不会落到这里
            }
          }
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}
