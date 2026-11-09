import express, { Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS and JSON parsing (50mb limit to support full production database backups)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Active Server-Sent Events (SSE) Client Connections for real-time synchronization
let clients: Response[] = [];

// Helper to broadcast changes instantly to all connected browser windows
const broadcastUpdate = (type: string, payload: any) => {
  const data = JSON.stringify({ type, ...payload });
  clients.forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (err) {
      // Clean up failed connections silently
    }
  });
};

// SSE updates registration route
app.get('/api/updates', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Content-Encoding': 'none'
  });

  // Keep connection alive with immediate feedback
  res.write('data: {"status":"connected"}\n\n');

  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

// Database connection configuration
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/bass_lessons';
const pool = new Pool({
  connectionString: databaseUrl,
});

async function initializeDatabaseSchema() {
  try {
    console.log('🔄 Checking and initializing database schema...');
    
    // Create UUID extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    
    // Create custom types safely
    await pool.query(`
      DO $$ BEGIN
          CREATE TYPE part_type_enum AS ENUM (
              'Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Hook', 'Bridge', 'Outro', 'Solo', 'Interlude'
          );
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
          CREATE TYPE widget_type_enum AS ENUM (
              'fret_board', 'note', 'rhythm', 'roman_numeral', 'helix_tone'
          );
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;
    `);

    await pool.query(`
      ALTER TYPE widget_type_enum ADD VALUE IF NOT EXISTS 'helix_tone';
    `);

    // Create folders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS folders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS songs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(255) NOT NULL,
          artist VARCHAR(255) NOT NULL,
          tuning VARCHAR(100) DEFAULT 'Standard (EADG)' NOT NULL,
          key_signature VARCHAR(100) DEFAULT 'C Major' NOT NULL,
          tempo INT DEFAULT 120 NOT NULL,
          time_signature VARCHAR(20) DEFAULT '4/4' NOT NULL,
          folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure columns exist for database upgrades
    await pool.query(`
      ALTER TABLE songs ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
      ALTER TABLE songs ADD COLUMN IF NOT EXISTS tempo INT DEFAULT 120;
      ALTER TABLE songs ADD COLUMN IF NOT EXISTS time_signature VARCHAR(20) DEFAULT '4/4';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS song_parts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
          part_type part_type_enum NOT NULL,
          label VARCHAR(255),
          order_index INT NOT NULL,
          bars INT DEFAULT 4 NOT NULL,
          lyrics TEXT DEFAULT '' NOT NULL,
          notes TEXT DEFAULT '' NOT NULL,
          linked_widget_ids JSONB DEFAULT '[]'::jsonb NOT NULL,
          chord_data JSONB DEFAULT '{}'::jsonb NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Drop legacy unique constraint so songs can repeat part types (e.g. Verse -> Chorus -> Verse -> Chorus)
    // and ensure new Edit/Play mode columns exist on song_parts
    await pool.query(`
      ALTER TABLE song_parts DROP CONSTRAINT IF EXISTS unique_song_part;
      ALTER TABLE song_parts ADD COLUMN IF NOT EXISTS label VARCHAR(255);
      ALTER TABLE song_parts ADD COLUMN IF NOT EXISTS bars INT DEFAULT 4;
      ALTER TABLE song_parts ADD COLUMN IF NOT EXISTS lyrics TEXT DEFAULT '';
      ALTER TABLE song_parts ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
      ALTER TABLE song_parts ADD COLUMN IF NOT EXISTS linked_widget_ids JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE song_parts ADD COLUMN IF NOT EXISTS chord_data JSONB DEFAULT '{}'::jsonb;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS widgets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
          part_id UUID REFERENCES song_parts(id) ON DELETE SET NULL,
          widget_type widget_type_enum NOT NULL,
          order_index INT NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate existing widgets to song-level for Teach Mode (do NOT auto-add them to Edit Mode song_parts)
    await pool.query(`
      ALTER TABLE widgets ADD COLUMN IF NOT EXISTS song_id UUID REFERENCES songs(id) ON DELETE CASCADE;
      ALTER TABLE widgets ALTER COLUMN part_id DROP NOT NULL;
    `);

    // Backfill song_id from song_parts for any legacy widgets
    await pool.query(`
      UPDATE widgets w
      SET song_id = sp.song_id
      FROM song_parts sp
      WHERE w.part_id = sp.id AND w.song_id IS NULL;
    `);

    // Decouple part_id on migrated widgets so deleting a song_part in Edit Mode never deletes Teach Mode widgets
    await pool.query(`
      UPDATE widgets SET part_id = NULL WHERE song_id IS NOT NULL AND part_id IS NOT NULL;
    `);

    // Create indices
    await pool.query('CREATE INDEX IF NOT EXISTS idx_widgets_song_id ON widgets(song_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_widgets_part_id ON widgets(part_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_song_parts_song_id ON song_parts(song_id)');

    console.log('✅ Database schema initialized successfully!');
  } catch (err) {
    console.error('❌ Failed to initialize database schema:', err);
  }
}

// Test connection and execute initial verification
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully at:', res.rows[0].now);
    await initializeDatabaseSchema();
  }
});

/* ==========================================================================
   SONG ROUTES
   ========================================================================== */

// 1. Get all songs
app.get('/api/songs', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM songs ORDER BY title ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve songs' });
  }
});

// 2. Create a new song
app.post('/api/songs', async (req: Request, res: Response) => {
  const { title, artist, tuning, key_signature, tempo, time_signature } = req.body;
  if (!title || !artist) {
    return res.status(400).json({ error: 'Title and artist are required fields' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO songs (title, artist, tuning, key_signature, tempo, time_signature) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [
        title,
        artist,
        tuning || 'Standard (EADG)',
        key_signature || 'C Major',
        tempo || 120,
        time_signature || '4/4'
      ]
    );
    const song = result.rows[0];
    broadcastUpdate('song_created', { song });
    res.status(201).json(song);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create song' });
  }
});

// 3. Delete a song
app.delete('/api/songs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM songs WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    broadcastUpdate('song_deleted', { id });
    res.json({ message: 'Song deleted successfully', song: result.rows[0] });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete song' });
  }
});

// 4. Get full song details (song-level Teach Mode widgets + Edit/Play Mode Parts with chord_data & linked widgets)
app.get('/api/songs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Fetch the song
    const songRes = await pool.query('SELECT * FROM songs WHERE id = $1', [id]);
    if (songRes.rowCount === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    const song = songRes.rows[0];

    // Fetch song parts ordered chronologically
    const partsRes = await pool.query('SELECT * FROM song_parts WHERE song_id = $1 ORDER BY order_index ASC, created_at ASC', [id]);
    const parts = partsRes.rows;

    // Fetch all widgets belonging to this song (or any of its parts as fallback)
    const partIds = parts.map((p: any) => p.id);
    let songWidgetsRes;
    if (partIds.length > 0) {
      songWidgetsRes = await pool.query(
        'SELECT * FROM widgets WHERE song_id = $1 OR part_id = ANY($2::uuid[]) ORDER BY order_index ASC, created_at ASC',
        [id, partIds]
      );
    } else {
      songWidgetsRes = await pool.query(
        'SELECT * FROM widgets WHERE song_id = $1 ORDER BY order_index ASC, created_at ASC',
        [id]
      );
    }
    const songWidgets = songWidgetsRes.rows;
    const widgetMap = new Map<string, any>();
    songWidgets.forEach((w: any) => widgetMap.set(w.id, w));

    // Resolve linked widgets for each part (never auto-adding Teach Mode widgets unless explicitly linked)
    const partsWithWidgets = parts.map((part: any) => {
      const rawLinkedIds: string[] = Array.isArray(part.linked_widget_ids)
        ? part.linked_widget_ids
        : [];
      const effectiveLinkedIds = rawLinkedIds.filter((wId: string) => widgetMap.has(wId));
      const resolvedWidgets = effectiveLinkedIds
        .map((wId: string) => widgetMap.get(wId))
        .filter(Boolean);

      const rawChordData = part.chord_data && typeof part.chord_data === 'object' ? part.chord_data : {};
      const cleanedChordWidgets: Record<string, string[]> = {};
      if (rawChordData.chord_widgets && typeof rawChordData.chord_widgets === 'object') {
        for (const [chordKey, wIds] of Object.entries(rawChordData.chord_widgets)) {
          if (Array.isArray(wIds)) {
            cleanedChordWidgets[chordKey] = wIds.filter((wId: any) => widgetMap.has(String(wId)));
          }
        }
      }

      const cleanedChordGroups = Array.isArray(rawChordData.chord_groups)
        ? rawChordData.chord_groups.map((grp: any, idx: number) => ({
            id: String(grp?.id || `grp-${idx}`),
            label: String(grp?.label || 'Chord Flow'),
            colorIndex: typeof grp?.colorIndex === 'number' ? grp.colorIndex : idx,
            chord_keys: Array.isArray(grp?.chord_keys) ? grp.chord_keys.map(String) : [],
            widget_ids: Array.isArray(grp?.widget_ids)
              ? grp.widget_ids.map(String).filter((wId: string) => widgetMap.has(wId))
              : []
          }))
        : [];

      return {
        ...part,
        label: part.label || part.part_type,
        bars: part.bars ?? 4,
        lyrics: part.lyrics ?? '',
        notes: part.notes ?? '',
        linked_widget_ids: effectiveLinkedIds,
        chord_data: {
          chords: Array.isArray(rawChordData.chords) ? rawChordData.chords : [],
          chord_widgets: cleanedChordWidgets,
          chord_groups: cleanedChordGroups
        },
        widgets: resolvedWidgets,
      };
    });

    res.json({
      ...song,
      tempo: song.tempo ?? 120,
      time_signature: song.time_signature ?? '4/4',
      widgets: songWidgets,
      parts: partsWithWidgets,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve song details' });
  }
});

// Update an existing song (including organizing into folder_id, tempo, time_signature)
app.put('/api/songs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, artist, tuning, key_signature, folder_id, tempo, time_signature } = req.body;
  try {
    const songRes = await pool.query('SELECT * FROM songs WHERE id = $1', [id]);
    if (songRes.rowCount === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    const current = songRes.rows[0];
    const newTitle = title !== undefined ? title : current.title;
    const newArtist = artist !== undefined ? artist : current.artist;
    const newTuning = tuning !== undefined ? tuning : current.tuning;
    const newKeySig = key_signature !== undefined ? key_signature : current.key_signature;
    const newFolderId = folder_id !== undefined ? (folder_id === null ? null : folder_id) : current.folder_id;
    const newTempo = tempo !== undefined ? Number(tempo) || 120 : (current.tempo ?? 120);
    const newTimeSig = time_signature !== undefined ? time_signature : (current.time_signature ?? '4/4');

    const result = await pool.query(
      'UPDATE songs SET title = $1, artist = $2, tuning = $3, key_signature = $4, folder_id = $5, tempo = $6, time_signature = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8 RETURNING *',
      [newTitle, newArtist, newTuning, newKeySig, newFolderId, newTempo, newTimeSig, id]
    );
    const song = result.rows[0];
    broadcastUpdate('song_updated', { song });
    res.json(song);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update song' });
  }
});

/* ==========================================================================
   FOLDER ROUTES
   ========================================================================== */

// Get all folders
app.get('/api/folders', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM folders ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve folders' });
  }
});

