import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Plus, 
  Trash2, 
  Music, 
  ChevronRight, 
  ChevronLeft,
  Disc, 
  AlignLeft, 
  Activity, 
  Sliders, 
  Hash,
  Download,
  Upload,
  Eye,
  Edit3,
  ArrowUp,
  ArrowDown,
  Folder as FolderIcon,
  FolderOpen,
  Search,
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  Repeat,
  Link2,
  Unlink,
  BookOpen,
  Layers,
  Sparkles,
  Volume2,
  VolumeX,
  Clock,
  FileText,
  Check
} from 'lucide-react';
import FretBoardWidget from './components/FretBoardWidget';
import NoteWidget from './components/NoteWidget';
import RhythmWidget from './components/RhythmWidget';
import RomanNumeralWidget from './components/RomanNumeralWidget';

// Interfaces matching our PostgreSQL Backend API (v1.2 - 3-Mode Architecture)
export interface Folder {
  id: string;
  name: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  tuning: string;
  key_signature: string;
  tempo?: number;
  time_signature?: string;
  folder_id?: string | null;
}

export interface Widget {
  id: string;
  song_id?: string | null;
  part_id?: string | null;
  widget_type: 'fret_board' | 'note' | 'rhythm' | 'roman_numeral';
  order_index: number;
  data: any;
}

export interface ChordWidgetGroup {
  id: string;
  label?: string;
  colorIndex: number;
  chord_keys: string[];
  widget_ids: string[];
}

export interface PartChordData {
  chords?: string[];
  chord_widgets?: Record<string, string[]>;
  chord_groups?: ChordWidgetGroup[];
}

export interface PartChordSelectionState {
  step: 'selecting' | 'widgets';
  groupId: string | null;
  selectedKeys: string[];
  anchorKey: string | null;
  customLabel: string;
  widgetIds?: string[];
}

const CHORD_GROUP_PALETTE = [
  { code: 'A', name: 'Cyan', bg: 'rgba(6, 182, 212, 0.24)', border: '#22d3ee', text: '#cffafe', badgeBg: '#0891b2' },
  { code: 'B', name: 'Violet', bg: 'rgba(139, 92, 246, 0.26)', border: '#a78bfa', text: '#ede9fe', badgeBg: '#7c3aed' },
  { code: 'C', name: 'Emerald', bg: 'rgba(16, 185, 129, 0.24)', border: '#34d399', text: '#d1fae5', badgeBg: '#059669' },
  { code: 'D', name: 'Amber', bg: 'rgba(245, 158, 11, 0.24)', border: '#fbbf24', text: '#fef3c7', badgeBg: '#d97706' },
  { code: 'E', name: 'Rose', bg: 'rgba(236, 72, 153, 0.24)', border: '#f472b6', text: '#fce7f3', badgeBg: '#db2777' },
  { code: 'F', name: 'Blue', bg: 'rgba(59, 130, 246, 0.25)', border: '#60a5fa', text: '#dbeafe', badgeBg: '#2563eb' },
  { code: 'G', name: 'Orange', bg: 'rgba(249, 115, 22, 0.25)', border: '#fb923c', text: '#ffedd5', badgeBg: '#ea580c' },
  { code: 'H', name: 'Lime', bg: 'rgba(132, 204, 22, 0.24)', border: '#a3e635', text: '#ecfccb', badgeBg: '#65a30d' }
];

export interface SongPart {
  id: string;
  song_id: string;
  part_type: string;
  label?: string;
  order_index: number;
  bars: number;
  lyrics: string;
  notes: string;
  linked_widget_ids: string[];
  chord_data?: PartChordData;
  widgets: Widget[];
}

export interface SongDetails extends Song {
  widgets: Widget[];
  parts: SongPart[];
}

export type AppMode = 'teach' | 'edit' | 'play';

const PART_TYPES = [
  'Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Hook', 'Bridge', 'Outro', 'Solo', 'Interlude'
];

const TUNINGS = [
  'Standard (EADG)',
  'Drop D (DADG)',
  'Half-Step Down (Eb Ab Db Gb)',
  'Whole-Step Down (DGCF)',
  'Drop C (CGCF)',
  '5-String Standard (BEADG)',
  '5-String Half-Step Down (Bb Eb Ab Db Gb)'
];

const KEY_SIGNATURES = [
  // Major Keys
  'C Major', 'G Major', 'D Major', 'A Major', 'E Major', 'B Major', 'F# Major', 'C# Major',
  'F Major', 'Bb Major', 'Eb Major', 'Ab Major', 'Db Major', 'Gb Major',
  // Minor Keys
  'A Minor', 'E Minor', 'B Minor', 'F# Minor', 'C# Minor', 'G# Minor', 'D# Minor', 'A# Minor',
  'D Minor', 'G Minor', 'C Minor', 'F Minor', 'Bb Minor', 'Eb Minor'
];

const TIME_SIGNATURES = [
  '4/4', '3/4', '2/4', '6/8', '7/4', '5/4', '12/8', '9/8'
];

interface LrclibTrack {
  id: string | number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string;
  tabUrl?: string;
  hasChords?: boolean;
  source?: string;
}

