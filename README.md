<h1 align="center">
  <img src="assets/logo.png" alt="ChatGPT2API" width="72" height="72" />
  <br />
  ChatGPT2API
</h1>


<p align="center">ChatGPT2API 主要是对 ChatGPT 官网相关能力进行逆向整理与封装，提供面向 ChatGPT 图片生成、图片编辑、多图组图编辑场景的 OpenAI 兼容图片 API / 代理，并集成在线画图、号池管理、多种账号导入方式与 Docker 自托管部署能力。</p>

<p align="center">
  <img src="assets/hero.png" alt="ChatGPT2API" width="100%" />
</p>

> [!NOTE]
> 本项目是基于 [basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api) 的二次开发版本，主要在前端 UI/UX、注册机、日志/图片管理等模块上做了增强与重构。
>
> - 原项目地址：https://github.com/basketikun/chatgpt2api
> - 感谢原作者的逆向工作与开源贡献。如果你只需要稳定的核心能力，可以直接使用原项目。

> [!WARNING]
> 免责声明：
>
> 本项目涉及对 ChatGPT 官网文本生成、图片生成与图片编辑等相关接口的逆向研究，仅供个人学习、技术研究与非商业性技术交流使用。
>
> - 严禁将本项目用于任何商业用途、盈利性使用、批量操作、自动化滥用或规模化调用。
> - 严禁将本项目用于破坏市场秩序、恶意竞争、套利倒卖、二次售卖相关服务，以及任何违反 OpenAI 服务条款或当地法律法规的行为。
> - 严禁将本项目用于生成、传播或协助生成违法、暴力、色情、未成年人相关内容，或用于诈骗、欺诈、骚扰等非法或不当用途。
> - 使用者应自行承担全部风险，包括但不限于账号被限制、临时封禁或永久封禁以及因违规使用等所导致的法律责任。
> - 使用本项目即视为你已充分理解并同意本免责声明全部内容；如因滥用、违规或违法使用造成任何后果，均由使用者自行承担。

> [!IMPORTANT]
> 本项目基于对 ChatGPT 官网相关能力的逆向研究实现，存在账号受限、临时封禁或永久封禁的风险。请勿使用你自己的重要账号、常用账号或高价值账号进行测试。

## 快速开始

已发布镜像支持 `linux/amd64` 与 `linux/arm64`，在 x86 服务器和 Apple Silicon / ARM Linux 设备上都会自动拉取匹配架构的版本。

### Docker 运行

```bash
git clone https://github.com/RemotePinee/ChatGPT2API.git
cd ChatGPT2API
docker compose up -d
```

启动前请先在 `config.json` 中设置 `auth-key`，也可以在 `docker-compose.yml` 中通过 `CHATGPT2API_AUTH_KEY` 覆盖。

- Web 面板：`http://localhost:3000`
- API 地址：`http://localhost:3000/v1`
- 数据目录：`./data`

### 本地开发

启动后端：

```bash
git clone https://github.com/RemotePinee/ChatGPT2API.git
cd ChatGPT2API
uv sync
uv run main.py
```

启动前端：

```bash
cd ChatGPT2API/web
bun install
bun run dev
```

### 存储后端配置

支持通过环境变量 `STORAGE_BACKEND` 切换存储方式：

- `json` - 本地 JSON 文件（默认）
- `sqlite` - 本地 SQLite 数据库
- `postgres` - 外部 PostgreSQL（需配置 `DATABASE_URL`）
- `git` - Git 私有仓库（需配置 `GIT_REPO_URL` 和 `GIT_TOKEN`）

示例：使用 PostgreSQL

```yaml
environment:
  - STORAGE_BACKEND=postgres
  - DATABASE_URL=postgresql://user:password@host:5432/dbname
```

## 功能

### API 兼容能力

- 兼容 `POST /v1/images/generations` 图片生成接口
- 兼容 `POST /v1/images/edits` 图片编辑接口
- 兼容 `POST /v1/chat/completions`（OpenAI Chat Completions）
- 兼容 `POST /v1/responses`（OpenAI Responses）
- 兼容 `POST /v1/messages`（Anthropic Messages）
- `GET /v1/models` 实时同步上游可用模型（如 `gpt-5`、`gpt-5-mini`、`auto` 等，以你账号实际权限为准），并附带本地图片模型别名 `gpt-image-2`、`codex-gpt-image-2`
- 文本类接口 `/v1/chat/completions`、`/v1/responses`、`/v1/messages` 的 `model` 字段直接透传给上游，可用模型范围由账号在 ChatGPT 网页端的权限决定
- 图片类接口仅识别 `gpt-image-2`（映射到上游 `gpt-5-3` slug）与 `codex-gpt-image-2`（走 Codex 画图通道），其他模型名走图片接口会回落到 `auto`
- 图片类接口支持 `size` 画幅参数（`1:1`、`16:9`、`9:16`、`4:3`、`3:4`）与 `resolution` 清晰度参数（`1k`、`2k`、`4k`）
- `resolution=2k/4k` 会优先走 Codex 高清画图路线，并按 `Pro` → `Plus` → `Team` 的可用账号池筛选；高清路线失败时不会自动降级成普通 1K
- 支持通过 `n` 一次返回多张生成结果（后端限制 1-4）
- 支持 Codex 中的画图接口逆向，仅 `Plus` / `Team` / `Pro` 订阅可用，模型别名为 `codex-gpt-image-2`，与官网画图共用账号但额度独立