// Create a new folder
app.post('/api/folders', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Folder name is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO folders (name) VALUES ($1) RETURNING *',
      [name]
    );
    const folder = result.rows[0];
    broadcastUpdate('folder_created', { folder });
    res.status(201).json(folder);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Rename a folder
app.put('/api/folders/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Folder name is required' });
  }
  try {
    const result = await pool.query(
      'UPDATE folders SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [name, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    const folder = result.rows[0];
    broadcastUpdate('folder_updated', { folder });
    res.json(folder);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Delete a folder
app.delete('/api/folders/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM folders WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    broadcastUpdate('folder_deleted', { id });
    res.json({ message: 'Folder deleted successfully', folder: result.rows[0] });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});


/* ==========================================================================
   SONG PART ROUTES (EDIT MODE)
   ========================================================================== */

// 5. Add a part to a song
app.post('/api/songs/:id/parts', async (req: Request, res: Response) => {
  const { id: song_id } = req.params;
  const { part_type, label, order_index, bars, lyrics, notes, linked_widget_ids, chord_data } = req.body;

  if (!part_type) {
    return res.status(400).json({ error: 'Part type is required' });
  }

  try {
    // If order_index isn't provided, calculate the next one
    let targetIndex = order_index;
    if (targetIndex === undefined) {
      const indexRes = await pool.query('SELECT COALESCE(MAX(order_index) + 1, 0) as next_idx FROM song_parts WHERE song_id = $1', [song_id]);
      targetIndex = indexRes.rows[0].next_idx;
    }

    const partLabel = label !== undefined && label.trim() !== '' ? label.trim() : part_type;
    const partBars = bars !== undefined ? Math.max(1, Number(bars) || 4) : 4;
    const partLyrics = lyrics !== undefined ? lyrics : '';
    const partNotes = notes !== undefined ? notes : '';
    const partLinkedWidgets = Array.isArray(linked_widget_ids) ? linked_widget_ids : [];
    const partChordData = chord_data && typeof chord_data === 'object' ? chord_data : { chords: [], chord_widgets: {} };

    const result = await pool.query(
      'INSERT INTO song_parts (song_id, part_type, label, order_index, bars, lyrics, notes, linked_widget_ids, chord_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [song_id, part_type, partLabel, targetIndex, partBars, partLyrics, partNotes, JSON.stringify(partLinkedWidgets), JSON.stringify(partChordData)]
    );

    const part = result.rows[0];
    broadcastUpdate('part_created', { part, song_id });
    res.status(201).json(part);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create song part' });
  }
});

// 5b. Update a song part (label, part_type, order_index, bars, lyrics, notes, linked_widget_ids, chord_data)
app.put('/api/parts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { part_type, label, order_index, bars, lyrics, notes, linked_widget_ids, chord_data } = req.body;

  try {
    const existingRes = await pool.query('SELECT * FROM song_parts WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      return res.status(404).json({ error: 'Song part not found' });
    }
    const current = existingRes.rows[0];

    const newPartType = part_type !== undefined ? part_type : current.part_type;
    const newLabel = label !== undefined ? label : (current.label || current.part_type);
    const newOrderIndex = order_index !== undefined ? Number(order_index) : current.order_index;
    const newBars = bars !== undefined ? Math.max(1, Number(bars) || 4) : (current.bars ?? 4);
    const newLyrics = lyrics !== undefined ? lyrics : (current.lyrics ?? '');
    const newNotes = notes !== undefined ? notes : (current.notes ?? '');
    const newLinkedWidgets = linked_widget_ids !== undefined
      ? (Array.isArray(linked_widget_ids) ? linked_widget_ids : [])
      : (Array.isArray(current.linked_widget_ids) ? current.linked_widget_ids : []);
    const newChordData = chord_data !== undefined
      ? (chord_data && typeof chord_data === 'object' ? chord_data : { chords: [], chord_widgets: {} })
      : (current.chord_data && typeof current.chord_data === 'object' ? current.chord_data : { chords: [], chord_widgets: {} });

    const result = await pool.query(
      'UPDATE song_parts SET part_type = $1, label = $2, order_index = $3, bars = $4, lyrics = $5, notes = $6, linked_widget_ids = $7, chord_data = $8 WHERE id = $9 RETURNING *',
      [newPartType, newLabel, newOrderIndex, newBars, newLyrics, newNotes, JSON.stringify(newLinkedWidgets), JSON.stringify(newChordData), id]
    );

    const part = result.rows[0];
    broadcastUpdate('part_updated', { part, song_id: part.song_id });
    res.json(part);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update song part' });
  }
});

