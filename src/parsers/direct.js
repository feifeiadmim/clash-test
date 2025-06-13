/**
 * Direct 协议解析器
 * 支持直连代理，主要用于 Surge 等客户端的直连配置
 */

import { ProxyTypes } from '../types.js';

/**
 * Direct 协议解析器
 * 格式: ProxyName = direct
 */
export class DirectParser {
  constructor() {
    this.name = 'Direct Parser';
  }

  /**
   * 测试是否为 Direct 格式
   * @param {string} line - 输入行
   * @returns {boolean} 是否匹配
   */
  test(line) {
    return /^.*=\s*direct\s*$/i.test(line.trim());
  }

  /**
   * 解析 Direct 格式
   * @param {string} line - 输入行
   * @returns {Object} 解析结果
   */
  parse(line) {
    const name = line.split('=')[0].trim();
    
    return {
      type: ProxyTypes.DIRECT,
      name
    };
  }
}

/**
 * 生成 Direct 配置
 * @param {Object} proxy - 代理对象
 * @returns {string} Direct 配置字符串
 */
export function generateDirectConfig(proxy) {
  if (proxy.type !== ProxyTypes.DIRECT) {
    throw new Error('Invalid proxy type for Direct config generation');
  }

  return `${proxy.name} = direct`;
}

/**
 * 转换为 Clash 格式
 * @param {Object} proxy - 代理对象
 * @returns {Object} Clash 格式节点
 */
export function toClashFormat(proxy) {
  if (proxy.type !== ProxyTypes.DIRECT) {
    throw new Error('Invalid proxy type for Clash format conversion');
  }

  return {
    name: proxy.name,
    type: 'direct'
  };
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  return {
    type: ProxyTypes.DIRECT,
    name: clashNode.name
  };
}

/**
 * 验证 Direct 节点
 * @param {Object} proxy - 代理对象
 * @returns {boolean} 是否有效
 */
export function validateNode(proxy) {
  if (!proxy || proxy.type !== ProxyTypes.DIRECT) {
    return false;
  }

  // Direct 节点只需要名称
  if (!proxy.name) {
    return false;
  }

  return true;
}

// 导出解析器
export const directParsers = [
  new DirectParser()
];
