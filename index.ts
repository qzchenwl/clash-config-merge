import yaml from 'js-yaml';
import axios from 'axios';
import fs from 'fs';

// 命令行参数解析
const args = Bun.argv.slice(2);
let configPath = './clash.yaml';
let urlsArg: string[] = [];
let keywordsArg: string[] = [];
let maxRetries = 3;
let retryDelay = 3000;
let accessToken = ''; // 访问令牌，默认为空(不启用)

// 解析命令行参数
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--config' && i + 1 < args.length) {
    const nextArg = args[++i];
    if (nextArg) configPath = nextArg;
  } else if (arg === '--url' && i + 1 < args.length) {
    const nextArg = args[++i];
    if (nextArg) urlsArg.push(nextArg);
  } else if (arg === '--keyword' && i + 1 < args.length) {
    const nextArg = args[++i];
    if (nextArg) keywordsArg.push(nextArg);
  } else if (arg === '--retries' && i + 1 < args.length) {
    const nextArg = args[++i];
    if (nextArg) maxRetries = parseInt(nextArg, 10);
  } else if (arg === '--retry-delay' && i + 1 < args.length) {
    const nextArg = args[++i];
    if (nextArg) retryDelay = parseInt(nextArg, 10) * 1000; // 转换为毫秒
  } else if (arg === '--token' && i + 1 < args.length) {
    const nextArg = args[++i];
    if (nextArg) accessToken = nextArg;
  } else if (arg === '--help') {
    console.log(`
用法: NODE_TLS_REJECT_UNAUTHORIZED=0 bun index.ts [选项]

选项:
  --config <path>      指定clash配置文件路径 (默认: ./clash.yaml)
  --url <url>          添加代理URL (必须提供至少一个，可多次使用)
  --keyword <keyword>  添加关键字，前缀!表示排除 (可多次使用，默认为空)
  --retries <number>   设置请求失败重试次数 (默认: 3)
  --retry-delay <sec>  设置请求失败重试间隔(秒) (默认: 3)
  --token <string>     设置访问令牌，需要通过URL参数验证 (默认: 不启用)
  --help               显示帮助信息

示例:
  bun index.ts --config ./my-clash.yaml --url https://example.com/clash --keyword 日本 --keyword '!香港' --retries 5 --retry-delay 5 --token mySecretToken
`);
    process.exit(0);
  }
}

// 验证必须提供至少一个URL
if (urlsArg.length === 0) {
  console.error('错误: 必须提供至少一个URL (使用 --url 选项)');
  console.log('使用 --help 查看帮助信息');
  process.exit(1);
}

// 使用命令行参数
const urls = urlsArg;
const keywords = keywordsArg; // 默认为空数组

console.log('使用配置:');
console.log(`- 配置文件: ${configPath}`);
console.log(`- URLs: ${urls.join(', ')}`);
console.log(`- 关键字: ${keywords.length > 0 ? keywords.join(', ') : '(无)'}`);
console.log(`- 重试次数: ${maxRetries}`);
console.log(`- 重试间隔: ${retryDelay/1000}秒`);
if (accessToken) {
  console.log(`- 访问令牌: 已启用 (${accessToken.substring(0, 3)}${'*'.repeat(Math.max(0, accessToken.length - 3))})`);
} else {
  console.log(`- 访问令牌: 未启用`);
}

/**
 * 带重试功能的请求函数
 * @param url 请求URL
 * @param index URL索引
 * @returns 请求结果
 */
async function fetchWithRetry(url: string, index: number): Promise<any> {
  let retries = 0;
  
  while (true) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'clash'
        },
        timeout: 30000 // 30 seconds timeout
      });
      return response.data;
    } catch (error: any) {
      retries++;
      if (retries > maxRetries) {
        console.error(`URL[${index}] 请求失败，已重试 ${maxRetries} 次，放弃请求:`, error.message || '未知错误');
        throw error;
      }
      
      console.warn(`URL[${index}] 请求失败 (${retries}/${maxRetries})，等待 ${retryDelay/1000} 秒后重试:`, error.message || '未知错误');
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      console.log(`URL[${index}] 正在进行第 ${retries} 次重试...`);
    }
  }
}

/**
 * 从多个URL获取并合并代理节点
 * @param urls 配置URL数组
 * @returns 合并后的代理节点数组
 */
async function fetchAndMergeProxies(urls: string[]): Promise<any[]> {
  const allProxies: any[] = [];
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue; // 跳过空URL
    
    try {
      console.log(`正在处理URL[${i}]...`);
      const data = await fetchWithRetry(url, i);
      const clashConfig = yaml.load(data) as any;
      
      if (clashConfig?.proxies?.length) {
        // 过滤有效代理并添加索引前缀
        const validProxies = clashConfig.proxies
          .filter((proxy: any) => typeof proxy.name === 'string' && proxy.name)
          .map((proxy: any) => ({
            ...proxy,
            name: `[${i}]${proxy.name}`
          }));
        
        console.log(`URL[${i}] 获取到 ${validProxies.length} 个有效节点`);
        allProxies.push(...validProxies);
      } else {
        console.log(`URL[${i}] 未找到可用节点`);
      }
    } catch (error: any) {
      console.error(`处理URL[${i}]时出错:`, error.message || '未知错误');
    }
  }
  
  return allProxies;
}

