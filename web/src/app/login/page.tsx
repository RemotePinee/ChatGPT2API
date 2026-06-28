"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, LockKeyhole, Ticket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { login, redeemCDK } from "@/lib/api";
import { primeAuthSessionCache } from "@/lib/auth-session";
import { useRedirectIfAuthenticated } from "@/lib/use-auth-guard";
import { getDefaultRouteForRole, setStoredAuthSession } from "@/store/auth";

type Mode = "login" | "cdk";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [authKey, setAuthKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isCheckingAuth } = useRedirectIfAuthenticated();

  // CDK 注册字段
  const [cdkCode, setCdkCode] = useState("");
  const [cdkUserName, setCdkUserName] = useState("");
  const [redeemedKey, setRedeemedKey] = useState("");

  const handleLogin = async () => {
    const normalizedAuthKey = authKey.trim();
    if (!normalizedAuthKey) {
      toast.error("请输入密钥");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await login(normalizedAuthKey);
      const nextSession = {
        key: normalizedAuthKey,
        role: data.role,
        subjectId: data.subject_id,
        name: data.name,
      };
      await setStoredAuthSession(nextSession);
      primeAuthSessionCache(nextSession);
      router.replace(getDefaultRouteForRole(data.role));
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCDKRedeem = async () => {
    const normalizedCode = cdkCode.trim().toUpperCase();
    const normalizedName = cdkUserName.trim();

    if (!normalizedCode) {
      toast.error("请输入 CDK 兑换码");
      return;
    }
    if (!normalizedName) {
      toast.error("请输入用户名");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await redeemCDK(normalizedCode, normalizedName);
      setRedeemedKey(data.key);
      toast.success(data.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "兑换失败";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(redeemedKey);
      toast.success("密钥已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  const handleLoginWithKey = async () => {
    setIsSubmitting(true);
    try {
      const data = await login(redeemedKey);
      const nextSession = {
        key: redeemedKey,
        role: data.role,
        subjectId: data.subject_id,
        name: data.name,
      };
      await setStoredAuthSession(nextSession);
      primeAuthSessionCache(nextSession);
      router.replace(getDefaultRouteForRole(data.role));
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="grid min-h-[calc(100vh-1rem)] w-full place-items-center px-4 py-6">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  // CDK 兑换成功页面
  if (redeemedKey) {
    return (
      <div className="grid min-h-[calc(100vh-1rem)] w-full place-items-center px-4 py-6">
        <Card className="w-full max-w-[505px] rounded-[30px] border-white/80 bg-white/95 shadow-[0_28px_90px_rgba(28,25,23,0.10)]">
          <CardContent className="space-y-7 p-6 sm:p-8">
            <div className="space-y-4 text-center">
              <div className="mx-auto inline-flex size-14 items-center justify-center rounded-[18px] bg-emerald-600 text-white shadow-sm">
                <Ticket className="size-5" />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-stone-950">兑换成功！</h1>
                <p className="text-sm leading-6 text-stone-500">
                  您的专属密钥已生成，请立即保存。此密钥仅显示一次，关闭后将无法再次查看。
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <span className="text-xl">⚠️</span>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-semibold text-amber-900">重要提示</p>
                  <p className="text-xs leading-relaxed text-amber-800">
                    密钥仅显示一次，请务必复制保存。丢失后无法找回，需重新获取新的 CDK。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label htmlFor="redeemed-key" className="block text-sm font-medium text-stone-700">
                您的专属密钥
              </label>
              <div className="relative">
                <Input
                  id="redeemed-key"
                  type="text"
                  value={redeemedKey}
                  readOnly
                  className="h-13 rounded-2xl border-stone-200 bg-stone-50 px-4 font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Button
                className="h-13 w-full rounded-2xl bg-stone-950 text-white hover:bg-stone-800"
                onClick={handleCopyKey}
              >
                复制密钥
              </Button>
              <Button
                className="h-13 w-full rounded-2xl border-2 border-stone-200 bg-white text-stone-900 hover:bg-stone-50"
                onClick={() => void handleLoginWithKey()}
                disabled={isSubmitting}
              >
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                复制完成，立即登录
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-1rem)] w-full place-items-center px-4 py-6">
      <Card className="w-full max-w-[505px] rounded-[30px] border-white/80 bg-white/95 shadow-[0_28px_90px_rgba(28,25,23,0.10)]">
        <CardContent className="space-y-7 p-6 sm:p-8">
          <div className="space-y-4 text-center">
            <div className="mx-auto inline-flex size-14 items-center justify-center rounded-[18px] bg-stone-950 text-white shadow-sm">
              {mode === "login" ? <LockKeyhole className="size-5" /> : <Ticket className="size-5" />}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
                {mode === "login" ? "欢迎回来" : "CDK 兑换"}
              </h1>
              <p className="text-sm leading-6 text-stone-500">
                {mode === "login"
                  ? "输入密钥后继续使用账号管理和图片生成功能。"
                  : "输入 CDK 兑换码和用户名，自动获取专属密钥。"}
              </p>
            </div>
          </div>

          {mode === "login" ? (
            <>
              <div className="space-y-3">
                <label htmlFor="auth-key" className="block text-sm font-medium text-stone-700">
                  密钥
                </label>
                <Input
                  id="auth-key"
                  type="password"
                  value={authKey}
                  onChange={(event) => setAuthKey(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleLogin();
                    }
                  }}
                  placeholder="请输入密钥"
                  className="h-13 rounded-2xl border-stone-200 bg-white px-4"
                />
              </div>

              <Button
                className="h-13 w-full rounded-2xl bg-stone-950 text-white hover:bg-stone-800"
                onClick={() => void handleLogin()}
                disabled={isSubmitting}
              >
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                登录
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-3">
                  <label htmlFor="cdk-code" className="block text-sm font-medium text-stone-700">
                    CDK 兑换码
                  </label>
                  <Input
                    id="cdk-code"
                    type="text"
                    value={cdkCode}
                    onChange={(event) => setCdkCode(event.target.value)}
                    placeholder="输入 16 位兑换码"
                    className="h-13 rounded-2xl border-stone-200 bg-white px-4 font-mono uppercase"
                    maxLength={16}
                  />
                </div>

                <div className="space-y-3">
                  <label htmlFor="cdk-username" className="block text-sm font-medium text-stone-700">
                    用户名
                  </label>
                  <Input
                    id="cdk-username"
                    type="text"
                    value={cdkUserName}
                    onChange={(event) => setCdkUserName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void handleCDKRedeem();
                      }
                    }}
                    placeholder="设置您的用户名"
                    className="h-13 rounded-2xl border-stone-200 bg-white px-4"
                  />
                </div>
              </div>

              <Button
                className="h-13 w-full rounded-2xl bg-stone-950 text-white hover:bg-stone-800"
                onClick={() => void handleCDKRedeem()}
                disabled={isSubmitting}
              >
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                兑换并获取密钥
              </Button>
            </>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-stone-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-stone-500">或</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="h-11 w-full rounded-2xl border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
            onClick={() => setMode(mode === "login" ? "cdk" : "login")}
          >
            {mode === "login" ? (
              <>
                <Ticket className="size-4" />
                使用 CDK 兑换码注册
              </>
            ) : (
              <>
                <LockKeyhole className="size-4" />
                已有密钥？直接登录
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
