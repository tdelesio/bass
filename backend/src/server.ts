import express, { Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

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

    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS songs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(255) NOT NULL,
          artist VARCHAR(255) NOT NULL,
          tuning VARCHAR(100) DEFAULT 'Standard (EADG)' NOT NULL,
          key_signature VARCHAR(100) DEFAULT 'C Major' NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS song_parts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
          part_type part_type_enum NOT NULL,
          order_index INT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT unique_song_part UNIQUE (song_id, part_type, order_index)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS widgets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          part_id UUID NOT NULL REFERENCES song_parts(id) ON DELETE CASCADE,
          widget_type widget_type_enum NOT NULL,
          order_index INT NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indices
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
  const { title, artist, tuning, key_signature } = req.body;
  if (!title || !artist) {
    return res.status(400).json({ error: 'Title and artist are required fields' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO songs (title, artist, tuning, key_signature) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, artist, tuning || 'Standard (EADG)', key_signature || 'C Major']
    );
    res.status(201).json(result.rows[0]);
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
    res.json({ message: 'Song deleted successfully', song: result.rows[0] });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete song' });
  }
});

// 4. Get full song details (nested Parts and Widgets)
app.get('/api/songs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Fetch the song
    const songRes = await pool.query('SELECT * FROM songs WHERE id = $1', [id]);
    if (songRes.rowCount === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    const song = songRes.rows[0];

    // Fetch song parts
    const partsRes = await pool.query('SELECT * FROM song_parts WHERE song_id = $1 ORDER BY order_index ASC', [id]);
    const parts = partsRes.rows;

    // Fetch all widgets for these parts in parallel
    const partsWithWidgets = await Promise.all(
      parts.map(async (part) => {
        const widgetsRes = await pool.query('SELECT * FROM widgets WHERE part_id = $1 ORDER BY order_index ASC', [part.id]);
        return {
          ...part,
          widgets: widgetsRes.rows,
        };
      })
    );

    res.json({
      ...song,
      parts: partsWithWidgets,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve song details' });
  }
});


/* ==========================================================================
   SONG PART ROUTES
   ========================================================================== */

// 5. Add a part to a song
app.post('/api/songs/:id/parts', async (req: Request, res: Response) => {
  const { id: song_id } = req.params;
  const { part_type, order_index } = req.body;

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

    const result = await pool.query(
      'INSERT INTO song_parts (song_id, part_type, order_index) VALUES ($1, $2, $3) RETURNING *',
      [song_id, part_type, targetIndex]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create song part' });
  }
});

// 6. Delete a part
app.delete('/api/parts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM song_parts WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Song part not found' });
    }
    res.json({ message: 'Song part deleted successfully', part: result.rows[0] });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete song part' });
  }
});


/* ==========================================================================
   WIDGET ROUTES
   ========================================================================== */

// 7. Add a widget to a part
app.post('/api/parts/:partId/widgets', async (req: Request, res: Response) => {
  const { partId: part_id } = req.params;
  const { widget_type, order_index, data } = req.body;

  if (!widget_type) {
    return res.status(400).json({ error: 'Widget type is required' });
  }

  try {
    let targetIndex = order_index;
    if (targetIndex === undefined) {
      const indexRes = await pool.query('SELECT COALESCE(MAX(order_index) + 1, 0) as next_idx FROM widgets WHERE part_id = $1', [part_id]);
      targetIndex = indexRes.rows[0].next_idx;
    }

    // Default payload based on widget type if none is provided
    let defaultData = data || {};
    if (!data) {
      if (widget_type === 'fret_board') {
        defaultData = { notes: [] };
      } else if (widget_type === 'note') {
        defaultData = { text: 'Write notes here...' };
      } else if (widget_type === 'rhythm') {
        defaultData = { timeSignature: '4/4', tempo: 100, subdivisions: 4, beats: Array(16).fill(false) };
      } else if (widget_type === 'roman_numeral') {
        defaultData = { key: 'C', scale: 'major', progression: [] };
      }
    }

    const result = await pool.query(
      'INSERT INTO widgets (part_id, widget_type, order_index, data) VALUES ($1, $2, $3, $4) RETURNING *',
      [part_id, widget_type, targetIndex, JSON.stringify(defaultData)]
    );

    res.status(201).json(result.rows[0]);
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

    res.json(result.rows[0]);
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
    res.json({ message: 'Widget deleted successfully', widget: result.rows[0] });
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

    res.json({
      version: '1.0',
      timestamp: new Date().toISOString(),
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

    // Restore Songs
    for (const song of songs) {
      await client.query(
        'INSERT INTO songs (id, title, artist, tuning, key_signature, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [song.id, song.title, song.artist, song.tuning, song.key_signature, song.created_at, song.updated_at]
      );
    }

    // Restore Song Parts
    for (const part of song_parts) {
      await client.query(
        'INSERT INTO song_parts (id, song_id, part_type, order_index, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [part.id, part.song_id, part.part_type, part.order_index, part.created_at, part.updated_at]
      );
    }

    // Restore Widgets
    for (const widget of widgets) {
      const widgetData = typeof widget.data === 'object' ? JSON.stringify(widget.data) : widget.data;
      await client.query(
        'INSERT INTO widgets (id, part_id, widget_type, order_index, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [widget.id, widget.part_id, widget.widget_type, widget.order_index, widgetData, widget.created_at, widget.updated_at]
      );
    }

    // Reset auto-increment sequences in PostgreSQL
    if (songs.length > 0) {
      await client.query("SELECT setval(pg_get_serial_sequence('songs', 'id'), COALESCE(MAX(id), 1)) FROM songs");
    }
    if (song_parts.length > 0) {
      await client.query("SELECT setval(pg_get_serial_sequence('song_parts', 'id'), COALESCE(MAX(id), 1)) FROM song_parts");
    }
    if (widgets.length > 0) {
      await client.query("SELECT setval(pg_get_serial_sequence('widgets', 'id'), COALESCE(MAX(id), 1)) FROM widgets");
    }

    await client.query('COMMIT');
    res.json({ 
      message: 'Database restored successfully!', 
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
