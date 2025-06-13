/**
 * 节点重命名工具
 */

import { RegionMap } from '../types.js';

/**
 * 重命名选项
 * @typedef {Object} RenameOptions
 * @property {string} template - 命名模板
 * @property {boolean} autoDetectRegion - 是否自动检测地区
 * @property {Object} customRegionMap - 自定义地区映射
 * @property {boolean} groupByRegion - 是否按地区分组编号
 * @property {number} startIndex - 起始编号
 * @property {number} padLength - 编号补零长度
 */

/**
 * 默认命名模板：国旗Emoji 地区中文名 三位数序号
 */
const DEFAULT_TEMPLATE = '{flag}{region}{index:3}';

/**
 * 重命名节点数组
 * @param {Object[]} nodes - 节点数组
 * @param {RenameOptions} options - 重命名选项
 * @returns {Object[]} 重命名后的节点数组
 */
export function renameNodes(nodes, options = {}) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const {
    template = DEFAULT_TEMPLATE,
    autoDetectRegion = true,
    customRegionMap = {},
    groupByRegion = true,
    startIndex = 1,
    padLength = 3
  } = options;

  // 合并地区映射
  const regionMap = { ...RegionMap, ...customRegionMap };

  // 为每个节点检测地区
  const nodesWithRegion = nodes.map(node => ({
    ...node,
    detectedRegion: autoDetectRegion ? detectRegion(node.name, node.server) : 'OTHER'
  }));

  // 按地区分组或统一编号
  let renamedNodes;
  if (groupByRegion) {
    renamedNodes = renameByRegionGroups(nodesWithRegion, template, regionMap, startIndex, padLength);
  } else {
    renamedNodes = renameSequentially(nodesWithRegion, template, regionMap, startIndex, padLength);
  }

  return renamedNodes;
}

/**
 * 按地区分组重命名
 * @param {Object[]} nodes - 带地区信息的节点数组
 * @param {string} template - 命名模板
 * @param {Object} regionMap - 地区映射
 * @param {number} startIndex - 起始编号
 * @param {number} padLength - 编号补零长度
 * @returns {Object[]} 重命名后的节点数组
 */
function renameByRegionGroups(nodes, template, regionMap, startIndex, padLength) {
  // 按地区分组
  const regionGroups = new Map();
  
  for (const node of nodes) {
    const region = node.detectedRegion;
    if (!regionGroups.has(region)) {
      regionGroups.set(region, []);
    }
    regionGroups.get(region).push(node);
  }

  const renamedNodes = [];

  // 对每个地区分别编号
  for (const [region, regionNodes] of regionGroups.entries()) {
    const regionInfo = regionMap[region] || regionMap.OTHER;
    
    regionNodes.forEach((node, index) => {
      const newName = generateNodeName(template, {
        flag: regionInfo.flag,
        region: regionInfo.name,
        index: startIndex + index,
        padLength,
        originalName: node.name,
        server: node.server,
        port: node.port,
        type: node.type
      });

      renamedNodes.push({
        ...node,
        name: newName,
        originalName: node.name
      });
    });
  }

  return renamedNodes;
}

/**
 * 顺序重命名
 * @param {Object[]} nodes - 带地区信息的节点数组
 * @param {string} template - 命名模板
 * @param {Object} regionMap - 地区映射
 * @param {number} startIndex - 起始编号
 * @param {number} padLength - 编号补零长度
 * @returns {Object[]} 重命名后的节点数组
 */
function renameSequentially(nodes, template, regionMap, startIndex, padLength) {
  return nodes.map((node, index) => {
    const regionInfo = regionMap[node.detectedRegion] || regionMap.OTHER;
    
    const newName = generateNodeName(template, {
      flag: regionInfo.flag,
      region: regionInfo.name,
      index: startIndex + index,
      padLength,
      originalName: node.name,
      server: node.server,
      port: node.port,
      type: node.type
    });

    return {
      ...node,
      name: newName,
      originalName: node.name
    };
  });
}

/**
 * 生成节点名称
 * @param {string} template - 命名模板
 * @param {Object} variables - 变量对象
 * @returns {string} 生成的名称
 */
function generateNodeName(template, variables) {
  let name = template;

  // 替换变量
  name = name.replace(/\{flag\}/g, variables.flag || '🌐');
  name = name.replace(/\{region\}/g, variables.region || '其他');
  name = name.replace(/\{originalName\}/g, variables.originalName || '');
  name = name.replace(/\{server\}/g, variables.server || '');
  name = name.replace(/\{port\}/g, variables.port || '');
  name = name.replace(/\{type\}/g, variables.type || '');

  // 处理带格式的索引 {index:3} -> 001, 002, 003...
  name = name.replace(/\{index:(\d+)\}/g, (match, padLength) => {
    return String(variables.index).padStart(parseInt(padLength), '0');
  });

  // 处理普通索引 {index} -> 1, 2, 3...
  name = name.replace(/\{index\}/g, String(variables.index));

  return name.trim();
}

/**
 * 从节点名称检测地区（重构版：只提取核心国家/地区关键词）
 * @param {string} name - 节点名称
 * @param {string} server - 服务器地址（保留参数以维持兼容性，但不使用）
 * @returns {string} 地区代码
 */
