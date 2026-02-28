const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const http = require('http');

const PROJECTS_DIR = path.join('C:/Users/linjin101/.claude/projects');
const PORT = 3033;
const DEFAULT_PAGE_SIZE = 100;

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
};

// 清理项目名称
function cleanProjectName(projectId) {
    return projectId.replace(/^C--/, '').replace(/--/g, '/');
}

// 提取文本内容
function extractTextContent(content) {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n');
    }
    return '';
}

// 检查是否是需要过滤的系统消息
function shouldFilterMessage(type, content) {
    const textContent = extractTextContent(content);
    if (!textContent) return false;

    // 过滤 task-notification 相关内容
    if (textContent.includes('<task-notification>')) return true;
    if (textContent.includes('<task-id>')) return true;
    if (textContent.includes('<tool-use-id>')) return true;
    if (textContent.includes('<output-file>')) return true;
    if (textContent.includes('Read the output file to retrieve the result:')) return true;

    // 过滤会话继续消息
    if (textContent.includes('This session is being continued from a previous conversation')) return true;
    if (textContent.includes('If you need specific details from before compaction')) return true;
    if (textContent.includes('read the full transcript at:')) return true;

    // 过滤分析/摘要类
    if (textContent.startsWith('Analysis:') || textContent.startsWith('\nAnalysis:')) return true;
    if (textContent.startsWith('Summary:') || textContent.startsWith('\nSummary:')) return true;

    // 过滤纯错误日志
    if (textContent.startsWith('Error:') && textContent.includes('stack')) return true;
    if (textContent.includes('node:events:') && textContent.includes('throw er')) return true;

    return false;
}

// 格式化工具调用内容
function formatToolUse(content) {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        let result = '';
        for (const item of content) {
            if (item.type === 'tool_use') {
                result += `Tool: ${item.name}\n`;
                if (item.input) {
                    result += JSON.stringify(item.input, null, 2);
                }
            } else if (item.type === 'text') {
                result += item.text;
            }
        }
        return result;
    }
    return '';
}

// 格式化工具结果
function formatToolResult(content) {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        let result = '';
        for (const item of content) {
            if (item.type === 'tool_result') {
                if (item.content) {
                    if (typeof item.content === 'string') {
                        result += item.content;
                    } else if (Array.isArray(item.content)) {
                        result += item.content
                            .filter(c => c.type === 'text')
                            .map(c => c.text)
                            .join('\n');
                    }
                }
            } else if (item.type === 'text') {
                result += item.text;
            }
        }
        return result;
    }
    return '';
}

// 读取所有消息
async function readAllMessages(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    const messages = [];

    for (const line of lines) {
        try {
            const data = JSON.parse(line);

            // 只处理这几种类型
            if (!['user', 'assistant', 'tool_result'].includes(data.type)) {
                continue;
            }

            // 跳过过滤的消息
            if (shouldFilterMessage(data.type, data.message?.content)) {
                continue;
            }

            // 处理用户消息
            if (data.type === 'user' && data.message) {
                const textContent = extractTextContent(data.message.content);
                if (textContent) {
                    messages.push({
                        uuid: data.uuid,
                        timestamp: data.timestamp,
                        type: 'user',
                        role: 'user',
                        content: textContent
                    });
                }
                continue;
            }

            // 处理助手消息（包含 tool_use）
            if (data.type === 'assistant' && data.message?.content) {
                const contentArray = data.message.content;

                // 如果是数组，检查里面的类型
                if (Array.isArray(contentArray)) {
                    for (const item of contentArray) {
                        // 跳过 thinking
                        if (item.type === 'thinking') {
                            continue;
                        }
                        // 处理 tool_use
                        if (item.type === 'tool_use') {
                            messages.push({
                                uuid: data.uuid,
                                timestamp: data.timestamp,
                                type: 'tool_use',
                                role: 'tool_use',
                                toolName: item.name,
                                content: `Tool: ${item.name}\n${JSON.stringify(item.input, null, 2)}`
                            });
                        }
                        // 处理 text
                        if (item.type === 'text' && item.text) {
                            messages.push({
                                uuid: data.uuid,
                                timestamp: data.timestamp,
                                type: 'assistant',
                                role: 'assistant',
                                content: item.text
                            });
                        }
                    }
                } else {
                    // 如果是字符串
                    const textContent = extractTextContent(contentArray);
                    if (textContent) {
                        messages.push({
                            uuid: data.uuid,
                            timestamp: data.timestamp,
                            type: 'assistant',
                            role: 'assistant',
                            content: textContent
                        });
                    }
                }
                continue;
            }

            // 处理工具结果
            if (data.type === 'tool_result' && data.message) {
                let result = formatToolResult(data.message.content);
                if (result && result.length > 10000) {
                    result = result.substring(0, 10000) + '\n\n... (truncated)';
                }
                if (result) {
                    messages.push({
                        uuid: data.uuid,
                        timestamp: data.timestamp,
                        type: 'tool_result',
                        role: 'tool_result',
                        content: result
                    });
                }
            }
        } catch (e) {
            // Skip invalid lines
        }
    }

    return messages;
}

