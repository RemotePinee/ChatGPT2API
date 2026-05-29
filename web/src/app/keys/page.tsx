"use client";

import { LoaderCircle } from "lucide-react";

import { useAuthGuard } from "@/lib/use-auth-guard";

import { UserKeysCard } from "./components/user-keys-card";

function KeysPageContent() {
  return (
    <>
      <section className="mt-4 mb-2 flex flex-col gap-1 sm:mt-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-data text-[10px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              Auth · User Keys
            </span>
            <span className="h-px w-8 bg-border" />
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">用户密钥</h1>
          <p className="text-[13px] text-muted-foreground">
            为团队成员分发独立 API key，按画图与对话各自的日 / 月 / 总额度独立计费。
          </p>
        </div>
      </section>
      <section className="pb-12">
        <UserKeysCard />
      </section>
    </>
  );
}

export default function KeysPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);

  if (isCheckingAuth || !session || session.role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <KeysPageContent />;
}
