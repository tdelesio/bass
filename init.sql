-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define custom types
CREATE TYPE part_type_enum AS ENUM (
    'Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Hook', 'Bridge', 'Outro', 'Solo', 'Interlude'
);

CREATE TYPE widget_type_enum AS ENUM (
    'fret_board', 'note', 'rhythm', 'roman_numeral'
);

-- Songs table
CREATE TABLE IF NOT EXISTS songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    tuning VARCHAR(100) DEFAULT 'Standard (EADG)' NOT NULL,
    key_signature VARCHAR(100) DEFAULT 'C Major' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Song Parts (Intro, Verse, etc.)
CREATE TABLE IF NOT EXISTS song_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    part_type part_type_enum NOT NULL,
    order_index INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_song_part UNIQUE (song_id, part_type, order_index)
);

-- Widgets table
CREATE TABLE IF NOT EXISTS widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id UUID NOT NULL REFERENCES song_parts(id) ON DELETE CASCADE,
    widget_type widget_type_enum NOT NULL,
    order_index INT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for performance and JSONB queries
CREATE INDEX IF NOT EXISTS idx_widgets_part_id ON widgets(part_id);
CREATE INDEX IF NOT EXISTS idx_song_parts_song_id ON song_parts(song_id);

-- Insert Seed Data (Pink Floyd - Money, Key of B Minor, Standard Tuning)
INSERT INTO songs (id, title, artist, tuning, key_signature) VALUES
('a0000000-0000-0000-0000-000000000001', 'Money', 'Pink Floyd', 'Standard (EADG)', 'B Minor'),
('a0000000-0000-0000-0000-000000000002', 'Under the Bridge', 'Red Hot Chili Peppers', 'Standard (EADG)', 'E Major'),
('a0000000-0000-0000-0000-000000000003', 'Hysteria', 'Muse', 'Standard (EADG)', 'A Minor')
ON CONFLICT (id) DO NOTHING;

-- Parts for Money (Pink Floyd)
INSERT INTO song_parts (id, song_id, part_type, order_index) VALUES
('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Intro', 0),
('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Verse', 1)
ON CONFLICT (id) DO NOTHING;

-- Widgets for Intro of Money (Fret board with 7/4 sequence, Notes, Rhythm)
INSERT INTO widgets (id, part_id, widget_type, order_index, data) VALUES
-- 1. Note Widget describing the Money bassline
(
    'c0000000-0000-0000-0000-000000000111',
    'b0000000-0000-0000-0000-000000000011',
    'note',
    0,
    '{"text": "### Money Bassline Intro (Pink Floyd)\nThis legendary riff is in **7/4 time**. Feel the syncopation and focus on playing each note with a nice, punchy round tone.\n\n*   **Tempo**: 120 BPM\n*   **Key**: B Minor\n*   **Groove style**: Steady, staccato picking."}'
),
-- 2. Fret Board Widget showing the notes
(
    'c0000000-0000-0000-0000-000000000112',
    'b0000000-0000-0000-0000-000000000011',
    'fret_board',
    1,
    '{
        "notes": [
            {"id": "n1", "string": 3, "fret": 2, "sequence": 1, "noteName": "B"},
            {"id": "n2", "string": 1, "fret": 4, "sequence": 2, "noteName": "F#"},
            {"id": "n3", "string": 3, "fret": 2, "sequence": 3, "noteName": "B"},
            {"id": "n4", "string": 2, "fret": 0, "sequence": 4, "noteName": "D"},
            {"id": "n5", "string": 2, "fret": 2, "sequence": 5, "noteName": "E"},
            {"id": "n6", "string": 1, "fret": 4, "sequence": 6, "noteName": "F#"},
            {"id": "n7", "string": 2, "fret": 0, "sequence": 7, "noteName": "D"},
            {"id": "n8", "string": 3, "fret": 2, "sequence": 8, "noteName": "B"}
        ]
    }'
),
-- 3. Rhythm Widget for 7/4 beat
(
    'c0000000-0000-0000-0000-000000000113',
    'b0000000-0000-0000-0000-000000000011',
    'rhythm',
    2,
    '{
        "timeSignature": "7/4",
        "tempo": 120,
        "subdivisions": 4,
        "beats": [true, false, true, true, true, false, true]
    }'
),
-- 4. Roman Numeral Widget showing the progression
(
    'c0000000-0000-0000-0000-000000000114',
    'b0000000-0000-0000-0000-000000000011',
    'roman_numeral',
    3,
    '{
        "key": "B",
        "scale": "minor",
        "progression": ["i", "v", "iv", "i"]
    }'
)
ON CONFLICT (id) DO NOTHING;
