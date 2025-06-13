/**
 * 代理节点类型定义
 */

/**
 * 基础代理节点接口
 * @typedef {Object} ProxyNode
 * @property {string} name - 节点名称
 * @property {string} type - 协议类型 (ss, ssr, vmess, vless, trojan, hysteria, etc.)
 * @property {string} server - 服务器地址
 * @property {number} port - 端口号
 * @property {string} [password] - 密码
 * @property {string} [uuid] - UUID (VMess/VLESS)
 * @property {string} [method] - 加密方法
 * @property {Object} [tls] - TLS配置
 * @property {Object} [transport] - 传输配置
 * @property {Object} [extra] - 额外配置
 */

/**
 * Shadowsocks节点
 * @typedef {Object} ShadowsocksNode
 * @property {string} type - 'ss'
 * @property {string} server - 服务器地址
 * @property {number} port - 端口号
 * @property {string} password - 密码
 * @property {string} method - 加密方法
 * @property {string} [plugin] - 插件
 * @property {string} [pluginOpts] - 插件选项
 */

/**
 * VMess节点
 * @typedef {Object} VMessNode
 * @property {string} type - 'vmess'
 * @property {string} server - 服务器地址
 * @property {number} port - 端口号
 * @property {string} uuid - UUID
 * @property {number} alterId - alterId
 * @property {string} cipher - 加密方法
 * @property {string} network - 传输协议
 * @property {Object} [ws] - WebSocket配置
 * @property {Object} [tls] - TLS配置
 */

/**
 * VLESS节点
 * @typedef {Object} VLESSNode
 * @property {string} type - 'vless'
 * @property {string} server - 服务器地址
 * @property {number} port - 端口号
 * @property {string} uuid - UUID
 * @property {string} flow - 流控
 * @property {string} encryption - 加密方法
 * @property {string} network - 传输协议
 * @property {Object} [tls] - TLS配置
 */

/**
 * Trojan节点
 * @typedef {Object} TrojanNode
 * @property {string} type - 'trojan'
 * @property {string} server - 服务器地址
 * @property {number} port - 端口号
 * @property {string} password - 密码
 * @property {Object} [tls] - TLS配置
 * @property {string} [network] - 传输协议
 */

/**
 * 地区信息
 * @typedef {Object} RegionInfo
 * @property {string} code - 地区代码
 * @property {string} name - 地区中文名
 * @property {string} flag - 国旗Emoji
 */

/**
 * 转换选项
 * @typedef {Object} ConvertOptions
 * @property {boolean} [deduplicate] - 是否去重
 * @property {boolean} [rename] - 是否重命名
 * @property {string} [format] - 输出格式
 * @property {Object} [clashConfig] - Clash配置模板
 */

export const ProxyTypes = {
  SHADOWSOCKS: 'ss',
  SHADOWSOCKSR: 'ssr',
  VMESS: 'vmess',
  VLESS: 'vless',
  TROJAN: 'trojan',
  HYSTERIA: 'hysteria',
  HYSTERIA2: 'hysteria2',
  TUIC: 'tuic',
  WIREGUARD: 'wireguard',
  SNELL: 'snell',
  ANYTLS: 'anytls',
  DIRECT: 'direct',
  HTTP: 'http',
  SOCKS5: 'socks5',
  SSH: 'ssh'
};

export const OutputFormats = {
  CLASH: 'clash',
  URL: 'url',
  BASE64: 'base64',
  JSON: 'json'
};

/**
 * 地区映射表
 */
export const RegionMap = {
  'HK': { name: '香港', flag: '🇭🇰' },
  'TW': { name: '台湾', flag: '🇹🇼' },
  'SG': { name: '新加坡', flag: '🇸🇬' },
  'JP': { name: '日本', flag: '🇯🇵' },
  'KR': { name: '韩国', flag: '🇰🇷' },
  'US': { name: '美国', flag: '🇺🇸' },
  'UK': { name: '英国', flag: '🇬🇧' },
  'DE': { name: '德国', flag: '🇩🇪' },
  'FR': { name: '法国', flag: '🇫🇷' },
  'CA': { name: '加拿大', flag: '🇨🇦' },
  'AU': { name: '澳大利亚', flag: '🇦🇺' },
  'RU': { name: '俄罗斯', flag: '🇷🇺' },
  'IN': { name: '印度', flag: '🇮🇳' },
  'BR': { name: '巴西', flag: '🇧🇷' },
  'NL': { name: '荷兰', flag: '🇳🇱' },
  'TR': { name: '土耳其', flag: '🇹🇷' },
  'TH': { name: '泰国', flag: '🇹🇭' },
  'MY': { name: '马来西亚', flag: '🇲🇾' },
  'PH': { name: '菲律宾', flag: '🇵🇭' },
  'VN': { name: '越南', flag: '🇻🇳' },
  'ID': { name: '印尼', flag: '🇮🇩' },
  'AR': { name: '阿根廷', flag: '🇦🇷' },
  'CL': { name: '智利', flag: '🇨🇱' },
  'MX': { name: '墨西哥', flag: '🇲🇽' },
  'ZA': { name: '南非', flag: '🇿🇦' },
  'EG': { name: '埃及', flag: '🇪🇬' },
  'AE': { name: '阿联酋', flag: '🇦🇪' },
  'SA': { name: '沙特', flag: '🇸🇦' },
  'IL': { name: '以色列', flag: '🇮🇱' },
  'CN': { name: '中国', flag: '🇨🇳' },
  'OTHER': { name: '其他', flag: '🌐' }
};
