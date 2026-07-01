// server.js
const http = require('http');
const dgram = require('dgram');
const fs = require('fs').promises;
const path = require('path');

const PORT = process.env.PORT || 7860;
const CONFIG_FILE = path.join(__dirname, 'upstreams.json');

// 运行时的内存缓存
let activeUpstreams = null;

// 默认上游服务器列表
const DEFAULT_UPSTREAMS = [
  "https://1.1.1.1/dns-query",
  "8.8.8.8",
  "114.114.114.114:53"
];

// 初始化并获取上游配置
async function getUpstreams() {
  // 1. 如果内存中已有当前配置（运行期间），直接返回
  if (activeUpstreams) {
    return activeUpstreams;
  }

  // 2. 尝试从本地 JSON 文件读取（如果本地存在或开启了持久化存储卷）
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    activeUpstreams = JSON.parse(data);
    return activeUpstreams;
  } catch (err) {
    // 读取文件失败，继续尝试环境变量
  }

  // 3. 尝试从环境变量读取（如在 HF 后台配置的 UPSTREAMS，以逗号分隔）
  if (process.env.UPSTREAMS) {
    try {
      // 解析逗号分隔的字符串，例如: "8.8.8.8, https://1.1.1.1/dns-query"
      activeUpstreams = process.env.UPSTREAMS.split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
      
      if (activeUpstreams.length > 0) {
        console.log("Loaded upstreams from environment variable:", activeUpstreams);
        return activeUpstreams;
      }
    } catch (e) {
      console.error("Failed to parse UPSTREAMS env variable:", e);
    }
  }

  // 4. 终极默认兜底值
  activeUpstreams = DEFAULT_UPSTREAMS;
  return activeUpstreams;
}

// 保存上游配置（支持同步到内存，并尝试写入本地）
async function saveUpstreams(upstreams) {
  activeUpstreams = upstreams; // 更新内存，确保即便无法写入硬盘，网页端设置也立即生效
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(upstreams, null, 2), 'utf8');
  } catch (err) {
    // 捕获可能由于临时或只读文件系统导致的写入失败，防止程序崩溃
    console.warn("Temporary filesystem: Could not write upstreams to disk (Normal in Ephemeral Environments):", err.message);
  }
}

// Base64URL 解码（用于解析 GET 请求中的 dns 参数）
function base64urlToBytes(base64url) {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// 解析上游地址类型
function parseUpstream(upstream) {
  const trimmed = upstream.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { type: "doh", url: trimmed };
  } else {
    let host = trimmed;
    let port = 53;
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":");
      host = parts[0];
      const p = parseInt(parts[1], 10);
      if (!isNaN(p)) port = p;
    }
    return { type: "udp", host, port };
  }
}

// 传统 UDP 查询逻辑（Node.js 原生 dgram）
function queryUdp(host, port, query, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      try { client.close(); } catch (e) {}
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`UDP timeout to ${host}:${port}`));
    }, timeoutMs);

    client.on('message', (msg) => {
      cleanup();
      resolve(new Uint8Array(msg));
    });

    client.on('error', (err) => {
      cleanup();
      reject(err);
    });

    client.send(query, 0, query.length, port, host, (err) => {
      if (err) {
        cleanup();
        reject(err);
      }
    });
  });
}

