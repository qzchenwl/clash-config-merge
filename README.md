# Clash 配置服务

这个服务可以动态生成基于关键字过滤的Clash配置文件。

## 环境要求

- [Bun](https://bun.sh) v1.2.8+
- [Docker](https://www.docker.com/) (可选)

## 本地运行

安装依赖:

```bash
bun install
```

运行服务:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 bun index.ts --url 'https://example.com/clash' --keyword '关键字'
```

## Docker 运行

构建镜像:

```bash
docker build -t clash-config-server .
```

运行容器:

```bash
# 基本运行方式
docker run -p 3000:3000 clash-config-server --url 'https://example.com/clash' --keyword '关键字'

# 可选：如需使用本地的clash.yaml文件
docker run -p 3000:3000 -v $(pwd)/clash.yaml:/app/clash.yaml:ro clash-config-server --url 'https://example.com/clash' --keyword '关键字'
```

## 使用 Docker Compose

```bash
docker-compose up -d
```

## 使用方法

服务启动后，访问 http://localhost:3000 获取配置文件。

### 命令行选项

- `--config <path>`: 指定clash配置文件路径 (默认: ./clash.yaml)
- `--url <url>`: 添加代理URL (必须提供至少一个，可多次使用)
- `--keyword <keyword>`: 添加关键字，前缀!表示排除 (可多次使用，默认为空)
- `--retries <number>`: 设置请求失败重试次数 (默认: 3)
- `--retry-delay <sec>`: 设置请求失败重试间隔(秒) (默认: 3)
- `--token <string>`: 设置访问令牌，需要通过URL参数验证 (默认: 不启用)
- `--help`: 显示帮助信息

## 特性功能

### 关键字过滤

可以使用关键字过滤节点，例如：

```bash
bun index.ts --url 'https://example.com/clash' --keyword '日本' --keyword '!香港'
```

这会创建包含"日本"节点，但排除"香港"节点的组。

### 请求重试

当获取配置源失败时，会自动进行重试：

```bash
bun index.ts --url 'https://example.com/clash' --retries 5 --retry-delay 5
```

上面的命令会在请求失败时最多重试5次，每次间隔5秒。

### 访问控制

通过设置访问令牌保护配置：

```bash
bun index.ts --url 'https://example.com/clash' --token 'my-secret-token'
```

设置令牌后，访问配置需要添加token参数：

```
http://localhost:3000/?token=my-secret-token
```

注意：健康检查端点 `/ping` 不需要令牌即可访问。
