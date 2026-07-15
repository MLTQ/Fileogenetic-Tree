use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;

use crate::models::{EntryDto, EntryKind, RootSummary, ScanResult, SearchResponse, TreeSnapshot};

const SNAPSHOT_LIMIT: usize = 200_000;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("index database error: {0}")]
    Database(#[from] rusqlite::Error),
}

pub struct IndexStore {
    path: PathBuf,
}

impl IndexStore {
    pub fn new(path: impl Into<PathBuf>) -> Result<Self, StoreError> {
        Ok(Self { path: path.into() })
    }

    pub fn initialize(&self) -> Result<(), StoreError> {
        let connection = self.connect()?;
        connection.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS roots (
               id INTEGER PRIMARY KEY,
               path TEXT NOT NULL UNIQUE,
               indexed_at_ms INTEGER NOT NULL,
               total_files INTEGER NOT NULL,
               total_dirs INTEGER NOT NULL,
               total_bytes INTEGER NOT NULL,
               unreadable INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS entries (
               id INTEGER PRIMARY KEY,
               root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
               path TEXT NOT NULL,
               parent_path TEXT,
               name TEXT NOT NULL,
               kind TEXT NOT NULL,
               size INTEGER NOT NULL,
               modified_ms INTEGER,
               extension TEXT NOT NULL,
               depth INTEGER NOT NULL,
               child_count INTEGER NOT NULL,
               UNIQUE(root_id, path)
             );
             CREATE INDEX IF NOT EXISTS entries_parent ON entries(root_id, parent_path);
             CREATE INDEX IF NOT EXISTS entries_size ON entries(root_id, size DESC);
             CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
               root_id UNINDEXED,
               path,
               name,
               extension,
               tokenize = 'unicode61'
             );",
        )?;
        Ok(())
    }

    pub fn replace_scan(&self, scan: &ScanResult) -> Result<i64, StoreError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let root_id: i64 = transaction.query_row(
            "INSERT INTO roots(path, indexed_at_ms, total_files, total_dirs, total_bytes, unreadable)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(path) DO UPDATE SET
               indexed_at_ms = excluded.indexed_at_ms,
               total_files = excluded.total_files,
               total_dirs = excluded.total_dirs,
               total_bytes = excluded.total_bytes,
               unreadable = excluded.unreadable
             RETURNING id",
            params![scan.root_path, scan.indexed_at_ms, scan.total_files as i64, scan.total_dirs as i64, to_sql_u64(scan.total_bytes), scan.unreadable as i64],
            |row| row.get(0),
        )?;

        transaction.execute("DELETE FROM entries WHERE root_id = ?1", [root_id])?;
        transaction.execute("DELETE FROM entries_fts WHERE root_id = ?1", [root_id])?;
        {
            let mut insert_entry = transaction.prepare_cached(
                "INSERT INTO entries(root_id, path, parent_path, name, kind, size, modified_ms, extension, depth, child_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )?;
            let mut insert_search = transaction.prepare_cached(
                "INSERT INTO entries_fts(root_id, path, name, extension) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for entry in &scan.entries {
                insert_entry.execute(params![
                    root_id,
                    entry.path,
                    entry.parent_path,
                    entry.name,
                    entry.kind.as_str(),
                    to_sql_u64(entry.size),
                    entry.modified_ms,
                    entry.extension,
                    entry.depth as i64,
                    entry.child_count as i64,
                ])?;
                insert_search.execute(params![root_id, entry.path, entry.name, entry.extension])?;
            }
        }
        transaction.commit()?;
        Ok(root_id)
    }

    pub fn list_roots(&self) -> Result<Vec<RootSummary>, StoreError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT id, path, indexed_at_ms, total_files, total_dirs, total_bytes, unreadable
             FROM roots ORDER BY indexed_at_ms DESC",
        )?;
        let rows = statement.query_map([], root_from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn load_snapshot(&self, root_id: i64) -> Result<Option<TreeSnapshot>, StoreError> {
        let connection = self.connect()?;
        let root = connection
            .query_row(
                "SELECT id, path, indexed_at_ms, total_files, total_dirs, total_bytes, unreadable FROM roots WHERE id = ?1",
                [root_id],
                root_from_row,
            )
            .optional()?;
        let Some(root) = root else {
            return Ok(None);
        };
        let mut statement = connection.prepare(
            "SELECT path, parent_path, name, kind, size, modified_ms, extension, depth, child_count
             FROM entries WHERE root_id = ?1 ORDER BY depth, path LIMIT ?2",
        )?;
        let rows = statement.query_map(params![root_id, (SNAPSHOT_LIMIT + 1) as i64], |row| {
            Ok(EntryDto {
                path: row.get(0)?,
                parent_path: row.get(1)?,
                name: row.get(2)?,
                kind: EntryKind::from_database(&row.get::<_, String>(3)?),
                size: from_sql_u64(row.get(4)?),
                modified_ms: row.get(5)?,
                extension: row.get(6)?,
                depth: row.get::<_, i64>(7)? as usize,
                child_count: row.get::<_, i64>(8)? as usize,
            })
        })?;
        let mut entries = rows.collect::<Result<Vec<_>, _>>()?;
        let truncated = entries.len() > SNAPSHOT_LIMIT;
        entries.truncate(SNAPSHOT_LIMIT);
        Ok(Some(TreeSnapshot {
            root,
            entries,
            truncated,
        }))
    }

    pub fn search(
        &self,
        root_id: i64,
        query: &str,
        limit: usize,
    ) -> Result<SearchResponse, StoreError> {
        let fts_query = to_fts_query(query);
        if fts_query.is_empty() {
            return Ok(SearchResponse {
                paths: Vec::new(),
                limited: false,
            });
        }
        let effective_limit = limit.clamp(1, 50_000);
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT path FROM entries_fts
             WHERE root_id = ?1 AND entries_fts MATCH ?2
             ORDER BY bm25(entries_fts), length(path)
             LIMIT ?3",
        )?;
        let rows = statement.query_map(
            params![root_id, fts_query, (effective_limit + 1) as i64],
            |row| row.get(0),
        )?;
        let mut paths = rows.collect::<Result<Vec<String>, _>>()?;
        let limited = paths.len() > effective_limit;
        paths.truncate(effective_limit);
        Ok(SearchResponse { paths, limited })
    }

    fn connect(&self) -> Result<Connection, StoreError> {
        let connection = Connection::open(&self.path)?;
        connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;
        Ok(connection)
    }
}