export function detectRegion(name = '', server = '') {
  // 只使用节点名称进行地区检测，忽略服务器地址
  const text = name.toLowerCase();

  // 处理编码问题：将常见的编码错误转换为正确的中文
  const normalizedText = text
    .replace(/é¦æ¸¯/g, '香港')
    .replace(/å°æ¹¾/g, '台湾')
    .replace(/æ°å å¡/g, '新加坡')
    .replace(/æ¥æ¬/g, '日本')
    .replace(/éå½/g, '韩国')
    .replace(/ç¾å½/g, '美国')
    .replace(/è±å½/g, '英国');

  // 简化的地区检测规则 - 只保留核心国家/地区关键词（使用词边界匹配）
  const regionPatterns = {
    'HK': [
      /香港|\bhk\b|hong\s*kong|hongkong/i
    ],
    'TW': [
      /台湾|\btw\b|taiwan/i
    ],
    'SG': [
      /新加坡|\bsg\b|singapore|狮城/i
    ],
    'JP': [
      /日本|\bjp\b|japan/i
    ],
    'KR': [
      /韩国|\bkr\b|korea/i
    ],
    'US': [
      /美国|\bus\b|usa|united\s*states|america/i
    ],
    'UK': [
      /英国|\buk\b|united\s*kingdom|britain/i
    ],
    'DE': [
      /德国|\bde\b|germany/i
    ],
    'FR': [
      /法国|\bfr\b|france/i
    ],
    'CA': [
      /加拿大|\bca\b|canada/i
    ],
    'AU': [
      /澳大利亚|澳洲|\bau\b|australia/i
    ],
    'RU': [
      /俄罗斯|\bru\b|russia/i
    ],
    'IN': [
      /印度|\bin\b|india/i
    ],
    'BR': [
      /巴西|\bbr\b|brazil/i
    ],
    'NL': [
      /荷兰|\bnl\b|netherlands/i
    ],
    'TR': [
      /土耳其|\btr\b|turkey/i
    ],
    'TH': [
      /泰国|\bth\b|thailand/i
    ],
    'MY': [
      /马来西亚|\bmy\b|malaysia/i
    ],
    'PH': [
      /菲律宾|\bph\b|philippines/i
    ],
    'VN': [
      /越南|\bvn\b|vietnam/i
    ],
    'ID': [
      /印尼|印度尼西亚|\bid\b|indonesia/i
    ],
    'AR': [
      /阿根廷|\bar\b|argentina/i
    ],
    'CL': [
      /智利|\bcl\b|chile/i
    ],
    'MX': [
      /墨西哥|\bmx\b|mexico/i
    ],
    'ZA': [
      /南非|\bza\b|south\s*africa/i
    ],
    'EG': [
      /埃及|\beg\b|egypt/i
    ],
    'AE': [
      /阿联酋|\bae\b|uae/i
    ],
    'SA': [
      /沙特|\bsa\b|saudi/i
    ],
    'IL': [
      /以色列|\bil\b|israel/i
    ],
    'CN': [
      /中国|\bcn\b|china/i
    ]
  };

  // 按优先级检测地区
  for (const [region, patterns] of Object.entries(regionPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        return region;
      }
    }
  }

  return 'OTHER';
}

/**
 * 批量重命名（支持不同地区使用不同模板）
 * @param {Object[]} nodes - 节点数组
 * @param {Object} regionTemplates - 地区模板映射
 * @param {RenameOptions} options - 重命名选项
 * @returns {Object[]} 重命名后的节点数组
 */
export function batchRename(nodes, regionTemplates, options = {}) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const {
    autoDetectRegion = true,
    customRegionMap = {},
    startIndex = 1,
    padLength = 3
  } = options;

  const regionMap = { ...RegionMap, ...customRegionMap };

  // 按地区分组
  const regionGroups = new Map();
  
  for (const node of nodes) {
    const region = autoDetectRegion ? detectRegion(node.name, node.server) : 'OTHER';
    if (!regionGroups.has(region)) {
      regionGroups.set(region, []);
    }
    regionGroups.get(region).push(node);
  }

  const renamedNodes = [];

  // 对每个地区使用对应的模板
  for (const [region, regionNodes] of regionGroups.entries()) {
    const template = regionTemplates[region] || regionTemplates.default || DEFAULT_TEMPLATE;
    const regionInfo = regionMap[region] || regionMap.OTHER;
    
    regionNodes.forEach((node, index) => {
      const newName = generateNodeName(template, {
        flag: regionInfo.flag,
        region: regionInfo.name,
        index: startIndex + index,
        padLength,
        originalName: node.name,
        server: node.server,
        port: node.port,
        type: node.type
      });

      renamedNodes.push({
        ...node,
        name: newName,
        originalName: node.name,
        detectedRegion: region
      });
    });
  }

  return renamedNodes;
}

/**
 * 恢复原始名称
 * @param {Object[]} nodes - 重命名后的节点数组
 * @returns {Object[]} 恢复原始名称的节点数组
 */
export function restoreOriginalNames(nodes) {
  return nodes.map(node => ({
    ...node,
    name: node.originalName || node.name
  }));
}

/**
 * 获取重命名统计信息
 * @param {Object[]} originalNodes - 原始节点数组
 * @param {Object[]} renamedNodes - 重命名后的节点数组
 * @returns {Object} 统计信息
 */
export function getRenameStats(originalNodes, renamedNodes) {
  const regionStats = new Map();
  
  for (const node of renamedNodes) {
    const region = node.detectedRegion || 'OTHER';
    regionStats.set(region, (regionStats.get(region) || 0) + 1);
  }

  return {
    total: renamedNodes.length,
    regions: Object.fromEntries(regionStats),
    regionCount: regionStats.size
  };
}
