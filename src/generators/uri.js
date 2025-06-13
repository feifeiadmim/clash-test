/**
 * 通用URI生成器
 * 支持所有主要协议的URI格式生成，兼容Sub-Store标准
 */

import { ProxyTypes } from '../types.js';
import { safeBtoa } from '../utils/index.js';
import { generateVMessUrl } from '../parsers/vmess.js';

/**
 * 通用URI生成器
 */
export class UniversalURIGenerator {
  /**
   * 生成代理节点的URI
   * @param {Object} node - 节点信息
   * @returns {string} URI字符串
   */
  static generate(node) {
    if (!node || !node.type) {
      throw new Error('Invalid node: missing type');
    }

    switch (node.type) {
      case ProxyTypes.SHADOWSOCKS:
        return this.generateShadowsocksURI(node);
      case ProxyTypes.SHADOWSOCKSR:
        return this.generateShadowsocksRURI(node);
      case ProxyTypes.VMESS:
        return generateVMessUrl(node);
      case ProxyTypes.VLESS:
        return this.generateVLESSURI(node);
      case ProxyTypes.TROJAN:
        return this.generateTrojanURI(node);
      case ProxyTypes.HYSTERIA:
        return this.generateHysteriaURI(node);
      case ProxyTypes.HYSTERIA2:
        return this.generateHysteria2URI(node);
      case ProxyTypes.TUIC:
        return this.generateTUICURI(node);
      case ProxyTypes.WIREGUARD:
        return this.generateWireGuardURI(node);
      case ProxyTypes.SOCKS5:
        return this.generateSOCKS5URI(node);
      case ProxyTypes.HTTP:
        return this.generateHTTPURI(node);
      case ProxyTypes.ANYTLS:
        return this.generateAnyTLSURI(node);
      default:
        throw new Error(`Unsupported protocol: ${node.type}`);
    }
  }

  /**
   * 生成Shadowsocks URI
   */
  static generateShadowsocksURI(node) {
    const userinfo = `${node.cipher}:${node.password}`;
    let result = `ss://${
      node.cipher?.startsWith('2022-blake3-') ? 
        `${encodeURIComponent(node.cipher)}:${encodeURIComponent(node.password)}` :
        safeBtoa(userinfo)
    }@${node.server}:${node.port}`;

    // 添加插件支持
    if (node.plugin) {
      result += '?plugin=';
      const opts = node['plugin-opts'];
      
      switch (node.plugin) {
        case 'obfs':
          result += encodeURIComponent(
            `simple-obfs;obfs=${opts.mode}${
              opts.host ? ';obfs-host=' + opts.host : ''
            }`
          );
          break;
        case 'v2ray-plugin':
          result += encodeURIComponent(
            `v2ray-plugin;obfs=${opts.mode}${
              opts.host ? ';obfs-host=' + opts.host : ''
            }${opts.tls ? ';tls' : ''}`
          );
          break;
        case 'shadow-tls':
          result += encodeURIComponent(
            `shadow-tls;host=${opts.host};password=${opts.password};version=${opts.version}`
          );
          break;
      }
    }

    // 添加其他参数
    const params = [];
    if (node['udp-over-tcp']) params.push('uot=1');
    if (node.tfo) params.push('tfo=1');
    
    if (params.length > 0) {
      result += (node.plugin ? '&' : '?') + params.join('&');
    }

    result += `#${encodeURIComponent(node.name)}`;
    return result;
  }

  /**
   * 生成ShadowsocksR URI
   */
  static generateShadowsocksRURI(node) {
    let result = `${node.server}:${node.port}:${node.protocol}:${
      node.cipher
    }:${node.obfs}:${safeBtoa(node.password)}/`;

    const params = [`remarks=${safeBtoa(node.name)}`];
    if (node['obfs-param']) {
      params.push(`obfsparam=${safeBtoa(node['obfs-param'])}`);
    }
    if (node['protocol-param']) {
      params.push(`protocolparam=${safeBtoa(node['protocol-param'])}`);
    }

    result += `?${params.join('&')}`;
    return 'ssr://' + safeBtoa(result);
  }