// 5c. Reorder song parts in bulk
app.post('/api/songs/:id/parts/reorder', async (req: Request, res: Response) => {
  const { id: song_id } = req.params;
  const { partIds } = req.body;

  if (!Array.isArray(partIds)) {
    return res.status(400).json({ error: 'partIds array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let idx = 0; idx < partIds.length; idx++) {
      await client.query(
        'UPDATE song_parts SET order_index = $1 WHERE id = $2 AND song_id = $3',
        [idx, partIds[idx], song_id]
      );
    }
    await client.query('COMMIT');
    broadcastUpdate('part_reordered', { song_id });
    res.json({ message: 'Song parts reordered successfully' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to reorder song parts' });
  } finally {
    client.release();
  }
});

// 5d. Bulk add/replace song parts (starts blank without auto-adding Teach Mode widgets)
app.post('/api/songs/:id/parts/bulk', async (req: Request, res: Response) => {
  const { id: song_id } = req.params;
  const { parts, replaceExisting } = req.body;

  if (!Array.isArray(parts)) {
    return res.status(400).json({ error: 'parts array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let startIndex = 0;
    if (replaceExisting) {
      await client.query('DELETE FROM song_parts WHERE song_id = $1', [song_id]);
    } else {
      const indexRes = await client.query(
        'SELECT COALESCE(MAX(order_index) + 1, 0) as next_idx FROM song_parts WHERE song_id = $1',
        [song_id]
      );
      startIndex = indexRes.rows[0].next_idx;
    }

    const createdParts = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const partType = p.part_type || 'Verse';
      const partLabel = p.label || partType;
      const partBars = Math.max(1, Number(p.bars) || 4);
      const partLyrics = p.lyrics || '';
      const partNotes = p.notes || '';
      const partLinkedWidgets = Array.isArray(p.linked_widget_ids) ? p.linked_widget_ids : [];
      const partChordData = p.chord_data && typeof p.chord_data === 'object' ? p.chord_data : { chords: [], chord_widgets: {} };

      const ins = await client.query(
        'INSERT INTO song_parts (song_id, part_type, label, order_index, bars, lyrics, notes, linked_widget_ids, chord_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [song_id, partType, partLabel, startIndex + i, partBars, partLyrics, partNotes, JSON.stringify(partLinkedWidgets), JSON.stringify(partChordData)]
      );
      createdParts.push(ins.rows[0]);
    }

    await client.query('COMMIT');
    broadcastUpdate('part_created', { song_id, parts: createdParts });
    res.status(201).json(createdParts);
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk create song parts' });
  } finally {
    client.release();
  }
});

/* ==========================================================================
   LYRICS & CHORD CHART SEARCH & FETCH PROXY ROUTES (NO API KEY REQUIRED)
   Uses Ultimate Guitar (Chords + Lyrics) + Lyrics.ovh + LRCLIB fallback
   ========================================================================== */
const UG_BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

function cleanUltimateGuitarWikiContent(rawContent: string): string {
  const normalized = String(rawContent || '')
    .replace(/\r\n/g, '\n')
    .replace(/\[\/?tab\]/gi, '')
    .replace(/\[ch\](.*?)\[\/ch\]/gi, '$1')
    // Replace N.C. (No Chord) with spaces of the same width so chord column alignment is preserved
    .replace(/\bN\.?C\.?(?=\s|$)/gi, m => ' '.repeat(m.length));

  const lines = normalized.split('\n');
  const sectionHeaderRegex =
    /^\s*\[?\s*(intro|verse|chorus|bridge|pre[-\s]?chorus|post[-\s]?chorus|outro|solo|guitar\s+solo|bass\s+solo|instrumental|interlude|hook|refrain|coda|ending|break|breakdown|tag|vamp|link)(\s*\d+)?\s*\]?\s*:?\s*$/i;

  // Strip preamble metadata lines (Tuning:, Capo:, Artist/Title header) before the first [Section] header if one exists
  const firstHeaderIdx = lines.findIndex(l => sectionHeaderRegex.test(l.trim()));
  const bodyLines = firstHeaderIdx >= 0 ? lines.slice(firstHeaderIdx) : lines;

  // Also strip trailing "(fade out)" or tablature legend blocks if needed, keeping chords & lyrics clean
  return bodyLines
    .filter(line => {
      const t = line.trim();
      if (/^(tuning|capo|key|tempo|time signature|tabbed by|transcribed by)\s*:/i.test(t)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

interface UgChordSearchResult {
  id: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  tabUrl: string;
  votes: number;
  rating: number;
  tonalityName?: string;
  hasChords: boolean;
  source: string;
}

async function searchUltimateGuitarChords(query: string): Promise<UgChordSearchResult[]> {
  if (!query.trim()) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const url = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query.trim())}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: UG_BROWSER_HEADERS
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const html = await res.text();
    const match = html.match(/<div class="js-store" data-content="([^"]+)"/);
    if (!match || !match[1]) return [];

    const parsed = JSON.parse(decodeHtmlEntities(match[1]));
    const rawResults = parsed?.store?.page?.data?.results;
    if (!Array.isArray(rawResults)) return [];

    const chordTabs = rawResults.filter(
      (item: any) =>
        item &&
        item.type === 'Chords' &&
        item.tab_access_type === 'public' &&
        typeof item.tab_url === 'string' &&
        item.tab_url.startsWith('https://tabs.ultimate-guitar.com/tab/') &&
        !item.marketing_type
    );

    chordTabs.sort((a: any, b: any) => (Number(b.votes) || 0) - (Number(a.votes) || 0));

    return chordTabs.slice(0, 6).map((item: any) => {
      const votes = Number(item.votes) || 0;
      const version = Number(item.version) || 1;
      const tonality = item.tonality_name ? ` • Key: ${item.tonality_name}` : '';
      return {
        id: `ug-${item.id}`,
        trackName: String(item.song_name || '').trim(),
        artistName: String(item.artist_name || '').trim(),
        albumName: `Chords + Lyrics (v${version} • ${votes} votes${tonality})`,
        tabUrl: String(item.tab_url),
        votes,
        rating: Number(item.rating) || 0,
        tonalityName: String(item.tonality_name || ''),
        hasChords: true,
        source: 'Ultimate Guitar (Chords + Lyrics)'
      };
    });
  } catch (_err) {
    return [];
  }
}

async function fetchUltimateGuitarChordSheet(tabUrl: string): Promise<string | null> {
  if (!tabUrl || !tabUrl.startsWith('https://tabs.ultimate-guitar.com/tab/')) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(tabUrl, {
      signal: controller.signal,
      headers: UG_BROWSER_HEADERS
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(/<div class="js-store" data-content="([^"]+)"/);
    if (!match || !match[1]) return null;

    const parsed = JSON.parse(decodeHtmlEntities(match[1]));
    const rawWikiContent = parsed?.store?.page?.data?.tab_view?.wiki_tab?.content;
    if (!rawWikiContent || typeof rawWikiContent !== 'string') return null;

    const cleaned = cleanUltimateGuitarWikiContent(rawWikiContent);
    return cleaned || null;
  } catch (_err) {
    return null;
  }
}

app.get('/api/lyrics/search', async (req: Request, res: Response) => {
  const rawTitle = String(req.query.title || '').replace(/[=_~*]+$/g, '').trim();
  const rawArtist = String(req.query.artist || '').replace(/[=_~*]+$/g, '').trim();

  if (!rawTitle && !rawArtist) {
    return res.json([]);
  }

  const isGenericArtist = /^(theme\s*song|unknown|traditional|standard|misc|tbd|n\/a)$/i.test(rawArtist);
  const searchQueries: string[] = [];
  if (rawTitle && rawArtist && !isGenericArtist) {
    searchQueries.push(`${rawTitle} ${rawArtist}`);
  }
  if (rawTitle) {
    searchQueries.push(rawTitle);
    // Also try compacted title if e.g. "Duck Tales" -> "DuckTales"
    if (rawTitle.includes(' ')) {
      searchQueries.push(rawTitle.replace(/\s+/g, ''));
    }
  } else if (rawArtist) {
    searchQueries.push(rawArtist);
  }

  const results: Array<{
    id: string;
    trackName: string;
    artistName: string;
    albumName?: string;
    plainLyrics?: string;
    syncedLyrics?: string;
    tabUrl?: string;
    hasChords?: boolean;
    source: string;
  }> = [];
  const seenKeys = new Set<string>();

  // 1. Search Ultimate Guitar for Chords + Lyrics charts first
  const ugResults: UgChordSearchResult[] = [];
  const seenUgUrls = new Set<string>();
  for (const q of searchQueries.slice(0, 2)) {
    const found = await searchUltimateGuitarChords(q);
    for (const item of found) {
      if (!seenUgUrls.has(item.tabUrl)) {
        seenUgUrls.add(item.tabUrl);
        ugResults.push(item);
      }
    }
    if (ugResults.length >= 4) break;
  }

  for (const ug of ugResults.slice(0, 5)) {
    results.push({
      id: ug.id,
      trackName: ug.trackName,
      artistName: ug.artistName,
      albumName: ug.albumName,
      tabUrl: ug.tabUrl,
      hasChords: true,
      source: ug.source
    });
  }

  // 2. Query Lyrics.ovh suggest endpoint (fast, no API key required, handles artist typos well)
  const ovhResults: Array<{
    id: string;
    trackName: string;
    artistName: string;
    albumName?: string;
    source: string;
  }> = [];

  for (const q of searchQueries) {
    if (ovhResults.length >= 6) break;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const ovhRes = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(q)}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'BassFretWorkbench/1.2' }
      });
      clearTimeout(timeout);

      if (ovhRes.ok) {
        const ovhJson: any = await ovhRes.json();
        const items = Array.isArray(ovhJson?.data) ? ovhJson.data : [];
        for (const item of items) {
          const trackName = String(item.title || item.title_short || '').trim();
          const artistName = String(item.artist?.name || '').trim();
          const albumName = String(item.album?.title || '').trim();
          if (!trackName || !artistName) continue;
          const dedupKey = `${trackName.toLowerCase()}::${artistName.toLowerCase()}`;
          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);
          ovhResults.push({
            id: `ovh-${item.id || dedupKey}`,
            trackName,
            artistName,
            albumName,
            source: 'Lyrics.ovh (Plain Lyrics)'
          });
          if (ovhResults.length >= 8) break;
        }
      }
    } catch (_err) {
      // Ignore and try next query / fallback
    }
  }

  // If UG didn't find anything on the raw query (e.g. due to artist typo like "Monkeys" instead of "The Monkees"),
  // try UG again with the canonical trackName + artistName discovered by Lyrics.ovh!
  if (ugResults.length === 0 && ovhResults.length > 0) {
    const canonicalQuery = `${ovhResults[0].trackName} ${ovhResults[0].artistName}`;
    const rescuedUg = await searchUltimateGuitarChords(canonicalQuery);
    for (const ug of rescuedUg.slice(0, 4)) {
      if (!seenUgUrls.has(ug.tabUrl)) {
        seenUgUrls.add(ug.tabUrl);
        results.unshift({
          id: ug.id,
          trackName: ug.trackName,
          artistName: ug.artistName,
          albumName: ug.albumName,
          tabUrl: ug.tabUrl,
          hasChords: true,
          source: ug.source
        });
      }
    }
  }

  results.push(...ovhResults);

  // 3. Also try LRCLIB with a short timeout in case it is online
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const lrcQuery = searchQueries[0] || rawTitle;
    const lrcRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(lrcQuery)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BassFretWorkbench/1.2' }
    });
    clearTimeout(timeout);
    if (lrcRes.ok) {
      const lrcData: any = await lrcRes.json();
      if (Array.isArray(lrcData)) {
        for (const item of lrcData.slice(0, 4)) {
          const trackName = String(item.trackName || '').trim();
          const artistName = String(item.artistName || '').trim();
          if (!trackName || !artistName) continue;
          const dedupKey = `${trackName.toLowerCase()}::${artistName.toLowerCase()}`;
          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);
          results.push({
            id: `lrc-${item.id || dedupKey}`,
            trackName,
            artistName,
            albumName: item.albumName || '',
            plainLyrics: item.plainLyrics || '',
            syncedLyrics: item.syncedLyrics || '',
            source: 'LRCLIB'
          });
        }
      }
    }
  } catch (_err) {
    // LRCLIB is optional
  }

  res.json(results);
});

