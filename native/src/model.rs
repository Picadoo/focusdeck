use crate::i18n::tr;
use anyhow::{Context, Result, bail};
use chrono::{Datelike, Duration, Local, NaiveDate, TimeZone, Timelike};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

static CLOCK_OFFSET: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);
pub fn set_clock_offset(offset: i64) {
    CLOCK_OFFSET.store(offset, std::sync::atomic::Ordering::Relaxed);
}
pub fn now() -> i64 {
    Local::now().timestamp_millis() + CLOCK_OFFSET.load(std::sync::atomic::Ordering::Relaxed)
}
pub fn today() -> NaiveDate {
    Local::now().date_naive()
}
pub fn monday(date: NaiveDate) -> NaiveDate {
    date - Duration::days(date.weekday().num_days_from_monday() as i64)
}
pub fn time_label(minutes: i32) -> String {
    format!("{:02}:{:02}", minutes / 60, minutes % 60)
}
pub fn duration_label(seconds: i64) -> String {
    format!("{:02}:{:02}", seconds.max(0) / 60, seconds.max(0) % 60)
}
pub fn parse_time(value: &str) -> Option<i32> {
    let (h, m) = value.trim().split_once(':')?;
    let (h, m) = (h.parse::<i32>().ok()?, m.parse::<i32>().ok()?);
    ((0..=24).contains(&h) && (0..60).contains(&m) && (h < 24 || m == 0)).then_some(h * 60 + m)
}
pub fn due_timestamp(date: NaiveDate) -> i64 {
    Local
        .from_local_datetime(&date.and_hms_opt(23, 59, 0).unwrap())
        .earliest()
        .unwrap()
        .timestamp_millis()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}