const App: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSong, setSelectedSong] = useState<SongDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Folders & Search State
  const [folders, setFolders] = useState<Folder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [draggingSongId, setDraggingSongId] = useState<string | null>(null);

  // New Song Modal State
  const [isNewSongModalOpen, setIsNewSongModalOpen] = useState(false);
  const [newSongTitle, setNewSongTitle] = useState('');
  const [newSongArtist, setNewSongArtist] = useState('');
  const [newSongTuning, setNewSongTuning] = useState('Standard (EADG)');
  const [newSongKey, setNewSongKey] = useState('C Major');
  const [newSongTempo, setNewSongTempo] = useState<number>(120);
  const [newSongTimeSig, setNewSongTimeSig] = useState<string>('4/4');
  const [newSongFolderId, setNewSongFolderId] = useState<string>('');

  // Edit Song Modal State
  const [isEditSongModalOpen, setIsEditSongModalOpen] = useState(false);
  const [editSongTitle, setEditSongTitle] = useState('');
  const [editSongArtist, setEditSongArtist] = useState('');
  const [editSongTuning, setEditSongTuning] = useState('Standard (EADG)');
  const [editSongKey, setEditSongKey] = useState('C Major');
  const [editSongTempo, setEditSongTempo] = useState<number>(120);
  const [editSongTimeSig, setEditSongTimeSig] = useState<string>('4/4');
  const [editSongFolderId, setEditSongFolderId] = useState<string>('');

  // 3-Mode State: 'teach' | 'edit' | 'play'
  const [activeMode, setActiveMode] = useState<AppMode>('teach');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Teach Mode State
  const [teachWidgetFilter, setTeachWidgetFilter] = useState<'all' | 'fret_board' | 'roman_numeral' | 'rhythm' | 'note'>('all');
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [editingWidgetTitle, setEditingWidgetTitle] = useState<string>('');

  // Edit Mode State (Collapsible Song Parts, HFC Chords Above Words, Clickable Chord Widget Drawer)
  const [newPartType, setNewPartType] = useState<string>('Verse');
  const [newPartLabel, setNewPartLabel] = useState<string>('');
  const [newPartBars, setNewPartBars] = useState<number>(8);
  const [editingPartLabelId, setEditingPartLabelId] = useState<string | null>(null);
  const [editingPartLabelValue, setEditingPartLabelValue] = useState<string>('');
  const [expandedEditParts, setExpandedEditParts] = useState<Record<string, boolean>>({});
  const [editingLyricsPartIds, setEditingLyricsPartIds] = useState<Record<string, boolean>>({});
  const [activeChordByPart, setActiveChordByPart] = useState<Record<string, string | null>>({});
  const [chordSelectionByPart, setChordSelectionByPart] = useState<Record<string, PartChordSelectionState | null>>({});
  const [playOpenChordTargetsByPart, setPlayOpenChordTargetsByPart] = useState<Record<string, string[]>>({});
  const latestChordGroupsByPartRef = useRef<Record<string, ChordWidgetGroup[]>>({});
  const [newChordInputByPart, setNewChordInputByPart] = useState<Record<string, string>>({});
  const [wordChordPicker, setWordChordPicker] = useState<{
    partId: string;
    lineIdx: number;
    wordIdx: number;
    wordText: string;
    currentChord: string;
    draftChord: string;
  } | null>(null);
  const [partLyricsDrafts, setPartLyricsDrafts] = useState<Record<string, string>>({});
  const [partNotesDrafts, setPartNotesDrafts] = useState<Record<string, string>>({});
  const [savedPartFeedbackId, setSavedPartFeedbackId] = useState<string | null>(null);

  // Lyrics & Structure Tooling Modal State (Step 1: Search & Fetch Lyrics -> Step 2: Smart Section Splitter)
  const [isLyricsToolOpen, setIsLyricsToolOpen] = useState<boolean>(false);
  const [lyricsToolTab, setLyricsToolTab] = useState<'lrclib' | 'paste'>('lrclib');
  const [smartPasteText, setSmartPasteText] = useState<string>('');
  const [smartPasteDefaultBars, setSmartPasteDefaultBars] = useState<number>(8);
  const [smartPasteReplaceExisting, setSmartPasteReplaceExisting] = useState<boolean>(true);
  const [includeAutoIntro, setIncludeAutoIntro] = useState<boolean>(true);
  const [lrclibQueryTitle, setLrclibQueryTitle] = useState<string>('');
  const [lrclibQueryArtist, setLrclibQueryArtist] = useState<string>('');
  const [lrclibResults, setLrclibResults] = useState<LrclibTrack[]>([]);
  const [lrclibSearching, setLrclibSearching] = useState<boolean>(false);
  const [fetchingTrackId, setFetchingTrackId] = useState<string | number | null>(null);
  const [lrclibError, setLrclibError] = useState<string>('');

  // Play Mode Live Streamer State
  const [streamState, setStreamState] = useState<'stopped' | 'countdown' | 'playing' | 'paused'>('stopped');
  const [activeStreamPartIdx, setActiveStreamPartIdx] = useState<number>(0);
  const [currentBeatInBar, setCurrentBeatInBar] = useState<number>(0);
  const [currentBarInPart, setCurrentBarInPart] = useState<number>(0);
  const [partProgressRatio, setPartProgressRatio] = useState<number>(0);
  const [countdownBeatsLeft, setCountdownBeatsLeft] = useState<number>(0);
  const [isDownbeatFlash, setIsDownbeatFlash] = useState<boolean>(false);
  const [useCountIn, setUseCountIn] = useState<boolean>(true);
  const [useAudioClick, setUseAudioClick] = useState<boolean>(false);
  const [autoScrollPlay, setAutoScrollPlay] = useState<boolean>(true);
  const [lyricFontSize, setLyricFontSize] = useState<number>(1.08);
  const [playVisibility, setPlayVisibility] = useState<{
    lyrics: boolean;
    roman_numeral: boolean;
    fret_board: boolean;
    rhythm: boolean;
    note: boolean;
  }>({
    lyrics: true,
    roman_numeral: true,
    fret_board: true,
    rhythm: true,
    note: true,
  });

  // Refs for real-time SSE & Play Mode animation loop
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedSongIdRef = useRef<string | null>(null);
  const workbenchContentRef = useRef<HTMLDivElement | null>(null);
  const streamRafRef = useRef<number | null>(null);
  const streamPartStartTimeRef = useRef<number>(0);
  const streamPausedElapsedRef = useRef<number>(0);
  const lastTriggeredBeatRef = useRef<number>(-1);
  const lastScrolledPartIdxRef = useRef<number>(-1);
  const preScrolledNextPartIdxRef = useRef<number>(-1);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    selectedSongIdRef.current = selectedSong?.id || null;
  }, [selectedSong]);

  // Sync local lyrics/notes drafts when selectedSong changes
  useEffect(() => {
    if (!selectedSong) return;
    const lyricsMap: Record<string, string> = {};
    const notesMap: Record<string, string> = {};
    selectedSong.parts.forEach(p => {
      lyricsMap[p.id] = p.lyrics || '';
      notesMap[p.id] = p.notes || '';
    });
    setPartLyricsDrafts(lyricsMap);
    setPartNotesDrafts(notesMap);
  }, [selectedSong?.id, selectedSong?.parts.length]);

  const API_BASE = `http://${window.location.hostname}:3001/api`;

  useEffect(() => {
    fetchSongs();
    fetchFolders();

    const eventSource = new EventSource(`${API_BASE}/updates`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        fetchSongs(false);
        fetchFolders();

        if (selectedSongIdRef.current) {
          fetchSongDetails(selectedSongIdRef.current);
        }
      } catch (e) {
        console.error('SSE Error:', e);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${API_BASE}/folders`);
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
        setExpandedFolders(prev => {
          const next = { ...prev };
          data.forEach((f: Folder) => {
            if (next[f.id] === undefined) next[f.id] = true;
          });
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to load folders:', err);
    }
  };

  const fetchSongs = async (autoSelectFirst = true) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/songs`);
      const data = await res.json();
      setSongs(data);
      if (autoSelectFirst && data.length > 0 && !selectedSongIdRef.current) {
        fetchSongDetails(data[0].id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to load songs:', err);
      setLoading(false);
    }
  };

  const fetchSongDetails = async (songId: string) => {
    const isSwitchingSong = selectedSongIdRef.current !== songId;
    try {
      const res = await fetch(`${API_BASE}/songs/${songId}`);
      if (!res.ok) throw new Error('Failed to fetch song details');
      const data: SongDetails = await res.json();
      if (isSwitchingSong) {
        setExpandedEditParts({});
        setActiveChordByPart({});
        setChordSelectionByPart({});
        setPlayOpenChordTargetsByPart({});
        latestChordGroupsByPartRef.current = {};
        setEditingLyricsPartIds({});
        setWordChordPicker(null);
      }
      setSelectedSong(data);
      setPartLyricsDrafts(prev => {
        const next = isSwitchingSong ? {} : { ...prev };
        data.parts.forEach(p => {
          next[p.id] = p.lyrics || '';
        });
        return next;
      });
      setPartNotesDrafts(prev => {
        const next = isSwitchingSong ? {} : { ...prev };
        data.parts.forEach(p => {
          next[p.id] = p.notes || '';
        });
        return next;
      });
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  /* ==========================================================================
     MODE SWITCHING
     ========================================================================== */
  const handleSwitchMode = (mode: AppMode) => {
    if (activeMode === 'play' && mode !== 'play') {
      stopLiveStream();
    }
    setActiveMode(mode);
    if (mode === 'play') {
      setIsSidebarCollapsed(true);
      setPlayOpenChordTargetsByPart({});
    }
  };

  /* ==========================================================================
     SONG & FOLDER CRUD HANDLERS
     ========================================================================== */
  const handleCreateSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSongTitle.trim() || !newSongArtist.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newSongTitle,
          artist: newSongArtist,
          tuning: newSongTuning,
          key_signature: newSongKey,
          tempo: newSongTempo || 120,
          time_signature: newSongTimeSig || '4/4'
        })
      });
      const newSong = await res.json();

      if (newSongFolderId) {
        await fetch(`${API_BASE}/songs/${newSong.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_id: newSongFolderId })
        });
        newSong.folder_id = newSongFolderId;
      }

      setSongs(prev => [...prev, newSong].sort((a, b) => a.title.localeCompare(b.title)));
      setIsNewSongModalOpen(false);
      setNewSongTitle('');
      setNewSongArtist('');
      setNewSongFolderId('');
      fetchSongDetails(newSong.id);
    } catch (err) {
      console.error('Error creating song:', err);
    }
  };

  const openEditSongModal = () => {
    if (!selectedSong) return;
    setEditSongTitle(selectedSong.title);
    setEditSongArtist(selectedSong.artist);
    setEditSongTuning(selectedSong.tuning);
    setEditSongKey(selectedSong.key_signature);
    setEditSongTempo(selectedSong.tempo || 120);
    setEditSongTimeSig(selectedSong.time_signature || '4/4');
    setEditSongFolderId(selectedSong.folder_id || '');
    setIsEditSongModalOpen(true);
  };

  const handleUpdateSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSong || !editSongTitle.trim() || !editSongArtist.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/songs/${selectedSong.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editSongTitle.trim(),
          artist: editSongArtist.trim(),
          tuning: editSongTuning,
          key_signature: editSongKey,
          tempo: editSongTempo || 120,
          time_signature: editSongTimeSig || '4/4',
          folder_id: editSongFolderId || null
        })
      });
      if (res.ok) {
        setIsEditSongModalOpen(false);
        fetchSongs(false);
        fetchSongDetails(selectedSong.id);
      }
    } catch (err) {
      console.error('Error updating song:', err);
    }
  };

  const handleQuickUpdateSongField = async (fields: Partial<Song>) => {
    if (!selectedSong) return;
    setSelectedSong(prev => prev ? { ...prev, ...fields } : null);
    try {
      await fetch(`${API_BASE}/songs/${selectedSong.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      fetchSongs(false);
    } catch (err) {
      console.error('Error updating song field:', err);
    }
  };

  const handleDeleteSong = async (songId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this song?')) return;

    try {
      await fetch(`${API_BASE}/songs/${songId}`, { method: 'DELETE' });
      const remaining = songs.filter(s => s.id !== songId);
      setSongs(remaining);
      if (selectedSong?.id === songId) {
        remaining.length > 0 ? fetchSongDetails(remaining[0].id) : setSelectedSong(null);
      }
    } catch (err) {
      console.error('Error deleting song:', err);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() })
      });
      if (res.ok) {
        const folder = await res.json();
        setFolders(prev => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
        setExpandedFolders(prev => ({ ...prev, [folder.id]: true }));
        setNewFolderName('');
        setIsNewFolderModalOpen(false);
      }
    } catch (err) {
      console.error('Error creating folder:', err);
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!editingFolderName.trim()) {
      setEditingFolderId(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingFolderName.trim() })
      });
      if (res.ok) {
        setEditingFolderId(null);
        fetchFolders();
      }
    } catch (err) {
      console.error('Error renaming folder:', err);
    }
  };

  const handleDeleteFolder = async (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this folder? Songs inside will be moved to Uncategorized.')) return;
    try {
      await fetch(`${API_BASE}/folders/${folderId}`, { method: 'DELETE' });
      fetchFolders();
      fetchSongs(false);
    } catch (err) {
      console.error('Error deleting folder:', err);
    }
  };

  const handleMoveSongToFolder = async (songId: string, folderId: string | null) => {
    try {
      await fetch(`${API_BASE}/songs/${songId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId })
      });
      fetchSongs(false);
      if (selectedSong?.id === songId) {
        fetchSongDetails(songId);
      }
    } catch (err) {
      console.error('Error moving song to folder:', err);
    }
  };

  /* ==========================================================================
     BACKUP & RESTORE HANDLERS
     ========================================================================== */
  const handleBackup = async () => {
    try {
      const response = await fetch(`${API_BASE}/backup`);
      if (!response.ok) throw new Error('Failed to generate backup');
      const data = await response.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `bass_fret_backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup failed:', err);
      alert('❌ Failed to download database backup.');
    }
  };

  const handleRestoreTrigger = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('⚠️ Restoring from a backup will overwrite ALL current songs, parts, and widgets in your database. Are you sure you want to proceed?')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonPayload = JSON.parse(event.target?.result as string);
        const res = await fetch(`${API_BASE}/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonPayload)
        });

        const responseText = await res.text();
        let result: any;
        try {
          result = JSON.parse(responseText);
        } catch {
          throw new Error(`Server returned HTTP ${res.status} (${res.statusText})`);
        }

        if (!res.ok) {
          throw new Error(result.details || result.error || 'Failed to restore');
        }

        alert(`✅ Database restored!\n• Folders: ${result.foldersCount ?? 0}\n• Songs: ${result.songsCount}\n• Parts: ${result.partsCount}\n• Widgets: ${result.widgetsCount}`);
        setSelectedSong(null);
        fetchFolders();
        fetchSongs();
      } catch (err: any) {
        console.error('Restore failed:', err);
        alert(`❌ Failed to restore database: ${err.message}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  /* ==========================================================================
     TEACH MODE HANDLERS (SONG-LEVEL WIDGET WORKBENCH)
     ========================================================================== */
  const getWidgetDefaultTitle = (w: Widget) => {
    if (w.data?.title) return w.data.title;
    if (w.widget_type === 'fret_board') return 'Fret Board Sequence';
    if (w.widget_type === 'note') return 'Performance Notes';
    if (w.widget_type === 'rhythm') return 'Rhythm Groove';
    if (w.widget_type === 'roman_numeral') return 'Roman Numeral Progression';
    return 'Lesson Widget';
  };

  const handleAddTeachWidget = async (widgetType: Widget['widget_type']) => {
    if (!selectedSong) return;

    const existingOfType = selectedSong.widgets.filter(w => w.widget_type === widgetType).length;
    const typeLabel =
      widgetType === 'fret_board' ? 'Fret Board Riff' :
      widgetType === 'roman_numeral' ? 'Chord Progression' :
      widgetType === 'rhythm' ? 'Rhythm Pattern' : 'Lesson Note';
    const defaultTitle = `${typeLabel} ${existingOfType + 1}`;

    let initialData: any = { title: defaultTitle };
    if (widgetType === 'fret_board') {
      initialData = { title: defaultTitle, notes: [] };
    } else if (widgetType === 'note') {
      initialData = { title: defaultTitle, text: 'Write bass lesson notes here...' };
    } else if (widgetType === 'rhythm') {
      initialData = {
        title: defaultTitle,
        timeSignature: selectedSong.time_signature || '4/4',
        tempo: selectedSong.tempo || 120,
        subdivisions: 4,
        beats: Array(16).fill(false),
        items: []
      };
    } else if (widgetType === 'roman_numeral') {
      const rootKey = (selectedSong.key_signature || 'C Major').split(' ')[0];
      const scaleType = (selectedSong.key_signature || 'C Major').toLowerCase().includes('minor') ? 'minor' : 'major';
      initialData = {
        title: defaultTitle,
        key: rootKey,
        scale: scaleType,
        progression: []
      };
    }

    try {
      const res = await fetch(`${API_BASE}/songs/${selectedSong.id}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widget_type: widgetType,
          order_index: selectedSong.widgets.length,
          data: initialData
        })
      });
      if (res.ok) {
        fetchSongDetails(selectedSong.id);
      }
    } catch (err) {
      console.error('Error adding widget in Teach Mode:', err);
    }
  };

  const handleUpdateWidget = async (widgetId: string, newData: any) => {
    if (!selectedSong) return;

    const existingWidget = selectedSong.widgets.find(w => w.id === widgetId);
    const mergedData = {
      ...(existingWidget?.data || {}),
      ...newData
    };

    try {
      await fetch(`${API_BASE}/widgets/${widgetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: mergedData })
      });
      setSelectedSong(prev => {
        if (!prev) return null;
        const updatedWidgets = prev.widgets.map(w => w.id === widgetId ? { ...w, data: mergedData } : w);
        const updatedParts = prev.parts.map(p => ({
          ...p,
          widgets: p.widgets.map(w => w.id === widgetId ? { ...w, data: mergedData } : w)
        }));
        return { ...prev, widgets: updatedWidgets, parts: updatedParts };
      });
    } catch (err) {
      console.error('Error updating widget:', err);
    }
  };

  const handleRenameWidget = async (widgetId: string) => {
    if (!selectedSong) return;
    const targetWidget = selectedSong.widgets.find(w => w.id === widgetId);
    if (!targetWidget) return;

    const updatedData = {
      ...targetWidget.data,
      title: editingWidgetTitle.trim() || undefined
    };

    setEditingWidgetId(null);
    await handleUpdateWidget(widgetId, updatedData);
  };

  const handleMoveTeachWidget = async (widgetIndex: number, direction: 'up' | 'down', widgetList: Widget[]) => {
    if (!selectedSong) return;
    const targetIndex = direction === 'up' ? widgetIndex - 1 : widgetIndex + 1;
    if (targetIndex < 0 || targetIndex >= widgetList.length) return;

    const currentWidget = widgetList[widgetIndex];
    const swapWidget = widgetList[targetIndex];

    try {
      await Promise.all([
        fetch(`${API_BASE}/widgets/${currentWidget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_index: targetIndex })
        }),
        fetch(`${API_BASE}/widgets/${swapWidget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_index: widgetIndex })
        })
      ]);
      fetchSongDetails(selectedSong.id);
    } catch (err) {
      console.error('Error reordering widgets:', err);
    }
  };

  const handleDeleteWidget = async (widgetId: string) => {
    if (!selectedSong) return;
    if (!confirm('Delete this lesson widget from Teach Mode? It will also be unlinked from any Song Parts.')) return;
    try {
      await fetch(`${API_BASE}/widgets/${widgetId}`, { method: 'DELETE' });
      fetchSongDetails(selectedSong.id);
    } catch (err) {
      console.error('Error deleting widget:', err);
    }
  };

  /* ==========================================================================
     EDIT MODE HANDLERS (SONG PARTS CONSTRUCTION & WIDGET LINKING)
     ========================================================================== */
  const generateSmartPartLabel = (partType: string, existingParts: SongPart[]) => {
    const sameTypeCount = existingParts.filter(p => p.part_type === partType).length;
    if (sameTypeCount === 0 && ['Intro', 'Bridge', 'Outro', 'Solo'].includes(partType)) {
      return partType;
    }
    return `${partType} ${sameTypeCount + 1}`;
  };

  const handleAddPart = async (
    partTypeOverride?: string,
    customLabelOverride?: string,
    barsOverride?: number,
    linkedWidgetIdsOverride?: string[],
    lyricsOverride?: string,
    notesOverride?: string,
    chordDataOverride?: PartChordData
  ) => {
    if (!selectedSong) return;
    const targetType = partTypeOverride || newPartType;
    const targetLabel = (customLabelOverride !== undefined ? customLabelOverride : newPartLabel).trim() ||
      generateSmartPartLabel(targetType, selectedSong.parts);
    const targetBars = barsOverride !== undefined ? barsOverride : (newPartBars || 8);

    try {
      const res = await fetch(`${API_BASE}/songs/${selectedSong.id}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part_type: targetType,
          label: targetLabel,
          order_index: selectedSong.parts.length,
          bars: targetBars,
          lyrics: lyricsOverride || '',
          notes: notesOverride || '',
          linked_widget_ids: linkedWidgetIdsOverride || [],
          chord_data: chordDataOverride || { chords: [], chord_widgets: {} }
        })
      });
      if (res.ok) {
        setNewPartLabel('');
        fetchSongDetails(selectedSong.id);
      }
    } catch (err) {
      console.error('Error adding song part:', err);
    }
  };

  const handleRepeatPart = async (partToRepeat: SongPart) => {
    if (!selectedSong) return;
    const nextLabel = generateSmartPartLabel(partToRepeat.part_type, selectedSong.parts);
    await handleAddPart(
      partToRepeat.part_type,
      nextLabel,
      partToRepeat.bars,
      partToRepeat.linked_widget_ids || [],
      partToRepeat.lyrics || '',
      partToRepeat.notes || '',
      partToRepeat.chord_data || { chords: [], chord_widgets: {} }
    );
  };

  const handleUpdatePart = async (partId: string, updates: Partial<SongPart>, showSavedFeedback = false) => {
    if (!selectedSong) return;
    // Optimistically update local state immediately so chord groups & linked widgets reflect on first click
    setSelectedSong(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        parts: prev.parts.map(p => (p.id === partId ? { ...p, ...updates } : p))
      };
    });
    try {
      const res = await fetch(`${API_BASE}/parts/${partId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        if (showSavedFeedback) {
          setSavedPartFeedbackId(partId);
          setTimeout(() => setSavedPartFeedbackId(prev => prev === partId ? null : prev), 1500);
        }
        fetchSongDetails(selectedSong.id);
      }
    } catch (err) {
      console.error('Error updating song part:', err);
    }
  };

  const handleMovePart = async (partIndex: number, direction: 'up' | 'down') => {
    if (!selectedSong) return;
    const targetIndex = direction === 'up' ? partIndex - 1 : partIndex + 1;
    if (targetIndex < 0 || targetIndex >= selectedSong.parts.length) return;

    const reordered = [...selectedSong.parts];
    const [moved] = reordered.splice(partIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    try {
      await fetch(`${API_BASE}/songs/${selectedSong.id}/parts/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partIds: reordered.map(p => p.id) })
      });
      fetchSongDetails(selectedSong.id);
    } catch (err) {
      console.error('Error reordering song parts:', err);
    }
  };

  const handleDeletePart = async (partId: string) => {
    if (!selectedSong) return;
    if (!confirm('Remove this Song Part from the arrangement? (Your Teach Mode widgets will NOT be deleted.)')) return;

    try {
      await fetch(`${API_BASE}/parts/${partId}`, { method: 'DELETE' });
      fetchSongDetails(selectedSong.id);
    } catch (err) {
      console.error('Error deleting song part:', err);
    }
  };

  /* ==========================================================================
     HFC CHORDS-ABOVE-WORDS & PER-CHORD TEACH MODE WIDGET HANDLERS
     ========================================================================== */
  const isMusicalChordToken = (token: string): boolean => {
    const cleaned = token.replace(/^\[|\]$/g, '').trim();
    if (!cleaned || cleaned.length > 10) return false;
    return /^[A-G][#b]?(?:m|maj|min|dim|aug|sus|add|[0-9])*(?:\/[A-G][#b]?)?$/.test(cleaned);
  };

  // Returns suggested diatonic chords for the song's key signature + any chords already in the song
  const getSuggestedChordsForSong = (): string[] => {
    const keySig = selectedSong?.key_signature || 'C Major';
    const diatonicByKey: Record<string, string[]> = {
      'C Major': ['C', 'Dm', 'Em', 'F', 'G', 'Am'],
      'G Major': ['G', 'Am', 'Bm', 'C', 'D', 'Em'],
      'D Major': ['D', 'Em', 'F#m', 'G', 'A', 'Bm'],
      'A Major': ['A', 'Bm', 'C#m', 'D', 'E', 'F#m'],
      'E Major': ['E', 'F#m', 'G#m', 'A', 'B', 'C#m'],
      'B Major': ['B', 'C#m', 'D#m', 'E', 'F#', 'G#m'],
      'F# Major': ['F#', 'G#m', 'A#m', 'B', 'C#', 'D#m'],
      'F Major': ['F', 'Gm', 'Am', 'Bb', 'C', 'Dm'],
      'Bb Major': ['Bb', 'Cm', 'Dm', 'Eb', 'F', 'Gm'],
      'Eb Major': ['Eb', 'Fm', 'Gm', 'Ab', 'Bb', 'Cm'],
      'Ab Major': ['Ab', 'Bbm', 'Cm', 'Db', 'Eb', 'Fm'],
      'A Minor': ['Am', 'Dm', 'Em', 'F', 'G', 'C'],
      'E Minor': ['Em', 'Am', 'Bm', 'C', 'D', 'G'],
      'B Minor': ['Bm', 'Em', 'F#m', 'G', 'A', 'D'],
      'F# Minor': ['F#m', 'Bm', 'C#m', 'D', 'E', 'A'],
      'C# Minor': ['C#m', 'F#m', 'G#m', 'A', 'B', 'E'],
      'D Minor': ['Dm', 'Gm', 'Am', 'Bb', 'C', 'F'],
      'G Minor': ['Gm', 'Cm', 'Dm', 'Eb', 'F', 'Bb'],
      'C Minor': ['Cm', 'Fm', 'Gm', 'Ab', 'Bb', 'Eb']
    };
    const base = diatonicByKey[keySig] || ['G', 'C', 'D', 'Em', 'Am'];
    const extra = new Set<string>(base);
    if (selectedSong) {
      for (const p of selectedSong.parts) {
        (p.chord_data?.chords || []).forEach(c => extra.add(c));
        const bracketMatches = (p.lyrics || '').match(/\[([^\]]+)\]/g) || [];
        bracketMatches.forEach(m => {
          const inner = m.slice(1, -1).trim();
          if (inner) extra.add(inner);
        });
      }
    }
    return Array.from(extra).slice(0, 10);
  };

  // Converts chord-over-lyric line pairs (e.g. a line of chords `G    C    D` above a line of words) into inline `[G]word` lines
  const normalizeLyricsToInlineBracketChords = (rawLyrics: string): string => {
    const cleaned = (rawLyrics || '')
      .replace(/^\(Instrumental(?:\s+Intro)?\)$/gim, '')
      .replace(/\[\/?tab\]/gi, '')
      .replace(/\[ch\](.*?)\[\/ch\]/gi, '$1')
      .replace(/\bN\.?C\.?(?=\s|$)/gi, m => ' '.repeat(m.length))
      .replace(/\r\n/g, '\n');

    const sectionHeaderRegex =
      /^\s*(?:\[|\(|###?\s*)?(Intro|Verse|Pre-?Chorus|Post-?Chorus|Chorus|Hook|Bridge|Outro|Solo|Guitar\s+Solo|Bass\s+Solo|Interlude|Instrumental|Refrain|Coda|Ending|Break|Breakdown|Tag|Vamp)(?:\s*(\d+|[A-Za-z]+))?(?:\s*[-:]\s*(\d+)\s*bars?)?(?:\]|\))?\s*:?\s*$/i;

    const rawLines = cleaned.split('\n');
    const isChordOnlyLine = (line: string): boolean => {
      if (sectionHeaderRegex.test(line)) return false;
      const trimmed = line
        .replace(/[|()]/g, ' ')
        .replace(/\bx\d+\b/gi, ' ')
        .replace(/\bN\.?C\.?\b/gi, ' ')
        .trim();
      if (!trimmed) return false;
      const tokens = trimmed.split(/\s+/);
      return tokens.length > 0 && tokens.every(t => isMusicalChordToken(t));
    };

    const outputLines: string[] = [];
    let i = 0;
    while (i < rawLines.length) {
      const line = rawLines[i];
      const nextLine = i + 1 < rawLines.length ? rawLines[i + 1] : null;
      if (isChordOnlyLine(line)) {
        // Extract chord positions preserving exact column alignment
        const chordPositions: Array<{ chord: string; col: number }> = [];
        const cleanLineForCols = line
          .replace(/[|()]/g, ' ')
          .replace(/\bx\d+\b/gi, m => ' '.repeat(m.length));
        const regex = /\S+/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(cleanLineForCols)) !== null) {
          const tok = m[0].replace(/^\[|\]$/g, '');
          if (isMusicalChordToken(tok)) {
            chordPositions.push({ chord: tok, col: m.index });
          }
        }

        if (
          nextLine !== null &&
          nextLine.trim() !== '' &&
          !isChordOnlyLine(nextLine) &&
          !sectionHeaderRegex.test(nextLine)
        ) {
          // Merge chord positions from `line` into `nextLine` words
          const words: Array<{ text: string; start: number; end: number; chords: string[] }> = [];
          const wordRegex = /\S+/g;
          while ((m = wordRegex.exec(nextLine)) !== null) {
            words.push({ text: m[0], start: m.index, end: m.index + m[0].length, chords: [] });
          }
          if (words.length > 0) {
            for (const cp of chordPositions) {
              let bestIdx = 0;
              let bestDist = Infinity;
              for (let wIdx = 0; wIdx < words.length; wIdx++) {
                const w = words[wIdx];
                const dist =
                  cp.col >= w.start && cp.col <= w.end
                    ? 0
                    : Math.min(Math.abs(cp.col - w.start), Math.abs(cp.col - w.end));
                if (dist < bestDist) {
                  bestDist = dist;
                  bestIdx = wIdx;
                }
              }
              if (
                words[bestIdx].chords.length > 0 &&
                bestIdx + 1 < words.length &&
                words[bestIdx + 1].chords.length === 0 &&
                cp.col > words[bestIdx].start + 1 &&
                words[bestIdx + 1].start - cp.col <= 5
              ) {
                words[bestIdx + 1].chords.push(cp.chord);
              } else {
                words[bestIdx].chords.push(cp.chord);
              }
            }
            const mergedLine = words
              .map(w => {
                if (w.chords.length === 0) return w.text;
                const primary = `[${w.chords[0]}]${w.text}`;
                if (w.chords.length === 1) return primary;
                const extras = w.chords.slice(1).map(c => `[${c}]`).join(' ');
                return `${primary} ${extras}`;
              })
              .join(' ');
            outputLines.push(mergedLine);
            i += 2;
            continue;
          }
        } else if (chordPositions.length > 0) {
          // Standalone chord-only line (e.g. in an Intro, Interlude, or Instrumental section)
          outputLines.push(chordPositions.map(cp => `[${cp.chord}]`).join(' '));
          i++;
          continue;
        }
      }
      outputLines.push(line);
      i++;
    }
    return outputLines.join('\n');
  };

  interface HfcWordCell {
    word: string;
    chord?: string;
    lineIdx: number;
    wordIdx: number;
    slotKey: string;
    prevChordOnLine?: string | null;
    nextChordOnLine?: string | null;
    flowLabel?: string;
  }

  interface HfcChordOccurrence {
    slotKey: string;
    chord: string;
    lineIdx: number;
    wordIdx: number;
    word: string;
    prevChordOnLine: string | null;
    nextChordOnLine: string | null;
    nextSlotKeyOnLine: string | null;
    flowLabel: string;
  }

  const computeChordFlowLabel = (
    chord: string,
    prevChord: string | null,
    nextChord: string | null
  ): string => {
    if (!prevChord && nextChord) return `${chord} → ${nextChord}`;
    if (prevChord && !nextChord) return `${prevChord} → ${chord}`;
    if (prevChord && nextChord) return `${prevChord} → ${chord} → ${nextChord}`;
    return chord;
  };

  // Parses a SongPart into HFC Chords-Above-Words lines (when words exist) OR a list of Chords (when no words exist),
  // plus per-instance slotKeys, musical flow context (e.g. G -> D vs D -> G), and color-coded ChordWidgetGroups.
  const parsePartHfcData = (part: SongPart) => {
    const normalized = normalizeLyricsToInlineBracketChords(part.lyrics || '');
    const rawLines = normalized
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const parsedLines: HfcWordCell[][] = [];
    const chordsFromChordOnlyLines: string[] = [];
    let totalActualWords = 0;

    rawLines.forEach((line) => {
      const currentLineIdx = parsedLines.length;
      const cells: HfcWordCell[] = [];
      const tokenRegex = /(?:\[([^\]]+)\]([^\s\[]*)|([^\s\[]+))/g;
      let match: RegExpExecArray | null;
      let wIdx = 0;
      while ((match = tokenRegex.exec(line)) !== null) {
        if (match[1] !== undefined) {
          const chordName = match[1].trim();
          const attachedWord = (match[2] || '').trim();
          if (attachedWord) {
            totalActualWords++;
          }
          const thisWordIdx = wIdx++;
          cells.push({
            chord: chordName,
            word: attachedWord,
            lineIdx: currentLineIdx,
            wordIdx: thisWordIdx,
            slotKey: `L${currentLineIdx}:W${thisWordIdx}`
          });
        } else if (match[3] !== undefined) {
          const plainTok = match[3].trim();
          if (plainTok === '|') continue;
          const thisWordIdx = wIdx++;
          cells.push({
            word: plainTok,
            lineIdx: currentLineIdx,
            wordIdx: thisWordIdx,
            slotKey: `L${currentLineIdx}:W${thisWordIdx}`
          });
        }
      }

      const allTokensAreChords =
        cells.length > 0 &&
        cells.every(c => (c.chord && !c.word) || (!c.chord && isMusicalChordToken(c.word)));

      if (allTokensAreChords) {
        cells.forEach(c => {
          const ch = c.chord || c.word;
          if (ch) chordsFromChordOnlyLines.push(ch);
        });
      } else if (cells.length > 0) {
        totalActualWords += cells.filter(c => c.word.length > 0).length;
        parsedLines.push(cells);
      }
    });

    const hasWords = totalActualWords > 0 && parsedLines.length > 0;
    const savedStandaloneChords = Array.isArray(part.chord_data?.chords) ? part.chord_data!.chords! : [];
    const listedChords = [...savedStandaloneChords, ...chordsFromChordOnlyLines];

    // Build allOccurrences with musical flow context (prevChordOnLine, nextChordOnLine, flowLabel)
    const allOccurrences: HfcChordOccurrence[] = [];

    // 1. Standalone listed chords
    listedChords.forEach((chordName, cIdx) => {
      const prevChord = cIdx > 0 ? listedChords[cIdx - 1] : null;
      const nextChord = cIdx + 1 < listedChords.length ? listedChords[cIdx + 1] : null;
      const nextSlotKey = cIdx + 1 < listedChords.length ? `LIST:${cIdx + 1}` : null;
      const flowLabel = computeChordFlowLabel(chordName, prevChord, nextChord);
      allOccurrences.push({
        slotKey: `LIST:${cIdx}`,
        chord: chordName,
        lineIdx: -1,
        wordIdx: cIdx,
        word: '',
        prevChordOnLine: prevChord,
        nextChordOnLine: nextChord,
        nextSlotKeyOnLine: nextSlotKey,
        flowLabel
      });
    });

    // 2. Word-aligned chords on each lyric line
    parsedLines.forEach((lineCells, lIdx) => {
      const chordCellsOnLine = lineCells.filter(c => !!c.chord);
      chordCellsOnLine.forEach((cell, idxInLine) => {
        const chordName = cell.chord!;
        const prevCell = idxInLine > 0 ? chordCellsOnLine[idxInLine - 1] : null;
        const nextCell = idxInLine + 1 < chordCellsOnLine.length ? chordCellsOnLine[idxInLine + 1] : null;
        const prevChord = prevCell?.chord || null;
        const nextChord = nextCell?.chord || null;
        const flowLabel = computeChordFlowLabel(chordName, prevChord, nextChord);
        cell.prevChordOnLine = prevChord;
        cell.nextChordOnLine = nextChord;
        cell.flowLabel = flowLabel;

        allOccurrences.push({
          slotKey: cell.slotKey,
          chord: chordName,
          lineIdx: lIdx,
          wordIdx: cell.wordIdx,
          word: cell.word,
          prevChordOnLine: prevChord,
          nextChordOnLine: nextChord,
          nextSlotKeyOnLine: nextCell ? nextCell.slotKey : null,
          flowLabel
        });
      });
    });

    // Resolve ChordWidgetGroups from:
    // 1. In-memory ref (for instant multi-click responsiveness before network round-trip completes)
    // 2. part.chord_data.chord_groups (if present)
    // 3. __GRP__: encoded entries inside part.chord_data.chord_widgets (preserved by all backend versions)
    let chordGroups: ChordWidgetGroup[] = [];
    if (latestChordGroupsByPartRef.current[part.id]) {
      chordGroups = latestChordGroupsByPartRef.current[part.id];
    } else if (Array.isArray(part.chord_data?.chord_groups) && part.chord_data!.chord_groups!.length > 0) {
      chordGroups = part.chord_data!.chord_groups!;
    } else if (part.chord_data?.chord_widgets && typeof part.chord_data.chord_widgets === 'object') {
      const decoded: ChordWidgetGroup[] = [];
      Object.entries(part.chord_data.chord_widgets).forEach(([rawKey, wIds], idx) => {
        if (rawKey.startsWith('__GRP__:')) {
          try {
            const meta = JSON.parse(rawKey.slice('__GRP__:'.length));
            if (meta && meta.id && Array.isArray(meta.chord_keys)) {
              decoded.push({
                id: String(meta.id),
                label: String(meta.label || 'Chord Flow'),
                colorIndex: typeof meta.colorIndex === 'number' ? meta.colorIndex : idx,
                chord_keys: meta.chord_keys.map(String),
                widget_ids: Array.isArray(wIds) ? wIds.map(String) : []
              });
            }
          } catch {
            // Ignore malformed key
          }
        }
      });
      chordGroups = decoded;
    }

    const slotToGroupMap: Record<string, ChordWidgetGroup> = {};
    chordGroups.forEach(grp => {
      (grp.chord_keys || []).forEach(k => {
        slotToGroupMap[k] = grp;
      });
    });

    const occurrenceByKey: Record<string, HfcChordOccurrence> = {};
    allOccurrences.forEach(occ => {
      occurrenceByKey[occ.slotKey] = occ;
    });

    const chordWidgetsMap: Record<string, string[]> =
      part.chord_data?.chord_widgets && typeof part.chord_data.chord_widgets === 'object'
        ? part.chord_data.chord_widgets
        : {};

    const uniqueChords = new Set<string>(listedChords);
    parsedLines.forEach(line =>
      line.forEach(cell => {
        if (cell.chord) uniqueChords.add(cell.chord);
      })
    );

    return {
      hasWords,
      parsedLines,
      listedChords,
      allOccurrences,
      occurrenceByKey,
      chordGroups,
      slotToGroupMap,
      chordWidgetsMap,
      uniqueChords: Array.from(uniqueChords)
    };
  };

  // Builds a descriptive default label for a selection of chord occurrences (e.g. "G → D (2 chords)" or "G (Line 1)")
  const buildDefaultGroupLabel = (
    selectedKeys: string[],
    occurrenceByKey: Record<string, HfcChordOccurrence>
  ): string => {
    const occs = selectedKeys.map(k => occurrenceByKey[k]).filter(Boolean);
    if (occs.length === 0) return 'Selected Chords';
    const distinctChords = Array.from(new Set(occs.map(o => o.chord)));
    const distinctFlows = Array.from(new Set(occs.map(o => o.flowLabel)));
    if (distinctChords.length === 1) {
      if (distinctFlows.length === 1 && distinctFlows[0].includes('→')) {
        return distinctFlows[0];
      }
      return occs.length === 1 && occs[0].lineIdx >= 0
        ? `${distinctChords[0]} (Line ${occs[0].lineIdx + 1})`
        : `${distinctChords[0]} (${occs.length}x)`;
    }
    return distinctChords.join(' → ');
  };

  // Persist updated chord_groups (both in chord_groups and encoded in chord_widgets so GET /api/songs/:id always preserves them)
  const savePartChordGroups = async (
    part: SongPart,
    nextGroups: ChordWidgetGroup[],
    nextStandaloneChords?: string[]
  ) => {
    latestChordGroupsByPartRef.current[part.id] = nextGroups;

    const existingChords =
      nextStandaloneChords !== undefined
        ? nextStandaloneChords
        : Array.isArray(part.chord_data?.chords)
        ? part.chord_data!.chords!
        : [];

    const allPartWidgetIds = new Set<string>();
    const encodedChordWidgets: Record<string, string[]> = {};

    nextGroups.forEach((grp, idx) => {
      const cleanWidgetIds = Array.isArray(grp.widget_ids) ? grp.widget_ids : [];
      cleanWidgetIds.forEach(id => allPartWidgetIds.add(id));
      const metaKey = `__GRP__:${JSON.stringify({
        id: grp.id,
        label: grp.label || 'Chord Flow',
        colorIndex: typeof grp.colorIndex === 'number' ? grp.colorIndex : idx,
        chord_keys: grp.chord_keys || []
      })}`;
      encodedChordWidgets[metaKey] = cleanWidgetIds;
    });

    await handleUpdatePart(
      part.id,
      {
        chord_data: {
          chords: existingChords,
          chord_widgets: encodedChordWidgets,
          chord_groups: nextGroups
        },
        linked_widget_ids: Array.from(allPartWidgetIds)
      },
      true
    );
  };

  // Handles clicking any chord slot on the HFC chart (Step 1 Multi-Select -> Step 2 Teach Mode Widgets Div)
  const handleChordSlotClick = async (part: SongPart, slotKey: string) => {
    const { chordGroups, slotToGroupMap, occurrenceByKey } = parsePartHfcData(part);
    const currentSel = chordSelectionByPart[part.id] || null;
    const existingGroup = slotToGroupMap[slotKey] || null;

    // CASE 1: User is currently in Step 1 ('selecting' mode) — clicking any chord toggles it in/out of the selection!
    if (currentSel && currentSel.step === 'selecting') {
      const alreadyInSelection = currentSel.selectedKeys.includes(slotKey);
      const nextKeys = alreadyInSelection
        ? currentSel.selectedKeys.filter(k => k !== slotKey)
        : [...currentSel.selectedKeys, slotKey];

      if (nextKeys.length === 0) {
        setChordSelectionByPart(prev => ({ ...prev, [part.id]: null }));
        return;
      }

      // If editing an existing saved group's chord keys, update it immediately
      if (currentSel.groupId) {
        const nextGroups = chordGroups
          .map(g => {
            if (g.id === currentSel.groupId) {
              return { ...g, chord_keys: nextKeys };
            }
            return { ...g, chord_keys: g.chord_keys.filter(k => !nextKeys.includes(k)) };
          })
          .filter(g => g.chord_keys.length > 0);
        await savePartChordGroups(part, nextGroups);
      }

      setChordSelectionByPart(prev => ({
        ...prev,
        [part.id]: {
          ...currentSel,
          selectedKeys: nextKeys,
          anchorKey: currentSel.anchorKey || slotKey
        }
      }));
      return;
    }

    // CASE 2: Not in Step 1. If the clicked chord already belongs to a saved Chord Group, open its Widgets Div (or toggle close if already open)
    if (existingGroup) {
      if (currentSel && currentSel.step === 'widgets' && currentSel.groupId === existingGroup.id) {
        setChordSelectionByPart(prev => ({ ...prev, [part.id]: null }));
      } else {
        setChordSelectionByPart(prev => ({
          ...prev,
          [part.id]: {
            step: 'widgets',
            groupId: existingGroup.id,
            selectedKeys: existingGroup.chord_keys,
            anchorKey: slotKey,
            customLabel: existingGroup.label || buildDefaultGroupLabel(existingGroup.chord_keys, occurrenceByKey),
            widgetIds: existingGroup.widget_ids || []
          }
        }));
      }
      return;
    }

    // CASE 3: Clicked an ungrouped chord! Start Step 1 ('selecting') with ONLY this specific chord instance selected
    const occ = occurrenceByKey[slotKey];
    setChordSelectionByPart(prev => ({
      ...prev,
      [part.id]: {
        step: 'selecting',
        groupId: null,
        selectedKeys: [slotKey],
        anchorKey: slotKey,
        customLabel: occ ? occ.flowLabel : 'Chord Flow',
        widgetIds: []
      }
    }));
  };

  // Applies a 1-click Smart Flow Selection Preset in Step 1 (e.g. "Same Flow: G -> D", "Only This G", "This G -> D Pair", "All Gs")
  const handleApplySmartSelectionPreset = async (
    part: SongPart,
    targetKeys: string[],
    suggestedLabel?: string
  ) => {
    if (targetKeys.length === 0) return;
    const { chordGroups, occurrenceByKey } = parsePartHfcData(part);
    const currentSel = chordSelectionByPart[part.id];
    const nextLabel = suggestedLabel || buildDefaultGroupLabel(targetKeys, occurrenceByKey);

    if (currentSel?.groupId) {
      const nextGroups = chordGroups
        .map(g => {
          if (g.id === currentSel.groupId) {
            return { ...g, chord_keys: targetKeys, label: nextLabel };
          }
          return { ...g, chord_keys: g.chord_keys.filter(k => !targetKeys.includes(k)) };
        })
        .filter(g => g.chord_keys.length > 0);
      await savePartChordGroups(part, nextGroups);
    }

    setChordSelectionByPart(prev => ({
      ...prev,
      [part.id]: {
        step: currentSel?.step || 'selecting',
        groupId: currentSel?.groupId || null,
        selectedKeys: targetKeys,
        anchorKey: currentSel?.anchorKey || targetKeys[0],
        customLabel: nextLabel,
        widgetIds: currentSel?.widgetIds || []
      }
    }));
  };

  // Transitions from Step 1 (Selecting Chords) -> Step 2 (Teach Mode Widgets Div)
  const handleProceedToWidgetsStep = async (part: SongPart) => {
    const currentSel = chordSelectionByPart[part.id];
    if (!currentSel || currentSel.selectedKeys.length === 0) return;
    const { chordGroups, occurrenceByKey } = parsePartHfcData(part);
    const resolvedLabel =
      currentSel.customLabel || buildDefaultGroupLabel(currentSel.selectedKeys, occurrenceByKey);

    let targetGroupId = currentSel.groupId;
    let nextGroups = [...chordGroups];
    const existingGrp = targetGroupId ? nextGroups.find(g => g.id === targetGroupId) : null;

    if (!existingGrp) {
      targetGroupId = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const usedColorIndices = new Set(nextGroups.map(g => g.colorIndex));
      let nextColorIndex = 0;
      for (let c = 0; c < CHORD_GROUP_PALETTE.length; c++) {
        if (!usedColorIndices.has(c)) {
          nextColorIndex = c;
          break;
        }
      }
      if (usedColorIndices.has(nextColorIndex)) {
        nextColorIndex = nextGroups.length % CHORD_GROUP_PALETTE.length;
      }

      nextGroups = nextGroups
        .map(g => ({
          ...g,
          chord_keys: g.chord_keys.filter(k => !currentSel.selectedKeys.includes(k))
        }))
        .filter(g => g.chord_keys.length > 0);

      nextGroups.push({
        id: targetGroupId,
        label: resolvedLabel,
        colorIndex: nextColorIndex,
        chord_keys: currentSel.selectedKeys,
        widget_ids: currentSel.widgetIds || []
      });
    } else {
      nextGroups = nextGroups.map(g =>
        g.id === targetGroupId
          ? { ...g, chord_keys: currentSel.selectedKeys, label: resolvedLabel }
          : { ...g, chord_keys: g.chord_keys.filter(k => !currentSel.selectedKeys.includes(k)) }
      );
    }

    setChordSelectionByPart(prev => ({
      ...prev,
      [part.id]: {
        ...currentSel,
        step: 'widgets',
        groupId: targetGroupId,
        customLabel: resolvedLabel,
        widgetIds: existingGrp ? existingGrp.widget_ids : (currentSel.widgetIds || [])
      }
    }));

    await savePartChordGroups(part, nextGroups);
  };

  // Adds or removes a Teach Mode widget for the currently selected chord instances in Step 2 (supports selecting as many widgets as desired)
  const handleToggleTeachWidgetForSelection = async (part: SongPart, widgetId: string) => {
    const currentSel = chordSelectionByPart[part.id];
    if (!currentSel || currentSel.selectedKeys.length === 0) return;

    const { chordGroups, occurrenceByKey } = parsePartHfcData(part);
    let targetGroupId = currentSel.groupId;
    let nextGroups = [...chordGroups];
    const existingGrp = targetGroupId ? nextGroups.find(g => g.id === targetGroupId) : null;

    let nextWidgetIds: string[] = [];

    if (existingGrp && targetGroupId) {
      const baseIds = currentSel.widgetIds !== undefined ? currentSel.widgetIds : existingGrp.widget_ids;
      const hasWidget = baseIds.includes(widgetId);
      nextWidgetIds = hasWidget
        ? baseIds.filter(id => id !== widgetId)
        : [...baseIds, widgetId];

      nextGroups = nextGroups.map(g =>
        g.id === targetGroupId
          ? {
              ...g,
              chord_keys: currentSel.selectedKeys,
              widget_ids: nextWidgetIds,
              label: currentSel.customLabel || g.label
            }
          : {
              ...g,
              chord_keys: g.chord_keys.filter(k => !currentSel.selectedKeys.includes(k))
            }
      );
    } else {
      // Create a brand new ChordWidgetGroup for ONLY the selected chord instances!
      targetGroupId = targetGroupId || `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const usedColorIndices = new Set(nextGroups.map(g => g.colorIndex));
      let nextColorIndex = 0;
      for (let c = 0; c < CHORD_GROUP_PALETTE.length; c++) {
        if (!usedColorIndices.has(c)) {
          nextColorIndex = c;
          break;
        }
      }
      if (usedColorIndices.has(nextColorIndex)) {
        nextColorIndex = nextGroups.length % CHORD_GROUP_PALETTE.length;
      }

      const baseIds = currentSel.widgetIds || [];
      const hasWidget = baseIds.includes(widgetId);
      nextWidgetIds = hasWidget
        ? baseIds.filter(id => id !== widgetId)
        : [...baseIds, widgetId];

      // Remove these selectedKeys from any older group so each chord instance belongs to at most one group
      nextGroups = nextGroups
        .map(g => ({
          ...g,
          chord_keys: g.chord_keys.filter(k => !currentSel.selectedKeys.includes(k))
        }))
        .filter(g => g.chord_keys.length > 0);

      const newGroup: ChordWidgetGroup = {
        id: targetGroupId,
        label:
          currentSel.customLabel || buildDefaultGroupLabel(currentSel.selectedKeys, occurrenceByKey),
        colorIndex: nextColorIndex,
        chord_keys: currentSel.selectedKeys,
        widget_ids: nextWidgetIds
      };
      nextGroups.push(newGroup);
    }

    setChordSelectionByPart(prev => ({
      ...prev,
      [part.id]: {
        ...currentSel,
        step: 'widgets',
        groupId: targetGroupId,
        widgetIds: nextWidgetIds
      }
    }));

    await savePartChordGroups(part, nextGroups);
  };

  // Reorder a Teach Mode widget up/down inside a ChordWidgetGroup
  const handleReorderTeachWidgetForGroup = async (
    part: SongPart,
    groupId: string,
    idx: number,
    direction: 'up' | 'down'
  ) => {
    const { chordGroups } = parsePartHfcData(part);
    const targetGrp = chordGroups.find(g => g.id === groupId);
    if (!targetGrp) return;

    const currentIds = [...targetGrp.widget_ids];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentIds.length) return;

    const [moved] = currentIds.splice(idx, 1);
    currentIds.splice(targetIdx, 0, moved);

    const nextGroups = chordGroups.map(g =>
      g.id === groupId ? { ...g, widget_ids: currentIds } : g
    );
    setChordSelectionByPart(prev =>
      prev[part.id] && prev[part.id]!.groupId === groupId
        ? { ...prev, [part.id]: { ...prev[part.id]!, widgetIds: currentIds } }
        : prev
    );
    await savePartChordGroups(part, nextGroups);
  };

  // Delete a ChordWidgetGroup from a SongPart
  const handleDeleteChordGroup = async (part: SongPart, groupId: string) => {
    const { chordGroups } = parsePartHfcData(part);
    const nextGroups = chordGroups.filter(g => g.id !== groupId);
    setChordSelectionByPart(prev => ({ ...prev, [part.id]: null }));
    await savePartChordGroups(part, nextGroups);
  };

  // Copy Chord Flow Groups from this Song Part to all other Song Parts of the same type (e.g. Verse 1 -> Verse 2, Chorus 1 -> Chorus 2)
  const handleCopyChordGroupsToMatchingParts = async (sourcePart: SongPart) => {
    if (!selectedSong) return;
    const sourceData = parsePartHfcData(sourcePart);
    if (sourceData.chordGroups.length === 0) return;

    const matchingParts = selectedSong.parts.filter(
      p => p.id !== sourcePart.id && p.part_type === sourcePart.part_type
    );
    if (matchingParts.length === 0) return;

    for (const targetPart of matchingParts) {
      const targetData = parsePartHfcData(targetPart);
      const mappedGroups: ChordWidgetGroup[] = [];

      sourceData.chordGroups.forEach(srcGrp => {
        const srcOccs = srcGrp.chord_keys
          .map(k => sourceData.occurrenceByKey[k])
          .filter(Boolean);
        const srcFlowSet = new Set(srcOccs.map(o => `${o.chord}::${o.flowLabel}`));

        // Match either exact slotKey (if samechord) OR matching chord+flowLabel in targetPart!
        const matchedTargetKeys = targetData.allOccurrences
          .filter(
            tOcc =>
              (srcGrp.chord_keys.includes(tOcc.slotKey) &&
                sourceData.occurrenceByKey[tOcc.slotKey]?.chord === tOcc.chord) ||
              srcFlowSet.has(`${tOcc.chord}::${tOcc.flowLabel}`)
          )
          .map(tOcc => tOcc.slotKey);

        if (matchedTargetKeys.length > 0) {
          mappedGroups.push({
            ...srcGrp,
            id: `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            chord_keys: matchedTargetKeys
          });
        }
      });

      if (mappedGroups.length > 0) {
        await savePartChordGroups(targetPart, mappedGroups);
      }
    }
  };

  // Sets or removes a chord directly above a specific word in `part.lyrics`
  const handleSetChordAboveWord = async (
    part: SongPart,
    targetLineIdx: number,
    targetWordIdx: number,
    newChordRaw: string
  ) => {
    const cleanChord = newChordRaw.replace(/^\[|\]$/g, '').trim();
    const { parsedLines } = parsePartHfcData(part);
    if (!parsedLines[targetLineIdx]) return;

    const updatedLines = parsedLines.map((lineCells, lIdx) => {
      return lineCells
        .map((cell, wIdx) => {
          const chordToUse =
            lIdx === targetLineIdx && wIdx === targetWordIdx ? (cleanChord || undefined) : cell.chord;
          if (chordToUse && cell.word) {
            return `[${chordToUse}]${cell.word}`;
          } else if (chordToUse && !cell.word) {
            return `[${chordToUse}]`;
          }
          return cell.word;
        })
        .filter(Boolean)
        .join(' ');
    });

    const updatedLyricsText = updatedLines.join('\n');
    setPartLyricsDrafts(prev => ({ ...prev, [part.id]: updatedLyricsText }));
    setWordChordPicker(null);
    await handleUpdatePart(part.id, { lyrics: updatedLyricsText }, true);
  };

  // Adds one or more standalone chords (e.g. "G" or "G C D G") to a SongPart's chord list
  const handleAddChordsToPartList = async (part: SongPart, rawInput: string) => {
    const tokens = rawInput
      .split(/[\s,|]+/)
      .map(t => t.replace(/^\[|\]$/g, '').trim())
      .filter(Boolean);
    if (tokens.length === 0) return;

    const existingChords = Array.isArray(part.chord_data?.chords) ? part.chord_data!.chords! : [];
    const existingGroups = Array.isArray(part.chord_data?.chord_groups) ? part.chord_data!.chord_groups! : [];
    const nextChords = [...existingChords, ...tokens];

    setNewChordInputByPart(prev => ({ ...prev, [part.id]: '' }));
    await savePartChordGroups(part, existingGroups, nextChords);
  };

  const handleRemoveChordFromPartList = async (part: SongPart, indexToRemove: number) => {
    const existingChords = Array.isArray(part.chord_data?.chords) ? [...part.chord_data!.chords!] : [];
    const existingGroups = Array.isArray(part.chord_data?.chord_groups) ? part.chord_data!.chord_groups! : [];
    existingChords.splice(indexToRemove, 1);
    await savePartChordGroups(part, existingGroups, existingChords);
  };

  /* ==========================================================================
     LYRICS & SONG STRUCTURE TOOLING (STEP 1: SEARCH & FETCH -> STEP 2: AUTO-SECTION)
     ========================================================================== */
  const runLyricsSearch = async (titleStr: string, artistStr: string) => {
    const cleanTitle = titleStr.replace(/[=_~*]+$/g, '').trim();
    const cleanArtist = artistStr.replace(/[=_~*]+$/g, '').trim();
    if (!cleanTitle && !cleanArtist) return;

    setLrclibSearching(true);
    setLrclibError('');
    try {
      const params = new URLSearchParams();
      if (cleanTitle) params.set('title', cleanTitle);
      if (cleanArtist) params.set('artist', cleanArtist);
      const res = await fetch(`${API_BASE}/lyrics/search?${params.toString()}`);
      if (!res.ok) throw new Error('Lyrics search request failed');
      const data: LrclibTrack[] = await res.json();
      setLrclibResults(Array.isArray(data) ? data : []);
      if (!data || data.length === 0) {
        setLrclibError('No matching tracks found. Try simplifying the Song Title or Artist name above, or switch to Step 2 to paste lyrics directly.');
      }
    } catch (err: any) {
      console.error('Lyrics search error:', err);
      setLrclibError('Could not reach the backend lyrics service. You can paste lyrics directly in Step 2.');
    } finally {
      setLrclibSearching(false);
    }
  };

  const openLyricsToolModal = () => {
    if (!selectedSong) return;
    const cleanTitle = selectedSong.title.replace(/[=_~*]+$/g, '').trim();
    const cleanArtist = selectedSong.artist.replace(/[=_~*]+$/g, '').trim();
    setLrclibQueryTitle(cleanTitle);
    setLrclibQueryArtist(cleanArtist);
    setLrclibError('');
    setSmartPasteReplaceExisting(true);
    setLyricsToolTab('lrclib');
    setIsLyricsToolOpen(true);
    runLyricsSearch(cleanTitle, cleanArtist);
  };

  const handleSearchLrclib = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await runLyricsSearch(lrclibQueryTitle, lrclibQueryArtist);
  };

  // Derive a fallback chord progression from the song's Roman Numeral widget or Key Signature
  const getSongFallbackChordProgression = (): string[] => {
    const keySig = selectedSong?.key_signature || 'C Major';
    const rootMatch = keySig.match(/^([A-G][#b]?)\s*(Major|Minor)?/i);
    const rootNote = rootMatch ? rootMatch[1] : 'C';
    const isMinorKey = /minor/i.test(keySig);

    const chromaticSharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const chromaticFlat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const useFlats = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm'].some(
      k => rootNote === k.replace('m', '') && (k.includes('b') || k === 'F' || (isMinorKey && ['D', 'G', 'C', 'F'].includes(rootNote)))
    );
    const scaleNotes = useFlats ? chromaticFlat : chromaticSharp;
    const normMap: Record<string, number> = {
      C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
      'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
    };
    const rootSemitone = normMap[rootNote] ?? 0;

    const romanToChord = (romanRaw: string): string | null => {
      const cleaned = String(romanRaw || '').trim();
      const m = cleaned.match(/^(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|dim|aug|\+|7|maj7|m7)?$/);
      if (!m) return isMusicalChordToken(cleaned) ? cleaned : null;
      const accidental = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
      const numeral = m[2];
      const suffix = m[3] || '';
      const isLower = numeral === numeral.toLowerCase();
      const upper = numeral.toUpperCase();
      const majorIntervals: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
      const minorIntervals: Record<string, number> = { I: 0, II: 2, III: 3, IV: 5, V: 7, VI: 8, VII: 10 };
      const baseInterval = (isMinorKey ? minorIntervals[upper] : majorIntervals[upper]) ?? 0;
      const noteIdx = (rootSemitone + baseInterval + accidental + 12) % 12;
      const chordRoot = scaleNotes[noteIdx];
      if (suffix === '°' || suffix === 'dim') return `${chordRoot}dim`;
      if (isLower) return `${chordRoot}m${suffix === 'm7' ? '7' : suffix}`;
      return `${chordRoot}${suffix}`;
    };

    // 1. Check if Teach Mode has a Roman Numeral widget with a progression defined
    if (selectedSong?.widgets) {
      for (const w of selectedSong.widgets) {
        if (w.widget_type === 'roman_numeral' && Array.isArray(w.data?.progression) && w.data.progression.length > 0) {
          const converted = w.data.progression
            .map((item: any) => (typeof item === 'string' ? romanToChord(item) : romanToChord(item?.numeral || item?.chord || '')))
            .filter((c: string | null): c is string => !!c);
          if (converted.length > 0) return converted;
        }
      }
    }

    // 2. Otherwise build standard 4-chord progression from song's key signature
    if (isMinorKey) {
      return [
        romanToChord('i') || `${rootNote}m`,
        romanToChord('VI') || 'C',
        romanToChord('III') || 'G',
        romanToChord('VII') || 'D'
      ];
    }
    return [
      romanToChord('I') || rootNote,
      romanToChord('V') || 'D',
      romanToChord('vi') || 'Em',
      romanToChord('IV') || 'C'
    ];
  };

  // Injects inline `[Chord]` markers above words when plain lyrics have no chords yet
  const injectFallbackChordsIntoPlainLyrics = (text: string): string => {
    const progression = getSongFallbackChordProgression();
    if (progression.length === 0) return text;

    const sectionHeaderRegex =
      /^\s*(?:\[|\(|###?\s*)?(Intro|Verse|Pre-?Chorus|Post-?Chorus|Chorus|Hook|Bridge|Outro|Solo|Guitar\s+Solo|Bass\s+Solo|Interlude|Instrumental|Refrain|Coda|Ending|Break|Breakdown|Tag|Vamp)(?:\s*(\d+|[A-Za-z]+))?(?:\s*[-:]\s*(\d+)\s*bars?)?(?:\]|\))?\s*:?\s*$/i;

    const lines = text.split('\n');
    const out: string[] = [];
    let chordCursor = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        out.push(line);
        continue;
      }
      if (sectionHeaderRegex.test(trimmed)) {
        out.push(line);
        // If this is an [Intro] or [Interlude] header with no lyrics following before the next blank/header line, add the chord list
        const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0);
        if (/^\[(Intro|Interlude|Instrumental|Solo)/i.test(trimmed) && (!nextNonEmpty || sectionHeaderRegex.test(nextNonEmpty.trim()))) {
          out.push(progression.slice(0, 4).map(c => `[${c}]`).join(' '));
        }
        continue;
      }

      // If line already has bracketed chords, keep as-is
      if (/\[([A-G][#b]?[^\]]*)\]/.test(line)) {
        out.push(line);
        continue;
      }

      const words = trimmed.split(/\s+/);
      if (words.length === 0) {
        out.push(line);
        continue;
      }

      const c1 = progression[chordCursor % progression.length];
      chordCursor++;
      words[0] = `[${c1}]${words[0]}`;

      if (words.length >= 5) {
        const midIdx = Math.floor(words.length / 2);
        const c2 = progression[chordCursor % progression.length];
        chordCursor++;
        words[midIdx] = `[${c2}]${words[midIdx]}`;
      }

      out.push(words.join(' '));
    }

    return out.join('\n');
  };

  // Automatically analyze plain or chord-annotated lyrics to detect repeating Choruses, Verses, Bridge, Intro & Outro
  const autoTagPlainLyricsWithSections = (rawText: string, defaultBars: number, addIntro: boolean): string => {
    // IMPORTANT: First convert any 2-line chord-over-lyric pairs into inline `[Chord]word` BEFORE trimming lines
    const normalizedChordsText = normalizeLyricsToInlineBracketChords(
      (rawText || '').replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '')
    ).trim();

    if (!normalizedChordsText) return '';

    // Extract any chords present in the song so we can populate an instrumental [Intro] if requested
    const detectedChords: string[] = [];
    const chordBracketRegex = /\[([A-G][#b]?[^\]]*)\]/g;
    let cm: RegExpExecArray | null;
    while ((cm = chordBracketRegex.exec(normalizedChordsText)) !== null) {
      if (isMusicalChordToken(cm[1]) && !detectedChords.includes(cm[1])) {
        detectedChords.push(cm[1]);
      }
    }
    const introChordLine = (detectedChords.length > 0 ? detectedChords.slice(0, 4) : getSongFallbackChordProgression().slice(0, 4))
      .map(c => `[${c}]`)
      .join(' ');

    const headerRegex =
      /^\s*(?:\[|\(|###?\s*)?(Intro|Verse|Pre-?Chorus|Post-?Chorus|Chorus|Hook|Bridge|Outro|Solo|Guitar\s+Solo|Bass\s+Solo|Interlude|Instrumental|Refrain|Coda|Ending|Break|Breakdown|Tag|Vamp)(?:\s*(\d+|[A-Za-z]+))?(?:\s*[-:]\s*(\d+)\s*bars?)?(?:\]|\))?\s*:?\s*$/im;

    if (headerRegex.test(normalizedChordsText)) {
      const hasIntroAlready = /^\s*\[?\s*Intro/im.test(normalizedChordsText);
      if (addIntro && !hasIntroAlready) {
        return `[Intro - 4 bars]\n${introChordLine}\n\n${normalizedChordsText}`;
      }
      return normalizedChordsText;
    }

    // Split by blank lines into stanzas; if no blank lines exist, group every 4 lines into a stanza
    let stanzas = normalizedChordsText
      .split(/\n\s*\n/)
      .map(s => s.split('\n').map(l => l.trim()).filter(Boolean).join('\n'))
      .filter(Boolean);

    if (stanzas.length === 1) {
      const allLines = stanzas[0].split('\n').filter(Boolean);
      if (allLines.length > 6) {
        stanzas = [];
        for (let i = 0; i < allLines.length; i += 4) {
          stanzas.push(allLines.slice(i, i + 4).join('\n'));
        }
      }
    }

    // Strip inline `[Chord]` tags when comparing stanzas for repetition so identical lyrics with chords still match
    const normalizeText = (s: string) =>
      s
        .replace(/\[[^\]]+\]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const firstLineKey = (s: string) => {
      const first = s.split('\n')[0] || '';
      return normalizeText(first);
    };

    // Count how many times each stanza (or its opening hook line) repeats across the song
    const fullCounts = new Map<string, number>();
    const hookCounts = new Map<string, number>();
    for (const st of stanzas) {
      const fk = normalizeText(st);
      const hk = firstLineKey(st);
      if (fk) fullCounts.set(fk, (fullCounts.get(fk) || 0) + 1);
      if (hk.length >= 10) hookCounts.set(hk, (hookCounts.get(hk) || 0) + 1);
    }

    const isChorusStanza = stanzas.map((st) => {
      const fk = normalizeText(st);
      const hk = firstLineKey(st);
      return (fullCounts.get(fk) || 0) >= 2 || (hk.length >= 10 && (hookCounts.get(hk) || 0) >= 2);
    });

    const taggedBlocks: string[] = [];
    if (addIntro) {
      taggedBlocks.push(`[Intro - 4 bars]\n${introChordLine}`);
    }

    let verseNum = 0;
    let chorusNum = 0;
    let seenChorusCount = 0;

    stanzas.forEach((stanza, idx) => {
      const lineCount = stanza.split('\n').filter(Boolean).length;
      const estimatedBars = Math.max(4, Math.min(16, lineCount * 2 || defaultBars));
      const isLast = idx === stanzas.length - 1;

      if (isChorusStanza[idx]) {
        chorusNum++;
        seenChorusCount++;
        taggedBlocks.push(`[Chorus ${chorusNum} - ${estimatedBars} bars]\n${stanza}`);
      } else if (isLast && lineCount <= 3 && stanzas.length >= 3) {
        taggedBlocks.push(`[Outro - 4 bars]\n${stanza}`);
      } else if (seenChorusCount >= 2 && idx < stanzas.length - 1 && isChorusStanza.slice(idx + 1).some(Boolean)) {
        taggedBlocks.push(`[Bridge - ${estimatedBars} bars]\n${stanza}`);
      } else {
        verseNum++;
        taggedBlocks.push(`[Verse ${verseNum} - ${estimatedBars} bars]\n${stanza}`);
      }
    });

    const joined = taggedBlocks.join('\n\n');
    // If the source had plain lyrics without any chords, automatically place the song's chord progression above the lyrics
    const hasAnyChords = /\[([A-G][#b]?[^\]]*)\]/.test(stanzas.join('\n'));
    return hasAnyChords ? joined : injectFallbackChordsIntoPlainLyrics(joined);
  };

  const handleSelectLyricsTrack = async (track: LrclibTrack) => {
    setLrclibError('');
    let rawLyrics = track.plainLyrics || track.syncedLyrics || '';

    // Always call /api/lyrics/fetch if we have a tabUrl OR if rawLyrics doesn't already have chords,
    // because /api/lyrics/fetch automatically upgrades plain lyrics to Ultimate Guitar Chords + Lyrics when available!
    const alreadyHasChords = /\[ch\]|\[([A-G][#b]?[^\]]*)\]/i.test(rawLyrics);
    if (!rawLyrics || track.tabUrl || !alreadyHasChords) {
      setFetchingTrackId(track.id);
      try {
        const params = new URLSearchParams({
          artist: track.artistName,
          title: track.trackName
        });
        if (track.tabUrl) {
          params.set('tabUrl', track.tabUrl);
        }
        const res = await fetch(`${API_BASE}/lyrics/fetch?${params.toString()}`);
        const data = await res.json();
        if (res.ok && data.lyrics) {
          rawLyrics = data.lyrics;
        } else if (!rawLyrics) {
          throw new Error(data.error || 'Could not fetch lyrics for this track.');
        }
      } catch (err: any) {
        if (!rawLyrics) {
          setLrclibError(err.message || 'Could not fetch lyrics for this track. Try another result below.');
          setFetchingTrackId(null);
          return;
        }
      }
      setFetchingTrackId(null);
    }

    const structuredText = autoTagPlainLyricsWithSections(rawLyrics, smartPasteDefaultBars, includeAutoIntro);
    setSmartPasteText(structuredText);
    setLyricsToolTab('paste');
  };

  const parseRawLyricsIntoSections = (rawText: string, defaultBars: number) => {
    // Convert any 2-line chord-over-lyric sheets into inline `[Chord]word` format first
    const cleaned = normalizeLyricsToInlineBracketChords(
      (rawText || '').replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '')
    ).trim();

    if (!cleaned) return [];

    const headerRegex =
      /^\s*(?:\[|\(|###?\s*)?(Intro|Verse|Pre-?Chorus|Post-?Chorus|Chorus|Hook|Bridge|Outro|Solo|Guitar\s+Solo|Bass\s+Solo|Interlude|Instrumental|Refrain|Coda|Ending|Break|Breakdown|Tag|Vamp)(?:\s*(\d+|[A-Za-z]+))?(?:\s*[-:]\s*(\d+)\s*bars?)?(?:\]|\))?\s*:?\s*$/i;
    const hasExplicitHeaders = cleaned.split(/\r?\n/).some(line => headerRegex.test(line));

    // If the user pasted plain lyrics without [Verse]/[Chorus] headers, auto-tag them first!
    const textToParse = hasExplicitHeaders
      ? cleaned
      : autoTagPlainLyricsWithSections(cleaned, defaultBars, includeAutoIntro);

    const lines = textToParse.split(/\r?\n/);
    const sections: Array<{ part_type: string; label: string; bars: number; lyrics: string }> = [];

    let currentHeaderType = 'Verse';
    let currentHeaderLabel = '';
    let currentBars: number | null = null;
    let currentLines: string[] = [];
    let foundExplicitHeaders = false;

    const mapToValidPartType = (rawType: string): string => {
      const lower = rawType.toLowerCase();
      if (lower.startsWith('intro')) return 'Intro';
      if (lower.startsWith('pre')) return 'Pre-Chorus';
      if (lower.startsWith('chorus') || lower.startsWith('refrain') || lower.startsWith('post')) return 'Chorus';
      if (lower.startsWith('hook')) return 'Hook';
      if (lower.startsWith('bridge')) return 'Bridge';
      if (lower.startsWith('outro') || lower.startsWith('coda') || lower.startsWith('ending') || lower.startsWith('tag')) return 'Outro';
      if (lower.startsWith('solo') || lower.includes('solo')) return 'Solo';
      if (lower.startsWith('interlude') || lower.startsWith('instrumental') || lower.startsWith('break') || lower.startsWith('vamp')) return 'Interlude';
      return 'Verse';
    };

    const flushSection = () => {
      const rawBody = currentLines.join('\n').trim();
      const body = rawBody.replace(/^\(Instrumental(?:\s+Intro)?\)$/i, '').trim();
      if (!body && !foundExplicitHeaders) return;

      // Estimate bars from pipe delimiters if present, else line count or defaultBars
      const pipeCount = (body.match(/\|/g) || []).length;
      const nonEmptyLines = body ? body.split('\n').filter(l => l.trim().length > 0).length : 0;
      const estimatedBars = currentBars || (pipeCount >= 2 ? pipeCount : Math.max(4, nonEmptyLines * 2 || defaultBars));

      const sameTypeExisting = sections.filter(s => s.part_type === currentHeaderType).length;
      const finalLabel = currentHeaderLabel || (sameTypeExisting > 0 || currentHeaderType === 'Verse' ? `${currentHeaderType} ${sameTypeExisting + 1}` : currentHeaderType);

      sections.push({
        part_type: currentHeaderType,
        label: finalLabel,
        bars: estimatedBars,
        lyrics: body
      });
      currentLines = [];
      currentBars = null;
    };

    for (const line of lines) {
      const match = line.match(headerRegex);
      if (match) {
        if (currentLines.length > 0 || foundExplicitHeaders) {
          flushSection();
        }
        foundExplicitHeaders = true;
        currentHeaderType = mapToValidPartType(match[1]);
        const suffix = match[2] ? ` ${match[2]}` : '';
        currentHeaderLabel = `${currentHeaderType}${suffix}`;
        currentBars = match[3] ? parseInt(match[3], 10) : null;
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0 || foundExplicitHeaders) {
      flushSection();
    }

    return sections;
  };

  const handleApplySmartPasteSections = async () => {
    if (!selectedSong || !smartPasteText.trim()) return;
    const parsedSections = parseRawLyricsIntoSections(smartPasteText, smartPasteDefaultBars);
    if (parsedSections.length === 0) return;

    try {
      const res = await fetch(`${API_BASE}/songs/${selectedSong.id}/parts/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: parsedSections,
          replaceExisting: smartPasteReplaceExisting
        })
      });
      if (res.ok) {
        setIsLyricsToolOpen(false);
        setSmartPasteText('');
        setExpandedEditParts({});
        setActiveChordByPart({});
        fetchSongDetails(selectedSong.id);
      }
    } catch (err) {
      console.error('Failed to bulk create sections from lyrics:', err);
    }
  };

  /* ==========================================================================
     PLAY MODE LIVE STREAMER ENGINE (BPM, TIME SIG, BARS, AUTOSCROLL & CLICK)
     ========================================================================== */
  const getBeatsPerBar = useCallback(() => {
    const ts = selectedSong?.time_signature || '4/4';
    const num = parseInt(ts.split('/')[0], 10);
    return Number.isFinite(num) && num > 0 ? num : 4;
  }, [selectedSong?.time_signature]);

  const playMetronomeClick = useCallback((isDownbeat: boolean) => {
    if (!useAudioClick) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isDownbeat ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(isDownbeat ? 1050 : 720, ctx.currentTime);
      gain.gain.setValueAtTime(isDownbeat ? 0.25 : 0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch (e) {
      // Ignore AudioContext errors if blocked
    }
  }, [useAudioClick]);

  const scrollToStreamPart = useCallback((partIdx: number) => {
    if (!selectedSong || !selectedSong.parts[partIdx]) return;
    const partId = selectedSong.parts[partIdx].id;
    const el = document.getElementById(`stream-part-${partId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedSong]);

  const stopLiveStream = useCallback(() => {
    if (streamRafRef.current) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
    setStreamState('stopped');
    setActiveStreamPartIdx(0);
    setCurrentBeatInBar(0);
    setCurrentBarInPart(0);
    setPartProgressRatio(0);
    setCountdownBeatsLeft(0);
    lastTriggeredBeatRef.current = -1;
    lastScrolledPartIdxRef.current = -1;
    preScrolledNextPartIdxRef.current = -1;
  }, []);

  const startLiveStream = useCallback((startFromPartIdx = 0) => {
    if (!selectedSong || selectedSong.parts.length === 0) return;

    setActiveStreamPartIdx(startFromPartIdx);
    setCurrentBeatInBar(0);
    setCurrentBarInPart(0);
    setPartProgressRatio(0);
    streamPausedElapsedRef.current = 0;
    lastTriggeredBeatRef.current = -1;
    lastScrolledPartIdxRef.current = startFromPartIdx;
    preScrolledNextPartIdxRef.current = -1;

    if (autoScrollPlay) {
      scrollToStreamPart(startFromPartIdx);
    }

    streamPartStartTimeRef.current = performance.now();
    if (useCountIn && startFromPartIdx === 0) {
      setCountdownBeatsLeft(getBeatsPerBar());
      setStreamState('countdown');
    } else {
      setStreamState('playing');
    }
  }, [selectedSong, autoScrollPlay, useCountIn, getBeatsPerBar, scrollToStreamPart]);

  const pauseLiveStream = useCallback(() => {
    if (streamState !== 'playing' && streamState !== 'countdown') return;
    if (streamRafRef.current) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
    streamPausedElapsedRef.current = performance.now() - streamPartStartTimeRef.current;
    setStreamState('paused');
  }, [streamState]);

  const resumeLiveStream = useCallback(() => {
    if (streamState !== 'paused') return;
    streamPartStartTimeRef.current = performance.now() - streamPausedElapsedRef.current;
    setStreamState('playing');
  }, [streamState]);

  const jumpToStreamPart = useCallback((targetIdx: number) => {
    if (!selectedSong || targetIdx < 0 || targetIdx >= selectedSong.parts.length) return;
    setActiveStreamPartIdx(targetIdx);
    setCurrentBeatInBar(0);
    setCurrentBarInPart(0);
    setPartProgressRatio(0);
    streamPartStartTimeRef.current = performance.now();
    streamPausedElapsedRef.current = 0;
    lastTriggeredBeatRef.current = -1;
    lastScrolledPartIdxRef.current = targetIdx;
    preScrolledNextPartIdxRef.current = -1;
    if (autoScrollPlay) {
      scrollToStreamPart(targetIdx);
    }
  }, [selectedSong, autoScrollPlay, scrollToStreamPart]);

  // Main requestAnimationFrame loop for Countdown & Playing states
  useEffect(() => {
    if (activeMode !== 'play' || !selectedSong || selectedSong.parts.length === 0) return;
    if (streamState !== 'countdown' && streamState !== 'playing') return;

    const bpm = Math.max(30, selectedSong.tempo || 120);
    const beatsPerBar = getBeatsPerBar();
    const msPerBeat = (60 / bpm) * 1000;
    const msPerBar = msPerBeat * beatsPerBar;

    const tick = (now: number) => {
      const elapsed = now - streamPartStartTimeRef.current;

      if (streamState === 'countdown') {
        const totalCountdownMs = msPerBar;
        if (elapsed >= totalCountdownMs) {
          streamPartStartTimeRef.current = now;
          lastTriggeredBeatRef.current = -1;
          setCountdownBeatsLeft(0);
          setStreamState('playing');
          return;
        }
        const beatIndex = Math.floor(elapsed / msPerBeat);
        const remainingBeats = Math.max(1, beatsPerBar - beatIndex);
        setCountdownBeatsLeft(remainingBeats);
        setCurrentBeatInBar(beatIndex % beatsPerBar);

        if (beatIndex !== lastTriggeredBeatRef.current) {
          lastTriggeredBeatRef.current = beatIndex;
          const isDown = beatIndex % beatsPerBar === 0;
          playMetronomeClick(isDown);
          if (isDown) {
            setIsDownbeatFlash(true);
            setTimeout(() => setIsDownbeatFlash(false), 160);
          }
        }

        streamRafRef.current = requestAnimationFrame(tick);
        return;
      }

      // 'playing' state
      const currentPart = selectedSong.parts[activeStreamPartIdx];
      if (!currentPart) {
        stopLiveStream();
        return;
      }

      const partBars = Math.max(1, currentPart.bars || 4);
      const partDurationMs = partBars * msPerBar;

      if (elapsed >= partDurationMs) {
        // Advance to next section in the song
        const nextIdx = activeStreamPartIdx + 1;
        if (nextIdx < selectedSong.parts.length) {
          setActiveStreamPartIdx(nextIdx);
          setCurrentBarInPart(0);
          setCurrentBeatInBar(0);
          setPartProgressRatio(0);
          streamPartStartTimeRef.current = now;
          lastTriggeredBeatRef.current = -1;
          if (autoScrollPlay && lastScrolledPartIdxRef.current !== nextIdx) {
            lastScrolledPartIdxRef.current = nextIdx;
            scrollToStreamPart(nextIdx);
          }
          streamRafRef.current = requestAnimationFrame(tick);
        } else {
          // End of song stream
          stopLiveStream();
        }
        return;
      }

      const totalBeatsElapsed = Math.floor(elapsed / msPerBeat);
      const beatInBar = totalBeatsElapsed % beatsPerBar;
      const barInPart = Math.min(partBars - 1, Math.floor(elapsed / msPerBar));
      const ratio = Math.min(1, Math.max(0, elapsed / partDurationMs));

      setCurrentBeatInBar(beatInBar);
      setCurrentBarInPart(barInPart);
      setPartProgressRatio(ratio);

      // Trigger beat pulse & audio click on each new beat
      if (totalBeatsElapsed !== lastTriggeredBeatRef.current) {
        lastTriggeredBeatRef.current = totalBeatsElapsed;
        const isDownbeat = beatInBar === 0;
        playMetronomeClick(isDownbeat);
        if (isDownbeat) {
          setIsDownbeatFlash(true);
          setTimeout(() => setIsDownbeatFlash(false), 160);
        }
      }

      // Pre-scroll toward next section 2 beats before current section finishes (like HFC)
      const msRemaining = partDurationMs - elapsed;
      const nextPartIdx = activeStreamPartIdx + 1;
      if (
        autoScrollPlay &&
        msRemaining <= msPerBeat * 1.5 &&
        nextPartIdx < selectedSong.parts.length &&
        preScrolledNextPartIdxRef.current !== nextPartIdx
      ) {
        preScrolledNextPartIdxRef.current = nextPartIdx;
        lastScrolledPartIdxRef.current = nextPartIdx;
        scrollToStreamPart(nextPartIdx);
      }

      streamRafRef.current = requestAnimationFrame(tick);
    };

    streamRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (streamRafRef.current) {
        cancelAnimationFrame(streamRafRef.current);
      }
    };
  }, [
    activeMode,
    streamState,
    selectedSong,
    activeStreamPartIdx,
    autoScrollPlay,
    getBeatsPerBar,
    playMetronomeClick,
    scrollToStreamPart,
    stopLiveStream
  ]);

  // Keyboard shortcuts in Play Mode (Space = Play/Pause, Up/Down = Previous/Next Section)
  useEffect(() => {
    if (activeMode !== 'play') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (streamState === 'stopped') {
          startLiveStream(activeStreamPartIdx);
        } else if (streamState === 'playing' || streamState === 'countdown') {
          pauseLiveStream();
        } else if (streamState === 'paused') {
          resumeLiveStream();
        }
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
        e.preventDefault();
        if (selectedSong && activeStreamPartIdx < selectedSong.parts.length - 1) {
          jumpToStreamPart(activeStreamPartIdx + 1);
        }
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
        e.preventDefault();
        if (activeStreamPartIdx > 0) {
          jumpToStreamPart(activeStreamPartIdx - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMode, streamState, activeStreamPartIdx, selectedSong, startLiveStream, pauseLiveStream, resumeLiveStream, jumpToStreamPart]);

  /* ==========================================================================
     SHARED WIDGET & LYRICS RENDERING HELPERS
     ========================================================================== */
  const renderWidgetIcon = (type: string) => {
    switch (type) {
      case 'fret_board': return <Sliders size={15} className="text-primary" style={{ color: 'var(--primary)' }} />;
      case 'note': return <AlignLeft size={15} className="text-secondary" style={{ color: 'var(--secondary)' }} />;
      case 'rhythm': return <Activity size={15} style={{ color: 'var(--accent-green)' }} />;
      case 'roman_numeral': return <Hash size={15} style={{ color: 'var(--accent-amber)' }} />;
      default: return <Disc size={15} />;
    }
  };

  const renderInteractiveWidget = (widget: Widget, isPlayModeFlag: boolean) => {
    const allSongWidgets = selectedSong?.widgets || [];
    switch (widget.widget_type) {
      case 'fret_board':
        return (
          <FretBoardWidget
            key={widget.id}
            widgetId={widget.id}
            initialData={widget.data}
            tuning={selectedSong?.tuning || 'Standard (EADG)'}
            songKey={selectedSong?.key_signature || 'C Major'}
            onSave={(data) => handleUpdateWidget(widget.id, data)}
            isPlayMode={isPlayModeFlag}
            allWidgets={allSongWidgets}
          />
        );
      case 'note':
        return (
          <NoteWidget
            key={widget.id}
            widgetId={widget.id}
            initialData={widget.data}
            onSave={(data) => handleUpdateWidget(widget.id, data)}
            isPlayMode={isPlayModeFlag}
          />
        );
      case 'rhythm':
        return (
          <RhythmWidget
            key={widget.id}
            widgetId={widget.id}
            initialData={widget.data}
            onSave={(data) => handleUpdateWidget(widget.id, data)}
            isPlayMode={isPlayModeFlag}
          />
        );
      case 'roman_numeral':
        return (
          <RomanNumeralWidget
            key={widget.id}
            widgetId={widget.id}
            initialData={widget.data}
            songKey={selectedSong?.key_signature || 'C Major'}
            onSave={(data) => handleUpdateWidget(widget.id, data)}
            isPlayMode={isPlayModeFlag}
            allWidgets={allSongWidgets}
          />
        );
      default:
        return null;
    }
  };

  // Renders section lyrics & chords in Play Mode (HFC Chords-Above-Words style, or Chords listed out if no words)
  // Widgets are ONLY shown when clicked on via the chords, inside a box matching the exact color of the chord box.
  const renderLiveSectionLyrics = (part: SongPart, isActivePart: boolean) => {
    const { hasWords, parsedLines, listedChords, chordGroups, slotToGroupMap, occurrenceByKey } = parsePartHfcData(part);
    const openTargets = playOpenChordTargetsByPart[part.id] || [];
    const allSongWidgets = selectedSong?.widgets || [];

    if (!hasWords && listedChords.length === 0) return null;

    const togglePlayChordTarget = (slotKey: string) => {
      const grp = slotToGroupMap[slotKey];
      const targetKey = grp ? grp.id : `SLOT:${slotKey}`;
      setPlayOpenChordTargetsByPart(prev => {
        const existing = prev[part.id] || [];
        const isAlreadyOpen = existing.includes(targetKey);
        const next = isAlreadyOpen
          ? existing.filter(k => k !== targetKey)
          : [...existing, targetKey];
        return { ...prev, [part.id]: next };
      });
    };

    const closePlayChordTarget = (targetKey: string) => {
      setPlayOpenChordTargetsByPart(prev => ({
        ...prev,
        [part.id]: (prev[part.id] || []).filter(k => k !== targetKey)
      }));
    };

    const activeLineIdx =
      hasWords && isActivePart && streamState === 'playing'
        ? Math.min(parsedLines.length - 1, Math.floor(partProgressRatio * parsedLines.length))
        : -1;

    return (
      <div
        className="hfc-chart-box"
        style={{
          fontSize: `${lyricFontSize}rem`,
          borderLeft: isActivePart ? '3px solid var(--accent-green)' : '3px solid rgba(6, 182, 212, 0.45)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasWords ? (
          parsedLines.map((lineCells, lIdx) => {
            const isCurrentLine = lIdx === activeLineIdx;
            const anyChordInLine = lineCells.some(c => !!c.chord);
            return (
              <div
                key={lIdx}
                className="hfc-line"
                style={{
                  background: isCurrentLine ? 'rgba(16, 185, 129, 0.14)' : 'transparent',
                  transition: 'all 0.18s ease'
                }}
              >
                {lineCells.map((cell, wIdx) => {
                  const chordName = cell.chord;
                  const slotKey = cell.slotKey;
                  const grp = slotToGroupMap[slotKey];
                  const palette = grp ? CHORD_GROUP_PALETTE[grp.colorIndex % CHORD_GROUP_PALETTE.length] : null;
                  const widgetCount = grp ? (grp.widget_ids || []).length : 0;
                  const targetKey = grp ? grp.id : `SLOT:${slotKey}`;
                  const isOpenInPlay = openTargets.includes(targetKey);
                  return (
                    <div key={wIdx} className="hfc-word-cell">
                      {anyChordInLine && (
                        <div className="hfc-chord-slot">
                          {chordName ? (
                            <button
                              type="button"
                              className={`hfc-chord-btn ${isOpenInPlay ? 'active' : ''} ${widgetCount > 0 ? 'has-widgets' : ''}`}
                              style={
                                palette
                                  ? {
                                      background: isOpenInPlay ? palette.badgeBg : palette.bg,
                                      border: `2px solid ${palette.border}`,
                                      color: '#ffffff',
                                      boxShadow: isOpenInPlay
                                        ? `0 0 14px ${palette.border}, 0 0 0 2px #ffffff`
                                        : `0 2px 6px rgba(0, 0, 0, 0.25)`
                                    }
                                  : undefined
                              }
                              onClick={() => togglePlayChordTarget(slotKey)}
                              title={
                                grp
                                  ? `Click to ${isOpenInPlay ? 'hide' : 'show'} Flow ${palette?.code} (${grp.label || chordName}) supporting widgets`
                                  : `Click ${chordName} to view supporting widgets`
                              }
                            >
                              <span>{chordName}</span>
                              {palette && (
                                <span
                                  style={{
                                    fontSize: '0.62rem',
                                    background: isOpenInPlay ? 'rgba(0,0,0,0.35)' : palette.badgeBg,
                                    color: '#fff',
                                    padding: '0 0.34rem',
                                    borderRadius: '999px',
                                    fontWeight: 800
                                  }}
                                >
                                  {palette.code}{widgetCount > 0 ? `•${widgetCount}` : ''}
                                </span>
                              )}
                            </button>
                          ) : null}
                        </div>
                      )}
                      {playVisibility.lyrics && cell.word && (
                        <span
                          className="hfc-word-text"
                          style={{
                            fontSize: `${lyricFontSize}rem`,
                            fontWeight: isCurrentLine ? 600 : 400,
                            color: isCurrentLine ? '#ffffff' : 'var(--text-main)'
                          }}
                        >
                          {cell.word}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        ) : (
          <div className="hfc-chords-only-row">
            {listedChords.map((chordName, cIdx) => {
              const slotKey = `LIST:${cIdx}`;
              const grp = slotToGroupMap[slotKey];
              const palette = grp ? CHORD_GROUP_PALETTE[grp.colorIndex % CHORD_GROUP_PALETTE.length] : null;
              const widgetCount = grp ? (grp.widget_ids || []).length : 0;
              const targetKey = grp ? grp.id : `SLOT:${slotKey}`;
              const isOpenInPlay = openTargets.includes(targetKey);
              return (
                <button
                  key={`${chordName}-${cIdx}`}
                  type="button"
                  className={`hfc-chord-card ${isOpenInPlay ? 'active' : ''} ${widgetCount > 0 ? 'has-widgets' : ''}`}
                  style={
                    palette
                      ? {
                          background: isOpenInPlay ? palette.badgeBg : palette.bg,
                          border: `2px solid ${palette.border}`,
                          color: '#ffffff',
                          boxShadow: isOpenInPlay
                            ? `0 0 14px ${palette.border}, 0 0 0 2px #ffffff`
                            : `0 2px 6px rgba(0, 0, 0, 0.25)`
                        }
                      : undefined
                  }
                  onClick={() => togglePlayChordTarget(slotKey)}
                >
                  <span>{chordName}</span>
                  {palette && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        background: isOpenInPlay ? 'rgba(0,0,0,0.35)' : palette.badgeBg,
                        color: '#fff',
                        padding: '0.04rem 0.38rem',
                        borderRadius: '999px',
                        fontWeight: 800
                      }}
                    >
                      {palette.code}{widgetCount > 0 ? `•${widgetCount}` : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Color-Matched Supporting Widget Boxes — ONLY shown when clicked via the chords */}
        {openTargets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.65rem' }}>
            {openTargets.map(targetKey => {
              if (targetKey.startsWith('SLOT:')) {
                const slotKey = targetKey.replace(/^SLOT:/, '');
                const occ = occurrenceByKey[slotKey];
                const chordTitle = occ ? occ.chord : slotKey;
                return (
                  <div
                    key={targetKey}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      background: 'rgba(6, 182, 212, 0.14)',
                      border: '2px solid rgba(6, 182, 212, 0.5)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span style={{ fontSize: '0.84rem', color: '#cffafe' }}>
                      No supporting Teach Mode widgets are linked to <strong>{chordTitle}</strong> yet.
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.73rem' }}
                        onClick={() => {
                          setExpandedEditParts(prev => ({ ...prev, [part.id]: true }));
                          handleChordSlotClick(part, slotKey);
                          handleSwitchMode('edit');
                        }}
                      >
                        <Edit3 size={12} /> Link Widgets in Edit Mode
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.73rem' }}
                        onClick={() => closePlayChordTarget(targetKey)}
                      >
                        Close ✕
                      </button>
                    </div>
                  </div>
                );
              }

              const activeGrp = chordGroups.find(g => g.id === targetKey);
              if (!activeGrp) return null;

              const palette = CHORD_GROUP_PALETTE[activeGrp.colorIndex % CHORD_GROUP_PALETTE.length];
              const groupLabel =
                activeGrp.label || buildDefaultGroupLabel(activeGrp.chord_keys, occurrenceByKey);
              const groupOccurrences = activeGrp.chord_keys
                .map(k => occurrenceByKey[k])
                .filter((o): o is HfcChordOccurrence => !!o);
              const cWidgets = (activeGrp.widget_ids || [])
                .map(id => allSongWidgets.find(w => w.id === id))
                .filter((w): w is Widget => !!w && playVisibility[w.widget_type]);

              return (
                <div
                  key={activeGrp.id}
                  style={{
                    background: `linear-gradient(180deg, ${palette.bg}, rgba(10, 14, 24, 0.92))`,
                    border: `2.5px solid ${palette.border}`,
                    borderRadius: '10px',
                    padding: '0.9rem 1.05rem',
                    boxShadow: `0 8px 24px rgba(0, 0, 0, 0.45), 0 0 14px ${palette.bg}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  {/* Color-Matched Header Bar matching the Chord Box */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      paddingBottom: '0.5rem',
                      borderBottom: `1px solid ${palette.border}`
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '0.22rem 0.65rem',
                          borderRadius: '6px',
                          background: palette.badgeBg,
                          border: `2px solid ${palette.border}`,
                          color: '#ffffff',
                          fontWeight: 800,
                          fontSize: '0.86rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <span
                          style={{
                            background: 'rgba(0,0,0,0.32)',
                            color: '#fff',
                            padding: '0.02rem 0.36rem',
                            borderRadius: '999px',
                            fontSize: '0.7rem'
                          }}
                        >
                          Flow {palette.code}
                        </span>
                        <span>{groupLabel}</span>
                      </span>

                      {groupOccurrences.map(occ => (
                        <span
                          key={occ.slotKey}
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.12rem 0.48rem',
                            borderRadius: '6px',
                            background: palette.bg,
                            border: `1.5px solid ${palette.border}`,
                            color: '#ffffff'
                          }}
                        >
                          {occ.chord}{occ.lineIdx >= 0 ? ` (L${occ.lineIdx + 1}: ${occ.word || 'line'})` : ''}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{
                        padding: '0.2rem 0.55rem',
                        fontSize: '0.73rem',
                        borderColor: palette.border,
                        color: palette.text
                      }}
                      onClick={() => closePlayChordTarget(activeGrp.id)}
                    >
                      Close ✕
                    </button>
                  </div>

                  {/* Supporting Widgets inside the Color-Matched Chord Box */}
                  {cWidgets.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: palette.text, fontStyle: 'italic' }}>
                      No visible Teach Mode widgets linked to <strong>{groupLabel}</strong>.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {cWidgets.map(w => (
                        <div
                          key={`${part.id}-${activeGrp.id}-${w.id}`}
                          style={{
                            padding: '0.85rem 1rem',
                            borderRadius: '8px',
                            background: 'rgba(10, 14, 24, 0.88)',
                            border: `1.5px solid ${palette.border}`,
                            borderLeft: `5px solid ${palette.border}`
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '0.5rem',
                              marginBottom: '0.55rem',
                              paddingBottom: '0.4rem',
                              borderBottom: '1px solid rgba(255,255,255,0.07)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>
                              {renderWidgetIcon(w.widget_type)}
                              <span>{getWidgetDefaultTitle(w)}</span>
                            </div>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '0.1rem 0.48rem',
                                borderRadius: '6px',
                                background: palette.bg,
                                border: `1px solid ${palette.border}`,
                                color: palette.text
                              }}
                            >
                              Supports {groupLabel}
                            </span>
                          </div>
                          {renderInteractiveWidget(w, true)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSongItem = (song: Song) => (
    <div
      key={song.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', song.id);
        setDraggingSongId(song.id);
      }}
      onDragEnd={() => {
        setDraggingSongId(null);
        setDragOverFolderId(null);
      }}
      className={`song-item ${selectedSong?.id === song.id ? 'active' : ''} ${draggingSongId === song.id ? 'dragging' : ''}`}
      onClick={() => fetchSongDetails(song.id)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="song-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {song.title}
          </div>
          <div className="song-artist" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {song.artist}
          </div>
        </div>
        <button 
          className="folder-btn" 
          onClick={(e) => handleDeleteSong(song.id, e)}
          title="Delete Song"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="song-meta-badges">
        <span className="badge badge-primary">{song.tuning}</span>
        <span className="badge badge-secondary">{song.key_signature}</span>
      </div>
    </div>
  );

  // Compute total bars and estimated duration for Edit/Play mode
  const totalSongBars = selectedSong?.parts.reduce((acc, p) => acc + (p.bars || 4), 0) || 0;
  const beatsPerBar = getBeatsPerBar();
  const estimatedSeconds = selectedSong
    ? Math.round((totalSongBars * beatsPerBar * 60) / Math.max(30, selectedSong.tempo || 120))
    : 0;
  const formattedEstimatedDuration = `${Math.floor(estimatedSeconds / 60)}:${String(estimatedSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="dashboard-container">
      {/* ====================================================================
         LEFT SIDEBAR: SONG DIRECTORY, FOLDERS & BACKUP/RESTORE
         ==================================================================== */}
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Disc size={28} color="var(--primary)" />
            <h1>BassFret</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
            <button 
              className="btn btn-primary" 
              style={{ flex: 1, justifyContent: 'center', padding: '0.55rem 0.75rem' }} 
              onClick={() => setIsNewSongModalOpen(true)}
              title="Add New Song"
            >
              <Plus size={16} /> Add Song
            </button>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.55rem 0.75rem' }} 
              onClick={() => setIsNewFolderModalOpen(true)}
              title="Create New Folder"
            >
              <FolderIcon size={16} />
            </button>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-dim)' }} />
            <input 
              type="text"
              className="input-field"
              placeholder="Search songs or artists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.2rem', paddingRight: '0.75rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div className="song-list-scroll">
          {loading ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading songs...</div>
          ) : songs.length === 0 && folders.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              No songs in library. Click "+ Add Song" above or "Restore" below!
            </div>
          ) : (
            (() => {
              const filteredSongs = songs.filter(s => 
                s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.artist.toLowerCase().includes(searchQuery.toLowerCase())
              );

              return (
                <>
                  {/* Folders List */}
                  {folders.map(folder => {
                    const folderSongs = filteredSongs.filter(s => s.folder_id === folder.id);
                    if (searchQuery && folderSongs.length === 0) return null;
                    const isExpanded = searchQuery ? true : !!expandedFolders[folder.id];

                    return (
                      <div 
                        key={folder.id} 
                        className={`folder-group ${dragOverFolderId === folder.id ? 'drag-over' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverFolderId(folder.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverFolderId(null);
                          const draggedSongId = e.dataTransfer.getData('text/plain');
                          if (draggedSongId) {
                            handleMoveSongToFolder(draggedSongId, folder.id);
                          }
                        }}
                      >
                        <div 
                          className="folder-header"
                          onClick={() => setExpandedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] }))}
                        >
                          <div className="folder-header-left">
                            {isExpanded ? <ChevronDown size={14} color="var(--text-dim)" /> : <ChevronRight size={14} color="var(--text-dim)" />}
                            {isExpanded ? <FolderOpen size={16} color="var(--primary)" /> : <FolderIcon size={16} color="var(--primary)" />}
                            
                            {editingFolderId === folder.id ? (
                              <input 
                                type="text"
                                className="input-field"
                                value={editingFolderName}
                                onChange={(e) => setEditingFolderName(e.target.value)}
                                onBlur={() => handleRenameFolder(folder.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameFolder(folder.id);
                                  if (e.key === 'Escape') setEditingFolderId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                                style={{ padding: '0.1rem 0.4rem', fontSize: '0.8rem', height: '24px' }}
                              />
                            ) : (
                              <span className="folder-title">
                                {folder.name}
                              </span>
                            )}
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                              ({folderSongs.length})
                            </span>
                          </div>

                          <div className="folder-actions">
                            <button 
                              className="folder-btn" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFolderId(folder.id);
                                setEditingFolderName(folder.name);
                              }}
                              title="Rename Folder"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button 
                              className="folder-btn" 
                              onClick={(e) => handleDeleteFolder(folder.id, e)}
                              title="Delete Folder"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="folder-songs-list">
                            {folderSongs.length === 0 ? (
                              <div style={{ padding: '0.4rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                Drag songs here
                              </div>
                            ) : (
                              folderSongs.map(song => renderSongItem(song))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Uncategorized Songs */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverFolderId('uncategorized');
                    }}
                    onDragLeave={() => {
                      if (dragOverFolderId === 'uncategorized') setDragOverFolderId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverFolderId(null);
                      const draggedSongId = e.dataTransfer.getData('text/plain');
                      if (draggedSongId) {
                        handleMoveSongToFolder(draggedSongId, null);
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      borderRadius: 'var(--radius-md)',
                      border: dragOverFolderId === 'uncategorized' ? '1px dashed var(--primary)' : '1px solid transparent',
                      background: dragOverFolderId === 'uncategorized' ? 'rgba(99, 102, 241, 0.06)' : 'transparent',
                      transition: 'all 0.15s ease',
                      paddingTop: folders.length > 0 ? '0.25rem' : 0
                    }}
                  >
                    {folders.length > 0 && (
                      <div style={{ padding: '0.35rem 0.4rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Uncategorized
                      </div>
                    )}
                    {filteredSongs.filter(s => !s.folder_id).map(song => renderSongItem(song))}
                  </div>
                </>
              );
            })()
          )}
        </div>

        {/* Database Backup & Restore Footer anchored at bottom of Left Nav */}
        <div
          className="sidebar-footer"
          style={{
            marginTop: 'auto',
            padding: '0.9rem 1rem',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            background: 'rgba(10, 12, 20, 0.9)'
          }}
        >
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Database Backup & Restore
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="btn btn-secondary" 
              style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem 0.6rem' }}
              onClick={handleBackup}
              title="Export all folders, songs, parts, and widgets to a JSON backup file"
            >
              <Download size={14} /> Backup
            </button>
            <button 
              className="btn btn-secondary" 
              style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem 0.6rem' }}
              onClick={handleRestoreTrigger}
              title="Import a JSON backup file (supports both pre-change prod backups and new backups)"
            >
              <Upload size={14} /> Restore
            </button>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            accept=".json" 
            onChange={handleRestoreFile} 
          />
        </div>
      </aside>

      {/* ====================================================================
         MAIN WORKBENCH AREA
         ==================================================================== */}
      <main className="workbench">
        {selectedSong ? (
          <>
            {/* Top Song Info & 3-Mode Switcher Header (Frozen at Top) */}
            <header className="workbench-header">
              <div className="workbench-header-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    style={{ padding: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={isSidebarCollapsed ? "Expand Song Library Sidebar" : "Collapse Song Library Sidebar"}
                  >
                    {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                  </button>
                  <div className="song-info-panel">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <h2>{selectedSong.title}</h2>
                      {activeMode !== 'play' && (
                        <button 
                          className="btn-icon" 
                          onClick={openEditSongModal}
                          title="Edit Song Metadata (Title, Artist, Tuning, Key, BPM, Time Signature, Folder)"
                        >
                          <Edit3 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="song-meta-badges" style={{ marginTop: '0.35rem' }}>
                      <span className="badge">{selectedSong.artist}</span>
                      <span className="badge badge-primary">🎸 {selectedSong.tuning}</span>
                      <span className="badge badge-secondary">🎵 Key: {selectedSong.key_signature}</span>
                      <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                        ⏱ {selectedSong.tempo || 120} BPM • {selectedSong.time_signature || '4/4'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3-Mode Segmented Switcher: Teach Mode | Edit Mode | Play Mode */}
                <div className="mode-segmented-control">
                  <button
                    onClick={() => handleSwitchMode('teach')}
                    className={`mode-segment-btn ${activeMode === 'teach' ? 'active-teach' : ''}`}
                    title="Teach Mode: Create and practice raw lesson widgets in one unified section"
                  >
                    <BookOpen size={14} /> Teach Mode
                  </button>
                  <button
                    onClick={() => handleSwitchMode('edit')}
                    className={`mode-segment-btn ${activeMode === 'edit' ? 'active-edit' : ''}`}
                    title="Edit Mode: Construct the song through sections, link Teach Mode widgets, and add lyrics"
                  >
                    <Layers size={14} /> Edit Mode
                  </button>
                  <button
                    onClick={() => handleSwitchMode('play')}
                    className={`mode-segment-btn ${activeMode === 'play' ? 'active-play' : ''}`}
                    title="Play Mode: Stream the constructed song live from top to bottom"
                  >
                    <Eye size={14} /> Play Mode
                  </button>
                </div>
              </div>

              {/* Frozen Second Row in Top Header for Teach Mode: Add Lesson Widget + Filter Pills */}
              {activeMode === 'teach' && (
                <div className="teach-frozen-toolbar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem' }}>
                      + Add Widget:
                    </span>
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleAddTeachWidget('fret_board')}>
                      <Sliders size={14} style={{ color: 'var(--primary)' }} /> Fret Board Graph
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleAddTeachWidget('roman_numeral')}>
                      <Hash size={14} style={{ color: 'var(--accent-amber)' }} /> Roman Chord Map
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleAddTeachWidget('rhythm')}>
                      <Activity size={14} style={{ color: 'var(--accent-green)' }} /> Rhythm Sequencer
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleAddTeachWidget('note')}>
                      <AlignLeft size={14} style={{ color: 'var(--secondary)' }} /> Notes Notepad
                    </button>
                  </div>

                  {/* Filter pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.18)', color: '#a5b4fc', marginRight: '0.25rem' }}>
                      {selectedSong.widgets.length} {selectedSong.widgets.length === 1 ? 'widget' : 'widgets'}
                    </span>
                    {(['all', 'fret_board', 'roman_numeral', 'rhythm', 'note'] as const).map(filterKey => (
                      <button
                        key={filterKey}
                        className={`btn ${teachWidgetFilter === filterKey ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.73rem' }}
                        onClick={() => setTeachWidgetFilter(filterKey)}
                      >
                        {filterKey === 'all' && 'All'}
                        {filterKey === 'fret_board' && 'Fret Boards'}
                        {filterKey === 'roman_numeral' && 'Chord Maps'}
                        {filterKey === 'rhythm' && 'Rhythms'}
                        {filterKey === 'note' && 'Notes'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </header>

            {/* ================================================================
               MODE 1: TEACH MODE (UNIFIED LESSON WIDGET WORKBENCH, NO SONG PARTS)
               ================================================================ */}
            {activeMode === 'teach' && (
              <div className="workbench-content" ref={workbenchContentRef}>

                {/* Unified Lesson Widgets Stack */}
                {(() => {
                  const filteredWidgets = teachWidgetFilter === 'all'
                    ? selectedSong.widgets
                    : selectedSong.widgets.filter(w => w.widget_type === teachWidgetFilter);

                  if (filteredWidgets.length === 0) {
                    return (
                      <div className="empty-state">
                        <div className="empty-state-icon">
                          <Sliders size={28} />
                        </div>
                        <h3>No Lesson Widgets Yet</h3>
                        <p style={{ maxWidth: '460px' }}>
                          Add a Fret Board Graph, Roman Chord Map, Rhythm Sequencer, or Notes Notepad below to start building your lesson blocks for <strong>{selectedSong.title}</strong>.
                        </p>
                      </div>
                    );
                  }

                  return filteredWidgets.map((widget, index) => {
                    // Find which Song Parts & Chord Flows in Edit Mode currently link to this widget
                    const linkedBadges: { key: string; text: string }[] = [];
                    selectedSong.parts.forEach(p => {
                      const partName = p.label || p.part_type;
                      const groups = parsePartHfcData(p).chordGroups;
                      const matchingGroups = groups
                        .filter(g => Array.isArray(g.widget_ids) && g.widget_ids.includes(widget.id))
                        .map(g => g.label || 'Chord Flow');
                      if (matchingGroups.length > 0) {
                        linkedBadges.push({
                          key: `${p.id}-groups`,
                          text: `${partName} (${matchingGroups.join(', ')})`
                        });
                      } else if (Array.isArray(p.linked_widget_ids) && p.linked_widget_ids.includes(widget.id)) {
                        linkedBadges.push({
                          key: p.id,
                          text: partName
                        });
                      }
                    });

                    return (
                      <div
                        key={widget.id}
                        id={`widget-${widget.id}`}
                        className="glass-card widget-card"
                      >
                        <div className="widget-header">
                          <div className="widget-title" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
                            {renderWidgetIcon(widget.widget_type)}
                            {editingWidgetId === widget.id ? (
                              <input
                                type="text"
                                className="input-field"
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.85rem', width: '220px' }}
                                value={editingWidgetTitle}
                                onChange={(e) => setEditingWidgetTitle(e.target.value)}
                                onBlur={() => handleRenameWidget(widget.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameWidget(widget.id);
                                  if (e.key === 'Escape') setEditingWidgetId(null);
                                }}
                                autoFocus
                              />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span>{getWidgetDefaultTitle(widget)}</span>
                                <button
                                  className="btn-icon"
                                  style={{ padding: '0.15rem', opacity: 0.6 }}
                                  onClick={() => {
                                    setEditingWidgetId(widget.id);
                                    setEditingWidgetTitle(widget.data?.title || '');
                                  }}
                                  title="Rename Widget (helps identify it when linking in Edit Mode)"
                                >
                                  <Edit3 size={12} />
                                </button>
                              </div>
                            )}

                            {/* Badges showing which Song Parts & Chords use this widget */}
                            {linkedBadges.length > 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Linked in:</span>
                                {linkedBadges.map(b => (
                                  <span
                                    key={b.key}
                                    style={{
                                      fontSize: '0.68rem',
                                      padding: '0.12rem 0.45rem',
                                      borderRadius: '999px',
                                      background: 'rgba(6, 182, 212, 0.14)',
                                      border: '1px solid rgba(6, 182, 212, 0.3)',
                                      color: '#67e8f9',
                                      fontWeight: 600
                                    }}
                                  >
                                    {b.text}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                Not linked to a chord/part yet
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <button
                              className="btn-icon"
                              onClick={() => handleMoveTeachWidget(index, 'up', filteredWidgets)}
                              disabled={index === 0}
                              title="Move Widget Up"
                              style={{ opacity: index === 0 ? 0.25 : 1, cursor: index === 0 ? 'default' : 'pointer' }}
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              className="btn-icon"
                              onClick={() => handleMoveTeachWidget(index, 'down', filteredWidgets)}
                              disabled={index === filteredWidgets.length - 1}
                              title="Move Widget Down"
                              style={{ opacity: index === filteredWidgets.length - 1 ? 0.25 : 1, cursor: index === filteredWidgets.length - 1 ? 'default' : 'pointer' }}
                            >
                              <ArrowDown size={15} />
                            </button>
                            <button
                              className="btn-icon"
                              onClick={() => handleDeleteWidget(widget.id)}
                              title="Delete Widget"
                              style={{ marginLeft: '0.25rem' }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {renderInteractiveWidget(widget, false)}
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* ================================================================
               MODE 2: EDIT MODE (SONG STRUCTURE, COLLAPSIBLE PARTS, HFC CHORDS & CLICKABLE CHORD WIDGETS)
               ================================================================ */}
            {activeMode === 'edit' && (
              <div className="workbench-content" ref={workbenchContentRef}>
                {/* Song Arrangement & Section Builder Top Panel */}
                <div
                  className="glass-card"
                  style={{
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(99, 102, 241, 0.05))',
                    borderColor: 'rgba(6, 182, 212, 0.25)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <Layers size={18} style={{ color: 'var(--secondary)' }} />
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                          Edit Mode — Song Structure ({selectedSong.parts.length} {selectedSong.parts.length === 1 ? 'Part' : 'Parts'})
                        </h3>
                        <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.18)', color: '#67e8f9' }}>
                          {totalSongBars} bars (~{formattedEstimatedDuration})
                        </span>
                        {selectedSong.parts.length > 0 && (
                          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                              onClick={() => {
                                const allExpanded: Record<string, boolean> = {};
                                selectedSong.parts.forEach(p => { allExpanded[p.id] = true; });
                                setExpandedEditParts(allExpanded);
                              }}
                            >
                              Expand All
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                              onClick={() => setExpandedEditParts({})}
                            >
                              Collapse All
                            </button>
                          </div>
                        )}
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Click any song part below (<strong>Intro, Verse 1, Chorus, etc.</strong>) to expand its lyrics &amp; chords. Click any <strong>Chord</strong> to open a section where you can add widgets from <strong>Teach Mode</strong>.
                      </p>
                    </div>

                    {/* Song Timing Controls + Lyrics & Structure Tooling Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(0,0,0,0.25)', padding: '0.35rem 0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Clock size={14} style={{ color: 'var(--accent-green)' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>BPM:</span>
                        <input
                          type="number"
                          min={30}
                          max={300}
                          value={selectedSong.tempo || 120}
                          onChange={(e) => handleQuickUpdateSongField({ tempo: Math.max(30, parseInt(e.target.value, 10) || 120) })}
                          className="input-field"
                          style={{ width: '64px', padding: '0.2rem 0.4rem', fontSize: '0.8rem', textAlign: 'center' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>Time:</span>
                        <select
                          value={selectedSong.time_signature || '4/4'}
                          onChange={(e) => handleQuickUpdateSongField({ time_signature: e.target.value })}
                          className="input-field"
                          style={{ width: '72px', padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                        >
                          {TIME_SIGNATURES.map(ts => <option key={ts} value={ts}>{ts}</option>)}
                        </select>
                      </div>

                      <button
                        className="btn btn-primary"
                        onClick={openLyricsToolModal}
                        style={{ background: 'linear-gradient(135deg, #06b6d4, #6366f1)', boxShadow: '0 2px 12px rgba(6, 182, 212, 0.35)' }}
                      >
                        <Sparkles size={15} /> Lyrics & Auto-Section Tool
                      </button>
                    </div>
                  </div>

                  {/* Add Song Part Controls Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      flexWrap: 'wrap',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid rgba(255,255,255,0.06)'
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      + Add Section:
                    </span>
                    <select
                      className="input-field"
                      style={{ width: '135px', padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}
                      value={newPartType}
                      onChange={(e) => setNewPartType(e.target.value)}
                    >
                      {PART_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="input-field"
                      placeholder={`Label (e.g. ${generateSmartPartLabel(newPartType, selectedSong.parts)})`}
                      value={newPartLabel}
                      onChange={(e) => setNewPartLabel(e.target.value)}
                      style={{ width: '185px', padding: '0.4rem 0.65rem', fontSize: '0.82rem' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Bars:</span>
                      <input
                        type="number"
                        min={1}
                        max={128}
                        value={newPartBars}
                        onChange={(e) => setNewPartBars(Math.max(1, parseInt(e.target.value, 10) || 4))}
                        className="input-field"
                        style={{ width: '62px', padding: '0.4rem 0.5rem', fontSize: '0.82rem', textAlign: 'center' }}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleAddPart()}
                      style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
                    >
                      <Plus size={15} /> Add Song Part
                    </button>

                    {/* Quick 1-Click Section Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Quick Add:</span>
                      {(['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'] as const).map(qType => (
                        <button
                          key={qType}
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.74rem' }}
                          onClick={() => handleAddPart(qType, '', qType === 'Intro' || qType === 'Outro' ? 4 : 8)}
                        >
                          + {qType}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Visual Song Structure Timeline Strip */}
                  {selectedSong.parts.length > 0 && (
                    <div className="structure-timeline">
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginRight: '0.25rem' }}>
                        Song Map:
                      </span>
                      {selectedSong.parts.map((part, idx) => {
                        const isPartExpanded = !!expandedEditParts[part.id];
                        return (
                          <React.Fragment key={part.id}>
                            <button
                              className={`timeline-pill ${isPartExpanded ? 'active' : ''}`}
                              onClick={() => {
                                setExpandedEditParts(prev => ({ ...prev, [part.id]: !prev[part.id] }));
                                setTimeout(() => {
                                  const el = document.getElementById(`edit-part-${part.id}`);
                                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 50);
                              }}
                              title="Click to expand/collapse and scroll to this section"
                            >
                              <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>#{idx + 1}</span>
                              <span>{part.label || part.part_type}</span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>({part.bars || 4}b)</span>
                            </button>
                            {idx < selectedSong.parts.length - 1 && (
                              <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>→</span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Chronological Collapsible Song Part Cards in Edit Mode */}
                {selectedSong.parts.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <Layers size={28} />
                    </div>
                    <h3>Construct Your Song Structure</h3>
                    <p style={{ maxWidth: '500px' }}>
                      Add sections above (e.g. <strong>Intro → Verse 1 → Chorus → Verse 2 → Chorus → Outro</strong>) or use the <strong>Lyrics &amp; Auto-Section Tool</strong> to fetch lyrics and build your song structure automatically.
                    </p>
                  </div>
                ) : (
                  selectedSong.parts.map((part, partIdx) => {
                    // Collapsed by default! Only expands when clicked.
                    const isExpanded = !!expandedEditParts[part.id];
                    const {
                      hasWords,
                      parsedLines,
                      listedChords,
                      uniqueChords,
                      chordGroups,
                      slotToGroupMap,
                      allOccurrences,
                      occurrenceByKey
                    } = parsePartHfcData(part);
                    const currentSel = chordSelectionByPart[part.id] || null;
                    const isEditingRawLyrics = !!editingLyricsPartIds[part.id];
                    const suggestedChords = getSuggestedChordsForSong();

                    // Count total manually linked Teach Mode widgets across all chord flow groups in this part
                    const totalChordWidgetsCount = chordGroups.reduce(
                      (acc, g) => acc + (Array.isArray(g.widget_ids) ? g.widget_ids.length : 0),
                      0
                    );

                    return (
                      <div
                        key={part.id}
                        id={`edit-part-${part.id}`}
                        className={`edit-part-card ${isExpanded ? '' : 'collapsed'}`}
                      >
                        {/* Clickable Song Part Header Row (Click anywhere on header to Expand / Collapse) */}
                        <div
                          className="edit-part-header-row"
                          onClick={() => setExpandedEditParts(prev => ({ ...prev, [part.id]: !prev[part.id] }))}
                          title={isExpanded ? 'Click to collapse song part' : 'Click to expand song part details'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                            {/* Expand/Collapse Chevron Indicator */}
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '24px',
                                height: '24px',
                                borderRadius: '6px',
                                background: isExpanded ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.05)',
                                color: isExpanded ? '#67e8f9' : 'var(--text-muted)'
                              }}
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>

                            <span
                              style={{
                                background: 'rgba(6, 182, 212, 0.16)',
                                border: '1px solid rgba(6, 182, 212, 0.35)',
                                color: '#67e8f9',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                padding: '0.2rem 0.55rem',
                                borderRadius: 'var(--radius-sm)'
                              }}
                            >
                              #{partIdx + 1}
                            </span>

                            {/*Editable Custom Section Label (e.g. Intro, Verse 1, Chorus 1) */}
                            {editingPartLabelId === part.id ? (
                              <input
                                type="text"
                                className="input-field"
                                value={editingPartLabelValue}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setEditingPartLabelValue(e.target.value)}
                                onBlur={() => {
                                  setEditingPartLabelId(null);
                                  handleUpdatePart(part.id, { label: editingPartLabelValue.trim() || part.part_type });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setEditingPartLabelId(null);
                                    handleUpdatePart(part.id, { label: editingPartLabelValue.trim() || part.part_type });
                                  }
                                  if (e.key === 'Escape') setEditingPartLabelId(null);
                                }}
                                autoFocus
                                style={{ width: '180px', padding: '0.25rem 0.5rem', fontSize: '0.95rem', fontWeight: 700 }}
                              />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                  {part.label || part.part_type}
                                </h4>
                                <button
                                  type="button"
                                  className="btn-icon"
                                  style={{ padding: '0.15rem', opacity: 0.65 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPartLabelId(part.id);
                                    setEditingPartLabelValue(part.label || part.part_type);
                                  }}
                                  title="Rename section (e.g. Intro, Verse 1, Chorus)"
                                >
                                  <Edit3 size={12} />
                                </button>
                              </div>
                            )}

                            {/* Part Type Selector */}
                            <select
                              value={part.part_type}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleUpdatePart(part.id, { part_type: e.target.value })}
                              className="input-field"
                              style={{ width: '115px', padding: '0.2rem 0.45rem', fontSize: '0.76rem', fontWeight: 600 }}
                            >
                              {PART_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                            </select>

                            {/* Bars Stepper */}
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0.12rem 0.4rem'
                              }}
                              title="Number of bars/measures for this section"
                            >
                              <button
                                type="button"
                                className="btn-icon"
                                style={{ padding: '0.05rem 0.25rem', fontSize: '0.82rem' }}
                                onClick={() => handleUpdatePart(part.id, { bars: Math.max(1, (part.bars || 4) - 1) })}
                              >
                                -
                              </button>
                              <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--accent-amber)', minWidth: '44px', textAlign: 'center' }}>
                                {part.bars || 4} bars
                              </span>
                              <button
                                type="button"
                                className="btn-icon"
                                style={{ padding: '0.05rem 0.25rem', fontSize: '0.82rem' }}
                                onClick={() => handleUpdatePart(part.id, { bars: (part.bars || 4) + 1 })}
                              >
                                +
                              </button>
                            </div>

                            {/* Summary pills of Chords & Linked Teach Widgets when collapsed */}
                            {uniqueChords.length > 0 && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {uniqueChords.slice(0, 6).map(c => (
                                  <span
                                    key={c}
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      padding: '0.1rem 0.42rem',
                                      borderRadius: '5px',
                                      background: 'rgba(6, 182, 212, 0.14)',
                                      border: '1px solid rgba(6, 182, 212, 0.35)',
                                      color: '#67e8f9'
                                    }}
                                  >
                                    {c}
                                  </span>
                                ))}
                                {uniqueChords.length > 6 && (
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>+{uniqueChords.length - 6}</span>
                                )}
                              </div>
                            )}

                            {totalChordWidgetsCount > 0 && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  padding: '0.12rem 0.48rem',
                                  borderRadius: '999px',
                                  background: 'rgba(16, 185, 129, 0.16)',
                                  border: '1px solid rgba(16, 185, 129, 0.35)',
                                  color: '#6ee7b7'
                                }}
                              >
                                {totalChordWidgetsCount} {totalChordWidgetsCount === 1 ? 'widget' : 'widgets'}
                              </span>
                            )}

                            {savedPartFeedbackId === part.id && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--accent-green)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                                <Check size={13} /> Saved
                              </span>
                            )}
                          </div>

                          {/* Part Actions: Repeat, Reorder Up/Down, Expand/Collapse, Delete */}
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.28rem 0.55rem', fontSize: '0.74rem' }}
                              onClick={() => handleRepeatPart(part)}
                              title="Repeat/Clone this section at the end of the song"
                            >
                              <Repeat size={13} style={{ color: 'var(--secondary)' }} /> Repeat
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => handleMovePart(partIdx, 'up')}
                              disabled={partIdx === 0}
                              title="Move Section Earlier"
                              style={{ opacity: partIdx === 0 ? 0.25 : 1 }}
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => handleMovePart(partIdx, 'down')}
                              disabled={partIdx === selectedSong.parts.length - 1}
                              title="Move Section Later"
                              style={{ opacity: partIdx === selectedSong.parts.length - 1 ? 0.25 : 1 }}
                            >
                              <ArrowDown size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => handleDeletePart(part.id)}
                              title="Remove Section from Song"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* EXPANDED SONG PART DETAILS */}
                        {isExpanded && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                            {/* 1. HFC LYRICS & CHORDS CHART SECTION */}
                            <div className="hfc-chart-box">
                              {/* Chart Toolbar: Add Chords + Toggle Lyrics Editor */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', paddingBottom: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <FileText size={14} style={{ color: 'var(--secondary)' }} />
                                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#67e8f9', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {hasWords ? 'Lyrics & Chords Above Words (HFC Style)' : 'Section Chords (No Lyrics in this Section)'}
                                  </span>
                                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                    {hasWords
                                      ? '• Click any Chord to add Teach Mode widgets, or click any word to place a chord above it'
                                      : '• Click any Chord below to open its Teach Mode widget section'}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                  {/* Quick Add Chord Input */}
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <input
                                      type="text"
                                      className="input-field"
                                      placeholder="Add chord(s) e.g. G C D"
                                      value={newChordInputByPart[part.id] || ''}
                                      onChange={(e) => setNewChordInputByPart(prev => ({ ...prev, [part.id]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleAddChordsToPartList(part, newChordInputByPart[part.id] || '');
                                        }
                                      }}
                                      style={{ width: '145px', padding: '0.25rem 0.5rem', fontSize: '0.76rem' }}
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem' }}
                                      onClick={() => handleAddChordsToPartList(part, newChordInputByPart[part.id] || '')}
                                    >
                                      <Plus size={12} /> Add Chord
                                    </button>
                                  </div>

                                  {hasWords && uniqueChords.length === 0 && (
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.74rem', background: 'linear-gradient(135deg, #06b6d4, #6366f1)' }}
                                      onClick={() => {
                                        const withChords = injectFallbackChordsIntoPlainLyrics(part.lyrics || '');
                                        setPartLyricsDrafts(prev => ({ ...prev, [part.id]: withChords }));
                                        handleUpdatePart(part.id, { lyrics: withChords });
                                      }}
                                      title="Automatically place chords above the words in this section"
                                    >
                                      <Sparkles size={12} /> Auto-Place Chords Above Words
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className={`btn ${isEditingRawLyrics ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem' }}
                                    onClick={() => setEditingLyricsPartIds(prev => ({ ...prev, [part.id]: !prev[part.id] }))}
                                  >
                                    <Edit3 size={12} /> {isEditingRawLyrics ? 'Done Editing Text' : 'Edit Lyrics / Chords Text'}
                                  </button>
                                </div>
                              </div>

                              {/* Quick 1-Click Diatonic Chords Bar (especially handy for sections with no words or quick chord entry) */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginRight: '0.15rem' }}>
                                  Quick Add Chord ({selectedSong.key_signature || 'C Major'}):
                                </span>
                                {suggestedChords.map(sc => (
                                  <button
                                    key={sc}
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: 700, color: '#67e8f9' }}
                                    onClick={() => handleAddChordsToPartList(part, sc)}
                                    title={`Add ${sc} chord to this section`}
                                  >
                                    + {sc}
                                  </button>
                                ))}
                              </div>

                              {/* Optional Raw Textarea Editor for pasting/editing lyrics or chords */}
                              {isEditingRawLyrics && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.65rem', background: 'rgba(0,0,0,0.28)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(6, 182, 212, 0.25)' }}>
                                  <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                    Paste or type lyrics below. You can place chords inline like <code style={{ color: '#67e8f9' }}>[G]Money [C]get away</code> OR paste standard chord-over-word lines (chords on one line, words underneath)—both automatically display with clickable chords above words!
                                  </span>
                                  <textarea
                                    className="input-field"
                                    rows={4}
                                    placeholder="Enter lyrics for this section (or leave blank if this section has no words and only chords)..."
                                    value={partLyricsDrafts[part.id] ?? part.lyrics ?? ''}
                                    onChange={(e) => setPartLyricsDrafts(prev => ({ ...prev, [part.id]: e.target.value }))}
                                    onBlur={() => {
                                      const rawDraft = partLyricsDrafts[part.id] ?? '';
                                      const normalizedDraft = normalizeLyricsToInlineBracketChords(rawDraft);
                                      if (normalizedDraft !== rawDraft) {
                                        setPartLyricsDrafts(prev => ({ ...prev, [part.id]: normalizedDraft }));
                                      }
                                      if (normalizedDraft !== (part.lyrics || '')) {
                                        handleUpdatePart(part.id, { lyrics: normalizedDraft }, true);
                                      }
                                    }}
                                    style={{ fontFamily: 'monospace', fontSize: '0.84rem', lineHeight: 1.5, resize: 'vertical' }}
                                  />
                                </div>
                              )}

                              {/* Saved Chord Flow Groups Bar (when any chord instances have linked Teach Mode widgets) */}
                              {chordGroups.length > 0 && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '0.5rem',
                                    padding: '0.5rem 0.7rem',
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(15, 23, 42, 0.7)',
                                    border: '1px solid rgba(255,255,255,0.08)'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                      Linked Chord Flows:
                                    </span>
                                    {chordGroups.map(grp => {
                                      const palette = CHORD_GROUP_PALETTE[grp.colorIndex % CHORD_GROUP_PALETTE.length];
                                      const isGroupOpen = currentSel?.groupId === grp.id;
                                      return (
                                        <button
                                          key={grp.id}
                                          type="button"
                                          onClick={() =>
                                            setChordSelectionByPart(prev => {
                                              if (prev[part.id]?.groupId === grp.id) {
                                                return { ...prev, [part.id]: null };
                                              }
                                              return {
                                                ...prev,
                                                [part.id]: {
                                                  step: 'widgets',
                                                  groupId: grp.id,
                                                  selectedKeys: [...grp.chord_keys],
                                                  anchorKey: grp.chord_keys[0] || null,
                                                  customLabel: grp.label || ''
                                                }
                                              };
                                            })
                                          }
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.38rem',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '999px',
                                            background: palette.bg,
                                            border: `1.5px solid ${isGroupOpen ? '#ffffff' : palette.border}`,
                                            color: palette.text,
                                            fontSize: '0.76rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            boxShadow: isGroupOpen ? `0 0 12px ${palette.bg}` : 'none'
                                          }}
                                          title={`Click to view/edit Teach Mode widgets or selected chords for Flow ${palette.code} (${grp.label})`}
                                        >
                                          <span
                                            style={{
                                              background: palette.badgeBg,
                                              color: '#fff',
                                              fontSize: '0.66rem',
                                              fontWeight: 800,
                                              padding: '0.02rem 0.36rem',
                                              borderRadius: '999px'
                                            }}
                                          >
                                            {palette.code}
                                          </span>
                                          <span>{grp.label}</span>
                                          <span style={{ opacity: 0.8, fontSize: '0.7rem' }}>
                                            ({grp.chord_keys.length} chord{grp.chord_keys.length === 1 ? '' : 's'} • {grp.widget_ids.length} widget{grp.widget_ids.length === 1 ? '' : 's'})
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {selectedSong.parts.some(p => p.id !== part.id && p.part_type === part.part_type) && (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      style={{ padding: '0.22rem 0.55rem', fontSize: '0.72rem' }}
                                      onClick={() => handleCopyChordGroupsToMatchingParts(part)}
                                      title={`Copy these linked chord flows to all other ${part.part_type} sections in this song`}
                                    >
                                      <Repeat size={12} style={{ color: 'var(--secondary)' }} /> Copy Flows to Other {part.part_type}s
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Standalone Chords Row (always shown if there are no words, or if standalone chords were added alongside lyrics) */}
                              {(!hasWords || listedChords.length > 0) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                  {hasWords && listedChords.length > 0 && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                                      Section Chords:
                                    </span>
                                  )}
                                  {listedChords.length > 0 ? (
                                    <div className="hfc-chords-only-row">
                                      {listedChords.map((chordName, cIdx) => {
                                        const slotKey = `LIST:${cIdx}`;
                                        const grp = slotToGroupMap[slotKey];
                                        const palette = grp ? CHORD_GROUP_PALETTE[grp.colorIndex % CHORD_GROUP_PALETTE.length] : null;
                                        const widgetCount = grp ? (grp.widget_ids || []).length : 0;
                                        const isSelected = !!currentSel?.selectedKeys.includes(slotKey);
                                        const isSelectingMode = currentSel?.step === 'selecting';
                                        return (
                                          <div
                                            key={`${chordName}-${cIdx}`}
                                            style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}
                                          >
                                            <button
                                              type="button"
                                              className={`hfc-chord-card ${isSelected ? 'active' : ''} ${widgetCount > 0 ? 'has-widgets' : ''}`}
                                              style={
                                                isSelected
                                                  ? {
                                                      background: palette ? palette.bg : 'rgba(6, 182, 212, 0.32)',
                                                      borderColor: '#ffffff',
                                                      color: '#ffffff',
                                                      boxShadow: '0 0 0 2px #06b6d4, 0 4px 14px rgba(6, 182, 212, 0.45)'
                                                    }
                                                  : palette
                                                  ? {
                                                      background: palette.bg,
                                                      borderColor: palette.border,
                                                      color: palette.text
                                                    }
                                                  : isSelectingMode
                                                  ? {
                                                      borderStyle: 'dashed',
                                                      borderColor: 'rgba(103, 232, 249, 0.55)'
                                                    }
                                                  : undefined
                                              }
                                              onClick={() => handleChordSlotClick(part, slotKey)}
                                              title={
                                                isSelectingMode
                                                  ? isSelected
                                                    ? `Selected! Click to deselect this ${chordName}`
                                                    : `Click to include this ${chordName} in your selection`
                                                  : grp
                                                  ? `Flow ${palette?.code}: ${grp.label} — Click to view/edit Teach Mode widgets`
                                                  : `Click this ${chordName} to select chords that apply & link Teach Mode widgets`
                                              }
                                            >
                                              {isSelected && <Check size={13} style={{ color: '#6ee7b7' }} />}
                                              <span>{chordName}</span>
                                              {palette && (
                                                <span
                                                  style={{
                                                    fontSize: '0.68rem',
                                                    background: palette.badgeBg,
                                                    color: '#fff',
                                                    padding: '0.03rem 0.38rem',
                                                    borderRadius: '999px',
                                                    fontWeight: 800
                                                  }}
                                                >
                                                  {palette.code}{widgetCount > 0 ? ` • ${widgetCount}` : ''}
                                                </span>
                                              )}
                                            </button>
                                            {(part.chord_data?.chords || []).length > 0 && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleRemoveChordFromPartList(part, cIdx);
                                                }}
                                                title={`Remove ${chordName}`}
                                                style={{
                                                  marginLeft: '-8px',
                                                  marginTop: '-18px',
                                                  width: '18px',
                                                  height: '18px',
                                                  borderRadius: '999px',
                                                  background: 'rgba(15, 23, 42, 0.9)',
                                                  border: '1px solid rgba(255,255,255,0.2)',
                                                  color: 'var(--text-dim)',
                                                  fontSize: '0.65rem',
                                                  cursor: 'pointer',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  zIndex: 2
                                                }}
                                              >
                                                ×
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '0.35rem 0' }}>
                                      No words or chords in this section yet. Click any <strong>+ Chord</strong> button above (or type chords like <code>G C D</code>) to list out the chords, or click <strong>Edit Lyrics / Chords Text</strong> to add lyrics.
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* HFC CHORDS-ABOVE-WORDS DISPLAY (when section has lyrics) */}
                              {hasWords && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                  {parsedLines.map((lineCells, lIdx) => (
                                    <div key={lIdx} className="hfc-line">
                                      {lineCells.map((cell, wIdx) => {
                                        const chordName = cell.chord;
                                        const slotKey = cell.slotKey;
                                        const grp = slotToGroupMap[slotKey];
                                        const palette = grp ? CHORD_GROUP_PALETTE[grp.colorIndex % CHORD_GROUP_PALETTE.length] : null;
                                        const widgetCount = grp ? (grp.widget_ids || []).length : 0;
                                        const isSelected = !!currentSel?.selectedKeys.includes(slotKey);
                                        const isSelectingMode = currentSel?.step === 'selecting';
                                        const isWordPickerOpen =
                                          wordChordPicker?.partId === part.id &&
                                          wordChordPicker.lineIdx === lIdx &&
                                          wordChordPicker.wordIdx === wIdx;

                                        return (
                                          <div key={wIdx} className="hfc-word-cell" style={{ position: 'relative' }}>
                                            {/* Top Slot: Chord directly above the word */}
                                            <div className="hfc-chord-slot">
                                              {chordName ? (
                                                <button
                                                  type="button"
                                                  className={`hfc-chord-btn ${isSelected ? 'active' : ''} ${widgetCount > 0 ? 'has-widgets' : ''}`}
                                                  style={
                                                    isSelected
                                                      ? {
                                                          background: palette ? palette.bg : 'rgba(6, 182, 212, 0.35)',
                                                          borderColor: '#ffffff',
                                                          color: '#ffffff',
                                                          boxShadow: '0 0 0 2px #06b6d4, 0 3px 12px rgba(6, 182, 212, 0.5)',
                                                          transform: 'translateY(-1px)'
                                                        }
                                                      : palette
                                                      ? {
                                                          background: palette.bg,
                                                          borderColor: palette.border,
                                                          color: palette.text
                                                        }
                                                      : isSelectingMode
                                                      ? {
                                                          borderStyle: 'dashed',
                                                          borderColor: 'rgba(103, 232, 249, 0.55)'
                                                        }
                                                      : undefined
                                                  }
                                                  onClick={() => handleChordSlotClick(part, slotKey)}
                                                  title={
                                                    isSelectingMode
                                                      ? isSelected
                                                        ? `Selected! Click to remove this ${chordName} from selection`
                                                        : `Click to add this ${chordName} (${cell.word || 'line'}) to selection`
                                                      : grp
                                                      ? `Flow ${palette?.code}: ${grp.label} (${widgetCount} widget${widgetCount === 1 ? '' : 's'}) — Click to open`
                                                      : `Click this ${chordName} to pick which chords apply before opening Teach Mode widgets`
                                                  }
                                                >
                                                  {isSelected && <Check size={11} style={{ color: '#6ee7b7', strokeWidth: 3 }} />}
                                                  <span>{chordName}</span>
                                                  {palette && (
                                                    <span
                                                      style={{
                                                        fontSize: '0.62rem',
                                                        background: palette.badgeBg,
                                                        color: '#fff',
                                                        padding: '0 0.3rem',
                                                        borderRadius: '999px',
                                                        fontWeight: 800
                                                      }}
                                                    >
                                                      {palette.code}{widgetCount > 0 ? `•${widgetCount}` : ''}
                                                    </span>
                                                  )}
                                                </button>
                                              ) : null}
                                            </div>

                                            {/* Inline Popover to place/change/remove a Chord above this specific word */}
                                            {isWordPickerOpen && (
                                              <div
                                                style={{
                                                  position: 'absolute',
                                                  bottom: '100%',
                                                  left: 0,
                                                  zIndex: 30,
                                                  marginBottom: '0.35rem',
                                                  background: 'rgba(15, 20, 32, 0.98)',
                                                  border: '1px solid var(--secondary)',
                                                  borderRadius: 'var(--radius-sm)',
                                                  padding: '0.5rem',
                                                  boxShadow: '0 10px 25px rgba(0,0,0,0.65)',
                                                  display: 'flex',
                                                  flexDirection: 'column',
                                                  gap: '0.4rem',
                                                  minWidth: '210px'
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#67e8f9' }}>
                                                    Chord above "{cell.word || 'line'}":
                                                  </span>
                                                  <button
                                                    type="button"
                                                    className="btn-icon"
                                                    style={{ padding: '0.1rem', fontSize: '0.75rem' }}
                                                    onClick={() => setWordChordPicker(null)}
                                                  >
                                                    ✕
                                                  </button>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                  <input
                                                    type="text"
                                                    className="input-field"
                                                    placeholder="e.g. G, Am, D7"
                                                    value={wordChordPicker.currentChord}
                                                    onChange={(e) =>
                                                      setWordChordPicker(prev =>
                                                        prev ? { ...prev, currentChord: e.target.value } : null
                                                      )
                                                    }
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleSetChordAboveWord(part, lIdx, wIdx, wordChordPicker.currentChord);
                                                      }
                                                      if (e.key === 'Escape') setWordChordPicker(null);
                                                    }}
                                                    autoFocus
                                                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem', flex: 1 }}
                                                  />
                                                  <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                                                    onClick={() => handleSetChordAboveWord(part, lIdx, wIdx, wordChordPicker.currentChord)}
                                                  >
                                                    Set
                                                  </button>
                                                  {chordName && (
                                                    <button
                                                      type="button"
                                                      className="btn btn-secondary"
                                                      style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem', color: '#fca5a5' }}
                                                      onClick={() => handleSetChordAboveWord(part, lIdx, wIdx, '')}
                                                      title="Remove chord above this word"
                                                    >
                                                      Clear
                                                    </button>
                                                  )}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                  {suggestedChords.map(sc => (
                                                    <button
                                                      key={sc}
                                                      type="button"
                                                      className="btn btn-secondary"
                                                      style={{ padding: '0.12rem 0.4rem', fontSize: '0.7rem', fontWeight: 700, color: '#67e8f9' }}
                                                      onClick={() => handleSetChordAboveWord(part, lIdx, wIdx, sc)}
                                                    >
                                                      {sc}
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {/* Bottom Slot: Lyric Word (click word to set/change chord above it) */}
                                            {cell.word && (
                                              <span
                                                className="hfc-word-text editable"
                                                onClick={() =>
                                                  setWordChordPicker(prev =>
                                                    prev &&
                                                    prev.partId === part.id &&
                                                    prev.lineIdx === lIdx &&
                                                    prev.wordIdx === wIdx
                                                      ? null
                                                      : {
                                                          partId: part.id,
                                                          lineIdx: lIdx,
                                                          wordIdx: wIdx,
                                                          wordText: cell.word,
                                                          currentChord: chordName || '',
                                                          draftChord: chordName || ''
                                                        }
                                                  )
                                                }
                                                title="Click word to place or edit the chord directly above it"
                                              >
                                                {cell.word}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* ==========================================================
                                  STEP 1: SELECT ALL CHORDS THAT APPLY (BEFORE OPENING WIDGETS DIV)
                                  ========================================================== */}
                              {currentSel && currentSel.step === 'selecting' && (() => {
                                const anchorOcc =
                                  (currentSel.anchorKey ? occurrenceByKey[currentSel.anchorKey] : null) ||
                                  (currentSel.selectedKeys[0] ? occurrenceByKey[currentSel.selectedKeys[0]] : null) ||
                                  null;
                                const anchorChord = anchorOcc?.chord || 'Chord';

                                // Compute Smart Musical Flow Presets relative to the clicked chord
                                const onlyThisKey = anchorOcc ? [anchorOcc.slotKey] : [];
                                const sameFlowKeys = anchorOcc
                                  ? allOccurrences
                                      .filter(o => o.chord === anchorOcc.chord && o.flowLabel === anchorOcc.flowLabel)
                                      .map(o => o.slotKey)
                                  : [];
                                const thisPairKeys =
                                  anchorOcc && anchorOcc.nextSlotKeyOnLine
                                    ? [anchorOcc.slotKey, anchorOcc.nextSlotKeyOnLine]
                                    : [];
                                const allMatchingPairKeys: string[] = [];
                                if (anchorOcc && anchorOcc.nextChordOnLine) {
                                  allOccurrences.forEach(o => {
                                    if (o.chord === anchorOcc.chord && o.nextChordOnLine === anchorOcc.nextChordOnLine && o.nextSlotKeyOnLine) {
                                      if (!allMatchingPairKeys.includes(o.slotKey)) allMatchingPairKeys.push(o.slotKey);
                                      if (!allMatchingPairKeys.includes(o.nextSlotKeyOnLine)) allMatchingPairKeys.push(o.nextSlotKeyOnLine);
                                    }
                                  });
                                }
                                const ungroupedSameChordKeys = anchorOcc
                                  ? allOccurrences
                                      .filter(o => o.chord === anchorOcc.chord && (!slotToGroupMap[o.slotKey] || slotToGroupMap[o.slotKey].id === currentSel.groupId))
                                      .map(o => o.slotKey)
                                  : [];
                                const allSameChordKeys = anchorOcc
                                  ? allOccurrences.filter(o => o.chord === anchorOcc.chord).map(o => o.slotKey)
                                  : [];

                                const selectedDisplayPills = currentSel.selectedKeys
                                  .map(k => occurrenceByKey[k])
                                  .filter((o): o is HfcChordOccurrence => !!o);

                                return (
                                  <div
                                    style={{
                                      marginTop: '0.35rem',
                                      padding: '0.9rem 1.05rem',
                                      borderRadius: 'var(--radius-md)',
                                      background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.14), rgba(99, 102, 241, 0.14))',
                                      border: '1.5px solid rgba(6, 182, 212, 0.55)',
                                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '0.75rem'
                                    }}
                                  >
                                    {/* Top Row: Step 1 Header & Primary Action to Open Teach Mode Widgets Div */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                                        <span
                                          style={{
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '999px',
                                            background: '#06b6d4',
                                            color: '#08101d',
                                            fontWeight: 800,
                                            fontSize: '0.72rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                          }}
                                        >
                                          Step 1 of 2 • Pick Chords That Apply
                                        </span>
                                        <span style={{ fontSize: '0.84rem', color: '#e2e8f0', fontWeight: 600 }}>
                                          Click any other chords above the words that share this same bass flow, or use a quick flow selector below:
                                        </span>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                        <button
                                          type="button"
                                          className="btn btn-primary"
                                          disabled={currentSel.selectedKeys.length === 0}
                                          onClick={() => handleProceedToWidgetsStep(part)}
                                          style={{
                                            background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                                            padding: '0.42rem 0.95rem',
                                            fontSize: '0.82rem',
                                            fontWeight: 700,
                                            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                                          }}
                                        >
                                          <Check size={14} /> Open Teach Mode Widgets ({currentSel.selectedKeys.length} {currentSel.selectedKeys.length === 1 ? 'Chord' : 'Chords'}) →
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: '0.38rem 0.65rem', fontSize: '0.76rem' }}
                                          onClick={() => setChordSelectionByPart(prev => ({ ...prev, [part.id]: null }))}
                                        >
                                          Cancel ✕
                                        </button>
                                      </div>
                                    </div>

                                    {/* Smart 1-Click Flow Selection Presets */}
                                    {anchorOcc && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#67e8f9', textTransform: 'uppercase', marginRight: '0.2rem' }}>
                                          Smart Select:
                                        </span>

                                        {/* 1. Only This Exact Chord Instance */}
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{
                                            padding: '0.24rem 0.6rem',
                                            fontSize: '0.75rem',
                                            borderColor:
                                              currentSel.selectedKeys.length === 1 && currentSel.selectedKeys[0] === anchorOcc.slotKey
                                                ? '#67e8f9'
                                                : undefined,
                                            background:
                                              currentSel.selectedKeys.length === 1 && currentSel.selectedKeys[0] === anchorOcc.slotKey
                                                ? 'rgba(6, 182, 212, 0.22)'
                                                : undefined
                                          }}
                                          onClick={() =>
                                            handleApplySmartSelectionPreset(
                                              part,
                                              onlyThisKey,
                                              `${anchorOcc.chord} (${anchorOcc.word || `Line ${anchorOcc.lineIdx + 1}`})`
                                            )
                                          }
                                        >
                                          Only This {anchorChord} (1)
                                        </button>

                                        {/* 2. Same Musical Flow (e.g., G -> D before D, excluding G after D!) */}
                                        {sameFlowKeys.length > 1 && (
                                          <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{
                                              padding: '0.24rem 0.6rem',
                                              fontSize: '0.75rem',
                                              borderColor:
                                                currentSel.selectedKeys.length === sameFlowKeys.length &&
                                                sameFlowKeys.every(k => currentSel.selectedKeys.includes(k))
                                                  ? '#67e8f9'
                                                  : undefined,
                                              background:
                                                currentSel.selectedKeys.length === sameFlowKeys.length &&
                                                sameFlowKeys.every(k => currentSel.selectedKeys.includes(k))
                                                  ? 'rgba(6, 182, 212, 0.22)'
                                                  : undefined
                                            }}
                                            onClick={() =>
                                              handleApplySmartSelectionPreset(
                                                part,
                                                sameFlowKeys,
                                                `${anchorOcc.flowLabel} (${sameFlowKeys.length}x)`
                                              )
                                            }
                                            title={`Select only the ${anchorChord} chords that have the exact same transition (${anchorOcc.flowLabel})`}
                                          >
                                            <Sparkles size={12} style={{ color: '#67e8f9' }} /> Same Flow "{anchorOcc.flowLabel}" ({sameFlowKeys.length})
                                          </button>
                                        )}

                                        {/* 3. This Transition Walk Pair (e.g. this G + the D right after it on the same line) */}
                                        {thisPairKeys.length === 2 && anchorOcc.nextChordOnLine && (
                                          <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{
                                              padding: '0.24rem 0.6rem',
                                              fontSize: '0.75rem',
                                              borderColor:
                                                currentSel.selectedKeys.length === 2 &&
                                                thisPairKeys.every(k => currentSel.selectedKeys.includes(k))
                                                  ? '#67e8f9'
                                                  : undefined,
                                              background:
                                                currentSel.selectedKeys.length === 2 &&
                                                thisPairKeys.every(k => currentSel.selectedKeys.includes(k))
                                                  ? 'rgba(6, 182, 212, 0.22)'
                                                  : undefined
                                            }}
                                            onClick={() =>
                                              handleApplySmartSelectionPreset(
                                                part,
                                                thisPairKeys,
                                                `${anchorOcc.chord} → ${anchorOcc.nextChordOnLine} (Line ${anchorOcc.lineIdx + 1})`
                                              )
                                            }
                                            title={`Select both this ${anchorOcc.chord} and the ${anchorOcc.nextChordOnLine} it flows into on Line ${anchorOcc.lineIdx + 1}`}
                                          >
                                            This Pair "{anchorOcc.chord} + {anchorOcc.nextChordOnLine}" (2)
                                          </button>
                                        )}

                                        {/* 4. All Matching Transition Pairs across lines (e.g. all G + D pairs) */}
                                        {allMatchingPairKeys.length > 2 && anchorOcc.nextChordOnLine && (
                                          <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{
                                              padding: '0.24rem 0.6rem',
                                              fontSize: '0.75rem',
                                              borderColor:
                                                currentSel.selectedKeys.length === allMatchingPairKeys.length &&
                                                allMatchingPairKeys.every(k => currentSel.selectedKeys.includes(k))
                                                  ? '#67e8f9'
                                                  : undefined,
                                              background:
                                                currentSel.selectedKeys.length === allMatchingPairKeys.length &&
                                                allMatchingPairKeys.every(k => currentSel.selectedKeys.includes(k))
                                                  ? 'rgba(6, 182, 212, 0.22)'
                                                  : undefined
                                            }}
                                            onClick={() =>
                                              handleApplySmartSelectionPreset(
                                                part,
                                                allMatchingPairKeys,
                                                `All ${anchorOcc.chord} → ${anchorOcc.nextChordOnLine} Pairs`
                                              )
                                            }
                                          >
                                            All "{anchorOcc.chord} + {anchorOcc.nextChordOnLine}" Pairs ({allMatchingPairKeys.length})
                                          </button>
                                        )}

                                        {/* 5. All Ungrouped instances of this chord */}
                                        {ungroupedSameChordKeys.length > 1 && ungroupedSameChordKeys.length < allSameChordKeys.length && (
                                          <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ padding: '0.24rem 0.6rem', fontSize: '0.75rem' }}
                                            onClick={() =>
                                              handleApplySmartSelectionPreset(
                                                part,
                                                ungroupedSameChordKeys,
                                                `${anchorChord} (Remaining ${ungroupedSameChordKeys.length}x)`
                                              )
                                            }
                                          >
                                            All Ungrouped {anchorChord}s ({ungroupedSameChordKeys.length})
                                          </button>
                                        )}

                                        {/* 6. All instances of this chord in this section */}
                                        {allSameChordKeys.length > 1 && (
                                          <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{
                                              padding: '0.24rem 0.6rem',
                                              fontSize: '0.75rem',
                                              borderColor:
                                                currentSel.selectedKeys.length === allSameChordKeys.length &&
                                                allSameChordKeys.every(k => currentSel.selectedKeys.includes(k))
                                                  ? '#67e8f9'
                                                  : undefined,
                                              background:
                                                currentSel.selectedKeys.length === allSameChordKeys.length &&
                                                allSameChordKeys.every(k => currentSel.selectedKeys.includes(k))
                                                  ? 'rgba(6, 182, 212, 0.22)'
                                                  : undefined
                                            }}
                                            onClick={() =>
                                              handleApplySmartSelectionPreset(
                                                part,
                                                allSameChordKeys,
                                                `All ${anchorChord} (${allSameChordKeys.length}x)`
                                              )
                                            }
                                          >
                                            All {anchorChord}s in Section ({allSameChordKeys.length})
                                          </button>
                                        )}
                                      </div>
                                    )}

                                    {/* Currently Selected Chord Instances Summary + Optional Flow Label */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                          Selected ({selectedDisplayPills.length}):
                                        </span>
                                        {selectedDisplayPills.map(occ => (
                                          <span
                                            key={occ.slotKey}
                                            style={{
                                              fontSize: '0.72rem',
                                              fontWeight: 700,
                                              padding: '0.12rem 0.48rem',
                                              borderRadius: '999px',
                                              background: 'rgba(6, 182, 212, 0.22)',
                                              border: '1px solid rgba(103, 232, 249, 0.6)',
                                              color: '#fff',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '0.28rem'
                                            }}
                                          >
                                            <span>{occ.chord}</span>
                                            <span style={{ fontSize: '0.66rem', color: '#a5f3fc', fontWeight: 500 }}>
                                              {occ.lineIdx >= 0 ? `(L${occ.lineIdx + 1}: ${occ.word || 'line'})` : ''}
                                            </span>
                                          </span>
                                        ))}
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Flow Label:</span>
                                        <input
                                          type="text"
                                          className="input-field"
                                          placeholder="e.g. G → D (before D)"
                                          value={currentSel.customLabel}
                                          onChange={(e) =>
                                            setChordSelectionByPart(prev =>
                                              prev[part.id]
                                                ? { ...prev, [part.id]: { ...prev[part.id]!, customLabel: e.target.value } }
                                                : prev
                                            )
                                          }
                                          style={{ width: '175px', padding: '0.2rem 0.5rem', fontSize: '0.76rem' }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* ==========================================================
                                  STEP 2: TEACH MODE WIDGETS DIV FOR THE SELECTED CHORDS
                                  ========================================================== */}
                              {currentSel && currentSel.step === 'widgets' && (() => {
                                const activeGroup = currentSel.groupId
                                  ? chordGroups.find(g => g.id === currentSel.groupId) || null
                                  : null;
                                const colorIdx = activeGroup
                                  ? activeGroup.colorIndex
                                  : chordGroups.length % CHORD_GROUP_PALETTE.length;
                                const palette = CHORD_GROUP_PALETTE[colorIdx % CHORD_GROUP_PALETTE.length];
                                const groupLabel =
                                  currentSel.customLabel ||
                                  activeGroup?.label ||
                                  buildDefaultGroupLabel(currentSel.selectedKeys, occurrenceByKey);
                                const cWidgetIds =
                                  currentSel.widgetIds !== undefined
                                    ? currentSel.widgetIds
                                    : activeGroup?.widget_ids || [];
                                const selectedDisplayPills = currentSel.selectedKeys
                                  .map(k => occurrenceByKey[k])
                                  .filter((o): o is HfcChordOccurrence => !!o);

                                return (
                                  <div
                                    className="chord-teach-drawer"
                                    style={{
                                      background: `linear-gradient(180deg, ${palette.bg}, rgba(10, 14, 24, 0.92))`,
                                      border: `2.5px solid ${palette.border}`,
                                      boxShadow: `0 8px 26px rgba(0, 0, 0, 0.45), 0 0 14px ${palette.bg}`
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                                        <span
                                          style={{
                                            padding: '0.22rem 0.65rem',
                                            borderRadius: '6px',
                                            background: palette.bg,
                                            border: `1.5px solid ${palette.border}`,
                                            color: '#ffffff',
                                            fontWeight: 800,
                                            fontSize: '0.88rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.4rem'
                                          }}
                                        >
                                          <span
                                            style={{
                                              background: palette.badgeBg,
                                              color: '#fff',
                                              padding: '0.02rem 0.36rem',
                                              borderRadius: '999px',
                                              fontSize: '0.7rem'
                                            }}
                                          >
                                            Flow {palette.code}
                                          </span>
                                          <span>{groupLabel}</span>
                                        </span>

                                        {/* Selected chord position pills */}
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.28rem', flexWrap: 'wrap' }}>
                                          {selectedDisplayPills.map(occ => (
                                            <span
                                              key={occ.slotKey}
                                              style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                padding: '0.1rem 0.42rem',
                                                borderRadius: '999px',
                                                background: 'rgba(255,255,255,0.06)',
                                                border: '1px solid rgba(255,255,255,0.14)',
                                                color: palette.text
                                              }}
                                            >
                                              {occ.chord}{occ.lineIdx >= 0 ? ` (L${occ.lineIdx + 1}: ${occ.word || 'line'})` : ''}
                                            </span>
                                          ))}
                                        </div>

                                        {cWidgetIds.length > 0 && (
                                          <span
                                            style={{
                                              fontSize: '0.72rem',
                                              fontWeight: 800,
                                              padding: '0.14rem 0.55rem',
                                              borderRadius: '999px',
                                              background: 'rgba(16, 185, 129, 0.2)',
                                              border: '1px solid #34d399',
                                              color: '#6ee7b7'
                                            }}
                                          >
                                            ✓ {cWidgetIds.length} {cWidgetIds.length === 1 ? 'Widget' : 'Widgets'} Selected
                                          </span>
                                        )}
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        {/* Button to switch back to Step 1 to add/remove chords in this flow */}
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: '0.24rem 0.6rem', fontSize: '0.74rem', borderColor: palette.border, color: palette.text }}
                                          onClick={() =>
                                            setChordSelectionByPart(prev =>
                                              prev[part.id]
                                                ? { ...prev, [part.id]: { ...prev[part.id]!, step: 'selecting' } }
                                                : prev
                                            )
                                          }
                                          title="Click to pick or unpick which chords on the chart belong to this flow"
                                        >
                                          <Edit3 size={12} /> Select / Change Chords ({currentSel.selectedKeys.length})
                                        </button>

                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: '0.24rem 0.55rem', fontSize: '0.72rem' }}
                                          onClick={() => handleSwitchMode('teach')}
                                        >
                                          <BookOpen size={12} /> Open Teach Mode
                                        </button>

                                        {activeGroup && (
                                          <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ padding: '0.24rem 0.55rem', fontSize: '0.72rem', color: '#fca5a5' }}
                                            onClick={() => handleDeleteChordGroup(part, activeGroup.id)}
                                            title="Unlink all widgets from this chord flow group"
                                          >
                                            <Trash2 size={12} /> Delete Flow
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: '0.24rem 0.55rem', fontSize: '0.72rem' }}
                                          onClick={() => setChordSelectionByPart(prev => ({ ...prev, [part.id]: null }))}
                                        >
                                          Close ✕
                                        </button>
                                      </div>
                                    </div>

                                    {/* Add/Remove Teach Mode Widgets to these Selected Chords (Multi-Select) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                      <span style={{ fontSize: '0.76rem', color: '#cbd5e1', fontWeight: 600 }}>
                                        Multi-Select — Click one or more Teach Mode widgets below to attach to <strong>{groupLabel}</strong> ({currentSel.selectedKeys.length} selected {currentSel.selectedKeys.length === 1 ? 'chord' : 'chords'}):
                                      </span>
                                      {selectedSong.widgets.length === 0 ? (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                          No widgets created in Teach Mode yet. Switch to <strong>Teach Mode</strong> to create Fret Board Graphs, Roman Chord Maps, Rhythms, or Notes, then click them here to attach them to <strong>{groupLabel}</strong>!
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', userSelect: 'none' }}>
                                          {selectedSong.widgets.map(w => {
                                            const isAddedToGroup = cWidgetIds.includes(w.id);
                                            const orderNum = isAddedToGroup ? cWidgetIds.indexOf(w.id) + 1 : null;
                                            return (
                                              <button
                                                key={w.id}
                                                type="button"
                                                className={`widget-link-chip ${isAddedToGroup ? 'linked' : ''}`}
                                                style={{
                                                  userSelect: 'none',
                                                  border: isAddedToGroup
                                                    ? '1.5px solid #10b981'
                                                    : '1px solid rgba(255, 255, 255, 0.14)',
                                                  background: isAddedToGroup
                                                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.28), rgba(6, 182, 212, 0.22))'
                                                    : undefined,
                                                  color: isAddedToGroup ? '#ecfdf5' : undefined,
                                                  boxShadow: isAddedToGroup
                                                    ? '0 0 12px rgba(16, 185, 129, 0.3)'
                                                    : undefined
                                                }}
                                                onClick={() => handleToggleTeachWidgetForSelection(part, w.id)}
                                                title={
                                                  isAddedToGroup
                                                    ? `Selected (#${orderNum}) — Click to remove "${getWidgetDefaultTitle(w)}" from ${groupLabel}`
                                                    : `Click to add "${getWidgetDefaultTitle(w)}" to ${groupLabel} (you can select multiple widgets)`
                                                }
                                              >
                                                <span
                                                  style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '16px',
                                                    height: '16px',
                                                    borderRadius: '4px',
                                                    background: isAddedToGroup ? '#10b981' : 'rgba(255,255,255,0.06)',
                                                    border: isAddedToGroup ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.22)',
                                                    color: isAddedToGroup ? '#042f2e' : 'var(--text-dim)',
                                                    fontSize: '0.68rem',
                                                    fontWeight: 900
                                                  }}
                                                >
                                                  {isAddedToGroup ? orderNum : '+'}
                                                </span>
                                                {renderWidgetIcon(w.widget_type)}
                                                <span>{getWidgetDefaultTitle(w)}</span>
                                                {isAddedToGroup && (
                                                  <Check size={13} style={{ color: '#34d399' }} />
                                                )}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    {/* Rendered Teach Mode Widgets inside this Chord Flow's Div */}
                                    {(() => {
                                      const cWidgets = cWidgetIds
                                        .map(id => selectedSong.widgets.find(w => w.id === id))
                                        .filter((w): w is Widget => !!w);

                                      if (cWidgets.length === 0) {
                                        return (
                                          <div
                                            style={{
                                              padding: '0.75rem 0.9rem',
                                              borderRadius: 'var(--radius-sm)',
                                              background: 'rgba(255,255,255,0.02)',
                                              border: '1px dashed rgba(255,255,255,0.1)',
                                              fontSize: '0.8rem',
                                              color: 'var(--text-dim)',
                                              fontStyle: 'italic'
                                            }}
                                          >
                                            No Teach Mode widgets linked to <strong>{groupLabel}</strong> yet. Click any widget button above to add it to {currentSel.selectedKeys.length === 1 ? 'this chord' : `these ${currentSel.selectedKeys.length} chords`}.
                                          </div>
                                        );
                                      }

                                      return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.25rem' }}>
                                          {cWidgets.map((linkedW, wIdx) => (
                                            <div
                                              key={`${part.id}-${activeGroup?.id || 'sel'}-${linkedW.id}`}
                                              style={{
                                                background: 'rgba(10, 14, 24, 0.88)',
                                                border: `1.5px solid ${palette.border}`,
                                                borderLeft: `5px solid ${palette.border}`,
                                                borderRadius: 'var(--radius-md)',
                                                padding: '0.85rem 1rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.65rem'
                                              }}
                                            >
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingBottom: '0.45rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                  {renderWidgetIcon(linkedW.widget_type)}
                                                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                                                    {getWidgetDefaultTitle(linkedW)}
                                                  </span>
                                                  <span
                                                    className="badge"
                                                    style={{
                                                      fontSize: '0.68rem',
                                                      background: palette.bg,
                                                      border: `1px solid ${palette.border}`,
                                                      color: palette.text
                                                    }}
                                                  >
                                                    Flow {palette.code}: {groupLabel}
                                                  </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                  {activeGroup && (
                                                    <>
                                                      <button
                                                        type="button"
                                                        className="btn-icon"
                                                        onClick={() => handleReorderTeachWidgetForGroup(part, activeGroup.id, wIdx, 'up')}
                                                        disabled={wIdx === 0}
                                                        style={{ opacity: wIdx === 0 ? 0.25 : 1 }}
                                                        title="Move Widget Up"
                                                      >
                                                        <ArrowUp size={13} />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        className="btn-icon"
                                                        onClick={() => handleReorderTeachWidgetForGroup(part, activeGroup.id, wIdx, 'down')}
                                                        disabled={wIdx === cWidgets.length - 1}
                                                        style={{ opacity: wIdx === cWidgets.length - 1 ? 0.25 : 1 }}
                                                        title="Move Widget Down"
                                                      >
                                                        <ArrowDown size={13} />
                                                      </button>
                                                    </>
                                                  )}
                                                  <button
                                                    type="button"
                                                    className="btn-icon"
                                                    onClick={() => handleToggleTeachWidgetForSelection(part, linkedW.id)}
                                                    title={`Remove widget from ${groupLabel}`}
                                                  >
                                                    <Unlink size={13} />
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Full Interactive Teach Mode Widget inside the Chord Flow Div */}
                                              {renderInteractiveWidget(linkedW, false)}
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Optional Performance Cue Input */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                🎯 Performance Cue:
                              </span>
                              <input
                                type="text"
                                className="input-field"
                                placeholder="Optional live cue (e.g. Play softly near bridge pickup, build on bar 7)"
                                value={partNotesDrafts[part.id] ?? part.notes ?? ''}
                                onChange={(e) => setPartNotesDrafts(prev => ({ ...prev, [part.id]: e.target.value }))}
                                onBlur={() => {
                                  const draft = partNotesDrafts[part.id] ?? '';
                                  if (draft !== (part.notes || '')) {
                                    handleUpdatePart(part.id, { notes: draft }, true);
                                  }
                                }}
                                style={{ flex: 1, padding: '0.4rem 0.7rem', fontSize: '0.82rem' }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ================================================================
               MODE 3: PLAY MODE (LIVE SONG STREAMER)
               ================================================================ */}
            {activeMode === 'play' && (
              <div className="workbench-content" ref={workbenchContentRef} style={{ gap: '1.25rem' }}>
                {/* Sticky Live Streamer HUD */}
                <div className="play-stream-hud">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem' }}>
                    {/* Transport Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {streamState === 'stopped' && (
                        <button
                          className="btn btn-primary"
                          onClick={() => startLiveStream(activeStreamPartIdx)}
                          disabled={selectedSong.parts.length === 0}
                          style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)', padding: '0.5rem 1.1rem', fontSize: '0.88rem' }}
                        >
                          <Play size={16} /> Stream Song
                        </button>
                      )}
                      {(streamState === 'playing' || streamState === 'countdown') && (
                        <button
                          className="btn btn-secondary"
                          onClick={pauseLiveStream}
                          style={{ borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', padding: '0.5rem 1rem', fontSize: '0.88rem' }}
                        >
                          <Pause size={16} /> Pause
                        </button>
                      )}
                      {streamState === 'paused' && (
                        <button
                          className="btn btn-primary"
                          onClick={resumeLiveStream}
                          style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)', padding: '0.5rem 1.1rem', fontSize: '0.88rem' }}
                        >
                          <Play size={16} /> Resume
                        </button>
                      )}
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          stopLiveStream();
                          if (autoScrollPlay && selectedSong.parts.length > 0) {
                            scrollToStreamPart(0);
                          }
                        }}
                        title="Stop & Reset to Top"
                        style={{ padding: '0.5rem 0.75rem' }}
                      >
                        <RotateCcw size={15} /> Restart
                      </button>

                      {/* Live Beat Dots & Bar Counter */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.4rem 0.85rem',
                          borderRadius: 'var(--radius-md)',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {Array.from({ length: beatsPerBar }).map((_, bIdx) => {
                            const isBeatActive = (streamState === 'playing' || streamState === 'countdown') && currentBeatInBar === bIdx;
                            return (
                              <div
                                key={bIdx}
                                className={`beat-dot ${isBeatActive ? (bIdx === 0 ? 'active-downbeat' : 'active-beat') : ''}`}
                                title={`Beat ${bIdx + 1}`}
                              />
                            );
                          })}
                        </div>

                        {streamState === 'countdown' ? (
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
                            COUNT-IN: {countdownBeatsLeft}...
                          </span>
                        ) : selectedSong.parts[activeStreamPartIdx] ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.82rem' }}>
                            <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>
                              Bar {currentBarInPart + 1} / {selectedSong.parts[activeStreamPartIdx].bars || 4}
                            </span>
                            <span style={{ color: 'var(--text-dim)' }}>•</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              {selectedSong.parts[activeStreamPartIdx].label || selectedSong.parts[activeStreamPartIdx].part_type}
                            </span>
                            {selectedSong.parts[activeStreamPartIdx + 1] && (
                              <span
                                style={{
                                  fontSize: '0.74rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '999px',
                                  background: 'rgba(99, 102, 241, 0.16)',
                                  color: '#a5b4fc',
                                  fontWeight: 600
                                }}
                              >
                                Next: {selectedSong.parts[activeStreamPartIdx + 1].label || selectedSong.parts[activeStreamPartIdx + 1].part_type}
                              </span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Tempo, Count-In, Click & Auto-Scroll Toggles */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {/* Live BPM Adjuster */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.03)', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <button
                          className="btn-icon"
                          style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem' }}
                          onClick={() => handleQuickUpdateSongField({ tempo: Math.max(30, (selectedSong.tempo || 120) - 5) })}
                          title="Decrease Tempo (-5 BPM)"
                        >
                          -5
                        </button>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', minWidth: '64px', textAlign: 'center' }}>
                          {selectedSong.tempo || 120} BPM
                        </span>
                        <button
                          className="btn-icon"
                          style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem' }}
                          onClick={() => handleQuickUpdateSongField({ tempo: Math.min(300, (selectedSong.tempo || 120) + 5) })}
                          title="Increase Tempo (+5 BPM)"
                        >
                          +5
                        </button>
                      </div>

                      <button
                        className={`btn ${useCountIn ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => setUseCountIn(!useCountIn)}
                        title="1-Bar Count-In before streaming starts"
                      >
                        Count-In
                      </button>

                      <button
                        className={`btn ${useAudioClick ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => setUseAudioClick(!useAudioClick)}
                        title="Toggle audible metronome click on beats"
                      >
                        {useAudioClick ? <Volume2 size={14} /> : <VolumeX size={14} />} Click
                      </button>

                      <button
                        className={`btn ${autoScrollPlay ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => setAutoScrollPlay(!autoScrollPlay)}
                        title="Automatically smooth-scroll to the active song section as bars progress"
                      >
                        Auto-Scroll
                      </button>
                    </div>
                  </div>

                  {/* Layer Visibility Filter & Section Jump Timeline */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Section Jump Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflowX: 'auto', flex: 1 }}>
                      {selectedSong.parts.map((part, idx) => (
                        <button
                          key={part.id}
                          className={`timeline-pill ${activeStreamPartIdx === idx ? 'active' : ''}`}
                          onClick={() => jumpToStreamPart(idx)}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem' }}
                        >
                          <span>#{idx + 1}</span>
                          <span>{part.label || part.part_type}</span>
                          <span style={{ opacity: 0.65 }}>({part.bars || 4}b)</span>
                        </button>
                      ))}
                    </div>

                    {/* Layer Toggles (Lyrics, Chords, Fretboards, Rhythms, Notes) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600 }}>Show:</span>
                      {(
                        [
                          { key: 'lyrics', label: 'Lyrics' },
                          { key: 'roman_numeral', label: 'Chords' },
                          { key: 'fret_board', label: 'Fretboard' },
                          { key: 'rhythm', label: 'Rhythm' },
                          { key: 'note', label: 'Notes' },
                        ] as const
                      ).map(item => (
                        <button
                          key={item.key}
                          className={`btn ${playVisibility[item.key] ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                          onClick={() => setPlayVisibility(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                        >
                          {item.label}
                        </button>
                      ))}
                      {playVisibility.lyrics && (
                        <div style={{ display: 'inline-flex', gap: '0.2rem', marginLeft: '0.2rem' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}
                            onClick={() => setLyricFontSize(s => Math.max(0.85, +(s - 0.1).toFixed(2)))}
                            title="Smaller Lyrics Font"
                          >
                            A-
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}
                            onClick={() => setLyricFontSize(s => Math.min(1.6, +(s + 0.1).toFixed(2)))}
                            title="Larger Lyrics Font"
                          >
                            A+
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live Streaming Song Parts Stack */}
                {selectedSong.parts.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <Layers size={28} />
                    </div>
                    <h3>No Song Sections Constructed Yet</h3>
                    <p style={{ maxWidth: '460px', marginBottom: '1rem' }}>
                      Switch to <strong>Edit Mode</strong> to add your song parts (Intro, Verse, Chorus, etc.), link your Teach Mode widgets, and add lyrics!
                    </p>
                    <button className="btn btn-primary" onClick={() => handleSwitchMode('edit')}>
                      <Layers size={15} /> Build Song in Edit Mode
                    </button>
                  </div>
                ) : (
                  selectedSong.parts.map((part, partIdx) => {
                    const isActivePart = activeStreamPartIdx === partIdx;
                    const partBars = Math.max(1, part.bars || 4);
                    const { hasWords, listedChords } = parsePartHfcData(part);
                    const hasChordsOrLyrics = hasWords || listedChords.length > 0;

                    return (
                      <div
                        key={part.id}
                        id={`stream-part-${part.id}`}
                        className={`play-stream-section ${isActivePart ? 'active-stream-part' : ''} ${isActivePart && isDownbeatFlash ? 'downbeat-flash' : ''}`}
                        onClick={() => {
                          if (activeStreamPartIdx !== partIdx) {
                            jumpToStreamPart(partIdx);
                          }
                        }}
                      >
                        {/* Live Section Progress Bar across top of card */}
                        {isActivePart && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              height: '4px',
                              background: 'rgba(255,255,255,0.06)'
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${(partProgressRatio * 100).toFixed(1)}%`,
                                background: 'linear-gradient(90deg, var(--accent-green), var(--secondary))',
                                boxShadow: '0 0 12px var(--accent-green)',
                                transition: 'width 0.08s linear'
                              }}
                            />
                          </div>
                        )}

                        {/* Section Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                padding: '0.25rem 0.6rem',
                                borderRadius: 'var(--radius-sm)',
                                background: isActivePart ? 'var(--accent-green)' : 'rgba(255,255,255,0.06)',
                                color: isActivePart ? '#052e16' : 'var(--text-muted)',
                                fontWeight: 800,
                                fontSize: '0.78rem'
                              }}
                            >
                              #{partIdx + 1}
                            </span>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: isActivePart ? '#fff' : 'var(--text-main)' }}>
                              {part.label || part.part_type}
                            </h3>
                            <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.14)', color: 'var(--accent-amber)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                              {partBars} {partBars === 1 ? 'Bar' : 'Bars'}
                            </span>
                            {part.notes && (
                              <span
                                style={{
                                  fontSize: '0.8rem',
                                  color: '#67e8f9',
                                  background: 'rgba(6, 182, 212, 0.12)',
                                  border: '1px solid rgba(6, 182, 212, 0.25)',
                                  padding: '0.2rem 0.65rem',
                                  borderRadius: '999px'
                                }}
                              >
                                🎯 {part.notes}
                              </span>
                            )}
                          </div>

                          {/* Bar Pills Indicator for this section */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {Array.from({ length: Math.min(partBars, 16) }).map((_, bIdx) => {
                              const isCurrentBar = isActivePart && streamState === 'playing' && currentBarInPart === bIdx;
                              const isPastBar = isActivePart && streamState === 'playing' && currentBarInPart > bIdx;
                              return (
                                <span
                                  key={bIdx}
                                  style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    background: isCurrentBar
                                      ? 'var(--accent-green)'
                                      : isPastBar
                                      ? 'rgba(16, 185, 129, 0.2)'
                                      : 'rgba(255,255,255,0.04)',
                                    color: isCurrentBar ? '#052e16' : isPastBar ? '#6ee7b7' : 'var(--text-dim)',
                                    border: isCurrentBar ? '1px solid #fff' : '1px solid rgba(255,255,255,0.06)',
                                    transform: isCurrentBar ? 'scale(1.12)' : 'none',
                                    transition: 'all 0.12s ease'
                                  }}
                                >
                                  {bIdx + 1}
                                </span>
                              );
                            })}
                            {partBars > 16 && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>+{partBars - 16}</span>
                            )}
                          </div>
                        </div>

                        {/* Section Content: Chords & Lyrics (Widgets ONLY appear inside a color-matched box when a chord is clicked) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                          {hasChordsOrLyrics ? (
                            renderLiveSectionLyrics(part, isActivePart)
                          ) : (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                              No chords or lyrics added to this section yet.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state" style={{ margin: 'auto' }}>
            <div className="empty-state-icon">
              <Music size={28} />
            </div>
            <h3>Select or Create a Song</h3>
            <p>Choose a song from the left library to open the Bass Workbench.</p>
          </div>
        )}
      </main>

      {/* ====================================================================
         MODAL: CREATE NEW SONG
         ==================================================================== */}
      {isNewSongModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewSongModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Song</h3>
              <button className="btn-icon" onClick={() => setIsNewSongModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateSong}>
              <div className="form-group">
                <label>Song Title *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Schism" 
                  value={newSongTitle}
                  onChange={e => setNewSongTitle(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Artist / Band *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Tool" 
                  value={newSongArtist}
                  onChange={e => setNewSongArtist(e.target.value)}
                  required 
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Bass Tuning</label>
                  <select 
                    className="input-field"
                    value={newSongTuning}
                    onChange={e => setNewSongTuning(e.target.value)}
                  >
                    {TUNINGS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Key Signature</label>
                  <select 
                    className="input-field" 
                    value={newSongKey}
                    onChange={e => setNewSongKey(e.target.value)}
                  >
                    {KEY_SIGNATURES.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Tempo (BPM)</label>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    className="input-field"
                    value={newSongTempo}
                    onChange={e => setNewSongTempo(parseInt(e.target.value, 10) || 120)}
                  />
                </div>
                <div className="form-group">
                  <label>Time Signature</label>
                  <select
                    className="input-field"
                    value={newSongTimeSig}
                    onChange={e => setNewSongTimeSig(e.target.value)}
                  >
                    {TIME_SIGNATURES.map(ts => <option key={ts} value={ts}>{ts}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Folder (Optional)</label>
                <select 
                  className="input-field" 
                  value={newSongFolderId}
                  onChange={e => setNewSongFolderId(e.target.value)}
                >
                  <option value="">(Uncategorized)</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="modal-footer" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewSongModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Song</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
         MODAL: EDIT SONG METADATA
         ==================================================================== */}
      {isEditSongModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEditSongModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Song Details</h3>
              <button className="btn-icon" onClick={() => setIsEditSongModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdateSong}>
              <div className="form-group">
                <label>Song Title *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editSongTitle}
                  onChange={e => setEditSongTitle(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Artist / Band *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editSongArtist}
                  onChange={e => setEditSongArtist(e.target.value)}
                  required 
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Bass Tuning</label>
                  <select 
                    className="input-field"
                    value={editSongTuning}
                    onChange={e => setEditSongTuning(e.target.value)}
                  >
                    {TUNINGS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Key Signature</label>
                  <select 
                    className="input-field" 
                    value={editSongKey}
                    onChange={e => setEditSongKey(e.target.value)}
                  >
                    {KEY_SIGNATURES.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Tempo (BPM)</label>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    className="input-field"
                    value={editSongTempo}
                    onChange={e => setEditSongTempo(parseInt(e.target.value, 10) || 120)}
                  />
                </div>
                <div className="form-group">
                  <label>Time Signature</label>
                  <select
                    className="input-field"
                    value={editSongTimeSig}
                    onChange={e => setEditSongTimeSig(e.target.value)}
                  >
                    {TIME_SIGNATURES.map(ts => <option key={ts} value={ts}>{ts}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Folder</label>
                <select 
                  className="input-field" 
                  value={editSongFolderId}
                  onChange={e => setEditSongFolderId(e.target.value)}
                >
                  <option value="">(Uncategorized)</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="modal-footer" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditSongModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
         MODAL: CREATE NEW FOLDER
         ==================================================================== */}
      {isNewFolderModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewFolderModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Folder</h3>
              <button className="btn-icon" onClick={() => setIsNewFolderModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <div className="form-group">
                <label>Folder Name *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Setlist 1, Practice, Funk Grooves" 
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  autoFocus
                  required 
                />
              </div>
              <div className="modal-footer" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewFolderModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Folder</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
         MODAL: LYRICS & SONG STRUCTURE TOOLING (STEP 1: FETCH -> STEP 2: AUTO-SPLIT)
         ==================================================================== */}
      {isLyricsToolOpen && selectedSong && (
        <div className="modal-overlay" onClick={() => setIsLyricsToolOpen(false)}>
          <div
            className="glass-card modal-content"
            style={{ maxWidth: '760px', width: '95%', maxHeight: '88vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={18} style={{ color: 'var(--secondary)' }} />
                <h3>Lyrics & Song Structure Tool — {selectedSong.title}</h3>
              </div>
              <button className="btn-icon" onClick={() => setIsLyricsToolOpen(false)}>✕</button>
            </div>

            {/* 2-Step Workflow Tabs: Step 1 (Fetch Lyrics) -> Step 2 (Auto-Split & Build Song Parts) */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${lyricsToolTab === 'lrclib' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setLyricsToolTab('lrclib');
                  if (lrclibResults.length === 0 && !lrclibSearching) {
                    handleSearchLrclib();
                  }
                }}
              >
                <Search size={14} /> Step 1: Search & Fetch Lyrics
              </button>
              <button
                type="button"
                className={`btn ${lyricsToolTab === 'paste' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setLyricsToolTab('paste')}
              >
                <FileText size={14} /> Step 2: Review & Build Song Parts ({parseRawLyricsIntoSections(smartPasteText, smartPasteDefaultBars).length})
              </button>
            </div>

            {lyricsToolTab === 'lrclib' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <strong>Step 1:</strong> Search for the song below (no API key required). Click <strong>Fetch & Auto-Detect Sections →</strong> on a match and we will automatically detect repeating Choruses, Verses, Bridge, and Intro for Step 2!
                </p>

                <form onSubmit={handleSearchLrclib} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Song Title (e.g. I'm a Believer)"
                    value={lrclibQueryTitle}
                    onChange={(e) => setLrclibQueryTitle(e.target.value)}
                    style={{ flex: 1, minWidth: '180px' }}
                  />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Artist (optional, e.g. The Monkees)"
                    value={lrclibQueryArtist}
                    onChange={(e) => setLrclibQueryArtist(e.target.value)}
                    style={{ flex: 1, minWidth: '180px' }}
                  />
                  <button type="submit" className="btn btn-primary" disabled={lrclibSearching}>
                    <Search size={15} /> {lrclibSearching ? 'Searching...' : 'Search Lyrics'}
                  </button>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={includeAutoIntro}
                      onChange={(e) => setIncludeAutoIntro(e.target.checked)}
                    />
                    Automatically include a 4-bar <code>[Intro]</code> section at the start of the song
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.28rem 0.65rem', fontSize: '0.75rem' }}
                    onClick={() => setLyricsToolTab('paste')}
                  >
                    Or skip to Step 2 (Paste manually) →
                  </button>
                </div>

                {lrclibError && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--accent-amber)', padding: '0.6rem 0.85rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 'var(--radius-sm)' }}>
                    {lrclibError}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '360px', overflowY: 'auto' }}>
                  {lrclibSearching && lrclibResults.length === 0 && (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Searching lyrics catalog for <strong>{lrclibQueryTitle}</strong>...
                    </div>
                  )}
                  {lrclibResults.map(track => {
                    const lyricsText = track.plainLyrics || track.syncedLyrics || '';
                    const isFetchingThis = fetchingTrackId === track.id;
                    return (
                      <div
                        key={track.id}
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          background: track.hasChords ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${track.hasChords ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255,255,255,0.08)'}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.92rem' }}>{track.trackName}</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              by {track.artistName} {track.albumName ? `• ${track.albumName}` : ''}
                            </span>
                            {track.hasChords && (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  padding: '0.14rem 0.5rem',
                                  borderRadius: '999px',
                                  background: 'rgba(16, 185, 129, 0.2)',
                                  border: '1px solid rgba(16, 185, 129, 0.45)',
                                  color: '#6ee7b7',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em'
                                }}
                              >
                                Chords + Lyrics
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '0.35rem 0.8rem', fontSize: '0.78rem' }}
                            disabled={isFetchingThis}
                            onClick={() => handleSelectLyricsTrack(track)}
                          >
                            <Sparkles size={13} />{' '}
                            {isFetchingThis
                              ? 'Fetching Chords & Lyrics...'
                              : track.hasChords
                              ? 'Fetch Chords & Lyrics →'
                              : 'Fetch & Auto-Detect Chords + Sections →'}
                          </button>
                        </div>
                        {lyricsText && (
                          <pre
                            style={{
                              fontSize: '0.76rem',
                              color: 'var(--text-muted)',
                              maxHeight: '80px',
                              overflowY: 'auto',
                              whiteSpace: 'pre-wrap',
                              fontFamily: 'inherit',
                              background: 'rgba(0,0,0,0.25)',
                              padding: '0.5rem',
                              borderRadius: '4px'
                            }}
                          >
                            {lyricsText.slice(0, 320)}{lyricsText.length > 320 ? '...' : ''}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, flex: 1 }}>
                    <strong>Step 2:</strong> Review the auto-detected song sections &amp; inline <code style={{ color: '#67e8f9' }}>[Chord]</code> markers below. Repeating stanzas are automatically tagged as <code style={{ color: 'var(--secondary)' }}>[Chorus]</code> and chords are placed directly above the words in HFC style!
                  </p>
                  {smartPasteText.trim() && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          setSmartPasteText(injectFallbackChordsIntoPlainLyrics(normalizeLyricsToInlineBracketChords(smartPasteText)));
                        }}
                        title="Place chords from the song's key / Roman Chord Map above any lyric lines that don't have chords yet"
                      >
                        <Music size={13} /> Auto-Place Chords Above Words
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          // Strip existing bracket section headers and re-run auto-detector
                          const stripped = smartPasteText
                            .split(/\r?\n/)
                            .filter(l => !/^\s*\[(Intro|Verse|Pre-?Chorus|Chorus|Hook|Bridge|Outro|Solo|Interlude).*\]\s*$/i.test(l) && l.trim() !== '(Instrumental Intro)')
                            .join('\n');
                          setSmartPasteText(autoTagPlainLyricsWithSections(stripped, smartPasteDefaultBars, includeAutoIntro));
                        }}
                      >
                        <Sparkles size={13} /> Re-Run Auto-Section Detector
                      </button>
                    </div>
                  )}
                </div>

                {/* Live Visual Preview of Detected Song Sections */}
                {(() => {
                  const previewSections = parseRawLyricsIntoSections(smartPasteText, smartPasteDefaultBars);
                  if (previewSections.length === 0) return null;
                  return (
                    <div
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(6, 182, 212, 0.07)',
                        border: '1px solid rgba(6, 182, 212, 0.22)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem'
                      }}
                    >
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#67e8f9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Detected Song Structure ({previewSections.length} sections):
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {previewSections.map((sec, i) => {
                          const secChords = Array.from(
                            new Set(
                              (sec.lyrics.match(/\[([A-G][#b]?[^\]]*)\]/g) || []).map(m => m.slice(1, -1).trim())
                            )
                          );
                          return (
                            <span
                              key={i}
                              style={{
                                fontSize: '0.73rem',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '999px',
                                background: sec.part_type === 'Chorus' ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255,255,255,0.06)',
                                border: `1px solid ${sec.part_type === 'Chorus' ? 'rgba(99, 102, 241, 0.45)' : 'rgba(255,255,255,0.12)'}`,
                                color: 'var(--text-main)',
                                fontWeight: 600
                              }}
                            >
                              #{i + 1} {sec.label}{' '}
                              <span style={{ opacity: 0.65, fontWeight: 400 }}>
                                ({sec.bars}b{secChords.length > 0 ? ` • ${secChords.slice(0, 4).join('–')}` : ''})
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <textarea
                  className="input-field"
                  rows={11}
                  placeholder={`Paste plain lyrics here (we will automatically split them into Intro, Verse, Chorus, Bridge) or use Step 1 to fetch lyrics automatically!`}
                  value={smartPasteText}
                  onChange={(e) => setSmartPasteText(e.target.value)}
                  style={{ fontFamily: 'inherit', fontSize: '0.86rem', lineHeight: 1.5 }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      Default Bars:
                      <input
                        type="number"
                        min={1}
                        max={64}
                        value={smartPasteDefaultBars}
                        onChange={(e) => setSmartPasteDefaultBars(Math.max(1, parseInt(e.target.value, 10) || 8))}
                        className="input-field"
                        style={{ width: '56px', padding: '0.25rem 0.4rem', fontSize: '0.8rem', textAlign: 'center' }}
                      />
                    </label>

                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={smartPasteReplaceExisting}
                        onChange={(e) => setSmartPasteReplaceExisting(e.target.checked)}
                      />
                      Replace existing song parts ({selectedSong.parts.length})
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setIsLyricsToolOpen(false)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!smartPasteText.trim()}
                      onClick={handleApplySmartPasteSections}
                    >
                      <Sparkles size={15} /> Build Song Parts ({parseRawLyricsIntoSections(smartPasteText, smartPasteDefaultBars).length})
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