// 获取项目信息
async function getProjectInfo(projectDir) {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
        return null;
    }

    let allMessages = [];
    let totalSize = 0;

    for (const jsonlFile of jsonlFiles) {
        const filePath = path.join(projectDir, jsonlFile);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        const messages = await readAllMessages(filePath);
        allMessages = allMessages.concat(messages);
    }

    // 按时间排序
    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // 获取第一条用户消息作为标题
    let title = 'Untitled';
    const firstUserMsg = allMessages.find(m => m.type === 'user');
    if (firstUserMsg && firstUserMsg.content) {
        title = firstUserMsg.content.length > 60 ? firstUserMsg.content.substring(0, 60) + '...' : firstUserMsg.content;
    }

    const timestamps = allMessages.map(m => m.timestamp).filter(t => t);
    const displayName = cleanProjectName(path.basename(projectDir));

    return {
        id: path.basename(projectDir),
        displayName: displayName,
        name: title,
        path: projectDir,
        messageCount: allMessages.length,
        userMessageCount: allMessages.filter(m => m.type === 'user').length,
        startTime: timestamps[0],
        endTime: timestamps[timestamps.length - 1],
        fileSize: totalSize,
        files: jsonlFiles.length
    };
}

// 获取所有项目
async function getAllProjects() {
    const dirs = await fs.readdir(PROJECTS_DIR);
    const projects = [];

    for (const dir of dirs) {
        try {
            const dirPath = path.join(PROJECTS_DIR, dir);
            const stat = await fs.stat(dirPath);

            if (stat.isDirectory()) {
                const info = await getProjectInfo(dirPath);
                if (info) {
                    projects.push(info);
                }
            }
        } catch (e) {
            console.error('Error reading project:', dir, e.message);
        }
    }

    projects.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    return projects;
}

// 获取项目消息（分页）
async function getProjectMessages(projectId, page = 0, pageSize = DEFAULT_PAGE_SIZE, filters = null) {
    const projectPath = path.join(PROJECTS_DIR, projectId);
    const info = await getProjectInfo(projectPath);

    if (!info) {
        return null;
    }

    const files = await fs.readdir(projectPath);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    let allMessages = [];
    for (const jsonlFile of jsonlFiles) {
        const filePath = path.join(projectPath, jsonlFile);
        const messages = await readAllMessages(filePath);
        allMessages = allMessages.concat(messages);
    }

    // 应用筛选
    if (filters) {
        allMessages = allMessages.filter(msg => {
            // 消息类型筛选
            if (msg.type === 'user' && !filters.user) return false;
            if (msg.type === 'assistant' && !filters.assistant) return false;
            if (msg.type === 'tool_result' && !filters.result) return false;

            // 工具类型筛选
            if (msg.type === 'tool_use') {
                if (!filters.tool) return false;
                if (msg.toolName === 'Read' && !filters.read) return false;
                if (msg.toolName === 'Grep' && !filters.grep) return false;
                if (msg.toolName === 'Edit' && !filters.edit) return false;
                if (msg.toolName === 'Bash' && !filters.bash) return false;
                if (msg.toolName === 'Write' && !filters.write) return false;
            }

            return true;
        });
    }

    // 按时间排序（最新的在前）
    allMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 分页
    const start = page * pageSize;
    const end = start + pageSize;
    const pageMessages = allMessages.slice(start, end);

    return {
        info: {
            ...info,
            totalPages: Math.ceil(allMessages.length / pageSize),
            currentPage: page,
            totalMessages: allMessages.length
        },
        messages: pageMessages,
        hasMore: end < allMessages.length
    };
}

// 发送 JSON 响应
function sendJson(res, data) {
    try {
        const json = JSON.stringify(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(json);
    } catch (e) {
        console.error('JSON stringify error:', e.message);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Response too large' }));
        }
    }
}

// 发送错误响应
function sendError(res, code, message) {
    if (!res.headersSent) {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
    }
}

// HTTP 服务器
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/projects') {
        try {
            const projects = await getAllProjects();
            sendJson(res, projects);
        } catch (e) {
            console.error('Error getting projects:', e);
            sendError(res, 500, e.message);
        }
        return;
    }

    if (url.pathname.startsWith('/api/project/')) {
        const projectId = decodeURIComponent(url.pathname.split('/')[3]);
        const page = parseInt(url.searchParams.get('page') || '0');
        const pageSize = parseInt(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE);

        // 解析筛选参数
        const filters = {};
        const filterParams = ['user', 'assistant', 'tool', 'result', 'read', 'grep', 'edit', 'bash', 'write'];
        let hasFilters = false;
        for (const param of filterParams) {
            const value = url.searchParams.get(`filter_${param}`);
            if (value !== null) {
                filters[param] = value === 'true';
                hasFilters = true;
            }
        }

        try {
            const data = await getProjectMessages(projectId, page, pageSize, hasFilters ? filters : null);
            if (!data) {
                sendError(res, 404, 'Project not found');
                return;
            }
            sendJson(res, data);
        } catch (e) {
            console.error('Error getting project:', e);
            sendError(res, 500, e.message);
        }
        return;
    }

    // 特殊处理 favicon.ico
    if (url.pathname === '/favicon.ico' || url.pathname === '/favicon') {
        const faviconPath = path.join(__dirname, 'favicon.ico');
        try {
            const content = await fs.readFile(faviconPath);
            res.setHeader('Content-Type', 'image/x-icon');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.writeHead(200);
            res.end(content);
            return;
        } catch (e) {
            // favicon 不存在，返回 404 但不打印错误
            res.writeHead(404);
            res.end();
            return;
        }
    }

    let filePath = url.pathname === '/' ? '/claude-viewer.html' : url.pathname;
    filePath = path.join(__dirname, filePath);

    try {
        const content = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // 添加缓存控制
        if (ext === '.ico') {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (e) {
        console.error('File not found:', filePath, e.message);
        sendError(res, 404, 'Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Claude Context Viewer running at http://localhost:${PORT}`);
    console.log(`Projects directory: ${PROJECTS_DIR}`);
    console.log(`Showing full conversation (user, assistant, tools)`);
});