### 在线画图工作台

- 内置在线画图工作台，支持文生图、图片编辑与多图组图编辑
- 支持 `gpt-image-2`、`codex-gpt-image-2` 两种图片模型
- 支持 1K / 2K / 4K 清晰度选择，普通用户自动锁定 1K，高级用户可使用 2K / 4K
- 编辑模式支持参考图上传
- 前端支持多图生成交互
- 本地保存图片会话历史，支持回看、删除和清空
- 支持服务端缓存图片 URL

### 号池管理

- 自动刷新账号邮箱、类型、额度和恢复时间
- 轮询可用账号执行图片生成与图片编辑
- 遇到 Token 失效类错误时自动剔除无效 Token
- 遇到图片生成 429 / `rate_limit_exceeded` / `usage_limit_reached` 时会标记该账号为限流，并按上游 reset header 自动恢复
- 定时检查限流账号并自动刷新
- 支持搜索、筛选、批量刷新、导出、手动编辑和清理账号
- 支持四种导入方式：本地 CPA JSON 文件导入、远程 CPA 服务器导入、`sub2api` 服务器导入、`access_token` 直接导入
- 支持在设置页配置 `sub2api` 服务器，筛选并批量导入其中的 OpenAI OAuth 账号

### 注册机

- 内置 ChatGPT 邮箱注册流水线
- 支持启动、停止、重置注册任务
- SSE 实时回传注册进度与日志

### 日志管理

- 系统日志按类型与时间范围筛选
- 支持 `debug` / `info` / `warning` / `error` 级别过滤
- 实时刷新与历史回看

### 图片管理

- 服务端缓存图片浏览与下载
- 标签管理与筛选
- 按日期范围检索
- 单图删除与批量清理

### CDK 管理

- CDK 兑换码生成与管理，支持单次使用和多次使用两种模式
- 批量生成 CDK，支持自定义过期时间和配额配置
- 灵活的配额控制：日额度、月额度、总额度，支持独立开关
- 管理端支持查看、编辑、删除 CDK（包括已使用的 CDK）
- 用户端 CDK 兑换入口，自动创建账号并分配权限

### 配置与备份

- 全局 `auth-key` + 用户级密钥二级权限体系（admin / user），用户密钥可设置普通 / 高级等级
- 普通用户只能使用 free 账号池和 1K 画图；高级用户可使用 Plus / Team / Pro 账号池与 2K / 4K 高清画图
- 多种存储后端：`json` / `sqlite` / `postgres` / `git`
- 全局 HTTP / HTTPS / SOCKS5 / SOCKS5H 代理
- Cloudflare R2 自动备份（可加密、可选项保留）
- 全局系统提示词、敏感词过滤、可选的 AI 自动审查

## 安卓客户端

提供配套的安卓客户端 **Draw**，与本项目后端深度对接，覆盖文生图、图生图、画廊、作品管理等场景。

