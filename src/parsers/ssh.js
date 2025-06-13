/**
 * SSH 解析器
 * 支持 SSH URI 格式和 Surge SSH 格式
 */

/**
 * SSH URI 解析器
 * 格式: ssh://username:password@server:port
 */
export class SSHURIParser {
  constructor() {
    this.name = 'SSH URI Parser';
  }

  /**
   * 测试是否为 SSH URI 格式
   * @param {string} line - 输入行
   * @returns {boolean} 是否匹配
   */
  test(line) {
    return /^ssh:\/\//.test(line.trim());
  }

  /**
   * 解析 SSH URI
   * @param {string} line - 输入行
   * @returns {Object} 解析结果
   */
  parse(line) {
    line = line.trim();
    
    // 解析 SSH URI: ssh://username:password@server:port#name
    const match = /^ssh:\/\/(?:([^:@]+)(?::([^@]*))?@)?([^:/#]+)(?::(\d+))?(?:#(.*))?$/.exec(line);
    if (!match) {
      throw new Error('Invalid SSH URI format');
    }

    const [, username, password, server, port, name] = match;
    
    return {
      type: 'ssh',
      name: name ? decodeURIComponent(name) : `SSH ${server}:${port || 22}`,
      server,
      port: parseInt(port || '22', 10),
      username: username ? decodeURIComponent(username) : '',
      password: password ? decodeURIComponent(password) : ''
    };
  }
}

/**
 * Surge SSH 格式解析器
 * 格式: ProxyName = ssh, server, port, username=xxx, password=xxx
 */
export class SurgeSSHParser {
  constructor() {
    this.name = 'Surge SSH Parser';
  }

  /**
   * 测试是否为 Surge SSH 格式
   * @param {string} line - 输入行
   * @returns {boolean} 是否匹配
   */
  test(line) {
    return /^.*?=\s*ssh\s*,/.test(line.trim());
  }

  /**
   * 解析 Surge SSH 格式
   * @param {string} line - 输入行
   * @returns {Object} 解析结果
   */
  parse(line) {
    line = line.trim();
    
    // 解析基本格式
    const match = /^(.*?)\s*=\s*ssh\s*,\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error('Invalid Surge SSH format');
    }

    const [, name, params] = match;
    const parts = params.split(',').map(p => p.trim());
    
    if (parts.length < 2) {
      throw new Error('Invalid Surge SSH format: missing server or port');
    }

    const proxy = {
      type: 'ssh',
      name: name.trim(),
      server: parts[0],
      port: parseInt(parts[1], 10)
    };

    // 解析其他参数
    for (let i = 2; i < parts.length; i++) {
      const param = parts[i];
      const [key, value] = param.split('=').map(p => p.trim());
      
      if (!key || !value) continue;
      
      switch (key.toLowerCase()) {
        case 'username':
          proxy.username = this.unquote(value);
          break;
        case 'password':
          proxy.password = this.unquote(value);
          break;
        case 'private-key':
        case 'privatekey':
          proxy['private-key'] = this.unquote(value);
          break;
        case 'private-key-passphrase':
        case 'privatekeypassphrase':
          proxy['private-key-passphrase'] = this.unquote(value);
          break;
        case 'host-key-algorithms':
        case 'hostkeyalgorithms':
          proxy['host-key-algorithms'] = this.unquote(value);
          break;
        case 'encryption-algorithms':
        case 'encryptionalgorithms':
          proxy['encryption-algorithms'] = this.unquote(value);
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
    if ((str.startsWith('"') && str.endsWith('"')) || 
        (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1);
    }
    return str;
  }
}

/**
 * OpenSSH 配置格式解析器
 * 支持简化的 OpenSSH 配置格式
 */
export class OpenSSHConfigParser {
  constructor() {
    this.name = 'OpenSSH Config Parser';
  }

  /**
   * 测试是否为 OpenSSH 配置格式
   * @param {string} content - 输入内容
   * @returns {boolean} 是否匹配
   */
  test(content) {
    return /^\s*Host\s+/im.test(content) && /^\s*HostName\s+/im.test(content);
  }

  /**
   * 解析 OpenSSH 配置
   * @param {string} content - 配置内容
   * @returns {Object[]} 解析结果数组
   */
  parse(content) {
    const hosts = this.parseHosts(content);
    const proxies = [];

    for (const host of hosts) {
      if (host.HostName) {
        const proxy = {
          type: 'ssh',
          name: host.Host || host.HostName,
          server: host.HostName,
          port: parseInt(host.Port || '22', 10),
          username: host.User || '',
          password: host.Password || ''
        };

        // 可选参数
        if (host.IdentityFile) {
          proxy['private-key'] = host.IdentityFile;
        }
        
        if (host.IdentitiesOnly) {
          proxy['identities-only'] = host.IdentitiesOnly.toLowerCase() === 'yes';
        }

        proxies.push(proxy);
      }
    }

    return proxies;
  }

  /**
   * 解析主机配置
   * @param {string} content - 配置内容
   * @returns {Array} 主机配置数组
   */
  parseHosts(content) {
    const hosts = [];
    const lines = content.split('\n');
    let currentHost = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#') || !trimmed) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split(/\s+/);
      const value = valueParts.join(' ');

      if (key.toLowerCase() === 'host') {
        if (currentHost) {
          hosts.push(currentHost);
        }
        currentHost = { Host: value };
      } else if (currentHost) {
        currentHost[key] = value;
      }
    }

    if (currentHost) {
      hosts.push(currentHost);
    }

    return hosts;
  }
}

// 导出解析器
export const sshParsers = [
  new SSHURIParser(),
  new SurgeSSHParser(),
  new OpenSSHConfigParser()
];
