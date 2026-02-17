use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ItemKind {
    Group,
    BrowserTab,
    FileRef,
    CapsuleView,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceItem {
    pub id: String,
    pub kind: ItemKind,
    pub parent_id: Option<String>,
    pub title: String,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Capability {
    BrowserNavigate,
    BrowserCookiesRead,
    BrowserCookiesWrite,
    FsRead,
    FsWrite,
    TerminalExec,
    McpToolInvoke,
    NetworkFetch,
}