> [!NOTE]
> 安卓客户端为闭源发布，仅以 APK 形式在 [Releases](https://github.com/RemotePinee/ChatGPT2API/releases) 提供下载；本仓库不包含其源码。后端 API 完全开源，欢迎基于 [`docs/android-integration.md`](docs/android-integration.md) 自行实现客户端。

### 下载安装

1. 在 [Releases](https://github.com/RemotePinee/ChatGPT2API/releases) 页面下载最新版 `Draw-vX.Y.Z.apk`
2. 安装后启动，首次进入填写：
   - **后端地址**：你部署的 ChatGPT2API 实例地址（例如 `https://api.example.com`）
   - **访问密钥**：管理员根 key（`config.json` 的 `auth-key`）或在设置页创建的 user 密钥

### 主要能力

- 文生图 / 图生图，支持参考图、风格预设、比例与张数选择
- 支持 1K / 2K / 4K 清晰度选择，并根据用户密钥权限展示普通 / 高级用户状态
- 公共画廊：浏览社区作品、一键复用 prompt、本人发布的可撤回
- 我的作品：本地缓存 + 云端归属合并，重装 / 换设备不丢图
- 后台生成：弹窗收起后任务继续跑，完成时全局 Toast 通知
- 自动刷新可用额度，密钥失效或后端不可达时自动跳回登录页

### 兼容性

| 项 | 要求 |
|---|---|
| Android 最低版本 | 8.0（API 26） |
| 后端版本 | 推荐与客户端发布日期相近的后端版本，至少需要支持 `/v1/images/*`、`/api/gallery/*`、`/api/me/images` 等接口 |
| 网络 | 客户端走 HTTPS 时后端建议套一层反向代理；HTTP 仅建议局域网调试 |

## Screenshots

号池管理：

![accounts](assets/accounts.png)

在线画图：

![image-studio](assets/image-studio.png)

注册机：

![register](assets/register.png)

日志管理：

![logs](assets/logs.png)

图片管理：

![image-manager](assets/image-manager.png)

CDK 管理：

![cdk-manage](assets/cdk-manage.png)

CDK 兑换：

![cdk-reg](assets/cdk-reg.png)

CDK 使用：

![cdk-get](assets/cdk-get.png)

## API

所有 AI 接口都需要请求头：

```http
Authorization: Bearer <auth-key>
```

<details>
<summary><code>GET /v1/models</code></summary>
<br>

返回当前暴露的图片模型列表。

```bash
curl http://localhost:8000/v1/models \
  -H "Authorization: Bearer <auth-key>"
```

<details>
<summary>说明</summary>
<br>

| 字段   | 说明                                                                                                         |
|:-----|:-----------------------------------------------------------------------------------------------------------|
| 返回模型 | `gpt-image-2`、`codex-gpt-image-2`、`auto`、`gpt-5`、`gpt-5-1`、`gpt-5-2`、`gpt-5-3`、`gpt-5-3-mini`、`gpt-5-mini` |
| 接入场景 | 可接入 Cherry Studio、New API 等上游或客户端                                                                          |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/images/generations</code></summary>
<br>

OpenAI 兼容图片生成接口，用于文生图。

```bash
curl http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一只漂浮在太空里的猫",
    "n": 1,
    "size": "1:1",
    "resolution": "1k",
    "response_format": "b64_json"
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段                | 说明                                                 |
|:------------------|:---------------------------------------------------|
| `model`           | 图片模型，当前可用值以 `/v1/models` 返回结果为准，推荐使用 `gpt-image-2` |
| `prompt`          | 图片生成提示词                                            |
| `n`               | 生成数量，当前后端限制为 `1-4`                                 |
| `size`            | 画幅比例，支持 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`               |
| `resolution`      | 清晰度，支持 `1k`、`2k`、`4k`；`2k/4k` 需要高级用户权限与可用 Plus/Team/Pro 账号 |
| `response_format` | 当前请求模型中包含该字段，默认值为 `b64_json`                       |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/images/edits</code></summary>
<br>

OpenAI 兼容图片编辑接口，用于上传图片并生成编辑结果。

```bash
curl http://localhost:8000/v1/images/edits \
  -H "Authorization: Bearer <auth-key>" \
  -F "model=gpt-image-2" \
  -F "prompt=把这张图改成赛博朋克夜景风格" \
  -F "n=1" \
  -F "size=9:16" \
  -F "resolution=1k" \
  -F "image=@./input.png"
```

<details>
<summary>字段说明</summary>
<br>

| 字段       | 说明                                  |
|:---------|:------------------------------------|
| `model`  | 图片模型， `gpt-image-2`                 |
| `prompt` | 图片编辑提示词                             |
| `n`      | 生成数量，当前后端限制为 `1-4`                  |
| `size`   | 画幅比例，支持 `1:1`、`16:9`、`9:16`、`4:3`、`3:4` |
| `resolution` | 清晰度，支持 `1k`、`2k`、`4k`；`2k/4k` 需要高级用户权限 |
| `image`  | 需要编辑的图片文件，使用 multipart/form-data 上传 |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/chat/completions</code></summary>
<br>

面向图片场景的 Chat Completions 兼容接口，不是完整通用聊天代理。

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-image-2",
    "messages": [
      {
        "role": "user",
        "content": "生成一张雨夜东京街头的赛博朋克猫"
      }
    ],
    "n": 1
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段         | 说明                |
|:-----------|:------------------|
| `model`    | 图片模型，默认按图片生成场景处理  |
| `messages` | 消息数组，需要是图片相关请求内容  |
| `n`        | 生成数量，按当前实现解析为图片数量 |
| `stream`   | 已实现，但仍在测试         |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/responses</code></summary>
<br>

面向图片生成工具调用的 Responses API 兼容接口，不是完整通用 Responses API 代理。

```bash
curl http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-5",
    "input": "生成一张未来感城市天际线图片",
    "tools": [
      {
        "type": "image_generation"
      }
    ]
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段       | 说明                            |
|:---------|:------------------------------|
| `model`  | 响应中会回显该模型字段，但图片生成当前仍走图片生成兼容逻辑 |
| `input`  | 输入内容，需要能解析出图片生成提示词            |
| `tools`  | 必须包含 `image_generation` 工具请求  |
| `stream` | 已实现，但仍在测试                     |

<br>
</details>
</details>

## 友情链接

- [LINUX DO - 新的理想型社区](https://linux.do/)