/**
 * 根据代理节点创建代理组
 * @param proxies 代理节点数组
 * @param keywords 关键字列表，每个关键字创建一个组
 * @returns 代理组数组
 */
function createProxyGroups(proxies: any[], keywords: string[] = []): any[] {
  // 提取所有代理节点的名称
  const proxyNames = proxies.map(proxy => proxy.name);
  
  // 创建基础代理组
  const proxyGroups = [
    {
      name: '自动选择',
      type: 'url-test',
      proxies: proxyNames,
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50
    },
    {
      name: '手动选择',
      type: 'select',
      proxies: proxyNames
    }
  ];
  
  // 为每个关键字创建一个自动选择的组
  const keywordGroups = keywords.map(keyword => {
    const isExclude = keyword.startsWith('!');
    const actualKeyword = isExclude ? keyword.substring(1) : keyword;
    const groupName = isExclude 
      ? `自动选择（非${actualKeyword}）` 
      : `自动选择（${actualKeyword}）`;
    
    // 根据关键字过滤节点
    const filteredProxies = proxyNames.filter(name => {
      const containsKeyword = name.toLowerCase().includes(actualKeyword.toLowerCase());
      return isExclude ? !containsKeyword : containsKeyword;
    });
    
    return {
      name: groupName,
      type: 'url-test',
      proxies: filteredProxies,
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50
    };
  });
  
  // 将关键字组添加到代理组列表
  proxyGroups.push(...keywordGroups);
  
  // 创建节点选择组，包含所有自动选择组和手动选择
  const allGroupNames = proxyGroups
    .filter(group => group.name !== '手动选择')
    .map(group => group.name);
  
  proxyGroups.push({
    name: '节点选择',
    type: 'select',
    proxies: [...allGroupNames, '手动选择', 'DIRECT']
  });
  
  return proxyGroups;
}

/**
 * 更新Clash配置中的proxies和proxy-groups
 * @param config 已加载的Clash配置
 * @param proxies 代理节点数组
 * @param proxyGroups 代理组数组
 * @returns 更新后的Clash配置
 */
function updateClashConfig(config: any, proxies: any[], proxyGroups: any[]): any {
  // 更新配置
  config.proxies = proxies;
  config['proxy-groups'] = proxyGroups;
  
  return config;
}

/**
 * 生成更新后的Clash配置
 * @returns 更新后的YAML配置
 */
async function generateUpdatedConfig(): Promise<string> {
  try {
    // 获取并合并代理节点
    const mergedProxies = await fetchAndMergeProxies(urls);
    
    if (mergedProxies.length > 0) {
      console.log(`\n成功合并 ${mergedProxies.length} 个节点`);
      
      // 创建代理组
      const proxyGroups = createProxyGroups(mergedProxies, keywords);
      
      // 读取clash.yaml文件
      const content = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(content) as any;
      
      // 更新Clash配置
      const fullConfig = updateClashConfig(config, mergedProxies, proxyGroups);
      
      // 将配置转换为YAML
      const yamlConfig = yaml.dump(fullConfig);
      return yamlConfig;
    } else {
      throw new Error('没有找到任何可用节点');
    }
  } catch (error: any) {
    console.error('生成配置出错:', error.message || '未知错误');
    throw error;
  }
}

// 创建HTTP服务器
const server = Bun.serve({
  port: 3000,
  
  // 定义路由
  routes: {
    // 主路由 - 返回更新后的clash配置
    "/": {
      GET: async (req) => {
        try {
          // 如果设置了访问令牌，验证请求中的token参数
          if (accessToken) {
            const url = new URL(req.url);
            const tokenParam = url.searchParams.get('token');
            
            if (!tokenParam || tokenParam !== accessToken) {
              console.error('访问令牌无效，拒绝请求');
              return new Response('Unauthorized: Invalid token', { status: 401 });
            }
          }
          
          const yamlConfig = await generateUpdatedConfig();
          console.log('已成功响应配置请求');
          
          return new Response(yamlConfig, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } catch (error: any) {
          console.error('处理请求时出错:', error.message || '未知错误');
          return Response.json(
            { error: error.message || '服务器内部错误' }, 
            { status: 500 }
          );
        }
      }
    },
    
    // 健康检查
    "/ping": {
      GET: (req) => {
        // ping 端点不需要 token 验证，直接返回响应
        return new Response("pong");
      }
    },
  },
  
  // 未匹配路由的处理
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  }
});

console.log(`Clash配置服务已启动，监听端口 ${server.port}`);
console.log(`- 访问 http://localhost:${server.port} 在浏览器中查看配置`);
console.log(`- 访问 http://localhost:${server.port}/ping 健康检查`);
if (accessToken) {
  console.log(`- 访问需要添加参数: ?token=${accessToken}`);
}
console.log('使用示例:');
console.log('NODE_TLS_REJECT_UNAUTHORIZED=0 bun index.ts --url https://example.com/clash --keyword 日本 --config ./clash.yaml');
