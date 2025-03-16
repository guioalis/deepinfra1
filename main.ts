// DeepInfra API代理服务
// 添加API Key认证并支持部署到Deno Deploy

// 配置
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/openai/";
const DEEPINFRA_API_KEY = "321123"; // DeepInfra API Key
const API_KEYS = ["321123"]; // 允许访问的API Keys列表

// 验证API Key
function validateApiKey(request: Request): boolean {
  const authHeader = request.headers.get("Authorization");
  
  if (!authHeader) {
    return false;
  }
  
  // 提取Bearer token
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) {
    return false;
  }
  
  const apiKey = match[1];
  return API_KEYS.includes(apiKey);
}

// 处理请求的主函数
async function handleRequest(request: Request): Promise<Response> {
  // 检查请求方法
  if (request.method === "OPTIONS") {
    return handleCORS();
  }

  try {
    // 获取请求路径
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 验证API Key (除了OPTIONS请求外的所有请求都需要验证)
    if (!validateApiKey(request)) {
      return new Response(JSON.stringify({ error: "未授权，请提供有效的API Key" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      });
    }
    
    // 处理 /v1/models 请求
    if (path === "/v1/models") {
      return await handleModelsRequest();
    }
    
    // 只处理对OpenAI API的请求
    if (!path.startsWith("/v1/openai/")) {
      return new Response(JSON.stringify({ error: "路径不支持" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      });
    }

    // 构建转发到DeepInfra的URL
    // 从路径中提取模型名称和其他路径部分
    const targetPath = path.replace("/v1/openai/", "");
    const targetUrl = `${DEEPINFRA_API_URL}${targetPath}${url.search}`;
    
    // 准备转发请求
    const headers = new Headers();
    
    // 复制原始请求的headers
    for (const [key, value] of request.headers.entries()) {
      // 跳过host和connection相关的header
      if (!["host", "connection", "authorization"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
    
    // 添加DeepInfra API Key认证
    headers.set("Authorization", `Bearer ${DEEPINFRA_API_KEY}`);
    headers.set("Content-Type", "application/json");
    
    // 创建转发请求
    const forwardRequest = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.body,
    });
    
    // 发送请求到DeepInfra API
    const response = await fetch(forwardRequest);
    
    // 构建响应
    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      responseHeaders.set(key, value);
    }
    
    // 添加CORS头
    for (const [key, value] of Object.entries(corsHeaders())) {
      responseHeaders.set(key, value);
    }
    
    // 返回响应
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("处理请求时出错:", error);
    return new Response(JSON.stringify({ error: "服务器内部错误" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
}

// 处理 /v1/models 请求
async function handleModelsRequest(): Promise<Response> {
  try {
    // 构建请求URL
    const targetUrl = `${DEEPINFRA_API_URL}models`;
    
    // 准备请求头
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${DEEPINFRA_API_KEY}`);
    headers.set("Content-Type", "application/json");
    
    // 创建请求
    const request = new Request(targetUrl, {
      method: "GET",
      headers: headers,
    });
    
    // 发送请求到DeepInfra API
    const response = await fetch(request);
    
    // 如果请求失败
    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify(errorData), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      });
    }
    
    // 获取并处理响应数据
    const data = await response.json();
    
    // 返回响应
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    console.error("处理models请求时出错:", error);
    return new Response(JSON.stringify({ error: "获取模型列表失败" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
}

// 处理CORS预检请求
function handleCORS(): Response {
  return new Response(null, {
    status: 204, // No content
    headers: corsHeaders(),
  });
}

// CORS头
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// 监听请求
Deno.serve(handleRequest);