// DoH 查询逻辑（Node.js 18+ 原生 fetch）
async function queryDoh(urlStr, query, method, searchParams, timeoutMs = 2500) {
  const targetUrl = new URL(urlStr);
  searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = {
    "content-type": "application/dns-message",
    "accept": "application/dns-message",
    "host": targetUrl.host,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestOptions = {
    method: method === "POST" ? "POST" : "GET",
    headers,
    signal: controller.signal,
  };

  if (method === "POST") {
    requestOptions.body = query;
  } else {
    const b64 = btoa(String.fromCharCode(...query))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    targetUrl.searchParams.set("dns", b64);
  }

  try {
    const response = await fetch(targetUrl.toString(), requestOptions);
    clearTimeout(timer);
    if (!response.ok) {
      throw new Error(`DoH upstream returned HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// 可视化面板 HTML
const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Node.js DNS & DoH 控制面板</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; background-color: #f8fafc; color: #1e293b; }
        h1 { text-align: center; color: #0f172a; margin-bottom: 5px; }
        .subtitle { text-align: center; color: #64748b; margin-bottom: 30px; font-size: 14px; }
        .card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); margin-bottom: 20px; border: 1px solid #e2e8f0; }
        .card h3 { margin-top: 0; color: #334155; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px; color: #475569; }
        input, select, button { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-size: 15px; }
        button { background-color: #2563eb; color: white; border: none; cursor: pointer; font-weight: 600; transition: background 0.2s; }
        button:hover { background-color: #1d4ed8; }
        .code-block { background: #f8fafc; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; border: 1px solid #e2e8f0; word-break: break-all; color: #0f172a; }
        
        .upstream-item { display: flex; gap: 10px; margin-bottom: 8px; }
        .btn-danger { background-color: #ef4444; width: auto; padding: 10px 15px; }
        .btn-danger:hover { background-color: #dc2626; }
        .btn-secondary { background-color: #64748b; margin-top: 10px; }
        .btn-secondary:hover { background-color: #475569; }

        .flex-container { display: flex; gap: 15px; }
        .flex-child { flex: 1; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
        .badge-success { background: #dcfce7; color: #15803d; }
        .badge-fail { background: #fee2e2; color: #b91c1c; }
        pre { background: #0f172a; color: #f8fafc; padding: 15px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 13px; margin-top: 10px; }
    </style>
</head>
<body>
    <h1>Node.js DNS & DoH 助手</h1>
    <div class="subtitle">支持传统 UDP DNS 与 DoH 上游并发竞速解析</div>
    
    <div class="card">
        <h3>1. 您的专属 DoH 地址</h3>
        <p style="font-size: 13px; color: #64748b; margin-top: -5px;">请在设备或浏览器中配置此地址：</p>
        <div class="code-block" id="doh-url">加载中...</div>
    </div>

    <div class="card">
        <h3>2. 配置多协议上游 DNS 服务器</h3>
        <p style="font-size: 13px; color: #64748b; margin-top: -5px;">
            支持混合填写！无论是 <b>DoH 地址</b> (e.g. <code>https://1.1.1.1/dns-query</code>) 还是 <b>传统 DNS</b> (e.g. <code>8.8.8.8</code> 或 <code>223.5.5.5:53</code>)，服务都会自动识别并并发竞速查询：
        </p>
        <div id="upstream-list"></div>
        <button class="btn-secondary" onclick="addUpstreamInput('')">+ 添加新上游</button>
        <button style="margin-top: 15px; background-color: #10b981;" onclick="saveUpstreams()">保存上游配置</button>
    </div>

    <div class="card">
        <h3>3. 联通性测试面板</h3>
        <div class="flex-container">
            <div class="flex-child form-group">
                <label for="test-domain">测试域名或网址</label>
                <input type="text" id="test-domain" value="google.com">
            </div>
            <div class="flex-child form-group">
                <label for="test-type">记录类型</label>
                <select id="test-type">
                    <option value="1">A (IPv4)</option>
                    <option value="28">AAAA (IPv6)</option>
                </select>
            </div>
        </div>
        <button onclick="testDoH()">执行 DoH 协议测试</button>
        
        <div id="test-result-area" style="display: none; margin-top: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold; font-size: 14px;">测试状态：</span>
                <span id="test-status"></span>
            </div>
            <pre id="test-output">等待测试...</pre>
        </div>
    </div>

    <script>
        document.getElementById('doh-url').textContent = window.location.origin + '/dns-query';

        async function loadUpstreams() {
            const res = await fetch('/api/upstreams');
            const data = await res.json();
            const listContainer = document.getElementById('upstream-list');
            listContainer.innerHTML = '';
            
            if (data.upstreams && data.upstreams.length > 0) {
                data.upstreams.forEach(url => addUpstreamInput(url));
            } else {
                addUpstreamInput('');
            }
        }

        function addUpstreamInput(value) {
            const container = document.getElementById('upstream-list');
            const div = document.createElement('div');
            div.className = 'upstream-item';
            div.innerHTML = \`
                <input type="text" class="upstream-url" value="\${value}" placeholder="例如 8.8.8.8 或 https://dns.google/dns-query">
                <button class="btn-danger" onclick="this.parentElement.remove()">删除</button>
            \`;
            container.appendChild(div);
        }

        async function saveUpstreams() {
            const inputs = document.querySelectorAll('.upstream-url');
            const upstreams = Array.from(inputs).map(i => i.value.trim()).filter(v => v !== '');

            if (upstreams.length === 0) {
                alert("至少需要保留一个上游服务器！");
                return;
            }

            const res = await fetch('/api/upstreams', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ upstreams })
            });

            if (res.ok) {
                alert("配置已成功保存！");
                loadUpstreams();
            } else {
                alert("保存失败");
            }
        }

        function buildDnsQuery(domain, qtype) {
            const domainParts = domain.split('.');
            let length = 12;
            for (const part of domainParts) length += 1 + part.length;
            length += 5;

            const buffer = new Uint8Array(length);
            const view = new DataView(buffer.buffer);

            view.setUint16(0, 0x1234); 
            view.setUint16(2, 0x0100); 
            view.setUint16(4, 1);      

            let offset = 12;
            for (const part of domainParts) {
                buffer[offset++] = part.length;
                for (let i = 0; i < part.length; i++) buffer[offset++] = part.charCodeAt(i);
            }
            buffer[offset++] = 0; 
            view.setUint16(offset, qtype);     
            view.setUint16(offset + 2, 1);    
            return buffer;
        }

        function parseDnsResponse(buffer, qtype) {
            const view = new DataView(buffer.buffer);
            const flags = view.getUint16(2);
            const qdcount = view.getUint16(4);
            const ancount = view.getUint16(6);
            if ((flags & 0x000F) !== 0) return "DNS解析失败 (RCODE != 0)";
            if (ancount === 0) return "无记录";

            let offset = 12;
            for (let i = 0; i < qdcount; i++) {
                while (buffer[offset] !== 0) {
                    if ((buffer[offset] & 0xC0) === 0xC0) { offset += 2; break; }
                    else offset += 1 + buffer[offset];
                }
                if (buffer[offset] === 0) offset++;
                offset += 4;
            }

            const ips = [];
            for (let i = 0; i < ancount; i++) {
                if ((buffer[offset] & 0xC0) === 0xC0) offset += 2;
                else {
                    while (buffer[offset] !== 0) offset += 1 + buffer[offset];
                    offset++;
                }
                const type = view.getUint16(offset);
                const rdlength = view.getUint16(offset + 8);
                offset += 10;

                if (type === 1 && rdlength === 4) {
                    ips.push(Array.from(buffer.subarray(offset, offset + 4)).join('.'));
                } else if (type === 28 && rdlength === 16) {
                    const hex = [];
                    for (let j = 0; j < 16; j += 2) hex.push(view.getUint16(offset + j).toString(16));
                    ips.push(hex.join(':'));
                }
                offset += rdlength;
            }
            return ips.length > 0 ? ips.join('\\n') : "未提取到直接IP";
        }

        async function testDoH() {
            let inputVal = document.getElementById('test-domain').value.trim();
            let domain = inputVal;

            // 自动解析和提取域名
            if (inputVal.includes("://")) {
                try {
                    const urlObj = new URL(inputVal);
                    domain = urlObj.hostname;
                } catch (e) {
                    domain = inputVal.replace(/^(https?:\\/\\/)?([^/\\s]+)(.*)$/i, '$2');
                }
            } else {
                domain = inputVal.split('/')[0];
            }

            if (domain.includes(':')) {
                domain = domain.split(':')[0];
            }

            const qtype = parseInt(document.getElementById('test-type').value);
            const resultArea = document.getElementById('test-result-area');
            const statusBadge = document.getElementById('test-status');
            const outputEl = document.getElementById('test-output');

            resultArea.style.display = 'block';
            statusBadge.className = 'badge';
            statusBadge.textContent = '测试中...';

            if (!domain) {
                statusBadge.className = 'badge badge-fail';
                statusBadge.textContent = '输入错误';
                outputEl.textContent = '无法从输入提取有效的域名，请检查输入。';
                return;
            }

            const queryPacket = buildDnsQuery(domain, qtype);
            try {
                const response = await fetch('/dns-query', {
                    method: 'POST',
                    headers: { 'content-type': 'application/dns-message' },
                    body: queryPacket
                });

                if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
                const resBuffer = new Uint8Array(await response.arrayBuffer());
                const parsed = parseDnsResponse(resBuffer, qtype);
                
                statusBadge.className = 'badge badge-success';
                statusBadge.textContent = '正常';
                outputEl.textContent = \`查询域名: \${domain}\\n\\n\` + parsed;
            } catch (err) {
                statusBadge.className = 'badge badge-fail';
                statusBadge.textContent = '异常';
                outputEl.textContent = \`查询域名: \${domain}\\n\\n\` + err.message;
            }
        }

        loadUpstreams();
    </script>
</body>
</html>
`;

// HTTP 服务创建
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. 获取已保存的上游配置接口
  if (url.pathname === "/api/upstreams" && req.method === "GET") {
    const upstreams = await getUpstreams();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ upstreams }));
    return;
  }

  // 2. 保存上游配置接口
  if (url.pathname === "/api/upstreams" && req.method === "POST") {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { upstreams } = JSON.parse(body);
        if (Array.isArray(upstreams) && upstreams.length > 0) {
          await saveUpstreams(upstreams);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(400);
          res.end("Invalid list");
        }
      } catch (err) {
        res.writeHead(400);
        res.end("Bad request");
      }
    });
    return;
  }

  // 3. 处理 DoH 核心请求 (支持 GET 与 POST)
  if (url.pathname.startsWith("/dns-query")) {
    const upstreams = await getUpstreams();

    const handleDnsQuery = async (queryBytes) => {
      // 竞速派发
      const fetchPromises = upstreams.map(async (upstream) => {
        const parsed = parseUpstream(upstream);
        if (parsed.type === "doh") {
          return await queryDoh(parsed.url, queryBytes, req.method, url.searchParams);
        } else {
          return await queryUdp(parsed.host, parsed.port, queryBytes);
        }
      });

      try {
        const fastestResponseBytes = await Promise.any(fetchPromises);
        res.writeHead(200, {
          "content-type": "application/dns-message",
          "cache-control": "max-age=30",
        });
        res.end(Buffer.from(fastestResponseBytes));
      } catch (err) {
        console.error("All DNS upstreams failed:", err);
        res.writeHead(502);
        res.end("All upstreams failed");
      }
    };

    if (req.method === "POST") {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const queryBytes = new Uint8Array(Buffer.concat(chunks));
        handleDnsQuery(queryBytes);
      });
    } else if (req.method === "GET") {
      const dnsParam = url.searchParams.get("dns");
      if (!dnsParam) {
        res.writeHead(400);
        res.end("Missing 'dns' parameter");
        return;
      }
      try {
        const queryBytes = base64urlToBytes(dnsParam);
        handleDnsQuery(queryBytes);
      } catch (err) {
        res.writeHead(400);
        res.end("Invalid dns encoding");
      }
    } else {
      res.writeHead(405);
      res.end("Method Not Allowed");
    }
    return;
  }

  // 4. 默认返回网页 HTML
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(htmlContent);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`DNS-over-HTTPS Server is running on port ${PORT}`);
});
