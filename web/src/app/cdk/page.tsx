"use client";

import { LoaderCircle } from "lucide-react";

import { useAuthGuard } from "@/lib/use-auth-guard";

import { CDKManagementCard } from "./components/cdk-management-card";

function CDKPageContent() {
  return (
    <>
      <section className="mt-4 mb-2 flex flex-col gap-1 sm:mt-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-data text-[10px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              CDK · Management
            </span>
            <span className="h-px w-8 bg-border" />
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">CDK 管理</h1>
          <p className="text-[13px] text-muted-foreground">
            批量生成兑换码，用户通过 CDK 自助注册获取独立密钥。每个 CDK 绑定固定的额度配置。
          </p>
        </div>
      </section>
      <section className="pb-12">
        <CDKManagementCard />
      </section>
    </>
  );
}

export default function CDKPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);

  if (isCheckingAuth || !session || session.role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <CDKPageContent />;
}