  /**
   * 生成VLESS URI
   */
  static generateVLESSURI(node) {
    const params = [];
    
    // 安全配置
    let security = 'none';
    if (node['reality-opts']) {
      security = 'reality';
      if (node['reality-opts']['public-key']) {
        params.push(`pbk=${encodeURIComponent(node['reality-opts']['public-key'])}`);
      }
      if (node['reality-opts']['short-id']) {
        params.push(`sid=${encodeURIComponent(node['reality-opts']['short-id'])}`);
      }
    } else if (node.tls) {
      security = 'tls';
    }
    params.push(`security=${encodeURIComponent(security)}`);

    // 传输配置
    if (node.network && node.network !== 'tcp') {
      params.push(`type=${encodeURIComponent(node.network)}`);
      
      const transportOpts = node[`${node.network}-opts`] || node.transport;
      if (transportOpts) {
        if (transportOpts.path) {
          params.push(`path=${encodeURIComponent(transportOpts.path)}`);
        }
        if (transportOpts.headers?.Host) {
          params.push(`host=${encodeURIComponent(transportOpts.headers.Host)}`);
        }
        if (transportOpts['grpc-service-name']) {
          params.push(`serviceName=${encodeURIComponent(transportOpts['grpc-service-name'])}`);
        }
      }
    }

    // 其他参数
    if (node.alpn) {
      const alpnStr = Array.isArray(node.alpn) ? node.alpn.join(',') : node.alpn;
      params.push(`alpn=${encodeURIComponent(alpnStr)}`);
    }
    if (node['skip-cert-verify']) params.push('allowInsecure=1');
    if (node.sni) params.push(`sni=${encodeURIComponent(node.sni)}`);
    if (node['client-fingerprint']) {
      params.push(`fp=${encodeURIComponent(node['client-fingerprint'])}`);
    }
    if (node.flow) params.push(`flow=${encodeURIComponent(node.flow)}`);

    return `vless://${node.uuid}@${node.server}:${node.port}?${params.join('&')}#${encodeURIComponent(node.name)}`;
  }

  /**
   * 生成Trojan URI
   */
  static generateTrojanURI(node) {
    const params = [];
    
    params.push(`sni=${encodeURIComponent(node.sni || node.server)}`);
    if (node['skip-cert-verify']) params.push('allowInsecure=1');

    // 传输配置
    if (node.network && node.network !== 'tcp') {
      params.push(`type=${encodeURIComponent(node.network)}`);
      
      const transportOpts = node[`${node.network}-opts`] || node.transport;
      if (transportOpts) {
        if (transportOpts.path) {
          params.push(`path=${encodeURIComponent(transportOpts.path)}`);
        }
        if (transportOpts.headers?.Host) {
          params.push(`host=${encodeURIComponent(transportOpts.headers.Host)}`);
        }
      }
    }

    // 其他参数
    if (node.alpn) {
      const alpnStr = Array.isArray(node.alpn) ? node.alpn.join(',') : node.alpn;
      params.push(`alpn=${encodeURIComponent(alpnStr)}`);
    }
    if (node['client-fingerprint']) {
      params.push(`fp=${encodeURIComponent(node['client-fingerprint'])}`);
    }

    return `trojan://${node.password}@${node.server}:${node.port}?${params.join('&')}#${encodeURIComponent(node.name)}`;
  }

  /**
   * 生成Hysteria2 URI
   */
  static generateHysteria2URI(node) {
    const params = [];
    
    if (node['hop-interval']) params.push(`hop-interval=${node['hop-interval']}`);
    if (node.keepalive) params.push(`keepalive=${node.keepalive}`);
    if (node['skip-cert-verify']) params.push('insecure=1');
    if (node.obfs) {
      params.push(`obfs=${encodeURIComponent(node.obfs)}`);
      if (node['obfs-password']) {
        params.push(`obfs-password=${encodeURIComponent(node['obfs-password'])}`);
      }
    }
    if (node.sni) params.push(`sni=${encodeURIComponent(node.sni)}`);
    if (node.ports) params.push(`mport=${node.ports}`);
    if (node['tls-fingerprint']) {
      params.push(`pinSHA256=${encodeURIComponent(node['tls-fingerprint'])}`);
    }
    if (node.tfo) params.push('fastopen=1');

    return `hysteria2://${encodeURIComponent(node.password)}@${node.server}:${node.port}?${params.join('&')}#${encodeURIComponent(node.name)}`;
  }

