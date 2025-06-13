/**
 * HTTP/SOCKS 代理解析器
 * 支持多种 HTTP 和 SOCKS 代理格式
 */

/**
 * HTTP/HTTPS URI 解析器
 * 格式: http://username:password@server:port 或 https://username:password@server:port
 */
export class HTTPURIParser {
  constructor() {
    this.name = 'HTTP URI Parser';
  }

  /**
   * 测试是否为 HTTP URI 格式
   * @param {string} line - 输入行
   * @returns {boolean} 是否匹配
   */
  test(line) {
    return /^https?:\/\//.test(line.trim());
  }

  /**
   * 解析 HTTP URI
   * @param {string} line - 输入行
   * @returns {Object} 解析结果
   */
  parse(line) {
    line = line.trim();
    
    // 解析 HTTP URI
    const match = /^(https?):\/\/(?:([^:@]+)(?::([^@]*))?@)?([^:/#]+)(?::(\d+))?(?:\/([^#]*))?(?:#(.*))?$/.exec(line);
    if (!match) {
      throw new Error('Invalid HTTP URI format');
    }

    const [, protocol, username, password, server, port, path, name] = match;
    
    const defaultPort = protocol === 'https' ? 443 : 80;
    
    return {
      type: 'http',
      name: name ? decodeURIComponent(name) : `HTTP ${server}:${port || defaultPort}`,
      server,
      port: parseInt(port || defaultPort.toString(), 10),
      username: username ? decodeURIComponent(username) : undefined,
      password: password ? decodeURIComponent(password) : undefined,
      tls: protocol === 'https',
      path: path ? '/' + path : undefined
    };
  }
}

/**
 * SOCKS URI 解析器
 * 格式: socks5://username:password@server:port 或 socks://base64auth@server:port
 */
export class SOCKSURIParser {
  constructor() {
    this.name = 'SOCKS URI Parser';
  }

  /**
   * 测试是否为 SOCKS URI 格式
   * @param {string} line - 输入行
   * @returns {boolean} 是否匹配
   */
  test(line) {
    return /^socks[45]?:\/\//.test(line.trim());
  }

  /**
   * 解析 SOCKS URI
   * @param {string} line - 输入行
   * @returns {Object} 解析结果
   */
  parse(line) {
    line = line.trim();
    
    // 解析 SOCKS URI
    const match = /^(socks[45]?):\/\/(?:([^@]+)@)?([^:/#]+)(?::(\d+))?(?:#(.*))?$/.exec(line);
    if (!match) {
      throw new Error('Invalid SOCKS URI format');
    }

    const [, protocol, auth, server, port, name] = match;
    
    const proxy = {
      type: protocol === 'socks4' ? 'socks4' : 'socks5',
      name: name ? decodeURIComponent(name) : `SOCKS ${server}:${port || 1080}`,
      server,
      port: parseInt(port || '1080', 10)
    };

    // 解析认证信息
    if (auth) {
      if (auth.includes(':')) {
        // 用户名:密码格式
        const [username, password] = auth.split(':');
        proxy.username = decodeURIComponent(username);
        proxy.password = decodeURIComponent(password);
      } else {
        // Base64编码的认证信息
        try {
          const decoded = atob(auth);
          const [username, password] = decoded.split(':');
          proxy.username = username;
          proxy.password = password;
        } catch (e) {
          // 如果不是Base64，当作用户名处理
          proxy.username = decodeURIComponent(auth);
        }
      }
    }

    return proxy;
  }
}

/**
 * Surge HTTP/SOCKS 格式解析器
 * 格式: ProxyName = http, server, port, username, password, tls=true
 */
export class SurgeHTTPSOCKSParser {
  constructor() {
    this.name = 'Surge HTTP/SOCKS Parser';
  }

  /**
   * 测试是否为 Surge HTTP/SOCKS 格式
   * @param {string} line - 输入行
   * @returns {boolean} 是否匹配
   */
  test(line) {
    return /^.*?=\s*(https?|socks5(-tls)?)\s*,/.test(line.trim());
  }

  /**
   * 解析 Surge HTTP/SOCKS 格式
   * @param {string} line - 输入行
   * @returns {Object} 解析结果
   */
  parse(line) {
    line = line.trim();
    
    // 解析基本格式
    const match = /^(.*?)\s*=\s*(https?|socks5(?:-tls)?)\s*,\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error('Invalid Surge HTTP/SOCKS format');
    }

    const [, name, type, params] = match;
    const parts = params.split(',').map(p => p.trim());
    
    if (parts.length < 2) {
      throw new Error('Invalid Surge HTTP/SOCKS format: missing server or port');
    }

    const proxy = {
      type: type.startsWith('socks') ? 'socks5' : 'http',
      name: name.trim(),
      server: parts[0],
      port: parseInt(parts[1], 10)
    };

    // SOCKS5-TLS 特殊处理
    if (type === 'socks5-tls') {
      proxy.tls = true;
    }

    // 解析用户名和密码（位置参数）
    if (parts.length > 2 && parts[2]) {
      proxy.username = this.unquote(parts[2]);
    }
    if (parts.length > 3 && parts[3]) {
      proxy.password = this.unquote(parts[3]);
    }

    // 解析其他参数
    for (let i = 4; i < parts.length; i++) {
      const param = parts[i];
      const [key, value] = param.split('=').map(p => p.trim());
      
      if (!key) continue;
      
      switch (key.toLowerCase()) {
        case 'tls':
          proxy.tls = value ? value.toLowerCase() === 'true' : true;
          break;
        case 'skip-cert-verify':
          proxy['skip-cert-verify'] = value ? value.toLowerCase() === 'true' : true;
          break;
        case 'sni':
          proxy.sni = this.unquote(value);
          break;
        case 'username':
          proxy.username = this.unquote(value);
          break;
        case 'password':
          proxy.password = this.unquote(value);
          break;
      }
    }

    return proxy;
  }

  /**
   * 移除引号
   * @param {string} str - 字符串
   * @returns {string} 移除引号后的字符串
   */
  unquote(str) {
    if (!str) return str;
    if ((str.startsWith('"') && str.endsWith('"')) || 
        (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1);
    }
    return str;
  }
}

/**
 * QX HTTP/SOCKS 格式解析器
 * 格式: http=server:port,username=xxx,password=xxx
 */
export class QXHTTPSOCKSParser {
  constructor() {
    this.name = 'QX HTTP/SOCKS Parser';
  }

  /**
   * 测试是否为 QX HTTP/SOCKS 格式
   * @param {string} line - 输入行
   * @returns {boolean} 是否匹配
   */
  test(line) {
    return /^(http|socks5)\s*=/.test(line.trim());
  }

  /**
   * 解析 QX HTTP/SOCKS 格式
   * @param {string} line - 输入行
   * @returns {Object} 解析结果
   */
  parse(line) {
    line = line.trim();
    
    // 解析基本格式
    const match = /^(http|socks5)\s*=\s*([^,]+)(?:,(.*))?$/.exec(line);
    if (!match) {
      throw new Error('Invalid QX HTTP/SOCKS format');
    }

    const [, type, serverPort, params = ''] = match;
    const [server, port] = serverPort.split(':');
    
    const proxy = {
      type,
      name: `${type.toUpperCase()} ${server}:${port}`,
      server,
      port: parseInt(port, 10)
    };

    // 解析参数
    if (params) {
      const paramPairs = params.split(',').map(p => p.trim());
      
      for (const param of paramPairs) {
        const [key, value] = param.split('=').map(p => p.trim());
        
        if (!key || !value) continue;
        
        switch (key.toLowerCase()) {
          case 'username':
            proxy.username = value;
            break;
          case 'password':
            proxy.password = value;
            break;
          case 'over-tls':
            proxy.tls = value.toLowerCase() === 'true';
            break;
          case 'tls-verification':
            proxy['skip-cert-verify'] = value.toLowerCase() === 'false';
            break;
          case 'tls-host':
            proxy.sni = value;
            break;
          case 'tag':
            proxy.name = value;
            break;
        }
      }
    }

    return proxy;
  }
}

// 导出解析器
export const httpSocksParsers = [
  new HTTPURIParser(),
  new SOCKSURIParser(),
  new SurgeHTTPSOCKSParser(),
  new QXHTTPSOCKSParser()
];
