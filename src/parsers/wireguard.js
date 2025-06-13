/**
 * WireGuard 解析器
 * 支持 WireGuard URI 格式和配置文件格式
 */

import { isIPv4, isIPv6 } from '../utils/common.js';

/**
 * WireGuard URI 解析器
 * 格式: wireguard://privatekey@server:port/?publickey=xxx&address=xxx&...
 */
export class WireGuardURIParser {
  constructor() {
    this.name = 'WireGuard URI Parser';
  }

  /**
   * 测试是否为 WireGuard URI 格式
   * @param {string} line - 输入行
   * @returns {boolean} 是否匹配
   */
  test(line) {
    return /^(wireguard|wg):\/\//.test(line.trim());
  }

  /**
   * 解析 WireGuard URI
   * @param {string} line - 输入行
   * @returns {Object} 解析结果
   */
  parse(line) {
    line = line.trim();

    // 移除协议前缀
    line = line.split(/(wireguard|wg):\/\//)[2];

    // 解析基本结构: privatekey@server:port/?params#name
    const match = /^((.*?)@)?(.*?)(:\d+)?\/?(\?(.*?))?(?:#(.*))?$/.exec(line);
    if (!match) {
      throw new Error('Invalid WireGuard URI format');
    }

    const [, , privateKey, server, portMatch, , params = '', name] = match;
    const port = portMatch ? portMatch.slice(1) : null; // 移除冒号

    const proxy = {
      type: 'wireguard',
      name: name ? decodeURIComponent(name) : `WireGuard ${server}:${port || 51820}`,
      server,
      port: parseInt(port || '51820', 10),
      'private-key': privateKey ? decodeURIComponent(privateKey) : '',
      udp: true
    };

    // 解析参数
    if (params) {
      this.parseParams(proxy, params);
    }

    return proxy;
  }

  /**
   * 解析 URL 参数
   * @param {Object} proxy - 代理对象
   * @param {string} params - 参数字符串
   */
  parseParams(proxy, params) {
    for (const param of params.split('&')) {
      const [key, value] = param.split('=').map(decodeURIComponent);

      switch (key.toLowerCase().replace(/_/g, '-')) {
        case 'publickey':
        case 'public-key':
          proxy['public-key'] = value;
          break;

        case 'address':
        case 'ip':
          this.parseAddress(proxy, value);
          break;

        case 'mtu':
          proxy.mtu = parseInt(value, 10);
          break;

        case 'reserved':
          proxy.reserved = value.split(',').map(v => parseInt(v.trim(), 10));
          break;

        case 'presharedkey':
        case 'preshared-key':
        case 'pre-shared-key':
          proxy['preshared-key'] = value;
          break;

        case 'allowedips':
        case 'allowed-ips':
          proxy['allowed-ips'] = value.split(',').map(ip => ip.trim());
          break;

        case 'endpoint':
          const [endpointHost, endpointPort] = value.split(':');
          proxy.server = endpointHost;
          if (endpointPort) {
            proxy.port = parseInt(endpointPort, 10);
          }
          break;

        case 'dns':
          proxy.dns = value.split(',').map(dns => dns.trim());
          break;

        case 'keepalive':
        case 'persistent-keepalive':
          proxy.keepalive = parseInt(value, 10);
          break;

        case 'udp':
          proxy.udp = /^(true|1|yes)$/i.test(value);
          break;
      }
    }
  }

  /**
   * 解析地址信息
   * @param {Object} proxy - 代理对象
   * @param {string} address - 地址字符串
   */
  parseAddress(proxy, address) {
    const addresses = address.split(',').map(addr => addr.trim());

    for (const addr of addresses) {
      const ip = addr.replace(/\/\d+$/, '').replace(/^\[/, '').replace(/\]$/, '');

      if (isIPv4(ip)) {
        proxy.ip = ip;
      } else if (isIPv6(ip)) {
        proxy.ipv6 = ip;
      }
    }
  }
}

/**
 * WireGuard 配置文件解析器
 * 支持标准的 WireGuard 配置文件格式
 */
export class WireGuardConfigParser {
  constructor() {
    this.name = 'WireGuard Config Parser';
  }

  /**
   * 测试是否为 WireGuard 配置格式
   * @param {string} content - 输入内容
   * @returns {boolean} 是否匹配
   */
  test(content) {
    return /^\s*\[Interface\]/im.test(content) && /^\s*\[Peer\]/im.test(content);
  }

  /**
   * 解析 WireGuard 配置文件
   * @param {string} content - 配置内容
   * @returns {Object[]} 解析结果数组
   */
  parse(content) {
    const sections = this.parseSections(content);
    const interfaceSection = sections.find(s => s.name.toLowerCase() === 'interface');
    const peerSections = sections.filter(s => s.name.toLowerCase() === 'peer');

    if (!interfaceSection || peerSections.length === 0) {
      throw new Error('Invalid WireGuard configuration: missing Interface or Peer section');
    }

    const proxies = [];

    for (let i = 0; i < peerSections.length; i++) {
      const peer = peerSections[i];
      const proxy = this.buildProxy(interfaceSection, peer, i);
      proxies.push(proxy);
    }

    return proxies;
  }

  /**
   * 解析配置文件的节
   * @param {string} content - 配置内容
   * @returns {Array} 节数组
   */
  parseSections(content) {
    const sections = [];
    const lines = content.split('\n');
    let currentSection = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // 新的节
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          name: trimmed.slice(1, -1),
          properties: {}
        };
      } else if (currentSection && trimmed && !trimmed.startsWith('#')) {
        // 属性行
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          currentSection.properties[key.trim()] = value;
        }
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * 构建代理对象
   * @param {Object} interfaceSection - Interface 节
   * @param {Object} peerSection - Peer 节
   * @param {number} index - 索引
   * @returns {Object} 代理对象
   */
  buildProxy(interfaceSection, peerSection, index) {
    const interfaceProps = interfaceSection.properties;
    const peerProps = peerSection.properties;

    // 解析 Endpoint
    const endpoint = peerProps.Endpoint || '';
    const [server, port] = endpoint.split(':');

    const proxy = {
      type: 'wireguard',
      name: `WireGuard-${index + 1}`,
      server: server || '',
      port: parseInt(port || '51820', 10),
      'private-key': interfaceProps.PrivateKey || '',
      'public-key': peerProps.PublicKey || '',
      udp: true
    };

    // Interface 属性
    if (interfaceProps.Address) {
      this.parseAddress(proxy, interfaceProps.Address);
    }

    if (interfaceProps.DNS) {
      proxy.dns = interfaceProps.DNS.split(',').map(dns => dns.trim());
    }

    if (interfaceProps.MTU) {
      proxy.mtu = parseInt(interfaceProps.MTU, 10);
    }

    // Peer 属性
    if (peerProps.AllowedIPs) {
      proxy['allowed-ips'] = peerProps.AllowedIPs.split(',').map(ip => ip.trim());
    }

    if (peerProps.PresharedKey) {
      proxy['preshared-key'] = peerProps.PresharedKey;
    }

    if (peerProps.PersistentKeepalive) {
      proxy.keepalive = parseInt(peerProps.PersistentKeepalive, 10);
    }

    return proxy;
  }

  /**
   * 解析地址信息
   * @param {Object} proxy - 代理对象
   * @param {string} address - 地址字符串
   */
  parseAddress(proxy, address) {
    const addresses = address.split(',').map(addr => addr.trim());

    for (const addr of addresses) {
      const ip = addr.replace(/\/\d+$/, '').replace(/^\[/, '').replace(/\]$/, '');

      if (isIPv4(ip)) {
        proxy.ip = ip;
      } else if (isIPv6(ip)) {
        proxy.ipv6 = ip;
      }
    }
  }
}

// 导出解析器
export const wireGuardParsers = [
  new WireGuardURIParser(),
  new WireGuardConfigParser()
];
