use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Directory,
    Symlink,
}

impl EntryKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::File => "file",
            Self::Directory => "directory",
            Self::Symlink => "symlink",
        }
    }

    pub fn from_database(value: &str) -> Self {
        match value {
            "directory" => Self::Directory,
            "symlink" => Self::Symlink,
            _ => Self::File,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct EntryDto {
    pub path: String,
    pub parent_path: Option<String>,
    pub name: String,
    pub kind: EntryKind,
    pub size: u64,
    pub modified_ms: Option<i64>,
    pub extension: String,
    pub depth: usize,
    pub child_count: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct RootSummary {
    pub id: i64,
    pub path: String,
    pub indexed_at_ms: i64,
    pub total_files: usize,
    pub total_dirs: usize,
    pub total_bytes: u64,
    pub unreadable: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct TreeSnapshot {
    pub root: RootSummary,
    pub entries: Vec<EntryDto>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct SearchResponse {
    pub paths: Vec<String>,
    pub limited: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum IndexEvent {
    Started {
        root_path: String,
    },
    Batch {
        entries: Vec<EntryDto>,
        scanned: usize,
        total_files: usize,
        total_dirs: usize,
        total_bytes: u64,
        unreadable: usize,
    },
    Finalizing {
        scanned: usize,
        total_files: usize,
        total_dirs: usize,
        total_bytes: u64,
        unreadable: usize,
    },
}

#[derive(Clone, Debug)]
pub struct ScanResult {
    pub root_path: String,
    pub indexed_at_ms: i64,
    pub entries: Vec<EntryDto>,
    pub total_files: usize,
    pub total_dirs: usize,
    pub total_bytes: u64,
    pub unreadable: usize,
}
