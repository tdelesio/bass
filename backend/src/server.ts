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
              'fret_board', 'note', 'rhythm', 'roman_numeral'
          );
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;
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