  /**
   * 生成TUIC URI
   */
  static generateTUICURI(node) {
    const params = [];
    
    if (node.alpn) {
      const alpnStr = Array.isArray(node.alpn) ? node.alpn.join(',') : node.alpn;
      params.push(`alpn=${encodeURIComponent(alpnStr)}`);
    }
    if (node['skip-cert-verify']) params.push('allow_insecure=1');
    if (node.tfo) params.push('fast_open=1');
    if (node['disable-sni']) params.push('disable_sni=1');
    if (node['reduce-rtt']) params.push('reduce_rtt=1');
    if (node['congestion-controller']) {
      params.push(`congestion_control=${node['congestion-controller']}`);
    }
    if (node.sni) params.push(`sni=${encodeURIComponent(node.sni)}`);

    return `tuic://${encodeURIComponent(node.uuid)}:${encodeURIComponent(node.password)}@${node.server}:${node.port}?${params.join('&')}#${encodeURIComponent(node.name)}`;
  }

  /**
   * 生成WireGuard URI
   */
  static generateWireGuardURI(node) {
    const params = [];
    
    if (node.reserved) params.push(`reserved=${node.reserved.join(',')}`);
    if (node.mtu) params.push(`mtu=${node.mtu}`);
    if (node['public-key']) params.push(`publickey=${node['public-key']}`);
    if (node.ip && node.ipv6) {
      params.push(`address=${node.ip}/32,${node.ipv6}/128`);
    } else if (node.ip) {
      params.push(`address=${node.ip}/32`);
    } else if (node.ipv6) {
      params.push(`address=${node.ipv6}/128`);
    }

    return `wireguard://${encodeURIComponent(node['private-key'])}@${node.server}:${node.port}/?${params.join('&')}#${encodeURIComponent(node.name)}`;
  }

  /**
   * 生成SOCKS5 URI
   */
  static generateSOCKS5URI(node) {
    const auth = safeBtoa(`${node.username || ''}:${node.password || ''}`);
    return `socks://${encodeURIComponent(auth)}@${node.server}:${node.port}#${encodeURIComponent(node.name)}`;
  }

  /**
   * 生成HTTP URI
   */
  static generateHTTPURI(node) {
    const protocol = node.tls ? 'https' : 'http';
    const auth = node.username && node.password ? 
      `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password)}@` : '';
    return `${protocol}://${auth}${node.server}:${node.port}#${encodeURIComponent(node.name)}`;
  }

  /**
   * 生成AnyTLS URI
   */
  static generateAnyTLSURI(node) {
    const params = [];
    
    if (node.alpn) {
      const alpnStr = Array.isArray(node.alpn) ? node.alpn.join(',') : node.alpn;
      params.push(`alpn=${encodeURIComponent(alpnStr)}`);
    }
    if (node['skip-cert-verify']) params.push('insecure=1');
    if (node.udp) params.push('udp=1');
    if (node.sni) params.push(`sni=${encodeURIComponent(node.sni)}`);

    return `anytls://${encodeURIComponent(node.password)}@${node.server}:${node.port}/?${params.join('&')}#${encodeURIComponent(node.name)}`;
  }

  /**
   * 生成Hysteria URI (v1)
   */
  static generateHysteriaURI(node) {
    const params = [];
    
    Object.keys(node).forEach(key => {
      if (!['name', 'type', 'server', 'port'].includes(key)) {
        const paramKey = key.replace(/-/, '_');
        
        if (key === 'alpn' && node[key]) {
          params.push(`${paramKey}=${encodeURIComponent(
            Array.isArray(node[key]) ? node[key][0] : node[key]
          )}`);
        } else if (key === 'skip-cert-verify' && node[key]) {
          params.push('insecure=1');
        } else if (['tfo', 'fast-open'].includes(key) && node[key]) {
          params.push('fastopen=1');
        } else if (key === 'ports') {
          params.push(`mport=${node[key]}`);
        } else if (key === 'auth-str') {
          params.push(`auth=${node[key]}`);
        } else if (key === 'up') {
          params.push(`upmbps=${node[key]}`);
        } else if (key === 'down') {
          params.push(`downmbps=${node[key]}`);
        } else if (key === 'sni') {
          params.push(`peer=${node[key]}`);
        } else if (node[key] && !/^_/i.test(key)) {
          params.push(`${paramKey}=${encodeURIComponent(node[key])}`);
        }
      }
    });

    return `hysteria://${node.server}:${node.port}?${params.join('&')}#${encodeURIComponent(node.name)}`;
  }
}