impl Meta {
    pub fn new() -> Self {
        Self::with_id(&uuid::Uuid::new_v4().to_string(), now())
    }
    fn with_id(id: &str, at: i64) -> Self {
        Self {
            id: id.into(),
            created_at: at,
            updated_at: at,
            deleted_at: None,
        }
    }
    pub fn touch(&mut self) {
        self.updated_at = now().max(self.updated_at + 1);
    }
    pub fn delete(&mut self) {
        self.touch();
        self.deleted_at = Some(self.updated_at);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Project {
    #[serde(flatten)]
    pub meta: Meta,
    pub name: String,
    pub color: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tag {
    #[serde(flatten)]
    pub meta: Meta,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    #[serde(flatten)]
    pub meta: Meta,
    pub title: String,
    pub project_id: String,
    pub tag_ids: Vec<String>,
    pub priority: String,
    pub status: String,
    pub due_at: Option<i64>,
    pub estimate_pomodoros: i64,
    pub actual_focus_seconds: i64,
    pub sort_key: f64,
}
impl Task {
    pub fn visible(&self) -> bool {
        self.meta.deleted_at.is_none() && self.status != "deleted"
    }
    pub fn active(&self) -> bool {
        self.visible() && self.status == "active"
    }
    pub fn due_date(&self) -> Option<NaiveDate> {
        Local
            .timestamp_millis_opt(self.due_at?)
            .single()
            .map(|date| date.date_naive())
    }
    pub fn overdue(&self) -> bool {
        self.active() && self.due_at.is_some_and(|due| due < now())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    #[serde(flatten)]
    pub meta: Meta,
    pub title: String,
    pub project_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    pub date: String,
    pub day_index: u32,
    pub start_minutes: i32,
    pub duration_minutes: i32,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default = "no_repeat")]
    pub repeat: String,
}
fn no_repeat() -> String {
    "none".into()
}
impl Event {
    pub fn occurs(&self, date: NaiveDate) -> bool {
        self.meta.deleted_at.is_none()
            && if self.repeat == "weekly" {
                date.weekday().num_days_from_monday() == self.day_index
                    && date.to_string() >= self.date
            } else {
                self.date == date.to_string()
            }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(flatten)]
    pub meta: Meta,
    pub name: String,
    pub focus_seconds: i64,
    pub short_break_seconds: i64,
    pub long_break_seconds: i64,
    pub sessions_before_long_break: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collections {
    #[serde(default)]
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub tags: Vec<Tag>,
    #[serde(default)]
    pub schedule_events: Vec<Event>,
    #[serde(default)]
    pub timer_profiles: Vec<Profile>,
}
impl Collections {
    pub fn seed(locale: &str) -> Self {
        const SEED: i64 = 1_704_067_200_000;
        let projects = [
            ("work", "#5FD4C7"),
            ("study", "#E8B05B"),
            ("life", "#69C58F"),
            ("side", "#9AA7F8"),
        ]
        .into_iter()
        .map(|(id, color)| Project {
            meta: Meta::with_id(id, SEED),
            name: tr(locale, &format!("seed.project.{id}")),
            color: color.into(),
        })
        .collect();
        let tags = ["urgent", "deep", "review", "meeting"]
            .into_iter()
            .map(|id| Tag {
                meta: Meta::with_id(id, SEED),
                name: tr(locale, &format!("seed.tag.{id}")),
            })
            .collect();
        let timer_profiles = [
            ("classic", 25, 5, 15, 4),
            ("deep", 50, 10, 20, 3),
            ("long", 90, 20, 30, 2),
        ]
        .into_iter()
        .map(|(id, f, s, l, n)| Profile {
            meta: Meta::with_id(id, SEED),
            name: tr(locale, &format!("seed.profile.{id}")),
            focus_seconds: f * 60,
            short_break_seconds: s * 60,
            long_break_seconds: l * 60,
            sessions_before_long_break: n,
        })
        .collect();
        let tasks = [
            ("work", "p1", Some(0), 2, "deep"),
            ("work", "p1", Some(1), 3, "deep"),
            ("life", "p3", Some(-1), 1, ""),
            ("study", "p2", Some(2), 1, "review"),
            ("work", "p2", Some(3), 1, "review"),
            ("work", "p1", Some(0), 1, "urgent"),
            ("study", "p2", Some(5), 2, "deep"),
            ("life", "p3", Some(7), 1, ""),
            ("side", "p3", Some(4), 2, "deep"),
            ("life", "p4", None, 1, ""),
        ]
        .into_iter()
        .enumerate()
        .map(|(i, (project, priority, offset, estimate, tag))| Task {
            meta: Meta::with_id(&format!("t{}", i + 1), SEED),
            title: tr(locale, &format!("seed.task.t{}", i + 1)),
            project_id: project.into(),
            tag_ids: if tag.is_empty() {
                vec![]
            } else {
                vec![tag.into()]
            },
            priority: priority.into(),
            status: "active".into(),
            due_at: offset.map(|days| due_timestamp(today() + Duration::days(days))),
            estimate_pomodoros: estimate,
            actual_focus_seconds: 0,
            sort_key: (i + 1) as f64 * 1000.,
        })
        .collect();
        let schedule_events = [
            ("work", 0, 540, 30),
            ("study", 2, 840, 90),
            ("life", 4, 1080, 60),
            ("life", 0, 1140, 60),
        ]
        .into_iter()
        .enumerate()
        .map(|(i, (project, day, start, duration))| Event {
            meta: Meta::with_id(&format!("e{}", i + 1), SEED),
            title: tr(locale, &format!("seed.event.e{}", i + 1)),
            project_id: project.into(),
            task_id: None,
            date: (monday(today()) + Duration::days(day)).to_string(),
            day_index: day as u32,
            start_minutes: start,
            duration_minutes: duration,
            kind: "fixed".into(),
            repeat: "weekly".into(),
        })
        .collect();
        Self {
            tasks,
            projects,
            tags,
            schedule_events,
            timer_profiles,
        }
    }
    pub fn profile(&self, id: &str) -> &Profile {
        self.timer_profiles
            .iter()
            .find(|p| p.meta.id == id && p.meta.deleted_at.is_none())
            .unwrap_or(&self.timer_profiles[0])
    }
    pub fn project(&self, id: &str) -> Option<&Project> {
        self.projects.iter().find(|p| p.meta.id == id)
    }
    pub fn validate(&self) -> Result<()> {
        if self.timer_profiles.is_empty() {
            bail!("At least one timer profile is required");
        }
        for p in &self.timer_profiles {
            if [p.focus_seconds, p.short_break_seconds, p.long_break_seconds]
                .iter()
                .any(|s| !(60..=10800).contains(s))
                || !(1..=8).contains(&p.sessions_before_long_break)
            {
                bail!("Invalid timer profile: {}", p.meta.id);
            }
        }
        for e in &self.schedule_events {
            if e.day_index > 6
                || !(0..1440).contains(&e.start_minutes)
                || e.duration_minutes < 1
                || e.start_minutes + e.duration_minutes > 1440
                || NaiveDate::parse_from_str(&e.date, "%Y-%m-%d").is_err()
            {
                bail!("Invalid schedule event: {}", e.meta.id);
            }
        }
        // Duplicate IDs would make task updates and conflict resolution ambiguous.
        let value = serde_json::to_value(self)?;
        for records in value.as_object().unwrap().values() {
            let mut ids = std::collections::HashSet::new();
            for record in records.as_array().unwrap() {
                let id = record["id"].as_str().unwrap_or_default();
                if id.is_empty() || !ids.insert(id) {
                    bail!("Missing or duplicate record ID");
                }
            }
        }
        Ok(())
    }
    pub fn add_task(
        &mut self,
        title: String,
        project_id: String,
        priority: String,
        due_at: Option<i64>,
        estimate: i64,
    ) -> String {
        let meta = Meta::new();
        let id = meta.id.clone();
        let sort_key = self.tasks.iter().map(|t| t.sort_key).fold(0., f64::max) + 1000.;
        self.tasks.push(Task {
            meta,
            title,
            project_id,
            tag_ids: vec![],
            priority,
            status: "active".into(),
            due_at,
            estimate_pomodoros: estimate.max(1),
            actual_focus_seconds: 0,
            sort_key,
        });
        id
    }
    pub fn sorted_tasks(&self, project: &str, search: &str) -> Vec<Task> {
        let mut tasks: Vec<_> = self
            .tasks
            .iter()
            .filter(|t| {
                t.visible()
                    && (project.is_empty() || t.project_id == project)
                    && t.title.to_lowercase().contains(&search.to_lowercase())
            })
            .cloned()
            .collect();
        tasks.sort_by(|a, b| {
            (a.status == "completed")
                .cmp(&(b.status == "completed"))
                .then(
                    a.due_at
                        .unwrap_or(i64::MAX)
                        .cmp(&b.due_at.unwrap_or(i64::MAX)),
                )
                .then(a.sort_key.total_cmp(&b.sort_key))
        });
        tasks
    }
    pub fn reorder_tasks(&mut self, active: &str, target: &str) {
        let mut visible = self.sorted_tasks("", "");
        let Some(from) = visible.iter().position(|t| t.meta.id == active) else {
            return;
        };
        let Some(to) = visible.iter().position(|t| t.meta.id == target) else {
            return;
        };
        if from == to {
            return;
        }
        let moved = visible.remove(from);
        visible.insert(to, moved);
        let positions: std::collections::HashMap<_, _> = visible
            .iter()
            .enumerate()
            .map(|(i, t)| (t.meta.id.clone(), (i + 1) as f64 * 1000.))
            .collect();
        for task in &mut self.tasks {
            if let Some(key) = positions.get(&task.meta.id) {
                task.sort_key = *key;
                task.meta.touch();
            }
        }
    }
    pub fn merge(&mut self, incoming: &Self) {
        fn records<T: Clone>(local: &mut Vec<T>, incoming: &[T], meta: impl Fn(&T) -> &Meta) {
            let mut indices: std::collections::HashMap<String, usize> = local
                .iter()
                .enumerate()
                .map(|(i, item)| (meta(item).id.clone(), i))
                .collect();
            for item in incoming {
                if let Some(index) = indices.get(&meta(item).id).copied() {
                    if meta(item).updated_at >= meta(&local[index]).updated_at {
                        local[index] = item.clone();
                    }
                } else {
                    indices.insert(meta(item).id.clone(), local.len());
                    local.push(item.clone());
                }
            }
        }
        records(&mut self.tasks, &incoming.tasks, |r| &r.meta);
        records(&mut self.projects, &incoming.projects, |r| &r.meta);
        records(&mut self.tags, &incoming.tags, |r| &r.meta);
        records(&mut self.schedule_events, &incoming.schedule_events, |r| {
            &r.meta
        });
        records(&mut self.timer_profiles, &incoming.timer_profiles, |r| {
            &r.meta
        });
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Timer {
    pub profile_id: String,
    pub phase: String,
    pub remaining_seconds: i64,
    pub session_count: i64,
    pub task_id: Option<String>,
    pub started_at: Option<i64>,
    pub ends_at: Option<i64>,
    pub focus_elapsed_seconds: i64,
    #[serde(skip)]
    pub last_transition: Option<String>,
}
impl Default for Timer {
    fn default() -> Self {
        Self {
            profile_id: "classic".into(),
            phase: "idle".into(),
            remaining_seconds: 1500,
            session_count: 0,
            task_id: None,
            started_at: None,
            ends_at: None,
            focus_elapsed_seconds: 0,
            last_transition: None,
        }
    }
}
impl Timer {
    pub fn running(&self) -> bool {
        self.phase.ends_with("_running")
    }
    pub fn remaining(&self, at: i64) -> i64 {
        if self.running() {
            (self.ends_at.unwrap_or(at) - at).max(0)
        } else {
            self.remaining_seconds
        }
    }
    pub fn phase_duration(&self, data: &Collections) -> i64 {
        let p = data.profile(&self.profile_id);
        if self.phase.starts_with("long_break") {
            p.long_break_seconds
        } else if self.phase.starts_with("short_break") {
            p.short_break_seconds
        } else {
            p.focus_seconds
        }
    }
    fn credit(&mut self, data: &mut Collections, at: i64) {
        if !self.phase.starts_with("focus") || !self.running() {
            return;
        }
        let duration = data.profile(&self.profile_id).focus_seconds;
        let credit = (at - self.started_at.unwrap_or(at))
            .clamp(0, (duration - self.focus_elapsed_seconds).max(0));
        if let Some(task) = data
            .tasks
            .iter_mut()
            .find(|t| Some(&t.meta.id) == self.task_id.as_ref())
            && credit > 0
        {
            task.actual_focus_seconds += credit;
            task.meta.touch();
        }
        self.focus_elapsed_seconds += credit;
        self.started_at = Some(at);
    }
    pub fn start(&mut self, data: &Collections, at: i64) {
        self.remaining_seconds = data.profile(&self.profile_id).focus_seconds;
        self.phase = "focus_running".into();
        self.started_at = Some(at);
        self.ends_at = Some(at + self.remaining_seconds);
        self.focus_elapsed_seconds = 0;
        self.last_transition = None;
    }
    pub fn toggle(&mut self, data: &mut Collections, at: i64) {
        if self.phase == "idle" {
            self.start(data, at)
        } else if self.running() {
            self.credit(data, at);
            self.remaining_seconds = self.remaining(at);
            self.ends_at = None;
            self.phase = self.phase.replace("_running", "_paused");
        } else {
            self.phase = self.phase.replace("_paused", "_running");
            self.started_at = Some(at);
            self.ends_at = Some(at + self.remaining_seconds);
        }
    }
    pub fn reset(&mut self, data: &mut Collections, at: i64) {
        self.credit(data, at);
        *self = Self {
            profile_id: self.profile_id.clone(),
            task_id: self.task_id.clone(),
            remaining_seconds: data.profile(&self.profile_id).focus_seconds,
            ..Self::default()
        };
    }
    pub fn tick(&mut self, data: &mut Collections, at: i64) -> bool {
        if !self.running() || self.remaining(at) > 0 {
            return false;
        }
        self.advance(data, at, false);
        true
    }
    pub fn advance(&mut self, data: &mut Collections, at: i64, skip: bool) {
        if self.phase == "idle" {
            return;
        }
        self.credit(data, at);
        let profile = data.profile(&self.profile_id);
        if self.phase.starts_with("focus") {
            if !skip {
                self.session_count += 1;
            }
            let long = !skip && self.session_count % profile.sessions_before_long_break == 0;
            self.phase = if long {
                "long_break_running"
            } else {
                "short_break_running"
            }
            .into();
            self.remaining_seconds = if long {
                profile.long_break_seconds
            } else {
                profile.short_break_seconds
            };
            self.started_at = Some(at);
            self.ends_at = Some(at + self.remaining_seconds);
            self.last_transition = Some(
                if skip {
                    "focus_skipped"
                } else {
                    "focus_completed"
                }
                .into(),
            );
        } else {
            let phase = self.phase.clone();
            self.phase = "idle".into();
            self.remaining_seconds = profile.focus_seconds;
            self.started_at = None;
            self.ends_at = None;
            self.focus_elapsed_seconds = 0;
            self.last_transition = Some(
                if skip {
                    "break_skipped"
                } else if phase.starts_with("long") {
                    "long_break_completed"
                } else {
                    "short_break_completed"
                }
                .into(),
            );
        }
        self.task_id = None;
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub locale: String,
    pub show_weekend: bool,
    pub schedule_full_day: bool,
    pub sound_enabled: bool,
    pub overlay_enabled: bool,
    pub notify_enabled: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            locale: "zh".into(),
            show_weekend: true,
            schedule_full_day: false,
            sound_enabled: true,
            overlay_enabled: true,
            notify_enabled: true,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub version: u32,
    pub data: Collections,
    #[serde(default)]
    pub timer: Timer,
    #[serde(default)]
    pub ui: Preferences,
    #[serde(default)]
    pub sync: crate::sync::SyncSettings,
}
impl Default for Document {
    fn default() -> Self {
        Self {
            version: 1,
            data: Collections::seed("zh"),
            timer: Timer::default(),
            ui: Preferences::default(),
            sync: Default::default(),
        }
    }
}
impl Document {
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let doc: Self = serde_json::from_slice(
            &fs::read(path).with_context(|| format!("Cannot read {}", path.display()))?,
        )
        .context("Invalid FocusDeck data; original file has been preserved")?;
        if doc.version != 1 {
            bail!("Unsupported FocusDeck data version: {}", doc.version);
        }
        doc.data.validate()?;
        Ok(doc)
    }
    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            fs::create_dir_all(parent)?;
        }
        let temporary = path.with_extension("json.tmp");
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&serde_json::to_vec(self)?)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)
            .with_context(|| format!("Cannot replace {}", path.display()))?;
        Ok(())
    }
    pub fn import(&mut self, path: &Path) -> Result<()> {
        let value: serde_json::Value = serde_json::from_slice(&fs::read(path)?)?;
        let raw = value
            .get("data")
            .or_else(|| value.get("state"))
            .unwrap_or(&value);
        // Imports merge records and preserve newer local changes, including tombstones.
        if raw.get("tasks").is_none() && raw.get("scheduleEvents").is_none() {
            bail!("Not a FocusDeck export");
        }
        let data: Collections = serde_json::from_value(raw.clone())?;
        data.validate()?;
        self.data.merge(&data);
        Ok(())
    }
}
pub fn data_path() -> PathBuf {
    let root = std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("XDG_DATA_HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_else(|| ".".into()))
                .join(".local/share")
        });
    root.join("FocusDeck").join("data.json")
}