app.get('/api/lyrics/fetch', async (req: Request, res: Response) => {
  const artist = String(req.query.artist || '').trim();
  const title = String(req.query.title || '').trim();
  const tabUrl = String(req.query.tabUrl || '').trim();

  // 1. If a specific Ultimate Guitar tabUrl was selected, fetch it directly
  if (tabUrl) {
    const chordSheet = await fetchUltimateGuitarChordSheet(tabUrl);
    if (chordSheet) {
      return res.json({
        lyrics: chordSheet,
        hasChords: true,
        source: 'Ultimate Guitar (Chords + Lyrics)'
      });
    }
  }

  if (!artist && !title) {
    return res.status(400).json({ error: 'artist and title (or tabUrl) are required' });
  }

  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, '').replace(/\s*\[[^\]]*\]\s*/g, '').trim();

  // 2. Even if the user clicked a plain-lyrics search result, try to find a matching Ultimate Guitar Chords chart first
  // so chords are automatically placed above the lyrics whenever a chord chart exists!
  const ugCandidates = await searchUltimateGuitarChords(
    artist ? `${cleanTitle || title} ${artist}` : cleanTitle || title
  );
  if (ugCandidates.length === 0 && cleanTitle) {
    const titleOnlyUg = await searchUltimateGuitarChords(cleanTitle);
    const artistLower = artist.toLowerCase().replace(/^the\s+/i, '');
    const matchingArtistUg = titleOnlyUg.filter(item => {
      if (!artistLower) return true;
      const itemArtist = item.artistName.toLowerCase().replace(/^the\s+/i, '');
      return itemArtist.includes(artistLower) || artistLower.includes(itemArtist);
    });
    ugCandidates.push(...(matchingArtistUg.length > 0 ? matchingArtistUg : titleOnlyUg.slice(0, 1)));
  }

  for (const ug of ugCandidates.slice(0, 2)) {
    const chordSheet = await fetchUltimateGuitarChordSheet(ug.tabUrl);
    if (chordSheet) {
      return res.json({
        lyrics: chordSheet,
        hasChords: true,
        source: 'Ultimate Guitar (Chords + Lyrics)'
      });
    }
  }

  // 3. Fallback to Lyrics.ovh plain lyrics if no chord chart was found
  const candidateTitles = Array.from(new Set([title, cleanTitle].filter(Boolean)));
  for (const candidateTitle of candidateTitles) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const ovhRes = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(candidateTitle)}`,
        {
          signal: controller.signal,
          headers: { 'User-Agent': 'BassFretWorkbench/1.2' }
        }
      );
      clearTimeout(timeout);

      if (ovhRes.ok) {
        const data: any = await ovhRes.json();
        if (data?.lyrics) {
          const cleanedLyrics = String(data.lyrics)
            .replace(/^Paroles de la chanson .*?\r?\n/i, '')
            .replace(/\r\n/g, '\n')
            .trim();
          return res.json({
            lyrics: cleanedLyrics,
            hasChords: false,
            source: 'Lyrics.ovh'
          });
        }
      }
    } catch (_err) {
      // Try next variation
    }
  }

  return res.status(404).json({
    error: `Lyrics text wasn't available for "${title}" by ${artist}. Try another search result or paste lyrics directly.`
  });
});

// 6. Delete a part
app.delete('/api/parts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM song_parts WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Song part not found' });
    }
    const part = result.rows[0];
    broadcastUpdate('part_deleted', { id, song_id: part.song_id });
    res.json({ message: 'Song part deleted successfully', part });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete song part' });
  }
});


/* ==========================================================================
   LINE 6 HX STOMP TONE & PEDAL CHAIN DISCOVERY ENGINE
   ========================================================================== */

interface HxStompBlockSpec {
  id: string;
  category: 'dynamics' | 'filter' | 'pitch' | 'distortion' | 'amp_cab' | 'modulation' | 'eq' | 'delay' | 'reverb';
  hxModel: string;
  basedOn: string;
  enabled: boolean;
  footswitch: 'Always On' | 'FS1' | 'FS2' | 'FS3';
  role: string;
  settings: Record<string, string>;
}

interface CustomToneResultItem {
  id: string;
  toneName: string;
  song: string;
  band: string;
  guitarist: string;
  instrumentTag: string;
  amp: string;
  style: string;
  comment: string;
  downloads: number;
  date: string;
  url: string;
}

async function pollLine6CustomTone(
  title: string,
  artist: string,
  instrument: 'bass' | 'guitar'
): Promise<CustomToneResultItem[]> {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, '').replace(/\s*\[[^\]]*\]\s*/g, '').trim();
  const cleanArtist = artist.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const terms = Array.from(
    new Set(
      [
        cleanTitle && cleanArtist ? `${cleanTitle} ${cleanArtist}` : '',
        cleanTitle,
        cleanArtist ? `${cleanArtist} ${instrument}` : '',
        cleanArtist
      ].filter(Boolean)
    )
  ).slice(0, 3);

  const collected: CustomToneResultItem[] = [];
  const seenIds = new Set<string>();

  for (const term of terms) {
    if (collected.length >= 6) break;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);
      const url = `https://line6.com/customtone/search/?submitted=1&family=hx_stomp&search_term=${encodeURIComponent(term)}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: UG_BROWSER_HEADERS
      });
      clearTimeout(timeout);
      if (!res.ok) continue;

      const html = await res.text();
      const toneBlocks = html.split(/<div class="tone">/i).slice(1);

      for (const block of toneBlocks) {
        const idMatch = block.match(/\/customtone\/tone\/(\d+)\//i);
        if (!idMatch) continue;
        const id = idMatch[1];
        if (seenIds.has(id)) continue;

        const extractField = (label: string) => {
          const re = new RegExp(`${label}:\\s*([\\s\\S]*?)<\\/(?:a|li)>`, 'i');
          const m = block.match(re);
          return m ? decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : '';
        };

        const toneName = extractField('TONE NAME') || 'HX Stomp Preset';
        const song = extractField('SONG');
        const band = extractField('BAND');
        const guitarist = extractField('GUITARIST');
        const amp = extractField('AMP').replace(/^---+$/, '').trim();

        const commentMatch = block.match(/<div class="comment[^"]*">([\s\S]*?)<\/div>/i);
        const comment = commentMatch
          ? decodeHtmlEntities(commentMatch[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
          : '';

        const dlMatch = block.match(/(\d+)\s+downloads/i);
        const downloads = dlMatch ? parseInt(dlMatch[1], 10) : 0;

        const dateMatch = block.match(/glyphicon-calendar[^>]*><\/span>\s*([0-9/]+)/i);
        const date = dateMatch ? dateMatch[1].trim() : '';

        const styleMatch = block.match(/<ul class="col-xs-4">\s*<li>([\s\S]*?)<\/li>/i);
        const style = styleMatch
          ? decodeHtmlEntities(styleMatch[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
          : '';

        seenIds.add(id);
        collected.push({
          id,
          toneName,
          song,
          band,
          guitarist,
          instrumentTag: '',
          amp,
          style,
          comment,
          downloads,
          date,
          url: `https://line6.com/customtone/tone/${id}/`
        });
      }
    } catch (_err) {
      // Continue to next term
    }
  }

  // Enrich top 3 results with detail page metadata (#tone_guitar and full #tone_comments)
  await Promise.all(
    collected.slice(0, 3).map(async item => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const detailRes = await fetch(item.url, {
          signal: controller.signal,
          headers: UG_BROWSER_HEADERS
        });
        clearTimeout(timeout);
        if (!detailRes.ok) return;
        const detailHtml = await detailRes.text();
        const guitarMatch = detailHtml.match(/id="tone_guitar">([\s\S]*?)<\/div>/i);
        if (guitarMatch) {
          item.instrumentTag = decodeHtmlEntities(guitarMatch[1].replace(/<[^>]+>/g, '')).trim();
        }
        const fullCommentMatch = detailHtml.match(/id="tone_comments">([\s\S]*?)<\/div>/i);
        if (fullCommentMatch) {
          const fullComment = decodeHtmlEntities(fullCommentMatch[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
          if (fullComment && fullComment.length > item.comment.length) {
            item.comment = fullComment;
          }
        }
      } catch (_err) {
        // Ignore enrichment errors
      }
    })
  );

  // Score and sort results so bass presets bubble to top for 'bass' and guitar presets for 'guitar'
  const artistLower = cleanArtist.toLowerCase();
  const titleLower = cleanTitle.toLowerCase();
  const bassRegex = /\b(bass|svt|ampeg|sansamp|b7k|darkglass|flea|wolstenholme|geddy|chancellor|burton|pastorius|commerford|kaye|entwistle|waters|deacon|mcKagan|claypool|wooten|pbass|jbass|jazz bass|p-bass)\b/i;

  collected.sort((a, b) => {
    const scoreItem = (it: CustomToneResultItem) => {
      let s = 0;
      const blob = `${it.toneName} ${it.song} ${it.band} ${it.guitarist} ${it.instrumentTag} ${it.comment}`.toLowerCase();
      if (artistLower && blob.includes(artistLower)) s += 30;
      if (titleLower && blob.includes(titleLower)) s += 25;
      const looksLikeBass = bassRegex.test(blob) || /bass/i.test(it.instrumentTag);
      if (instrument === 'bass' && looksLikeBass) s += 40;
      if (instrument === 'guitar' && !looksLikeBass) s += 25;
      s += Math.min(20, Math.floor(it.downloads / 250));
      return s;
    };
    return scoreItem(b) - scoreItem(a);
  });

  return collected.slice(0, 6);
}

