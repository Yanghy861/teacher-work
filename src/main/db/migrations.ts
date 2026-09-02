import type Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

export interface Migration {
  readonly version: number
  readonly name: string
  readonly up: (database: SqliteDatabase) => void
}

export const workspaceMigrations: readonly Migration[] = [
  {
    version: 1,
    name: 'create_workspace_metadata',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS workspace_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        )
      `)
    },
  },
  {
    version: 2,
    name: 'create_core_data_tree',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY NOT NULL,
          parent_id TEXT REFERENCES nodes(id) ON DELETE RESTRICT,
          kind TEXT NOT NULL CHECK (kind IN ('course', 'period', 'lesson')),
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          lesson_label TEXT,
          course_mode TEXT CHECK (course_mode IN ('class', 'one_to_one') OR course_mode IS NULL),
          sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
          content_md TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_parent_sort
          ON nodes (parent_id, sort_order, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_nodes_deleted
          ON nodes (deleted_at);

        CREATE TABLE IF NOT EXISTS students (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS course_students (
          course_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (course_id, student_id)
        );

        CREATE INDEX IF NOT EXISTS idx_course_students_student
          ON course_students (student_id, course_id);

        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY NOT NULL,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          lesson_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
          body_md TEXT NOT NULL CHECK (length(trim(body_md)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          occurred_on TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_notes_student_created
          ON notes (student_id, created_at, id);
      `)
    },
  },
  {
    version: 3,
    name: 'create_managed_files',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY NOT NULL,
          original_name TEXT NOT NULL CHECK (length(trim(original_name)) > 0),
          size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
          mime_type TEXT NOT NULL,
          origin_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_files_active_created
          ON files (deleted_at, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_files_origin
          ON files (origin_file_id);

        CREATE TABLE IF NOT EXISTS lesson_files (
          file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          lesson_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (file_id, lesson_id)
        );

        CREATE INDEX IF NOT EXISTS idx_lesson_files_lesson
          ON lesson_files (lesson_id, created_at, file_id);

        CREATE TABLE IF NOT EXISTS student_files (
          file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (file_id, student_id)
        );

        CREATE INDEX IF NOT EXISTS idx_student_files_student
          ON student_files (student_id, created_at, file_id);
      `)
    },
  },
  {
    version: 4,
    name: 'add_managed_file_refresh_metadata',
    up: (database) => {
      database.exec(`
        ALTER TABLE files ADD COLUMN mtime_ms REAL;
        ALTER TABLE files ADD COLUMN content_hash TEXT;
      `)
    },
  },
  {
    version: 5,
    name: 'add_managed_file_index_state',
    up: (database) => {
      database.exec(`
        ALTER TABLE files ADD COLUMN indexed_hash TEXT;
        ALTER TABLE files ADD COLUMN index_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (index_status IN ('pending', 'indexed', 'no_text', 'parse_failed'));
        CREATE INDEX IF NOT EXISTS idx_files_index_status
          ON files (index_status, deleted_at, id);
      `)
    },
  },
  {
    version: 6,
    name: 'create_ai_settings',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS ai_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          provider TEXT NOT NULL CHECK (provider IN ('openai-compatible')),
          model TEXT NOT NULL CHECK (length(trim(model)) > 0),
          endpoint TEXT NOT NULL CHECK (length(trim(endpoint)) > 0),
          updated_at TEXT NOT NULL
        );

      `)
    },
  },
  {
    version: 7,
    name: 'add_note_draft_metadata',
    up: (database) => {
      database.exec(`
        ALTER TABLE notes ADD COLUMN note_kind TEXT NOT NULL DEFAULT 'manual'
          CHECK (note_kind IN ('manual', 'lecture', 'example', 'homework'));
        ALTER TABLE notes ADD COLUMN ai_metadata_json TEXT;
      `)
    },
  },
  {
    version: 8,
    name: 'create_external_library_root',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS external_roots (
          singleton_id INTEGER PRIMARY KEY NOT NULL CHECK (singleton_id = 1),
          id TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          path TEXT NOT NULL CHECK (length(trim(path)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    },
  },
  {
    version: 9,
    name: 'allow_lesson_drafts_without_student',
    up: (database) => {
      database.exec(`
        CREATE TABLE notes_v11_02 (
          id TEXT PRIMARY KEY NOT NULL,
          student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
          lesson_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
          body_md TEXT NOT NULL CHECK (length(trim(body_md)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          note_kind TEXT NOT NULL DEFAULT 'manual'
            CHECK (note_kind IN ('manual', 'lecture', 'example', 'homework')),
          ai_metadata_json TEXT
        );

        INSERT INTO notes_v11_02
          (id, student_id, lesson_id, body_md, created_at, updated_at,
           deleted_at, note_kind, ai_metadata_json)
        SELECT id, student_id, lesson_id, body_md, created_at, updated_at,
               deleted_at, note_kind, ai_metadata_json
          FROM notes;

        DROP TABLE notes;
        ALTER TABLE notes_v11_02 RENAME TO notes;

        CREATE INDEX idx_notes_student_created
          ON notes (student_id, created_at, id);
        CREATE INDEX idx_notes_lesson_created
          ON notes (lesson_id, created_at, id);
      `)
    },
  },
  {
    version: 10,
    name: 'create_prompt_skills',
    up: (database) => {
      database.exec(`
        CREATE TABLE skills (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          prompt TEXT NOT NULL CHECK (length(trim(prompt)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE INDEX idx_skills_active_updated
          ON skills (deleted_at, updated_at DESC, id);

        INSERT INTO skills (id, name, prompt, created_at, updated_at, deleted_at)
        VALUES
          (
            'starter-amc8-lesson-prep-v1',
            'AMC8 一对一常规备课',
            '你是我的 AMC8 一对一备课助手。请围绕当前课次和明确选择的资料组织内容：讲义要面向学生、简洁、结构清楚并突出公式、解题动作与常见错误；例题按基础热身、标准应用、综合迁移和挑战题形成难度梯度；作业默认控制为 10 题，兼顾直接巩固与 AMC8 风格应用，较难题用 * 标记。除非本次要求明确提出，否则不要在学生版练习或作业中泄露答案，也不要加入教师内部规划说明。',
            '2026-08-22T00:00:00.000Z',
            '2026-08-22T00:00:00.000Z',
            NULL
          ),
          (
            'starter-middle-school-math-prep-v1',
            '初中数学常规备课',
            '你是我的初中数学一对一备课助手。请以当前课次、教材范围、学生实际进度和明确选择的资料为依据：优先提炼核心知识与前置基础，少讲空泛理论，多用分层例题说明方法，突出学生容易出错的地方和可直接用于课堂的表达。作业量不要套用固定题数，应根据本节范围、题目难度、学生状态与当前薄弱点安排；不要超出已学范围，也不要虚构资料中没有的学情。',
            '2026-08-22T00:00:00.000Z',
            '2026-08-22T00:00:00.000Z',
            NULL
          );
      `)
    },
  },
  {
    version: 11,
    name: 'add_draft_lifecycle',
    up: (database) => {
      database.exec(`
        CREATE TABLE notes_v11_04 (
          id TEXT PRIMARY KEY NOT NULL,
          student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
          lesson_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
          body_md TEXT NOT NULL CHECK (length(trim(body_md)) > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          note_kind TEXT NOT NULL DEFAULT 'manual'
            CHECK (note_kind IN ('manual', 'lecture', 'example', 'homework')),
          ai_metadata_json TEXT,
          draft_status TEXT,
          CHECK (
            (note_kind = 'manual' AND draft_status IS NULL)
            OR
            (note_kind <> 'manual' AND draft_status IS NOT NULL
              AND draft_status IN ('draft', 'saved'))
          )
        );

        INSERT INTO notes_v11_04
          (id, student_id, lesson_id, body_md, created_at, updated_at,
           deleted_at, note_kind, ai_metadata_json, draft_status)
        SELECT id, student_id, lesson_id, body_md, created_at, updated_at,
               deleted_at, note_kind, ai_metadata_json,
               CASE WHEN note_kind = 'manual' THEN NULL ELSE 'draft' END
          FROM notes;

        DROP TABLE notes;
        ALTER TABLE notes_v11_04 RENAME TO notes;

        CREATE INDEX idx_notes_student_created
          ON notes (student_id, created_at, id);
        CREATE INDEX idx_notes_lesson_created
          ON notes (lesson_id, created_at, id);
        CREATE INDEX idx_notes_draft_inbox
          ON notes (draft_status, deleted_at, updated_at DESC, id);
      `)
    },
  },
  {
    version: 12,
    name: 'add_course_progress_and_attendance',
    up: (database) => {
      database.exec(`
        ALTER TABLE course_students ADD COLUMN ended_at TEXT;

        CREATE INDEX idx_course_students_active
          ON course_students (course_id, ended_at, student_id);

        CREATE TABLE course_progress (
          course_id TEXT PRIMARY KEY NOT NULL
            REFERENCES nodes(id) ON DELETE CASCADE,
          active_period_id TEXT
            REFERENCES nodes(id) ON DELETE SET NULL,
          current_lesson_id TEXT
            REFERENCES nodes(id) ON DELETE SET NULL,
          ended_at TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE lesson_sessions (
          lesson_id TEXT PRIMARY KEY NOT NULL
            REFERENCES nodes(id) ON DELETE CASCADE,
          scheduled_at TEXT,
          scheduled_on TEXT,
          taught_confirmed_at TEXT,
          attendance_recorded_at TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX idx_lesson_sessions_schedule
          ON lesson_sessions (scheduled_at);

        CREATE TABLE lesson_attendance (
          lesson_id TEXT NOT NULL
            REFERENCES lesson_sessions(lesson_id) ON DELETE CASCADE,
          student_id TEXT NOT NULL
            REFERENCES students(id) ON DELETE RESTRICT,
          status TEXT NOT NULL
            CHECK (status IN ('present', 'leave', 'absent')),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (lesson_id, student_id)
        );

        CREATE INDEX idx_lesson_attendance_student
          ON lesson_attendance (student_id, lesson_id);
      `)
    },
  },
  {
    version: 13,
    name: 'add_lesson_session_duration',
    up: (database) => {
      database.exec(`
        ALTER TABLE lesson_sessions
          ADD COLUMN duration_minutes INTEGER
          CHECK (duration_minutes IS NULL OR duration_minutes > 0);
      `)
    },
  },
  {
    version: 14,
    name: 'add_historical_course_date_metadata',
    up: (database) => {
      addColumnIfMissing(database, 'nodes', 'lesson_label', 'TEXT')
      addColumnIfMissing(database, 'lesson_sessions', 'scheduled_on', 'TEXT')
      addColumnIfMissing(database, 'notes', 'occurred_on', 'TEXT')
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_lesson_sessions_scheduled_on
          ON lesson_sessions (scheduled_on);
        CREATE INDEX IF NOT EXISTS idx_notes_student_occurred
          ON notes (student_id, occurred_on, id);
      `)
    },
  },
  {
    version: 15,
    name: 'create_material_library_tree',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS material_folders (
          id TEXT PRIMARY KEY NOT NULL,
          parent_id TEXT REFERENCES material_folders(id) ON DELETE RESTRICT,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_material_folders_parent_sort
          ON material_folders (parent_id, sort_order, created_at, id);
        CREATE TABLE IF NOT EXISTS material_folder_items (
          folder_id TEXT REFERENCES material_folders(id) ON DELETE RESTRICT,
          file_id TEXT PRIMARY KEY NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_material_folder_items_folder
          ON material_folder_items (folder_id, created_at, file_id);

        INSERT OR IGNORE INTO material_folder_items (folder_id, file_id, created_at)
        SELECT NULL, f.id, f.created_at
          FROM files AS f
         WHERE f.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM lesson_files lf WHERE lf.file_id = f.id)
           AND NOT EXISTS (SELECT 1 FROM student_files sf WHERE sf.file_id = f.id);
      `)
    },
  },
  {
    version: 16,
    name: 'extend_files_index_status_for_mineru',
    up: (database) => {
      // SQLite 不能 ALTER CHECK：按官方 12 步法重建 files 表。
      // 事故复盘（2026-09-02）：runMigrations 将 up 包在 better-sqlite3 事务里执行，
      // 事务内的 PRAGMA foreign_keys=OFF 是静默 no-op（SQLite 规定 FK PRAGMA 在事务内不可变更），
      // DROP TABLE files 触发 ON DELETE CASCADE 把 lesson_files/student_files/material_folder_items 清空。
      // 因此关闭外键必须在迁移事务开启**之前**执行：这里用 savepoint 之外的全局 PRAGMA，
      // 由 runMigrations 在 applyMigration 前后显式关闭/恢复（见 runMigrationWithFkGuard）。
      database.exec(`
        CREATE TABLE files_v16 (
          id TEXT PRIMARY KEY NOT NULL,
          original_name TEXT NOT NULL CHECK (length(trim(original_name)) > 0),
          size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
          mime_type TEXT NOT NULL,
          origin_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          mtime_ms REAL,
          content_hash TEXT,
          indexed_hash TEXT,
          index_status TEXT NOT NULL DEFAULT 'pending'
            CHECK (index_status IN ('pending', 'indexed', 'no_text', 'parse_failed', 'mineru_ready'))
        );

        INSERT INTO files_v16
          (id, original_name, size_bytes, mime_type, origin_file_id, created_at,
           updated_at, deleted_at, mtime_ms, content_hash, indexed_hash, index_status)
        SELECT id, original_name, size_bytes, mime_type, origin_file_id, created_at,
               updated_at, deleted_at, mtime_ms, content_hash, indexed_hash, index_status
          FROM files;

        DROP TABLE files;
        ALTER TABLE files_v16 RENAME TO files;

        CREATE INDEX IF NOT EXISTS idx_files_active_created
          ON files (deleted_at, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_files_origin
          ON files (origin_file_id);
        CREATE INDEX IF NOT EXISTS idx_files_index_status
          ON files (index_status, deleted_at, id);
      `)
    },
  },
]