// Calculate columns per overlapping cluster, so unrelated events retain full width.
pub fn event_columns(events: &[Event]) -> Vec<(Event, usize, usize)> {
    let mut sorted = events.to_vec();
    sorted.sort_by_key(|e| e.start_minutes);
    let mut result = Vec::new();
    let mut cluster: Vec<(Event, usize)> = Vec::new();
    let mut ends = Vec::<i32>::new();
    let mut cluster_end = 0;
    for event in sorted {
        if !cluster.is_empty() && event.start_minutes >= cluster_end {
            let count = ends.len();
            result.extend(cluster.drain(..).map(|(e, c)| (e, c, count)));
            ends.clear();
        }
        let col = ends
            .iter()
            .position(|end| *end <= event.start_minutes)
            .unwrap_or(ends.len());
        let end = event.start_minutes + event.duration_minutes;
        if col == ends.len() {
            ends.push(end)
        } else {
            ends[col] = end
        }
        cluster_end = if cluster.is_empty() {
            end
        } else {
            cluster_end.max(end)
        };
        cluster.push((event, col));
    }
    let count = ends.len();
    result.extend(cluster.into_iter().map(|(e, c)| (e, c, count)));
    result
}

pub fn clock_minutes() -> i32 {
    let now = Local::now();
    now.hour() as i32 * 60 + now.minute() as i32
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pause_resume_does_not_double_credit() {
        let mut data = Collections::seed("zh");
        let mut timer = Timer {
            task_id: Some("t1".into()),
            ..Timer::default()
        };
        timer.start(&data, 100);
        timer.toggle(&mut data, 110);
        assert_eq!(timer.remaining(800), 1490);
        timer.toggle(&mut data, 800);
        assert_eq!(timer.remaining(810), 1480);
        timer.toggle(&mut data, 810);
        assert_eq!(data.tasks[0].actual_focus_seconds, 20);
    }
    #[test]
    fn suspended_timer_transitions_once_and_caps_credit() {
        let mut data = Collections::seed("zh");
        let mut timer = Timer {
            task_id: Some("t1".into()),
            ..Timer::default()
        };
        timer.start(&data, 100);
        assert!(timer.tick(&mut data, 10000));
        assert!(!timer.tick(&mut data, 10000));
        assert_eq!(timer.session_count, 1);
        assert_eq!(data.tasks[0].actual_focus_seconds, 1500);
        assert_eq!(timer.remaining(10000), 300);
    }
    #[test]
    fn paused_skip_does_not_credit_time_twice() {
        let mut data = Collections::seed("zh");
        let mut timer = Timer {
            task_id: Some("t1".into()),
            ..Timer::default()
        };
        timer.start(&data, 100);
        timer.toggle(&mut data, 110);
        timer.advance(&mut data, 900, true);
        assert_eq!(data.tasks[0].actual_focus_seconds, 10);
        assert_eq!(timer.session_count, 0);
    }
    #[test]
    fn completed_sessions_trigger_long_break() {
        let mut data = Collections::seed("zh");
        let mut timer = Timer {
            session_count: 3,
            ..Timer::default()
        };
        timer.start(&data, 100);
        timer.tick(&mut data, 1600);
        assert_eq!(timer.phase, "long_break_running");
    }
    #[test]
    fn recurring_events_follow_monday_index() {
        let data = Collections::seed("zh");
        let date = monday(today()) + Duration::weeks(7);
        assert!(data.schedule_events[0].occurs(date));
        assert!(!data.schedule_events[0].occurs(date + Duration::days(1)));
    }
    #[test]
    fn overlaps_get_separate_columns() {
        let data = Collections::seed("zh");
        let mut a = data.schedule_events[0].clone();
        let mut b = a.clone();
        let mut c = a.clone();
        a.start_minutes = 540;
        a.duration_minutes = 60;
        b.start_minutes = 570;
        b.duration_minutes = 60;
        c.start_minutes = 700;
        let layout = event_columns(&[a, b, c]);
        assert_eq!((layout[0].1, layout[0].2), (0, 2));
        assert_eq!((layout[1].1, layout[1].2), (1, 2));
        assert_eq!(layout[2].2, 1);
    }
    #[test]
    fn tombstone_wins_and_older_import_does_not_overwrite() {
        let mut data = Collections::seed("zh");
        let old = data.clone();
        data.tasks[0].meta.delete();
        data.merge(&old);
        assert!(!data.tasks[0].visible());
    }
    #[test]
    fn invalid_profiles_are_rejected() {
        let mut data = Collections::seed("zh");
        data.timer_profiles[0].sessions_before_long_break = 0;
        assert!(data.validate().is_err());
        assert_eq!(parse_time("24:00"), Some(1440));
        assert_eq!(parse_time("24:01"), None);
    }
    #[test]
    fn persistence_round_trip_and_invalid_data_preservation() {
        let dir = std::env::temp_dir().join(format!("focusdeck-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("data.json");
        let mut doc = Document::default();
        doc.save(&path).unwrap();
        doc.data.tasks[0].title = "原生 task 🦀".into();
        doc.save(&path).unwrap();
        assert_eq!(
            Document::load(&path).unwrap().data.tasks[0].title,
            "原生 task 🦀"
        );
        fs::write(&path, b"broken json").unwrap();
        assert!(Document::load(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"broken json");
        fs::remove_file(path).unwrap();
        fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn repeated_task_reorder_matches_web_and_keeps_unique_keys() {
        let mut data = Collections::seed("zh");
        let due = data.tasks[0].due_at;
        for task in &mut data.tasks {
            task.due_at = due;
        }
        data.reorder_tasks("t1", "t3");
        assert_eq!(data.sorted_tasks("", "")[2].meta.id, "t1");
        data.reorder_tasks("t1", "t2");
        assert_eq!(data.sorted_tasks("", "")[0].meta.id, "t1");
        let keys: std::collections::HashSet<_> =
            data.tasks.iter().map(|t| t.sort_key as i64).collect();
        assert_eq!(keys.len(), data.tasks.len());
    }
    #[test]
    fn original_zustand_export_imports_without_losing_local_changes() {
        let dir = std::env::temp_dir().join(format!("focusdeck-import-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("export.json");
        let mut doc = Document::default();
        let mut incoming = doc.data.clone();
        incoming.tasks[1].title = "Imported task".into();
        incoming.tasks[1].meta.touch();
        doc.data.tasks[0].meta.delete();
        fs::write(
            &path,
            serde_json::to_vec(&serde_json::json!({"state":incoming,"version":6})).unwrap(),
        )
        .unwrap();
        doc.import(&path).unwrap();
        assert_eq!(doc.data.tasks[1].title, "Imported task");
        assert!(!doc.data.tasks[0].visible());
        fs::write(&path, b"{}").unwrap();
        assert!(doc.import(&path).is_err());
        fs::remove_file(path).unwrap();
        fs::remove_dir(dir).unwrap();
    }
}
