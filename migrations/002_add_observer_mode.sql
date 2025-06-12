-- Добавление поля is_observer в таблицу participants
ALTER TABLE participants ADD COLUMN is_observer BOOLEAN NOT NULL DEFAULT FALSE;

-- Обновление индексов
CREATE INDEX IF NOT EXISTS idx_participants_is_observer ON participants(is_observer); 