async function pollSongsterrTrackInfo(
  title: string,
  artist: string,
  instrument: 'bass' | 'guitar'
): Promise<{
  matchedSongTitle?: string;
  matchedArtist?: string;
  playingStyle?: string;
  trackNames: string[];
  tuning?: string;
}> {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const cleanArtist = artist.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const query = [cleanTitle, cleanArtist].filter(Boolean).join(' ');
  if (!query) return { trackNames: [] };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://www.songsterr.com/api/songs?pattern=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: UG_BROWSER_HEADERS
    });
    clearTimeout(timeout);
    if (!res.ok) return { trackNames: [] };

    const items: any = await res.json();
    if (!Array.isArray(items) || items.length === 0) return { trackNames: [] };

    const artistLower = cleanArtist.toLowerCase();
    const best =
      items.find((it: any) => artistLower && String(it.artist || '').toLowerCase().includes(artistLower)) ||
      items[0];

    const tracks = Array.isArray(best?.tracks) ? best.tracks : [];
    const relevantTracks = tracks.filter((t: any) => {
      const inst = String(t?.instrument || '').toLowerCase();
      const name = String(t?.name || '').toLowerCase();
      if (instrument === 'bass') {
        return inst.includes('bass') || name.includes('bass');
      }
      return (inst.includes('guitar') || name.includes('guitar')) && !inst.includes('bass');
    });

    const trackNames = relevantTracks.map((t: any) => `${t.name || t.instrument} (${t.instrument || ''})`.trim());
    const primaryInst = String(relevantTracks[0]?.instrument || '');
    let playingStyle = '';
    if (instrument === 'bass') {
      if (/pick/i.test(primaryInst)) playingStyle = 'Picked Bass (Aggressive Attack)';
      else if (/slap/i.test(primaryInst)) playingStyle = 'Slap & Pop Bass (Percussive Funk)';
      else if (/fretless/i.test(primaryInst)) playingStyle = 'Fretless Bass (Warm Mwah & Chorus)';
      else if (/synth/i.test(primaryInst)) playingStyle = 'Synth / Sub-Octave Bass';
      else if (primaryInst) playingStyle = 'Fingerstyle Bass (Warm Punch)';
    } else {
      if (/distortion/i.test(primaryInst)) playingStyle = 'High-Gain / Distortion Guitar';
      else if (/overdriven/i.test(primaryInst)) playingStyle = 'Overdriven / Edge-of-Breakup Guitar';
      else if (/clean|jazz/i.test(primaryInst)) playingStyle = 'Clean / Modulated Electric Guitar';
      else if (/acoustic/i.test(primaryInst)) playingStyle = 'Acoustic / Piezo Simulator';
      else if (primaryInst) playingStyle = primaryInst;
    }

    let tuningStr: string | undefined;
    if (Array.isArray(relevantTracks[0]?.tuning) && relevantTracks[0].tuning.length > 0) {
      const midiToNote = (m: number) => ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][m % 12];
      const notes = [...relevantTracks[0].tuning].reverse().map(midiToNote);
      tuningStr = notes.join(' ');
    }

    return {
      matchedSongTitle: best?.title,
      matchedArtist: best?.artist,
      playingStyle: playingStyle || undefined,
      trackNames: trackNames.slice(0, 4),
      tuning: tuningStr
    };
  } catch (_err) {
    return { trackNames: [] };
  }
}

async function pollWebRigSnippets(
  title: string,
  artist: string,
  instrument: 'bass' | 'guitar'
): Promise<string[]> {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const cleanArtist = artist.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const q = `"${cleanTitle}" "${cleanArtist}" ${instrument} tone pedals amp rig`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      headers: UG_BROWSER_HEADERS
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const html = await res.text();
    const snippets: string[] = [];
    const regex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null && snippets.length < 6) {
      const cleaned = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (cleaned) snippets.push(cleaned);
    }
    return snippets;
  } catch (_err) {
    return [];
  }
}

