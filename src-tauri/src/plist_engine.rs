use plist::{Dictionary, Value};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Lossless AST representation of an Apple Plist node for the frontend.
/// Binary `Data` is exposed as uppercase Hex string (standard in Dortania/OpenCore guides)
/// and serialized back to standard Base64 `<data>` in XML plist without losing types.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", content = "val")]
pub enum PlistNode {
    Dict(Vec<(String, PlistNode)>),
    Array(Vec<PlistNode>),
    String(String),
    Integer(i64),
    Real(f64),
    Boolean(bool),
    Data(String), // Uppercase Hex string, e.g. "07009B3E"
    Date(String),
}

impl PlistNode {
    pub fn from_plist_value(v: &Value) -> Self {
        match v {
            Value::Dictionary(dict) => {
                let entries = dict
                    .iter()
                    .map(|(k, val)| (k.clone(), PlistNode::from_plist_value(val)))
                    .collect();
                PlistNode::Dict(entries)
            }
            Value::Array(arr) => {
                PlistNode::Array(arr.iter().map(PlistNode::from_plist_value).collect())
            }
            Value::String(s) => PlistNode::String(s.clone()),
            Value::Integer(i) => {
                let n = i
                    .as_signed()
                    .or_else(|| i.as_unsigned().map(|u| u as i64))
                    .unwrap_or(0);
                PlistNode::Integer(n)
            }
            Value::Real(f) => PlistNode::Real(*f),
            Value::Boolean(b) => PlistNode::Boolean(*b),
            Value::Data(bytes) => PlistNode::Data(hex::encode_upper(bytes)),
            Value::Date(d) => PlistNode::Date(d.to_xml_format()),
            _ => PlistNode::String(String::new()),
        }
    }

    pub fn to_plist_value(&self) -> Result<Value, String> {
        match self {
            PlistNode::Dict(entries) => {
                let mut dict = Dictionary::new();
                for (k, val) in entries {
                    dict.insert(k.clone(), val.to_plist_value()?);
                }
                Ok(Value::Dictionary(dict))
            }
            PlistNode::Array(items) => {
                let mut arr = Vec::with_capacity(items.len());
                for item in items {
                    arr.push(item.to_plist_value()?);
                }
                Ok(Value::Array(arr))
            }
            PlistNode::String(s) => Ok(Value::String(s.clone())),
            PlistNode::Integer(i) => Ok(Value::Integer((*i).into())),
            PlistNode::Real(f) => Ok(Value::Real(*f)),
            PlistNode::Boolean(b) => Ok(Value::Boolean(*b)),
            PlistNode::Data(hex_str) => {
                let clean: String = hex_str
                    .chars()
                    .filter(|c| !c.is_whitespace() && *c != '<' && *c != '>')
                    .collect();
                if clean.is_empty() {
                    return Ok(Value::Data(Vec::new()));
                }
                let normalized = if clean.len() % 2 != 0 {
                    format!("0{}", clean)
                } else {
                    clean
                };
                let bytes = hex::decode(&normalized)
                    .map_err(|e| format!("无效的十六进制 Data '{}': {}", hex_str, e))?;
                Ok(Value::Data(bytes))
            }
            PlistNode::Date(iso) => {
                if let Ok(d) = plist::Date::from_xml_format(iso) {
                    Ok(Value::Date(d))
                } else {
                    Ok(Value::String(iso.clone()))
                }
            }
        }
    }
}

pub fn load_plist_file(path: &Path) -> Result<PlistNode, String> {
    let val = Value::from_file(path)
        .map_err(|e| format!("解析 Plist 文件失败 ({}): {}", path.display(), e))?;
    Ok(PlistNode::from_plist_value(&val))
}

pub fn load_plist_bytes(bytes: &[u8]) -> Result<PlistNode, String> {
    let val = Value::from_reader_xml(bytes)
        .or_else(|_| plist::from_bytes::<Value>(bytes))
        .map_err(|e| format!("解析 Plist 内容失败: {}", e))?;
    Ok(PlistNode::from_plist_value(&val))
}

pub fn save_plist_file(path: &Path, node: &PlistNode) -> Result<(), String> {
    let val = node.to_plist_value()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败 ({}): {}", parent.display(), e))?;
    }
    val.to_file_xml(path)
        .map_err(|e| format!("写入 XML Plist 失败 ({}): {}", path.display(), e))
}

pub fn serialize_plist_xml_string(node: &PlistNode) -> Result<String, String> {
    let val = node.to_plist_value()?;
    let mut buf = Vec::new();
    val.to_writer_xml(&mut buf)
        .map_err(|e| format!("序列化 XML Plist 失败: {}", e))?;
    String::from_utf8(buf).map_err(|e| format!("UTF-8 转换失败: {}", e))
}

/// Dict lookup helpers on PlistNode
impl PlistNode {
    pub fn as_dict(&self) -> Option<&[(String, PlistNode)]> {
        match self {
            PlistNode::Dict(d) => Some(d.as_slice()),
            _ => None,
        }
    }

    pub fn as_dict_mut(&mut self) -> Option<&mut Vec<(String, PlistNode)>> {
        match self {
            PlistNode::Dict(d) => Some(d),
            _ => None,
        }
    }

    pub fn get(&self, key: &str) -> Option<&PlistNode> {
        self.as_dict()?
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v)
    }

    pub fn get_mut(&mut self, key: &str) -> Option<&mut PlistNode> {
        self.as_dict_mut()?
            .iter_mut()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v)
    }

    pub fn set_key(&mut self, key: &str, value: PlistNode) {
        if let PlistNode::Dict(entries) = self {
            if let Some((_, existing)) = entries.iter_mut().find(|(k, _)| k == key) {
                *existing = value;
            } else {
                entries.push((key.to_string(), value));
            }
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            PlistNode::Boolean(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            PlistNode::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            PlistNode::Integer(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[PlistNode]> {
        match self {
            PlistNode::Array(a) => Some(a.as_slice()),
            _ => None,
        }
    }
}
