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
- `--help`: 显示帮助信息