function buildHxStompToneRecommendations(params: {
  title: string;
  artist: string;
  instrument: 'bass' | 'guitar';
  customTones: CustomToneResultItem[];
  songsterrInfo: {
    playingStyle?: string;
    trackNames: string[];
    tuning?: string;
  };
  webSnippets: string[];
}) {
  const { title, artist, instrument, customTones, songsterrInfo, webSnippets } = params;
  const combinedText = [
    title,
    artist,
    songsterrInfo.playingStyle || '',
    ...songsterrInfo.trackNames,
    ...customTones.map(c => `${c.toneName} ${c.amp} ${c.style} ${c.comment} ${c.guitarist}`),
    ...webSnippets
  ]
    .join(' ')
    .toLowerCase();

  const detectedGear: string[] = [];
  const addGear = (label: string) => {
    if (!detectedGear.includes(label)) detectedGear.push(label);
  };

  if (instrument === 'bass') {
    // Detect signature songs/artists & gear keywords for Bass
    const hasMuseFuzz = /\b(muse|hysteria|wolstenholme|animato|woolly mammoth|fuzz factory)\b/i.test(combinedText);
    const hasBigMuff = /\b(big muff|muff|russian|cliff burton|anesthesia|black keys|royal blood|jack white)\b/i.test(combinedText);
    const hasDarkglass = /\b(darkglass|b7k|alpha omega|vintage microtubes|periphery|metal|dingwall|architects|tool|chancellor)\b/i.test(combinedText);
    const hasSansAmp = /\b(sansamp|tech 21|geddy|rush|blink|green day|dirnt|hoppus|grunge|nirvana|alice in chains)\b/i.test(combinedText);
    const hasFleaGK = /\b(flea|red hot chili|rhcp|under the bridge|californication|can't stop|gallien|gk\s*800|800rb)\b/i.test(combinedText);
    const hasMotownB15 = /\b(motown|jamerson|b-15|b15|fliptop|flip-top|soul|marvin gaye|stevie wonder|vulfpeck|joe dart|duck tales|ducktales|theme)\b/i.test(combinedText);
    const hasChorus = /\b(chorus|ce-1|ceb-3|small clone|duff|guns n|new order|hook|cure|eighties|80s|fretless|come as you are|schism)\b/i.test(combinedText);
    const hasEnvelopeFilter = /\b(mu-tron|mutron|envelope|auto-wah|autowah|q-tron|funk|slap|bootsy|thundercat|jamiroquai|flea|sir psycho)\b/i.test(combinedText);
    const hasOctave = /\b(octave|oc-2|oc2|pogs|sub|synth|royal blood|sledgehammer|peter gabriel|dua lipa)\b/i.test(combinedText);
    const hasFlangerPhaser = /\b(flanger|phaser|phase 90|forty six|46 & 2|tool|van halen|thin lizzy)\b/i.test(combinedText);
    const isPicked = /pick/i.test(songsterrInfo.playingStyle || '') || /\b(pick|pink floyd|money|waters|punk|green day|tool|muse)\b/i.test(combinedText);

    // 1. Compressor Block (Slot 1)
    const compBlock: HxStompBlockSpec = hasMotownB15 || !isPicked
      ? {
          id: 'blk-1',
          category: 'dynamics',
          hxModel: 'LA Studio Comp',
          basedOn: 'Teletronix LA-2A Studio Optical Compressor',
          enabled: true,
          footswitch: 'Always On',
          role: 'Smooth optical studio compression to glue low-end fundamentals and sustain.',
          settings: { 'Peak Reduc': '5.5', Gain: '5.0', Type: 'Compress', Mix: '80%' }
        }
      : {
          id: 'blk-1',
          category: 'dynamics',
          hxModel: 'Rochester Comp',
          basedOn: 'Ashly CLX-52 / BBE Opto Stomp Bass Compressor',
          enabled: true,
          footswitch: 'Always On',
          role: 'Tight transient control that preserves pick/slap attack without pumping.',
          settings: { Threshold: '-24 dB', Ratio: '4:1', Attack: '15 ms', Gain: '3.5 dB' }
        };
    addGear(compBlock.basedOn);

    // 2. Pitch / Filter / Synth Block (Optional Slot 2)
    let filterOrPitchBlock: HxStompBlockSpec | null = null;
    if (hasEnvelopeFilter) {
      filterOrPitchBlock = {
        id: 'blk-2',
        category: 'filter',
        hxModel: 'Mutant Filter',
        basedOn: 'Musitronics Mu-Tron III Envelope Filter',
        enabled: true,
        footswitch: 'FS1',
        role: 'Vocal, percussive funk filter sweep triggered by picking/slap dynamics.',
        settings: { Mode: 'BP (Bandpass)', Drive: '4.5', Peak: '6.5', Range: 'Low', Mix: '100%' }
      };
      addGear('Mu-Tron III Envelope Filter');
    } else if (hasOctave || hasMuseFuzz) {
      filterOrPitchBlock = {
        id: 'blk-2',
        category: 'pitch',
        hxModel: hasMuseFuzz ? '3 OSC Synth' : 'Twin Harmony',
        basedOn: hasMuseFuzz ? 'Analog 3-Oscillator Synth Bass' : 'Sub-Octave Divider (BOSS OC-2 style)',
        enabled: !hasMuseFuzz,
        footswitch: 'FS1',
        role: hasMuseFuzz
          ? 'Optional synth sub-layer for the chorus/interlude synth-bass texture.'
          : 'Adds -1 octave sub weight underneath single-note bass riffs.',
        settings: hasMuseFuzz
          ? { 'Osc 1': 'Saw (-1 Oct)', Cut: '4.2', Resonance: '5.5', Mix: '35%' }
          : { 'Interval 1': '-1 Oct', 'Voice 1': '65%',Mix: '45%' }
      };
      addGear(filterOrPitchBlock.basedOn);
    }

    // 3. Drive / Fuzz / DI Preamp Block (Slot 3)
    let driveBlock: HxStompBlockSpec;
    if (hasMuseFuzz) {
      driveBlock = {
        id: 'blk-3',
        category: 'distortion',
        hxModel: 'Industrial Fuzz',
        basedOn: 'Z.Vex Woolly Mammoth / Human Gear Animato Fuzz',
        enabled: true,
        footswitch: 'FS2',
        role: 'Biting, gated saw-wave bass fuzz with parallel clean blend for fast 16th-note riffs.',
        settings: { Stab: '7.5', Gate: '3.0', Pinch: '5.5', Drive: '7.0', Blend: '65%' }
      };
      addGear('Human Gear Animato / Z.Vex Woolly Mammoth Bass Fuzz');
      addGear('EHX Russian Big Muff Pi');
    } else if (hasBigMuff) {
      driveBlock = {
        id: 'blk-3',
        category: 'distortion',
        hxModel: 'Russian Big Pi',
        basedOn: 'Electro-Harmonix Green Russian Big Muff Pi',
        enabled: true,
        footswitch: 'FS2',
        role: 'Thick, wooly low-end fuzz sustain that retains deep bass fundamentals.',
        settings: { Sustain: '6.8', Tone: '5.2', Level: '6.5', Blend: '70%' }
      };
      addGear('Electro-Harmonix Green Russian Big Muff Pi');
    } else if (hasDarkglass) {
      driveBlock = {
        id: 'blk-3',
        category: 'distortion',
        hxModel: 'Obsidian 7000',
        basedOn: 'Darkglass Electronics Microtubes B7K Ultra',
        enabled: true,
        footswitch: 'FS2',
        role: 'Modern aggressive upper-mid grind and clank mixed with clean sub-bass.',
        settings: { Drive: '6.2', Blend: '70%', Attack: 'Boost', Grunt: 'Fat', 'Hi Mids': '+3.5 dB' }
      };
      addGear('Darkglass Microtubes B7K Ultra');
    } else {
      driveBlock = {
        id: 'blk-3',
        category: 'distortion',
        hxModel: 'ZeroAmp Bass DI',
        basedOn: 'Tech 21 SansAmp Bass Driver DI',
        enabled: hasSansAmp || isPicked,
        footswitch: hasSansAmp ? 'Always On' : 'FS2',
        role: 'Warm tube-emulated DI harmonic grit and presence; kick on for driven sections.',
        settings: { Drive: isPicked ? '5.2' : '4.0', Bass: '5.8', Treble: '6.2', Presence: '5.5', Blend: '75%' }
      };
      addGear('Tech 21 SansAmp Bass Driver DI');
    }

    // 4. Bass Amp + Cab Block (Slot 4)
    let ampBlock: HxStompBlockSpec;
    if (hasFleaGK) {
      ampBlock = {
        id: 'blk-4',
        category: 'amp_cab',
        hxModel: 'G Cougar 800 + 4x10 Rhino',
        basedOn: 'Gallien-Krueger GK 800RB + 4x10 Cab',
        enabled: true,
        footswitch: 'Always On',
        role: 'Punchy, fast-transient solid-state bi-amp articulation with tight low-mid bark.',
        settings: { Boost: '5.5', 'Lo Cut': 'On', 'Lo Mid': '6.0', 'Hi Mid': '6.5', Presence: '6.0' }
      };
      addGear('Gallien-Krueger GK 800RB Amplifier');
    } else if (hasMotownB15) {
      ampBlock = {
        id: 'blk-4',
        category: 'amp_cab',
        hxModel: 'Flip Top + 1x15 Flip Top',
        basedOn: '1960s Ampeg B-15N Portaflex Tube Combo',
        enabled: true,
        footswitch: 'Always On',
        role: 'Warm, round vintage 60s/70s studio tube thump that sits effortlessly in the pocket.',
        settings: { Drive: '4.5', Bass: '6.5', Treble: '4.2', 'Cab Mic': '47 Cond FET' }
      };
      addGear('Ampeg B-15N Portaflex Tube Flip-Top');
    } else {
      ampBlock = {
        id: 'blk-4',
        category: 'amp_cab',
        hxModel: isPicked ? 'SV Beast Brt + 8x10 SVT Beast' : 'SV Beast Nrm + 8x10 SVT Beast',
        basedOn: isPicked ? 'Ampeg SVT (Bright Ch) + 8x10 Cab' : 'Ampeg SVT (Normal Ch) + 8x10 Cab',
        enabled: true,
        footswitch: 'Always On',
        role: 'Classic 300W all-tube rock/funk bass stack with authoritative low-end and woody midrange.',
        settings: {
          Drive: isPicked ? '5.5' : '4.5',
          Bass: '6.0',
          Midrange: '6.5',
          'Mid Freq': '800 Hz',
          Treble: isPicked ? '6.2' : '5.0',
          'Ultra Lo': 'On'
        }
      };
      addGear('Ampeg SVT Classic + 8x10 SVT Cab');
    }

    // 5. Modulation Block (Slot 5)
    const modBlock: HxStompBlockSpec = hasFlangerPhaser
      ? {
          id: 'blk-5',
          category: 'modulation',
          hxModel: 'Gray Flanger',
          basedOn: 'MXR M117 Flanger',
          enabled: true,
          footswitch: 'FS3',
          role: 'Metallic jet-sweep modulation on picked bass riffs and atmospheric interludes.',
          settings: { Manual: '5.5', Width: '6.0', Speed: '2.2', Regen: '4.5', Mix: '45%' }
        }
      : {
          id: 'blk-5',
          category: 'modulation',
          hxModel: '70s Chorus',
          basedOn: 'BOSS CE-1 Chorus Ensemble',
          enabled: hasChorus || hasFleaGK,
          footswitch: 'FS3',
          role: 'Warm analog chorus shimmer on upper-register bass chords, intros, and melodic hooks.',
          settings: { 'Chorus Intensity': '4.5', Mode: 'Chorus', 'Low Cut': '180 Hz', Mix: '40%' }
        };
    if (hasChorus || hasFleaGK || hasFlangerPhaser) {
      addGear(modBlock.basedOn);
    }

    // 6. Studio Output EQ Block (Slot 6)
    const eqBlock: HxStompBlockSpec = {
      id: 'blk-6',
      category: 'eq',
      hxModel: '10 Band Graphic',
      basedOn: 'MXR M108 10-Band Graphic EQ (Low-Cut @ 35Hz)',
      enabled: true,
      footswitch: 'Always On',
      role: 'Tightens sub-35Hz rumble and adds 800Hz–1.5kHz finger/pick definition in the mix.',
      settings: { '62.5 Hz': '+2.0 dB', '250 Hz': '-1.5 dB', '800 Hz': '+2.5 dB', '2 kHz': '+1.5 dB', Level: '0.0 dB' }
    };

    const primaryChain: HxStompBlockSpec[] = [
      compBlock,
      ...(filterOrPitchBlock ? [filterOrPitchBlock] : []),
      driveBlock,
      ampBlock,
      modBlock,
      eqBlock
    ].map((b, idx) => ({ ...b, id: `blk-${idx + 1}` }));

    const cleanChain: HxStompBlockSpec[] = [
      compBlock,
      {
        ...driveBlock,
        hxModel: 'ZeroAmp Bass DI',
        basedOn: 'Tech 21 SansAmp Bass Driver DI (Clean Tube Warmth)',
        enabled: true,
        footswitch: 'Always On' as const,
        settings: { Drive: '3.2', Bass: '5.8', Treble: '5.5', Blend: '55%' }
      },
      ampBlock,
      eqBlock
    ].map((b, idx) => ({ ...b, id: `clean-${idx + 1}` }));

    return {
      instrument: 'bass' as const,
      playingStyle: songsterrInfo.playingStyle || (isPicked ? 'Picked Bass' : 'Fingerstyle Bass'),
      tuning: songsterrInfo.tuning,
      detectedGear,
      summary: `HX Stomp Bass Signal Chain tailored for "${title || 'this song'}"${artist ? ` by ${artist}` : ''}. Uses ${ampBlock.hxModel} (${ampBlock.basedOn}) with ${driveBlock.hxModel} (${driveBlock.basedOn}) and ${compBlock.hxModel}.`,
      recommendedChain: primaryChain,
      presets: [
        {
          id: 'preset-full-bass',
          name: `${title || 'Song'} — Full HX Stomp Bass Rig`,
          description: `Complete 6-block HX Stomp bass chain with ${compBlock.hxModel}, ${driveBlock.hxModel}, and ${ampBlock.hxModel}.`,
          chain: primaryChain
        },
        {
          id: 'preset-clean-bass',
          name: `${title || 'Song'} — Clean Pocket / Verse Bass DI`,
          description: 'Warm, studio-compressed clean tube bass foundation for verses and groove sections.',
          chain: cleanChain
        }
      ]
    };
  } else {
    // GUITAR TONE & PEDAL CHAIN BUILDER
    const isHighGain =
      /distortion/i.test(songsterrInfo.playingStyle || '') ||
      /\b(muse|metal|metallica|tool|nirvana|grunge|hard rock|rectifier|friedman|marshall|plexi|jcm|fuzz|hysteria)\b/i.test(combinedText);
    const isCleanFunkOrChime =
      /clean/i.test(songsterrInfo.playingStyle || '') ||
      /\b(rhcp|red hot chili|frusciante|under the bridge|fender|twin|strat|chorus|funk|police|u2|smiths|pink floyd|gilmour)\b/i.test(combinedText);

    const compBlock: HxStompBlockSpec = {
      id: 'gblk-1',
      category: 'dynamics',
      hxModel: 'Red Squeeze',
      basedOn: 'MXR Dyna Comp',
      enabled: isCleanFunkOrChime,
      footswitch: isCleanFunkOrChime ? 'Always On' : 'FS1',
      role: 'Adds sustain and snappy single-coil attack (John Frusciante / David Gilmour style).',
      settings: { Sensitivity: '5.5', Mix: '75%', Level: '+1.5 dB' }
    };
    addGear('MXR Dyna Comp Compressor');

    const driveBlock: HxStompBlockSpec = isHighGain
      ? {
          id: 'gblk-2',
          category: 'distortion',
          hxModel: 'Compulsive Drive',
          basedOn: 'Fulltone OCD / Marshall-Style Overdrive',
          enabled: true,
          footswitch: 'FS1',
          role: 'Pushes the amp into rich harmonic saturation and tightens low strings.',
          settings: { Gain: '6.0', Tone: '6.2', Peak: 'High', Level: '6.5' }
        }
      : {
          id: 'gblk-2',
          category: 'distortion',
          hxModel: 'Minotaur',
          basedOn: 'Klon Centaur Transparent Overdrive',
          enabled: true,
          footswitch: 'FS1',
          role: 'Edge-of-breakup midrange warmth and lead boost.',
          settings: { Gain: '3.8', Treble: '6.0', Output: '6.5' }
        };
    addGear(driveBlock.basedOn);

    const fuzzOrBoostBlock: HxStompBlockSpec = {
      id: 'gblk-3',
      category: 'distortion',
      hxModel: 'Triangle Fuzz',
      basedOn: 'Electro-Harmonix Triangle Big Muff Pi',
      enabled: false,
      footswitch: 'FS2',
      role: 'Kick on FS2 for soaring lead solos and heavy chorus walls of fuzz.',
      settings: { Sustain: '7.0', Tone: '5.8', Level: '6.5' }
    };
    addGear('EHX Triangle Big Muff / Solo Lead Boost');

    const ampBlock: HxStompBlockSpec = isHighGain
      ? {
          id: 'gblk-4',
          category: 'amp_cab',
          hxModel: 'Brit 2204 + 4x12 Greenback25',
          basedOn: 'Marshall JCM800 2204 + 4x12 Celestion Greenback Cab',
          enabled: true,
          footswitch: 'Always On',
          role: 'Punchy British rock crunch and articulate chord separation.',
          settings: { Preamp: '6.5', Bass: '5.5', Mid: '6.8', Treble: '6.0', Presence: '5.5' }
        }
      : {
          id: 'gblk-4',
          category: 'amp_cab',
          hxModel: 'US Double Nrm + 2x12 Double C12N',
          basedOn: 'Fender Twin Reverb + 2x12 Jensen Cab',
          enabled: true,
          footswitch: 'Always On',
          role: 'Bell-like clean headroom and warm pedal-platform response.',
          settings: { Drive: '4.2', Bass: '5.5', Mid: '6.0', Treble: '6.2', Presence: '5.0' }
        };
    addGear(ampBlock.basedOn);

    const modBlock: HxStompBlockSpec = {
      id: 'gblk-5',
      category: 'modulation',
      hxModel: '70s Chorus',
      basedOn: 'BOSS CE-1 Chorus Ensemble',
      enabled: isCleanFunkOrChime,
      footswitch: 'FS3',
      role: 'Lush stereo-style analog chorus movement on arpeggios and clean chords.',
      settings: { 'Chorus Intensity': '4.8', Mode: 'Chorus', Mix: '45%' }
    };
    addGear('BOSS CE-1 Chorus Ensemble');

    const delayReverbBlock: HxStompBlockSpec = {
      id: 'gblk-6',
      category: 'delay',
      hxModel: 'Transistor Tape',
      basedOn: 'Maestro Echoplex EP-3 Tape Delay',
      enabled: true,
      footswitch: 'Always On',
      role: 'Adds 3D studio depth and vintage tape echo trails.',
      settings: { Time: '360 ms', Feedback: '22%', 'Wow Flt': '3.5', Mix: '24%' }
    };
    addGear('Maestro Echoplex EP-3 Tape Echo');

    const guitarChain = [compBlock, driveBlock, fuzzOrBoostBlock, ampBlock, modBlock, delayReverbBlock];

    return {
      instrument: 'guitar' as const,
      playingStyle: songsterrInfo.playingStyle || (isHighGain ? 'Driven Rock Guitar' : 'Clean / Edge-of-Breakup Guitar'),
      tuning: songsterrInfo.tuning,
      detectedGear,
      summary: `HX Stomp Guitar Signal Chain tailored for "${title || 'this song'}"${artist ? ` by ${artist}` : ''}. Uses ${ampBlock.hxModel} (${ampBlock.basedOn}) paired with ${driveBlock.hxModel} and ${delayReverbBlock.hxModel}.`,
      recommendedChain: guitarChain,
      presets: [
        {
          id: 'preset-full-guitar',
          name: `${title || 'Song'} — Full HX Stomp Guitar Rig`,
          description: `6-block HX Stomp guitar chain with ${driveBlock.hxModel}, ${ampBlock.hxModel}, and ${delayReverbBlock.hxModel}.`,
          chain: guitarChain
        }
      ]
    };
  }
}

app.get('/api/tone/discover', async (req: Request, res: Response) => {
  const title = String(req.query.title || '').replace(/[=_~*]+$/g, '').trim();
  const artist = String(req.query.artist || '').replace(/[=_~*]+$/g, '').trim();
  const instrument: 'bass' | 'guitar' =
    String(req.query.instrument || 'bass').toLowerCase() === 'guitar' ? 'guitar' : 'bass';

  try {
    const [customTones, songsterrInfo, webSnippets] = await Promise.all([
      pollLine6CustomTone(title, artist, instrument),
      pollSongsterrTrackInfo(title, artist, instrument),
      pollWebRigSnippets(title, artist, instrument)
    ]);

    const recommendation = buildHxStompToneRecommendations({
      title,
      artist,
      instrument,
      customTones,
      songsterrInfo,
      webSnippets
    });

    res.json({
      query: { title, artist, instrument },
      ...recommendation,
      customTones,
      webSnippets,
      sourcesPolled: [
        'Line 6 CustomTone (HX Stomp)',
        'Songsterr Instrument & Track API',
        'Web Rig & Pedalboard Search'
      ]
    });
  } catch (err: any) {
    console.error('❌ Tone discovery error:', err);
    res.status(500).json({ error: 'Failed to poll tone and pedal chain information' });
  }
});

/* ==========================================================================
   WIDGET ROUTES (TEACH MODE)
   ========================================================================== */

// Helper for default widget data
const getDefaultWidgetData = (widget_type: string, data?: any) => {
  if (data) return data;
  if (widget_type === 'fret_board') {
    return { notes: [] };
  } else if (widget_type === 'note') {
    return { text: 'Write notes here...' };
  } else if (widget_type === 'rhythm') {
    return { timeSignature: '4/4', tempo: 100, subdivisions: 4, beats: Array(16).fill(false) };
  } else if (widget_type === 'roman_numeral') {
    return { key: 'C', scale: 'major', progression: [] };
  } else if (widget_type === 'helix_tone') {
    return {
      instrument: 'bass',
      playingStyle: 'Fingerstyle Bass',
      summary: 'Click "Poll Internet for Tone" to auto-detect the Line 6 HX Stomp pedal chain for this song, or customize blocks below.',
      blocks: [
        {
          id: 'blk-1',
          category: 'dynamics',
          hxModel: 'LA Studio Comp',
          basedOn: 'Teletronix LA-2A Studio Compressor',
          enabled: true,
          footswitch: 'Always On',
          role: 'Smooth studio optical compression for even bass sustain.',
          settings: { 'Peak Reduc': '5.5', Gain: '5.0', Mix: '80%' }
        },
        {
          id: 'blk-2',
          category: 'distortion',
          hxModel: 'ZeroAmp Bass DI',
          basedOn: 'Tech 21 SansAmp Bass Driver DI',
          enabled: true,
          footswitch: 'FS1',
          role: 'Warm tube-style DI harmonic grit and parallel blend.',
          settings: { Drive: '4.5', Bass: '5.8', Treble: '6.0', Blend: '75%' }
        },
        {
          id: 'blk-3',
          category: 'amp_cab',
          hxModel: 'SV Beast Nrm + 8x10 SVT Beast',
          basedOn: 'Ampeg SVT (Normal) + 8x10 SVT Cab',
          enabled: true,
          footswitch: 'Always On',
          role: 'Classic 300W all-tube bass stack foundation.',
          settings: { Drive: '4.5', Bass: '6.0', Midrange: '6.5', Treble: '5.2' }
        },
        {
          id: 'blk-4',
          category: 'eq',
          hxModel: '10 Band Graphic',
          basedOn: 'MXR 10-Band Graphic EQ',
          enabled: true,
          footswitch: 'Always On',
          role: 'Sculpts 800Hz midrange punch and tightens low end.',
          settings: { '62.5 Hz': '+2.0 dB', '800 Hz': '+2.5 dB', Level: '0.0 dB' }
        }
      ],
      detectedGear: [],
      customTones: []
    };
  }
  return {};
};

// 7a. Add a widget directly to a song (Teach Mode)
app.post('/api/songs/:id/widgets', async (req: Request, res: Response) => {
  const { id: song_id } = req.params;
  const { widget_type, order_index, data } = req.body;

  if (!widget_type) {
    return res.status(400).json({ error: 'Widget type is required' });
  }

  try {
    let targetIndex = order_index;
    if (targetIndex === undefined) {
      const indexRes = await pool.query(
        'SELECT COALESCE(MAX(order_index) + 1, 0) as next_idx FROM widgets WHERE song_id = $1',
        [song_id]
      );
      targetIndex = indexRes.rows[0].next_idx;
    }

    const defaultData = getDefaultWidgetData(widget_type, data);

    const result = await pool.query(
      'INSERT INTO widgets (song_id, part_id, widget_type, order_index, data) VALUES ($1, NULL, $2, $3, $4) RETURNING *',
      [song_id, widget_type, targetIndex, JSON.stringify(defaultData)]
    );

    const widget = result.rows[0];
    broadcastUpdate('widget_created', { widget, song_id });
    res.status(201).json(widget);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add widget to song' });
  }
});

// 7b. Legacy route: Add a widget to a part (creates song-level widget and links it to the part)
app.post('/api/parts/:partId/widgets', async (req: Request, res: Response) => {
  const { partId: part_id } = req.params;
  const { widget_type, order_index, data } = req.body;

  if (!widget_type) {
    return res.status(400).json({ error: 'Widget type is required' });
  }

  try {
    const partRes = await pool.query('SELECT * FROM song_parts WHERE id = $1', [part_id]);
    if (partRes.rowCount === 0) {
      return res.status(404).json({ error: 'Song part not found' });
    }
    const part = partRes.rows[0];
    const song_id = part.song_id;

    let targetIndex = order_index;
    if (targetIndex === undefined) {
      const indexRes = await pool.query(
        'SELECT COALESCE(MAX(order_index) + 1, 0) as next_idx FROM widgets WHERE song_id = $1',
        [song_id]
      );
      targetIndex = indexRes.rows[0].next_idx;
    }

    const defaultData = getDefaultWidgetData(widget_type, data);

    const result = await pool.query(
      'INSERT INTO widgets (song_id, part_id, widget_type, order_index, data) VALUES ($1, NULL, $2, $3, $4) RETURNING *',
      [song_id, widget_type, targetIndex, JSON.stringify(defaultData)]
    );

    const widget = result.rows[0];

    // Also link to the part
    const currentLinked: string[] = Array.isArray(part.linked_widget_ids) ? part.linked_widget_ids : [];
    await pool.query(
      'UPDATE song_parts SET linked_widget_ids = $1 WHERE id = $2',
      [JSON.stringify([...currentLinked, widget.id]), part_id]
    );

    broadcastUpdate('widget_created', { widget, part_id, song_id });
    res.status(201).json(widget);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add widget to part' });
  }
});

// 8. Update a widget's data (or sequence order)
app.put('/api/widgets/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, order_index } = req.body;

  try {
    let result;
    if (data !== undefined && order_index !== undefined) {
      result = await pool.query(
        'UPDATE widgets SET data = $1, order_index = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
        [JSON.stringify(data), order_index, id]
      );
    } else if (data !== undefined) {
      result = await pool.query(
        'UPDATE widgets SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [JSON.stringify(data), id]
      );
    } else if (order_index !== undefined) {
      result = await pool.query(
        'UPDATE widgets SET order_index = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [order_index, id]
      );
    } else {
      return res.status(400).json({ error: 'Please provide data or order_index to update' });
    }

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Widget not found' });
    }

    const widget = result.rows[0];
    broadcastUpdate('widget_updated', { widget });
    res.json(widget);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update widget' });
  }
});

