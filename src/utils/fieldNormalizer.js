/**
 * 字段标准化工具
 * 统一不同来源节点的字段格式，提高去重精准度
 */

/**
 * 字段名称映射表
 */
const FIELD_MAPPINGS = {
  // VMess字段
  'alter-id': 'alterId',
  'alter_id': 'alterId',

  // TLS字段
  'skip-cert-verify': 'skipCertVerify',
  'skip_cert_verify': 'skipCertVerify',
  'cert-verify': 'skipCertVerify',
  'cert_verify': 'skipCertVerify',

  // Hysteria2字段
  'obfs-password': 'obfsPassword',
  'obfs_password': 'obfsPassword',

  // SSR字段
  'protocol-param': 'protocolParam',
  'protocol_param': 'protocolParam',
  'obfs-param': 'obfsParam',
  'obfs_param': 'obfsParam',

  // 传输层字段
  'grpc-service-name': 'grpcServiceName',
  'grpc_service_name': 'grpcServiceName',
  'ws-path': 'wsPath',
  'ws_path': 'wsPath',
  'ws-headers': 'wsHeaders',
  'ws_headers': 'wsHeaders'
};

/**
 * 布尔值标准化
 */
function normalizeBooleanValue(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') {
      return false;
    }
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return Boolean(value);
}

/**
 * 数字值标准化
 */
function normalizeNumberValue(value, defaultValue = 0) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * 字符串值标准化
 */
function normalizeStringValue(value, defaultValue = '') {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return String(value).trim();
}

/**
 * 标准化单个字段
 */
function normalizeField(obj, oldKey, newKey, normalizer = null) {
  if (oldKey in obj) {
    const value = obj[oldKey];
    obj[newKey] = normalizer ? normalizer(value) : value;
    if (oldKey !== newKey) {
      delete obj[oldKey];
    }
  }
}

/**
 * 标准化节点字段
 * @param {Object} node - 原始节点
 * @returns {Object} 标准化后的节点
 */
export function normalizeNodeFields(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }

  // 深拷贝避免修改原对象
  const normalized = JSON.parse(JSON.stringify(node));

  // 1. 标准化字段名称
  for (const [oldName, newName] of Object.entries(FIELD_MAPPINGS)) {
    if (oldName in normalized) {
      normalized[newName] = normalized[oldName];
      if (oldName !== newName) {
        delete normalized[oldName];
      }
    }
  }

  // 2. 标准化基础字段
  if ('port' in normalized) {
    normalized.port = normalizeNumberValue(normalized.port);
  }

  // 3. 标准化TLS字段
  if (normalized.tls && typeof normalized.tls === 'object') {
    normalizeField(normalized.tls, 'enabled', 'enabled', normalizeBooleanValue);
    normalizeField(normalized.tls, 'skipCertVerify', 'skipCertVerify', normalizeBooleanValue);
    normalizeField(normalized.tls, 'serverName', 'serverName', normalizeStringValue);

    // 处理字段别名
    if ('skip-cert-verify' in normalized.tls) {
      normalized.tls.skipCertVerify = normalizeBooleanValue(normalized.tls['skip-cert-verify']);
      delete normalized.tls['skip-cert-verify'];
    }
  }

  // 4. 根据协议类型进行特定标准化
  switch (normalized.type) {
    case 'vmess':
      normalizeField(normalized, 'alterId', 'alterId', normalizeNumberValue);
      normalizeField(normalized, 'cipher', 'cipher', (v) => normalizeStringValue(v, 'auto'));
      normalizeField(normalized, 'network', 'network', (v) => normalizeStringValue(v, 'tcp'));
      break;

    case 'vless':
      normalizeField(normalized, 'flow', 'flow', normalizeStringValue);
      normalizeField(normalized, 'encryption', 'encryption', (v) => normalizeStringValue(v, 'none'));
      normalizeField(normalized, 'network', 'network', (v) => normalizeStringValue(v, 'tcp'));
      break;

    case 'hysteria2':
      if (normalized.obfs && typeof normalized.obfs === 'object') {
        normalizeField(normalized.obfs, 'type', 'type', normalizeStringValue);
        normalizeField(normalized.obfs, 'password', 'password', normalizeStringValue);

        // 处理字段别名
        if ('obfs-password' in normalized.obfs) {
          normalized.obfs.password = normalizeStringValue(normalized.obfs['obfs-password']);
          delete normalized.obfs['obfs-password'];
        }
      }
      break;

    case 'ssr':
      normalizeField(normalized, 'protocol', 'protocol', normalizeStringValue);
      normalizeField(normalized, 'obfs', 'obfs', normalizeStringValue);
      normalizeField(normalized, 'protocolParam', 'protocolParam', normalizeStringValue);
      normalizeField(normalized, 'obfsParam', 'obfsParam', normalizeStringValue);
      break;

    case 'trojan':
      normalizeField(normalized, 'network', 'network', (v) => normalizeStringValue(v, 'tcp'));
      break;
  }

  // 5. 标准化传输层配置
  if (normalized.transport && typeof normalized.transport === 'object') {
    normalizeField(normalized.transport, 'path', 'path', normalizeStringValue);
    normalizeField(normalized.transport, 'host', 'host', normalizeStringValue);
    normalizeField(normalized.transport, 'serviceName', 'serviceName', normalizeStringValue);

    // 处理字段别名
    if ('grpc-service-name' in normalized.transport) {
      normalized.transport.serviceName = normalizeStringValue(normalized.transport['grpc-service-name']);
      delete normalized.transport['grpc-service-name'];
    }
  }

  return normalized;
}

// 未使用的函数已移除，保留核心标准化功能
// 如需要批量处理或复杂字段访问，可以在具体使用场景中实现