fn root_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RootSummary> {
    Ok(RootSummary {
        id: row.get(0)?,
        path: row.get(1)?,
        indexed_at_ms: row.get(2)?,
        total_files: row.get::<_, i64>(3)? as usize,
        total_dirs: row.get::<_, i64>(4)? as usize,
        total_bytes: from_sql_u64(row.get(5)?),
        unreadable: row.get::<_, i64>(6)? as usize,
    })
}

fn to_fts_query(query: &str) -> String {
    query
        .split(|character: char| {
            !character.is_alphanumeric() && character != '_' && character != '-'
        })
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{}\"*", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn to_sql_u64(value: u64) -> i64 {
    value.min(i64::MAX as u64) as i64
}

fn from_sql_u64(value: i64) -> u64 {
    value.max(0) as u64
}

#[allow(dead_code)]
fn _database_exists(path: &Path) -> bool {
    path.exists()
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use super::{to_fts_query, IndexStore};
    use crate::scanner::scan_folder;

    #[test]
    fn creates_safe_prefix_query() {
        assert_eq!(to_fts_query("photo raw"), "\"photo\"* AND \"raw\"*");
        assert_eq!(to_fts_query("  /// "), "");
    }

    #[test]
    fn persists_and_searches_a_scan() {
        let nonce = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("clock should follow the epoch")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!(
            "fileogenetic-store-test-{}-{nonce}",
            std::process::id()
        ));
        let root = workspace.join("root");
        fs::create_dir_all(root.join("photos")).expect("test tree should be created");
        fs::write(root.join("photos").join("nebula.raw"), b"stellar bytes")
            .expect("test file should be written");

        let store = IndexStore::new(workspace.join("index.db")).expect("store should be created");
        store.initialize().expect("schema should initialize");
        let scan = scan_folder(&root).expect("test tree should scan");
        let root_id = store.replace_scan(&scan).expect("scan should persist");
        let snapshot = store
            .load_snapshot(root_id)
            .expect("snapshot query should succeed")
            .expect("snapshot should exist");
        let search = store
            .search(root_id, "nebu raw", 20)
            .expect("search should succeed");

        assert_eq!(snapshot.root.total_files, 1);
        assert_eq!(snapshot.root.total_bytes, 13);
        assert_eq!(search.paths.len(), 1);
        assert!(search.paths[0].ends_with("nebula.raw"));

        drop(store);
        fs::remove_dir_all(workspace).expect("test workspace should be removed");
    }
}