// 9. Delete a widget
app.delete('/api/widgets/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM widgets WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Widget not found' });
    }
    const widget = result.rows[0];

    // Remove this widget ID from any song_parts.linked_widget_ids in the song
    if (widget.song_id) {
      const partsRes = await pool.query('SELECT id, linked_widget_ids FROM song_parts WHERE song_id = $1', [widget.song_id]);
      for (const p of partsRes.rows) {
        if (Array.isArray(p.linked_widget_ids) && p.linked_widget_ids.includes(id)) {
          const filtered = p.linked_widget_ids.filter((wId: string) => wId !== id);
          await pool.query('UPDATE song_parts SET linked_widget_ids = $1 WHERE id = $2', [JSON.stringify(filtered), p.id]);
        }
      }
    }

    broadcastUpdate('widget_deleted', { id, song_id: widget.song_id, part_id: widget.part_id });
    res.json({ message: 'Widget deleted successfully', widget });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete widget' });
  }
});

/* ==========================================================================
   BACKUP & RESTORE ROUTES
   ========================================================================== */

// 10. Create a database backup payload (GET /api/backup)
app.get('/api/backup', async (req: Request, res: Response) => {
  try {
    const songs = await pool.query('SELECT * FROM songs');
    const songParts = await pool.query('SELECT * FROM song_parts');
    const widgets = await pool.query('SELECT * FROM widgets');
    const folders = await pool.query('SELECT * FROM folders');

    res.json({
      version: '1.2',
      timestamp: new Date().toISOString(),
      folders: folders.rows,
      songs: songs.rows,
      song_parts: songParts.rows,
      widgets: widgets.rows
    });
  } catch (err: any) {
    console.error('❌ Backup error:', err);
    res.status(500).json({ error: 'Failed to create database backup' });
  }
});

