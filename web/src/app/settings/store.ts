"use client";

import { create } from "zustand";
import { toast } from "sonner";

import {
  createCPAPool,
  deleteBackup,
  deleteCPAPool,
  fetchCPAPoolFiles,
  fetchCPAPools,
  fetchBackups,
  fetchRegisterConfig,
  resetRegister as resetRegisterApi,
  fetchSettingsConfig,
  runBackupNow,
  startRegister,
  startCPAImport,
  stopRegister,
  testBackupConnection,
  updateCPAPool,
  updateRegisterConfig,
  updateSettingsConfig,
  type BackupItem,
  type BackupSettings,
  type BackupState,
  type CPAPool,
  type CPARemoteFile,
  type RegisterConfig,
  type SettingsConfig,
} from "@/lib/api";

export const PAGE_SIZE_OPTIONS = ["50", "100", "200"] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

function normalizeConfig(config: SettingsConfig): SettingsConfig {
  const backup = typeof config.backup === "object" && config.backup
    ? config.backup as BackupSettings
    : {
      enabled: false,
      provider: "cloudflare_r2",
      account_id: "",
      access_key_id: "",
      secret_access_key: "",
      bucket: "",
      prefix: "backups",
      interval_minutes: 360,
      rotation_keep: 10,
      encrypt: false,
      passphrase: "",
      include: {
        config: true,
        register: true,
        cpa: true,
        sub2api: true,
        logs: true,
        image_tasks: true,
        accounts_snapshot: true,
        auth_keys_snapshot: true,
        chat_conversations_snapshot: true,
        images: false,
      },
    };
  return {
    ...config,
    refresh_account_interval_minute: Number(config.refresh_account_interval_minute || 5),
    image_retention_days: Number(config.image_retention_days || 30),
    cleanup_protect_gallery: Boolean(config.cleanup_protect_gallery ?? true),
    cleanup_protect_user_images: Boolean(config.cleanup_protect_user_images ?? true),
    image_poll_timeout_secs: Number(config.image_poll_timeout_secs || 120),
    image_account_concurrency: Number(config.image_account_concurrency || 3),
    auto_remove_invalid_accounts: Boolean(config.auto_remove_invalid_accounts),
    auto_remove_rate_limited_accounts: Boolean(config.auto_remove_rate_limited_accounts),
    log_levels: Array.isArray(config.log_levels) ? config.log_levels : [],
    proxy: typeof config.proxy === "string" ? config.proxy : "",
    base_url: typeof config.base_url === "string" ? config.base_url : "",
    global_system_prompt: String(config.global_system_prompt || ""),
    sensitive_words: Array.isArray(config.sensitive_words) ? config.sensitive_words : [],
    ai_review: {
      enabled: Boolean(config.ai_review?.enabled),
      base_url: String(config.ai_review?.base_url || ""),
      api_key: String(config.ai_review?.api_key || ""),
      model: String(config.ai_review?.model || ""),
      prompt: String(config.ai_review?.prompt || ""),
    },
    backup: {
      ...backup,
      enabled: Boolean(backup.enabled),
      account_id: String(backup.account_id || ""),
      access_key_id: String(backup.access_key_id || ""),
      secret_access_key: String(backup.secret_access_key || ""),
      bucket: String(backup.bucket || ""),
      prefix: String(backup.prefix || "backups"),
      interval_minutes: Number(backup.interval_minutes || 360),
      rotation_keep: Number(backup.rotation_keep ?? 10),
      encrypt: Boolean(backup.encrypt),
      passphrase: String(backup.passphrase || ""),
      include: {
        config: Boolean(backup.include?.config ?? true),
        register: Boolean(backup.include?.register ?? true),
        cpa: Boolean(backup.include?.cpa ?? true),
        sub2api: Boolean(backup.include?.sub2api ?? true),
        logs: Boolean(backup.include?.logs ?? true),
        image_tasks: Boolean(backup.include?.image_tasks ?? true),
        accounts_snapshot: Boolean(backup.include?.accounts_snapshot ?? true),
        auth_keys_snapshot: Boolean(backup.include?.auth_keys_snapshot ?? true),
        chat_conversations_snapshot: Boolean(backup.include?.chat_conversations_snapshot ?? true),
        images: Boolean(backup.include?.images ?? false),
      },
    },
  };
}