export function runMigrations(
  database: SqliteDatabase,
  migrations: readonly Migration[] = workspaceMigrations,
): number {
  validateMigrations(migrations)
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const appliedVersions = new Set(
    database
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .pluck()
      .all() as number[],
  )
  const applyMigration = database.transaction((migration: Migration) => {
    migration.up(database)
    database
      .prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      )
      .run(migration.version, migration.name, new Date().toISOString())
  })

  // FK PRAGMA 在事务内是静默 no-op（SQLite 规定），因此必须在迁移事务开启之前关闭外键：
  // v16 的 files 表重建依赖 DROP TABLE 不触发级联，否则其隐式 DELETE 会把
  // lesson_files / student_files / material_folder_items 清空（2026-09-02 真实工作区事故）。
  // 全部迁移提交后恢复外键并强制 foreign_key_check，失败则让启动显式报错。
  const foreignKeysWereOn =
    (database.pragma('foreign_keys', { simple: true }) as number) === 1
  if (foreignKeysWereOn) {
    database.pragma('foreign_keys = OFF')
  }
  try {
    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        applyMigration.immediate(migration)
      }
    }
    if (foreignKeysWereOn) {
      database.pragma('foreign_keys = ON')
      const violations = database.pragma('foreign_key_check') as unknown[]
      if (Array.isArray(violations) && violations.length > 0) {
        throw new Error(`迁移后外键校验失败：${JSON.stringify(violations.slice(0, 3))}`)
      }
    }
  } finally {
    if (foreignKeysWereOn) {
      database.pragma('foreign_keys = ON')
    }
  }

  return getSchemaVersion(database)
}

export function getSchemaVersion(database: SqliteDatabase): number {
  const result = database
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as { version: number }
  return result.version
}

export function getAppliedMigrationVersions(database: SqliteDatabase): number[] {
  return database
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .pluck()
    .all() as number[]
}

function addColumnIfMissing(
  database: SqliteDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  const row = database
    .prepare(`SELECT 1 AS present FROM pragma_table_info(?) WHERE name = ?`)
    .get(table, column) as { present: number } | undefined
  if (row === undefined) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function validateMigrations(migrations: readonly Migration[]): void {
  const versions = new Set<number>()
  let previousVersion = 0

  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Migration version must be a positive integer: ${migration.version}`)
    }
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`)
    }
    if (migration.version <= previousVersion) {
      throw new Error('Migrations must be provided in strictly increasing version order')
    }
    if (!migration.name.trim()) {
      throw new Error(`Migration ${migration.version} must have a name`)
    }
    versions.add(migration.version)
    previousVersion = migration.version
  }
}