// 11. Restore a database from backup payload (POST /api/restore)
app.post('/api/restore', async (req: Request, res: Response) => {
  const { songs, song_parts, widgets } = req.body;
  const folders = req.body.folders || [];

  if (!Array.isArray(songs) || !Array.isArray(song_parts) || !Array.isArray(widgets)) {
    return res.status(400).json({ error: 'Invalid backup file format. Must contain songs, song_parts, and widgets arrays.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete existing data in reverse dependency order
    await client.query('DELETE FROM widgets');
    await client.query('DELETE FROM song_parts');
    await client.query('DELETE FROM songs');
    await client.query('DELETE FROM folders');

    // Restore Folders
    const validFolderIds = new Set<string>();
    for (const folder of folders) {
      validFolderIds.add(folder.id);
      await client.query(
        'INSERT INTO folders (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)',
        [
          folder.id,
          folder.name,
          folder.created_at || new Date().toISOString(),
          folder.updated_at || new Date().toISOString()
        ]
      );
    }

    // Restore Songs
    const validSongIds = new Set<string>();
    for (const song of songs) {
      validSongIds.add(song.id);
      const safeFolderId = song.folder_id && validFolderIds.has(song.folder_id) ? song.folder_id : null;
      await client.query(
        'INSERT INTO songs (id, title, artist, tuning, key_signature, tempo, time_signature, folder_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          song.id,
          song.title,
          song.artist,
          song.tuning || 'Standard (EADG)',
          song.key_signature || 'C Major',
          song.tempo ?? 120,
          song.time_signature ?? '4/4',
          safeFolderId,
          song.created_at || new Date().toISOString(),
          song.updated_at || new Date().toISOString()
        ]
      );
    }

    // Build lookup maps for v1.0/v1.1 pre-change production backups
    const partToSongMap = new Map<string, string>();
    const partOrderMap = new Map<string, number>();
    const partLabelMap = new Map<string, string>();
    for (const part of song_parts) {
      if (!validSongIds.has(part.song_id)) continue;
      partToSongMap.set(part.id, part.song_id);
      partOrderMap.set(part.id, part.order_index ?? 0);
      partLabelMap.set(part.id, part.label || part.part_type || 'Section');
    }

    // Restore Song Parts (start blank without auto-linking Teach Mode widgets from pre-change backups)
    for (const part of song_parts) {
      if (!validSongIds.has(part.song_id)) continue;
      const linkedWidgetIds = Array.isArray(part.linked_widget_ids) ? part.linked_widget_ids : [];
      const chordData = part.chord_data && typeof part.chord_data === 'object' ? part.chord_data : { chords: [], chord_widgets: {} };

      await client.query(
        'INSERT INTO song_parts (id, song_id, part_type, label, order_index, bars, lyrics, notes, linked_widget_ids, chord_data, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [
          part.id,
          part.song_id,
          part.part_type,
          part.label || part.part_type,
          part.order_index ?? 0,
          part.bars ?? 4,
          part.lyrics ?? '',
          part.notes ?? '',
          JSON.stringify(linkedWidgetIds),
          JSON.stringify(chordData),
          part.created_at || new Date().toISOString()
        ]
      );
    }

    // Group widgets by song_id so pre-change v1.0/v1.1 backups get clean sequential order_index values in Teach Mode
    const widgetsWithResolvedSong = widgets.map((w: any) => {
      const resolvedSongId = w.song_id || (w.part_id ? partToSongMap.get(w.part_id) : null) || null;
      const validPartId = w.part_id && partToSongMap.has(w.part_id) ? w.part_id : null;
      const partOrder = validPartId ? (partOrderMap.get(validPartId) ?? 0) : 0;
      const partLabel = validPartId ? partLabelMap.get(validPartId) : null;
      return {
        ...w,
        resolvedSongId,
        validPartId,
        partOrder,
        partLabel
      };
    });

    // Sort widgets within each song by (partOrder ASC, widget.order_index ASC)
    widgetsWithResolvedSong.sort((a: any, b: any) => {
      if (a.resolvedSongId !== b.resolvedSongId) {
        return String(a.resolvedSongId).localeCompare(String(b.resolvedSongId));
      }
      if (a.partOrder !== b.partOrder) {
        return a.partOrder - b.partOrder;
      }
      return (a.order_index ?? 0) - (b.order_index ?? 0);
    });

    const songWidgetCounter = new Map<string, number>();

    // Restore Widgets
    for (const widget of widgetsWithResolvedSong) {
      if (widget.resolvedSongId && !validSongIds.has(widget.resolvedSongId)) continue;
      let parsedData = typeof widget.data === 'string' ? JSON.parse(widget.data) : { ...(widget.data || {}) };
      if (!parsedData.title && widget.partLabel) {
        const typeLabel =
          widget.widget_type === 'fret_board' ? 'Fret Board' :
          widget.widget_type === 'roman_numeral' ? 'Chord Progression' :
          widget.widget_type === 'rhythm' ? 'Rhythm Groove' : 'Lesson Notes';
        parsedData.title = `${widget.partLabel} — ${typeLabel}`;
      }
      const widgetData = JSON.stringify(parsedData);
      const songKey = String(widget.resolvedSongId || 'none');
      const normalizedOrderIndex = songWidgetCounter.get(songKey) ?? 0;
      songWidgetCounter.set(songKey, normalizedOrderIndex + 1);

      await client.query(
        'INSERT INTO widgets (id, song_id, part_id, widget_type, order_index, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          widget.id,
          widget.resolvedSongId,
          null,
          widget.widget_type,
          normalizedOrderIndex,
          widgetData,
          widget.created_at || new Date().toISOString(),
          widget.updated_at || new Date().toISOString()
        ]
      );
    }

    await client.query('COMMIT');
    broadcastUpdate('restore', {});
    res.json({ 
      message: 'Database restored successfully!', 
      foldersCount: folders.length,
      songsCount: songs.length, 
      partsCount: song_parts.length, 
      widgetsCount: widgets.length 
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Restore error:', err);
    res.status(500).json({ error: 'Failed to restore database. Transaction rolled back safely.', details: err.message });
  } finally {
    client.release();
  }
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Bass Fret Backend is running on port ${port}`);
});