// 测试连接 / 立即备份前的本地必填校验：必须先有 R2 四要素 + bucket，
// 否则别走 saveConfig，免得后端 200 返回触发"配置已保存"成功 toast，
// 紧接着实际操作再报错，UI 同时冒两条互相打架的提示。
function collectMissingBackupFields(backup: BackupSettings | undefined | null): string | null {
  if (!backup) {
    return "R2 备份配置";
  }
  const required: Array<{ key: keyof BackupSettings; label: string }> = [
    { key: "account_id", label: "Cloudflare Account ID" },
    { key: "access_key_id", label: "Access Key ID" },
    { key: "secret_access_key", label: "Secret Access Key" },
    { key: "bucket", label: "Bucket 名称" },
  ];
  const missing = required
    .filter((item) => !String(backup[item.key] ?? "").trim())
    .map((item) => item.label);
  if (missing.length === 0) {
    return null;
  }
  return missing.join("、");
}

function normalizeFiles(items: CPARemoteFile[]) {
  const seen = new Set<string>();
  const files: CPARemoteFile[] = [];
  for (const item of items) {
    const name = String(item.name || "").trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    files.push({
      name,
      email: String(item.email || "").trim(),
    });
  }
  return files;
}

type SettingsStore = {
  config: SettingsConfig | null;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  /**
   * config 自上次成功 load / save 之后是否有改动。
   * 任意 setXxx 都会置 true；loadConfig / saveConfig 成功后回 false。
   * FloatingSaveBar 只有 isDirty=true 才浮现，干净状态下完全不占视觉位。
   */
  isDirty: boolean;
  backups: BackupItem[];
  backupState: BackupState | null;
  isLoadingBackups: boolean;
  isRunningBackup: boolean;
  deletingBackupKey: string | null;
  isTestingBackup: boolean;

  registerConfig: RegisterConfig | null;
  isLoadingRegister: boolean;
  isSavingRegister: boolean;

  pools: CPAPool[];
  isLoadingPools: boolean;
  deletingId: string | null;
  loadingFilesId: string | null;

  dialogOpen: boolean;
  editingPool: CPAPool | null;
  formName: string;
  formBaseUrl: string;
  formSecretKey: string;
  showSecret: boolean;
  isSavingPool: boolean;

  browserOpen: boolean;
  browserPool: CPAPool | null;
  remoteFiles: CPARemoteFile[];
  selectedNames: string[];
  fileQuery: string;
  filePage: number;
  pageSize: PageSizeOption;
  isStartingImport: boolean;

  initialize: () => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<boolean>;
  /** 取消未保存修改：重新拉一次 config 把 dirty 打回去。 */
  revertConfig: () => Promise<void>;
  loadBackups: (silent?: boolean) => Promise<void>;
  runBackup: () => Promise<void>;
  removeBackup: (key: string) => Promise<void>;
  testBackup: () => Promise<void>;
  setRefreshAccountIntervalMinute: (value: string) => void;
  setImageRetentionDays: (value: string) => void;
  setCleanupProtectGallery: (value: boolean) => void;
  setCleanupProtectUserImages: (value: boolean) => void;
  setImagePollTimeoutSecs: (value: string) => void;
  setImageAccountConcurrency: (value: string) => void;
  setAutoRemoveInvalidAccounts: (value: boolean) => void;
  setAutoRemoveRateLimitedAccounts: (value: boolean) => void;
  setLogLevel: (level: string, enabled: boolean) => void;
  setProxy: (value: string) => void;
  setBaseUrl: (value: string) => void;
  setGlobalSystemPrompt: (value: string) => void;
  setSensitiveWordsText: (value: string) => void;
  setAIReviewField: (key: "enabled" | "base_url" | "api_key" | "model" | "prompt", value: string | boolean) => void;
  setBackupField: (key: keyof BackupSettings, value: string | boolean) => void;
  setBackupInclude: (key: keyof BackupSettings["include"], value: boolean) => void;

  loadRegister: (silent?: boolean) => Promise<void>;
  setRegisterConfig: (config: RegisterConfig) => void;
  setRegisterProxy: (value: string) => void;
  setRegisterTotal: (value: string) => void;
  setRegisterThreads: (value: string) => void;
  setRegisterMode: (value: "total" | "quota" | "available") => void;
  setRegisterTargetQuota: (value: string) => void;
  setRegisterTargetAvailable: (value: string) => void;
  setRegisterCheckInterval: (value: string) => void;
  setRegisterFixedPassword: (value: string) => void;
  setRegisterMailField: (key: "request_timeout" | "wait_timeout" | "wait_interval", value: string) => void;
  addRegisterProvider: () => void;
  updateRegisterProvider: (index: number, updates: Record<string, unknown>) => void;
  deleteRegisterProvider: (index: number) => void;
  saveRegister: () => Promise<void>;
  toggleRegister: () => Promise<void>;
  resetRegister: () => Promise<void>;

  loadPools: (silent?: boolean) => Promise<void>;
  openAddDialog: () => void;
  openEditDialog: (pool: CPAPool) => void;
  setDialogOpen: (open: boolean) => void;
  setFormName: (value: string) => void;
  setFormBaseUrl: (value: string) => void;
  setFormSecretKey: (value: string) => void;
  setShowSecret: (checked: boolean) => void;
  savePool: () => Promise<void>;
  deletePool: (pool: CPAPool) => Promise<void>;

  browseFiles: (pool: CPAPool) => Promise<void>;
  setBrowserOpen: (open: boolean) => void;
  toggleFile: (name: string, checked: boolean) => void;
  replaceSelectedNames: (names: string[]) => void;
  setFileQuery: (value: string) => void;
  setFilePage: (page: number) => void;
  setPageSize: (value: PageSizeOption) => void;
  startImport: () => Promise<void>;
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  config: null,
  isLoadingConfig: true,
  isSavingConfig: false,
  isDirty: false,
  backups: [],
  backupState: null,
  isLoadingBackups: true,
  isRunningBackup: false,
  deletingBackupKey: null,
  isTestingBackup: false,

  registerConfig: null,
  isLoadingRegister: true,
  isSavingRegister: false,

  pools: [],
  isLoadingPools: true,
  deletingId: null,
  loadingFilesId: null,

  dialogOpen: false,
  editingPool: null,
  formName: "",
  formBaseUrl: "",
  formSecretKey: "",
  showSecret: false,
  isSavingPool: false,

  browserOpen: false,
  browserPool: null,
  remoteFiles: [],
  selectedNames: [],
  fileQuery: "",
  filePage: 1,
  pageSize: "100",
  isStartingImport: false,

  initialize: async () => {
    await Promise.allSettled([get().loadConfig(), get().loadPools()]);
    const backup = get().config?.backup;
    const isConfigured = Boolean(
      String(backup?.account_id || "").trim()
      && String(backup?.access_key_id || "").trim()
      && String(backup?.secret_access_key || "").trim()
      && String(backup?.bucket || "").trim(),
    );
    if (isConfigured) {
      await get().loadBackups();
    } else {
      set({ backups: [], isLoadingBackups: false });
    }
  },

  loadConfig: async () => {
    // 已有 config 时视为静默刷新：保持原有的 isLoadingConfig=false，
    // 不让 ConfigCard 在路由切回时坍缩成 spinner 小卡片再撑回大卡片，
    // 避免一次几百像素的 CLS。第一次加载（config 仍为 null）才正常走 loading。
    const silent = get().config !== null;
    if (!silent) {
      set({ isLoadingConfig: true });
    }
    try {
      const data = await fetchSettingsConfig();
      const normalized = normalizeConfig(data.config);
      // load 成功 = 当前内存 config 跟服务端一致，把 dirty 打回去
      set({
        config: normalized,
        isDirty: false,
      });
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "加载系统配置失败");
      }
    } finally {
      if (!silent) {
        set({ isLoadingConfig: false });
      }
    }
  },

  /**
   * 取消未保存修改：重新拉一次 config 覆盖内存值，把 dirty 打回去。
   * 走 loadConfig 同款路径，silent 模式不打扰用户。
   */
  revertConfig: async () => {
    set({ config: null });
    try {
      const data = await fetchSettingsConfig();
      set({
        config: normalizeConfig(data.config),
        isDirty: false,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤销失败");
    }
  },

  saveConfig: async () => {
    const { config } = get();
    if (!config) {
      return false;
    }

    set({ isSavingConfig: true });
    try {
      const data = await updateSettingsConfig({
        ...config,
        refresh_account_interval_minute: Math.max(1, Number(config.refresh_account_interval_minute) || 1),
        image_retention_days: Math.max(1, Number(config.image_retention_days) || 30),
        cleanup_protect_gallery: Boolean(config.cleanup_protect_gallery ?? true),
        cleanup_protect_user_images: Boolean(config.cleanup_protect_user_images ?? true),
        image_poll_timeout_secs: Math.max(1, Number(config.image_poll_timeout_secs) || 120),
        image_account_concurrency: Math.max(1, Number(config.image_account_concurrency) || 3),
        auto_remove_invalid_accounts: Boolean(config.auto_remove_invalid_accounts),
        auto_remove_rate_limited_accounts: Boolean(config.auto_remove_rate_limited_accounts),
        proxy: config.proxy.trim(),
        base_url: String(config.base_url || "").trim(),
        global_system_prompt: String(config.global_system_prompt || "").trim(),
        sensitive_words: (config.sensitive_words || []).map((item) => String(item).trim()).filter(Boolean),
        ai_review: {
          enabled: Boolean(config.ai_review?.enabled),
          base_url: String(config.ai_review?.base_url || "").trim(),
          api_key: String(config.ai_review?.api_key || "").trim(),
          model: String(config.ai_review?.model || "").trim(),
          prompt: String(config.ai_review?.prompt || "").trim(),
        },
        backup: {
          ...(config.backup as BackupSettings),
          account_id: String(config.backup?.account_id || "").trim(),
          access_key_id: String(config.backup?.access_key_id || "").trim(),
          secret_access_key: String(config.backup?.secret_access_key || "").trim(),
          bucket: String(config.backup?.bucket || "").trim(),
          prefix: String(config.backup?.prefix || "backups").trim(),
          interval_minutes: Math.max(1, Number(config.backup?.interval_minutes) || 360),
          rotation_keep: Math.max(0, Number(config.backup?.rotation_keep) || 0),
          passphrase: String(config.backup?.passphrase || "").trim(),
        },
      });
      set({
        config: normalizeConfig(data.config),
        isDirty: false,
      });
      toast.success("配置已保存");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存系统配置失败");
      return false;
    } finally {
      set({ isSavingConfig: false });
    }
  },

  setRefreshAccountIntervalMinute: (value) => {
    set((state) => {
      if (!state.config) {
        return {};
      }
      return {
        config: {
          ...state.config,
          refresh_account_interval_minute: value,
        },
        isDirty: true,
      };
    });
  },

  setImageRetentionDays: (value) => {
    set((state) => state.config ? { config: { ...state.config, image_retention_days: value }, isDirty: true } : {});
  },

  setCleanupProtectGallery: (value) => {
    set((state) => state.config ? { config: { ...state.config, cleanup_protect_gallery: value }, isDirty: true } : {});
  },

  setCleanupProtectUserImages: (value) => {
    set((state) => state.config ? { config: { ...state.config, cleanup_protect_user_images: value }, isDirty: true } : {});
  },

  setImagePollTimeoutSecs: (value) => {
    set((state) => state.config ? { config: { ...state.config, image_poll_timeout_secs: value }, isDirty: true } : {});
  },

  setImageAccountConcurrency: (value) => {
    set((state) => state.config ? { config: { ...state.config, image_account_concurrency: value }, isDirty: true } : {});
  },

  setAutoRemoveInvalidAccounts: (value) => {
    set((state) => state.config ? { config: { ...state.config, auto_remove_invalid_accounts: value }, isDirty: true } : {});
  },

  setAutoRemoveRateLimitedAccounts: (value) => {
    set((state) => state.config ? { config: { ...state.config, auto_remove_rate_limited_accounts: value }, isDirty: true } : {});
  },

  setLogLevel: (level, enabled) => {
    set((state) => {
      if (!state.config) return {};
      const levels = new Set(state.config.log_levels || []);
      if (enabled) levels.add(level);
      else levels.delete(level);
      return { config: { ...state.config, log_levels: Array.from(levels) }, isDirty: true };
    });
  },

  setProxy: (value) => {
    set((state) => {
      if (!state.config) {
        return {};
      }
      return {
        config: {
          ...state.config,
          proxy: value,
        },
        isDirty: true,
      };
    });
  },

  setBaseUrl: (value) => {
    set((state) => {
      if (!state.config) {
        return {};
      }
      return {
        config: {
          ...state.config,
          base_url: value,
        },
        isDirty: true,
      };
    });
  },

  setGlobalSystemPrompt: (value) => {
    set((state) => state.config ? { config: { ...state.config, global_system_prompt: value }, isDirty: true } : {});
  },

  setSensitiveWordsText: (value) => {
    set((state) => state.config ? { config: { ...state.config, sensitive_words: value.split("\n") }, isDirty: true } : {});
  },

  setAIReviewField: (key, value) => {
    set((state) => state.config ? { config: { ...state.config, ai_review: { ...(state.config.ai_review || {}), [key]: value } }, isDirty: true } : {});
  },

  setBackupField: (key, value) => {
    set((state) => {
      if (!state.config?.backup) {
        return {};
      }
      return {
        config: {
          ...state.config,
          backup: {
            ...state.config.backup,
            [key]: value,
          },
        },
        isDirty: true,
      };
    });
  },

  setBackupInclude: (key, value) => {
    set((state) => {
      if (!state.config?.backup) {
        return {};
      }
      return {
        config: {
          ...state.config,
          backup: {
            ...state.config.backup,
            include: {
              ...state.config.backup.include,
              [key]: value,
            },
          },
        },
        isDirty: true,
      };
    });
  },

  loadBackups: async (silent = false) => {
    // 已有数据时同样视作静默刷新，避免 BackupSettingsCard 切回时坍缩。
    const effectiveSilent = silent || get().backups.length > 0 || get().backupState !== null;
    if (!effectiveSilent) {
      set({ isLoadingBackups: true });
    }
    try {
      const data = await fetchBackups();
      set({
        backups: data.items,
        backupState: data.state,
      });
    } catch (error) {
      if (!effectiveSilent) {
        toast.error(error instanceof Error ? error.message : "加载备份列表失败");
      }
    } finally {
      if (!effectiveSilent) {
        set({ isLoadingBackups: false });
      }
    }
  },

  runBackup: async () => {
    const missing = collectMissingBackupFields(get().config?.backup);
    if (missing) {
      toast.error(`请先填写${missing}`);
      return;
    }
    set({ isRunningBackup: true });
    try {
      const saved = await get().saveConfig();
      if (!saved) {
        return;
      }
      const data = await runBackupNow();
      toast.success(`备份已完成：${data.result.key}`);
      await get().loadBackups(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "执行备份失败");
    } finally {
      set({ isRunningBackup: false });
    }
  },

  removeBackup: async (key) => {
    set({ deletingBackupKey: key });
    try {
      await deleteBackup(key);
      toast.success("备份已删除");
      await get().loadBackups(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除备份失败");
    } finally {
      set({ deletingBackupKey: null });
    }
  },

  testBackup: async () => {
    const missing = collectMissingBackupFields(get().config?.backup);
    if (missing) {
      toast.error(`请先填写${missing}`);
      return;
    }
    set({ isTestingBackup: true });
    try {
      const saved = await get().saveConfig();
      if (!saved) {
        return;
      }
      const data = await testBackupConnection();
      toast.success(`R2 连接正常（HTTP ${data.result.status}）`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试备份连接失败");
    } finally {
      set({ isTestingBackup: false });
    }
  },

  loadRegister: async (silent = false) => {
    if (!silent) set({ isLoadingRegister: true });
    try {
      const data = await fetchRegisterConfig();
      set({ registerConfig: data.register });
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "加载注册配置失败");
    } finally {
      if (!silent) set({ isLoadingRegister: false });
    }
  },

  setRegisterConfig: (config) => {
    set({ registerConfig: config, isLoadingRegister: false });
  },

  setRegisterProxy: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, proxy: value } } : {});
  },

  setRegisterTotal: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, total: Number(value) || 0 } } : {});
  },

  setRegisterThreads: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, threads: Number(value) || 0 } } : {});
  },

  setRegisterMode: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, mode: value } } : {});
  },

  setRegisterTargetQuota: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, target_quota: Number(value) || 0 } } : {});
  },

  setRegisterTargetAvailable: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, target_available: Number(value) || 0 } } : {});
  },

  setRegisterCheckInterval: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, check_interval: Number(value) || 0 } } : {});
  },

  setRegisterFixedPassword: (value) => {
    set((state) => state.registerConfig ? { registerConfig: { ...state.registerConfig, fixed_password: value } } : {});
  },

  setRegisterMailField: (key, value) => {
    set((state) => state.registerConfig ? {
      registerConfig: {
        ...state.registerConfig,
        mail: { ...state.registerConfig.mail, [key]: Number(value) || 0 },
      },
    } : {});
  },

  addRegisterProvider: () => {
    set((state) => state.registerConfig ? {
      registerConfig: {
        ...state.registerConfig,
        mail: {
          ...state.registerConfig.mail,
          providers: [
            ...(state.registerConfig.mail.providers || []),
            { enable: true, type: "tempmail_lol", api_key: "", domain: [] },
          ],
        },
      },
    } : {});
  },

  updateRegisterProvider: (index, updates) => {
    set((state) => {
      if (!state.registerConfig) return {};
      const providers = [...(state.registerConfig.mail.providers || [])];
      providers[index] = { ...(providers[index] || {}), ...updates };
      return { registerConfig: { ...state.registerConfig, mail: { ...state.registerConfig.mail, providers } } };
    });
  },

  deleteRegisterProvider: (index) => {
    set((state) => state.registerConfig ? {
      registerConfig: {
        ...state.registerConfig,
        mail: {
          ...state.registerConfig.mail,
          providers: (state.registerConfig.mail.providers || []).filter((_, itemIndex) => itemIndex !== index),
        },
      },
    } : {});
  },

  saveRegister: async () => {
    const { registerConfig } = get();
    if (!registerConfig) return;
    try {
      set({ isSavingRegister: true });
      const data = await updateRegisterConfig({
        mail: registerConfig.mail,
        proxy: registerConfig.proxy.trim(),
        total: Math.max(1, Number(registerConfig.total) || 1),
        threads: Math.max(1, Number(registerConfig.threads) || 1),
        mode: registerConfig.mode,
        target_quota: Math.max(1, Number(registerConfig.target_quota) || 1),
        target_available: Math.max(1, Number(registerConfig.target_available) || 1),
        check_interval: Math.max(1, Number(registerConfig.check_interval) || 5),
        fixed_password: registerConfig.fixed_password,
      });
      set({ registerConfig: data.register });
      toast.success("注册配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存注册配置失败");
    } finally {
      set({ isSavingRegister: false });
    }
  },

  toggleRegister: async () => {
    const { registerConfig } = get();
    if (!registerConfig) return;
    set({ isSavingRegister: true });
    try {
      if (!registerConfig.enabled) {
        await updateRegisterConfig({
          mail: registerConfig.mail,
          proxy: registerConfig.proxy.trim(),
          total: Math.max(1, Number(registerConfig.total) || 1),
          threads: Math.max(1, Number(registerConfig.threads) || 1),
          mode: registerConfig.mode,
          target_quota: Math.max(1, Number(registerConfig.target_quota) || 1),
          target_available: Math.max(1, Number(registerConfig.target_available) || 1),
          check_interval: Math.max(1, Number(registerConfig.check_interval) || 5),
          fixed_password: registerConfig.fixed_password,
        });
      }
      const data = registerConfig.enabled ? await stopRegister() : await startRegister();
      set({ registerConfig: data.register });
      toast.success(registerConfig.enabled ? "注册任务已停止" : "注册任务已启动");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换注册状态失败");
    } finally {
      set({ isSavingRegister: false });
    }
  },

  resetRegister: async () => {
    set({ isSavingRegister: true });
    try {
      const data = await resetRegisterApi();
      set({ registerConfig: data.register });
      toast.success("注册统计已重置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置注册统计失败");
    } finally {
      set({ isSavingRegister: false });
    }
  },

  loadPools: async (silent = false) => {
    // 已经加载过 pools 后再切回设置页：静默刷新，不让 CPAPoolsCard 坍缩成 spinner。
    const effectiveSilent = silent || get().pools.length > 0;
    if (!effectiveSilent) {
      set({ isLoadingPools: true });
    }
    try {
      const data = await fetchCPAPools();
      set({ pools: data.pools });
    } catch (error) {
      if (!effectiveSilent) {
        toast.error(error instanceof Error ? error.message : "加载 CPA 连接失败");
      }
    } finally {
      if (!effectiveSilent) {
        set({ isLoadingPools: false });
      }
    }
  },

  openAddDialog: () => {
    set({
      editingPool: null,
      formName: "",
      formBaseUrl: "",
      formSecretKey: "",
      showSecret: false,
      dialogOpen: true,
    });
  },

  openEditDialog: (pool) => {
    set({
      editingPool: pool,
      formName: pool.name,
      formBaseUrl: pool.base_url,
      formSecretKey: "",
      showSecret: false,
      dialogOpen: true,
    });
  },

  setDialogOpen: (open) => {
    set({ dialogOpen: open });
  },

  setFormName: (value) => {
    set({ formName: value });
  },

  setFormBaseUrl: (value) => {
    set({ formBaseUrl: value });
  },

  setFormSecretKey: (value) => {
    set({ formSecretKey: value });
  },

  setShowSecret: (checked) => {
    set({ showSecret: checked });
  },

  savePool: async () => {
    const { editingPool, formName, formBaseUrl, formSecretKey } = get();
    if (!formBaseUrl.trim()) {
      toast.error("请输入 CPA 地址");
      return;
    }
    if (!editingPool && !formSecretKey.trim()) {
      toast.error("请输入 Secret Key");
      return;
    }

    set({ isSavingPool: true });
    try {
      if (editingPool) {
        const data = await updateCPAPool(editingPool.id, {
          name: formName.trim(),
          base_url: formBaseUrl.trim(),
          secret_key: formSecretKey.trim() || undefined,
        });
        set({ pools: data.pools, dialogOpen: false });
        toast.success("连接已更新");
      } else {
        const data = await createCPAPool({
          name: formName.trim(),
          base_url: formBaseUrl.trim(),
          secret_key: formSecretKey.trim(),
        });
        set({ pools: data.pools, dialogOpen: false });
        toast.success("连接已添加");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      set({ isSavingPool: false });
    }
  },

  deletePool: async (pool) => {
    set({ deletingId: pool.id });
    try {
      const data = await deleteCPAPool(pool.id);
      set({ pools: data.pools });
      toast.success("连接已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      set({ deletingId: null });
    }
  },

  browseFiles: async (pool) => {
    set({ loadingFilesId: pool.id });
    try {
      const data = await fetchCPAPoolFiles(pool.id);
      const files = normalizeFiles(data.files);
      set({
        browserPool: pool,
        remoteFiles: files,
        selectedNames: [],
        fileQuery: "",
        filePage: 1,
        browserOpen: true,
      });
      toast.success(`读取成功，共 ${files.length} 个远程账号`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取远程账号失败");
    } finally {
      set({ loadingFilesId: null });
    }
  },

  setBrowserOpen: (open) => {
    set({ browserOpen: open });
  },

  toggleFile: (name, checked) => {
    set((state) => {
      if (checked) {
        return {
          selectedNames: Array.from(new Set([...state.selectedNames, name])),
        };
      }
      return {
        selectedNames: state.selectedNames.filter((item) => item !== name),
      };
    });
  },

  replaceSelectedNames: (names) => {
    set({ selectedNames: Array.from(new Set(names)) });
  },

  setFileQuery: (value) => {
    set({ fileQuery: value, filePage: 1 });
  },

  setFilePage: (page) => {
    set({ filePage: page });
  },

  setPageSize: (value) => {
    set({ pageSize: value, filePage: 1 });
  },

  startImport: async () => {
    const { browserPool, selectedNames, pools } = get();
    if (!browserPool) {
      return;
    }
    if (selectedNames.length === 0) {
      toast.error("请先选择要导入的账号");
      return;
    }

    set({ isStartingImport: true });
    try {
      const result = await startCPAImport(browserPool.id, selectedNames);
      set({
        pools: pools.map((pool) =>
          pool.id === browserPool.id ? { ...pool, import_job: result.import_job } : pool,
        ),
        browserOpen: false,
      });
      toast.success("导入任务已启动");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "启动导入失败");
    } finally {
      set({ isStartingImport: false });
    }
  },
}));
