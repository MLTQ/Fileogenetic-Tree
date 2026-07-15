use std::{
    collections::{HashMap, HashSet},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use thiserror::Error;
use walkdir::WalkDir;

use crate::models::{EntryDto, EntryKind, IndexEvent, ScanResult};

const PROGRESS_BATCH_SIZE: usize = 256;
const PROGRESS_COUNTER_INTERVAL: usize = 1_024;
const PROGRESS_ENTRY_LIMIT: usize = 1_000_000;
const PROGRESS_DIRECTORY_LIMIT: usize = 250_000;
const PROGRESS_LEAF_LIMIT: usize = PROGRESS_ENTRY_LIMIT - PROGRESS_DIRECTORY_LIMIT;
const PROGRESS_INITIAL_LEAVES: usize = 512;
const PROGRESS_SAMPLE_DIVISOR: usize = 16;

struct ProgressSampler {
    streamed_paths: HashSet<String>,
    streamed_directories: usize,
    seen_leaves: usize,
    streamed_leaves: usize,
    next_leaf_sample: usize,
}

impl ProgressSampler {
    fn new() -> Self {
        Self {
            streamed_paths: HashSet::new(),
            streamed_directories: 0,
            seen_leaves: 0,
            streamed_leaves: 0,
            next_leaf_sample: 1,
        }
    }

    fn should_stream(&mut self, entry: &EntryDto) -> bool {
        let parent_is_visible = entry
            .parent_path
            .as_ref()
            .is_none_or(|parent| self.streamed_paths.contains(parent));

        let selected = match entry.kind {
            EntryKind::Directory => {
                parent_is_visible && self.streamed_directories < PROGRESS_DIRECTORY_LIMIT
            }
            EntryKind::File | EntryKind::Symlink => {
                self.seen_leaves += 1;
                let sample_due = self.seen_leaves <= PROGRESS_INITIAL_LEAVES
                    || self.seen_leaves >= self.next_leaf_sample;
                parent_is_visible && self.streamed_leaves < PROGRESS_LEAF_LIMIT && sample_due
            }
        };

        if !selected {
            return false;
        }

        self.streamed_paths.insert(entry.path.clone());
        match entry.kind {
            EntryKind::Directory => self.streamed_directories += 1,
            EntryKind::File | EntryKind::Symlink => {
                self.streamed_leaves += 1;
                self.next_leaf_sample =
                    self.seen_leaves + 1 + self.streamed_leaves / PROGRESS_SAMPLE_DIVISOR;
            }
        }
        true
    }
}

#[derive(Debug, Error)]
pub enum ScanError {
    #[error("folder does not exist: {0}")]
    Missing(String),
    #[error("path is not a folder: {0}")]
    NotDirectory(String),
    #[error("could not resolve folder: {0}")]
    Canonicalize(#[from] std::io::Error),
}

#[cfg(test)]
pub fn scan_folder(path: &Path) -> Result<ScanResult, ScanError> {
    scan_folder_with_progress(path, |_| {})
}

pub fn scan_folder_with_progress(
    path: &Path,
    mut on_progress: impl FnMut(IndexEvent),
) -> Result<ScanResult, ScanError> {
    if !path.exists() {
        return Err(ScanError::Missing(path.to_string_lossy().into_owned()));
    }
    if !path.is_dir() {
        return Err(ScanError::NotDirectory(path.to_string_lossy().into_owned()));
    }

    let root = path.canonicalize()?;
    let root_path = path_string(&root);
    on_progress(IndexEvent::Started {
        root_path: root_path.clone(),
    });
    let mut entries = Vec::new();
    let mut pending = Vec::with_capacity(PROGRESS_BATCH_SIZE);
    let mut progress_sampler = ProgressSampler::new();
    let mut scanned = 0usize;
    let mut total_files = 0usize;
    let mut total_dirs = 0usize;
    let mut discovered_bytes = 0u64;
    let mut unreadable = 0usize;

    for result in WalkDir::new(&root).follow_links(false).into_iter() {
        let item = match result {
            Ok(item) => item,
            Err(_) => {
                unreadable += 1;
                continue;
            }
        };
        let metadata = match item.metadata() {
            Ok(metadata) => metadata,
            Err(_) => {
                unreadable += 1;
                continue;
            }
        };
        let kind = if item.file_type().is_symlink() {
            EntryKind::Symlink
        } else if item.file_type().is_dir() {
            EntryKind::Directory
        } else {
            EntryKind::File
        };
        match &kind {
            EntryKind::File => total_files += 1,
            EntryKind::Directory => total_dirs += 1,
            EntryKind::Symlink => {}
        }
        let full_path = path_string(item.path());
        let parent_path = if item.depth() == 0 {
            None
        } else {
            item.path().parent().map(path_string)
        };
        let extension = item
            .path()
            .extension()
            .map(|value| value.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let modified_ms = metadata.modified().ok().and_then(system_time_ms);
        let entry = EntryDto {
            path: full_path,
            parent_path,
            name: item.file_name().to_string_lossy().into_owned(),
            size: if matches!(kind, EntryKind::File) {
                metadata.len()
            } else {
                0
            },
            kind,
            modified_ms,
            extension,
            depth: item.depth(),
            child_count: 0,
        };
        scanned += 1;
        discovered_bytes = discovered_bytes.saturating_add(entry.size);
        if progress_sampler.should_stream(&entry) {
            pending.push(entry.clone());
        }
        entries.push(entry);

        if pending.len() >= PROGRESS_BATCH_SIZE || scanned.is_multiple_of(PROGRESS_COUNTER_INTERVAL)
        {
            emit_batch(
                &mut on_progress,
                &mut pending,
                scanned,
                total_files,
                total_dirs,
                discovered_bytes,
                unreadable,
            );
        }
    }

    if !pending.is_empty() {
        emit_batch(
            &mut on_progress,
            &mut pending,
            scanned,
            total_files,
            total_dirs,
            discovered_bytes,
            unreadable,
        );
    }
    on_progress(IndexEvent::Finalizing {
        scanned,
        total_files,
        total_dirs,
        total_bytes: discovered_bytes,
        unreadable,
    });

    aggregate_directories(&mut entries);
    let total_bytes = entries.first().map(|entry| entry.size).unwrap_or(0);

    Ok(ScanResult {
        root_path,
        indexed_at_ms: system_time_ms(SystemTime::now()).unwrap_or(0),
        entries,
        total_files,
        total_dirs,
        total_bytes,
        unreadable,
    })
}

fn emit_batch(
    on_progress: &mut impl FnMut(IndexEvent),
    pending: &mut Vec<EntryDto>,
    scanned: usize,
    total_files: usize,
    total_dirs: usize,
    total_bytes: u64,
    unreadable: usize,
) {
    on_progress(IndexEvent::Batch {
        entries: std::mem::take(pending),
        scanned,
        total_files,
        total_dirs,
        total_bytes,
        unreadable,
    });
}

fn aggregate_directories(entries: &mut [EntryDto]) {
    let positions: HashMap<String, usize> = entries
        .iter()
        .enumerate()
        .map(|(index, entry)| (entry.path.clone(), index))
        .collect();
    let mut order: Vec<usize> = (0..entries.len()).collect();
    order.sort_unstable_by_key(|index| std::cmp::Reverse(entries[*index].depth));

    for index in order {
        let Some(parent_path) = entries[index].parent_path.clone() else {
            continue;
        };
        let Some(parent_index) = positions.get(&parent_path).copied() else {
            continue;
        };
        let size = entries[index].size;
        entries[parent_index].size = entries[parent_index].size.saturating_add(size);
        entries[parent_index].child_count += 1;
    }
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn system_time_ms(value: SystemTime) -> Option<i64> {
    value
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use super::{
        aggregate_directories, scan_folder_with_progress, ProgressSampler,
        PROGRESS_DIRECTORY_LIMIT, PROGRESS_ENTRY_LIMIT, PROGRESS_LEAF_LIMIT,
    };
    use crate::models::{EntryDto, EntryKind, IndexEvent};

    #[test]
    fn aggregates_file_sizes_through_ancestors() {
        let mut entries = vec![
            entry("/root", None, EntryKind::Directory, 0, 0),
            entry("/root/a", Some("/root"), EntryKind::Directory, 0, 1),
            entry("/root/a/file", Some("/root/a"), EntryKind::File, 42, 2),
        ];
        aggregate_directories(&mut entries);
        assert_eq!(entries[0].size, 42);
        assert_eq!(entries[1].size, 42);
        assert_eq!(entries[0].child_count, 1);
    }

    #[test]
    fn streams_entries_and_lifecycle_while_scanning() {
        let nonce = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("clock should follow the epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "fileogenetic-progress-test-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(root.join("branch")).expect("test tree should be created");
        fs::write(root.join("branch").join("leaf.txt"), b"emerging")
            .expect("test file should be written");

        let mut events = Vec::new();
        let result = scan_folder_with_progress(&root, |event| events.push(event))
            .expect("test tree should scan");

        assert!(matches!(events.first(), Some(IndexEvent::Started { .. })));
        assert!(events.iter().any(
            |event| matches!(event, IndexEvent::Batch { entries, .. } if entries.iter().any(|entry| entry.name == "leaf.txt"))
        ));
        assert!(matches!(
            events.last(),
            Some(IndexEvent::Finalizing { total_files: 1, .. })
        ));
        assert_eq!(result.total_bytes, 8);

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn samples_late_files_without_growing_progress_memory_unbounded() {
        assert_eq!(
            PROGRESS_DIRECTORY_LIMIT + PROGRESS_LEAF_LIMIT,
            PROGRESS_ENTRY_LIMIT
        );
        assert_eq!(PROGRESS_ENTRY_LIMIT, 1_000_000);

        let mut sampler = ProgressSampler::new();
        let root = entry("/root", None, EntryKind::Directory, 0, 0);
        assert!(sampler.should_stream(&root));

        let mut selected = 0usize;
        let mut last_selected = 0usize;
        for index in 1..=100_000 {
            let file = entry(
                &format!("/root/file-{index}"),
                Some("/root"),
                EntryKind::File,
                1,
                1,
            );
            if sampler.should_stream(&file) {
                selected += 1;
                last_selected = index;
            }
        }

        assert!(
            selected > 512,
            "sampling should continue after the initial burst"
        );
        assert!(selected < 5_000, "the progress sample should stay bounded");
        assert!(
            last_selected > 99_000,
            "late scan entries should continue reaching the progressive map"
        );
    }

    fn entry(
        path: &str,
        parent: Option<&str>,
        kind: EntryKind,
        size: u64,
        depth: usize,
    ) -> EntryDto {
        EntryDto {
            path: path.into(),
            parent_path: parent.map(str::to_owned),
            name: path.rsplit('/').next().unwrap_or(path).into(),
            kind,
            size,
            modified_ms: None,
            extension: String::new(),
            depth,
            child_count: 0,
        }
    }
}
