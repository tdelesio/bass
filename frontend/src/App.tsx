import React, { useState, useEffect } from 'react';
import { 
  Music, Plus, Trash2, FolderPlus, Compass, ArrowRight, Menu, X, 
  Layers, FileText, Activity, Hash, Layers3, RefreshCw, ChevronLeft, ChevronRight,
  Download, Upload, Folder, FolderOpen, ChevronDown, ChevronUp, Edit3
} from 'lucide-react';
import FretBoardWidget from './components/FretBoardWidget.tsx';
import NoteWidget from './components/NoteWidget.tsx';
import RhythmWidget from './components/RhythmWidget.tsx';
import RomanNumeralWidget from './components/RomanNumeralWidget.tsx';

interface Folder {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  tuning: string;
  key_signature: string;
  folder_id?: string | null;
}

interface Widget {
  id: string;
  part_id: string;
  widget_type: 'fret_board' | 'note' | 'rhythm' | 'roman_numeral';
  order_index: number;
  data: any;
}

interface SongPart {
  id: string;
  song_id: string;
  part_type: 'Intro' | 'Verse' | 'Pre-Chorus' | 'Chorus' | 'Hook' | 'Bridge' | 'Outro' | 'Solo' | 'Interlude';
  order_index: number;
  widgets: Widget[];
}

interface SongDetails extends Song {
  parts: SongPart[];
}

const AVAILABLE_KEYS = [
  "C Major", "C Minor", "C# Major", "C# Minor", "D Major", "D Minor", 
  "Eb Major", "Eb Minor", "E Major", "E Minor", "F Major", "F Minor", 
  "F# Major", "F# Minor", "G Major", "G Minor", "Ab Major", "Ab Minor", 
  "A Major", "A Minor", "Bb Major", "Bb Minor", "B Major", "B Minor"
];

const AVAILABLE_TUNINGS = [
  "Standard (EADG)",
  "Half-Step Down (EbAbDbGb)",
  "Whole-Step Down (DGCF)",
  "Drop D (DADG)",
  "Drop C (CGCF)",
  "5-String Standard (BEADG)",
  "5-String Half-Step Down (BbEbAbDbGb)"
];

const PART_TYPES = [
  'Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Hook', 'Bridge', 'Outro', 'Solo', 'Interlude'
];

export default function App() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedSong, setSelectedSong] = useState<SongDetails | null>(null);
  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [collapsedParts, setCollapsedParts] = useState<Record<string, boolean>>({});

  // Folders state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Drag and drop state
  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverUncategorized, setDragOverUncategorized] = useState(false);

  // Widget Title Editing state
  const [editingWidgetTitleId, setEditingWidgetTitleId] = useState<string | null>(null);
  const [editingWidgetTitleValue, setEditingWidgetTitleValue] = useState<string>('');

  // Mobile layout sidebars
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNewSongModalOpen, setIsNewSongModalOpen] = useState(false);

  // Play Mode practicer states
  const [isPlayMode, setIsPlayMode] = useState(false);
  const [activePlayWidgetType, setActivePlayWidgetType] = useState<'roman_numeral' | 'fret_board' | 'rhythm' | 'note'>('roman_numeral');

  const handleTogglePlayMode = (playModeOn: boolean) => {
    setIsPlayMode(playModeOn);
    if (playModeOn) {
      setIsSidebarCollapsed(true);
    }
  };

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newTuning, setNewTuning] = useState('Standard (EADG)');
  const [newKey, setNewKey] = useState('C Major');

  // Backend API URI base (self-correcting for dev/prod proxy boundaries)
  const getApiBase = () => {
    const url = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    if (url.endsWith('/api')) return url;
    return url + '/api';
  };
  const API_BASE = getApiBase();

  // Load all songs & folders initially
  useEffect(() => {
    fetchSongs();
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${API_BASE}/folders`);
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch (err) {
      console.error('Error fetching folders list:', err);
    }
  };

  // Load full details whenever selection changes
  useEffect(() => {
    if (selectedSongId) {
      fetchSongDetails(selectedSongId);
    } else {
      setSelectedSong(null);
      setActivePartId(null);
    }
  }, [selectedSongId]);

  const fetchSongs = async () => {
    try {
      const res = await fetch(`${API_BASE}/songs`);
      if (res.ok) {
        const data = await res.json();
        setSongs(data);
        // Default select first song if available and nothing is selected
        if (data.length > 0 && !selectedSongId) {
          setSelectedSongId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching songs list:', err);
    }
  };

  // Backup entire database to a downloadable JSON file
  const handleBackupDatabase = async () => {
    try {
      const response = await fetch(`${API_BASE}/backup`);
      if (!response.ok) {
        throw new Error('Server failed to generate backup file.');
      }
      const data = await response.json();
      
      // Create a downloadable JSON blob
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchorNode.setAttribute("download", `bass_fret_backup_${dateStr}.json`);
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (err: any) {
      console.error('Backup error:', err);
      alert(`❌ Backup failed: ${err.message}`);
    }
  };

  // Restore entire database from a JSON backup file
  const handleRestoreDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Double confirmation dialog for high data safety!
    const confirmRestore = window.confirm(
      '⚠️ WARNING: Restoring from a backup will COMPLETELY OVERWRITE your current database!\n\nAll existing songs, parts, and fret/chord notes will be permanently deleted.\n\nAre you absolutely sure you want to proceed with the restore?'
    );
    if (!confirmRestore) {
      e.target.value = ''; // clear input
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileContent = event.target?.result as string;
        const parsedData = JSON.parse(fileContent);

        const response = await fetch(`${API_BASE}/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Server rejected the backup payload.');
        }

        alert(`✅ Restore Successful!\n\nSongs: ${result.songsCount}\nParts: ${result.partsCount}\nWidgets: ${result.widgetsCount}`);
        
        // Reset and fully reload the lists to sync state
        setSelectedSongId(null);
        setSelectedSong(null);
        setActivePartId(null);
        await fetchSongs();
        await fetchFolders();
      } catch (err: any) {
        console.error('Restore error:', err);
        alert(`❌ Restore failed: ${err.message}`);
      } finally {
        e.target.value = ''; // clear input
      }
    };
    
    reader.readAsText(file);
  };

  const fetchSongDetails = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/songs/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSong(data);
        // Default set active part to first part if exists
        if (data.parts && data.parts.length > 0) {
          // Keep active part selected if it still exists in the list, else default to first
          const exists = data.parts.some((p: any) => p.id === activePartId);
          if (!exists) {
            setActivePartId(data.parts[0].id);
          }
        } else {
          setActivePartId(null);
        }
      }
    } catch (err) {
      console.error('Error loading song details:', err);
    }
  };

  const handleAddSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newArtist.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          artist: newArtist,
          tuning: newTuning,
          key_signature: newKey
        })
      });

      if (res.ok) {
        const newlyCreated = await res.json();
        await fetchSongs();
        setSelectedSongId(newlyCreated.id);
        
        // Reset form & close modal
        setNewTitle('');
        setNewArtist('');
        setNewTuning('Standard (EADG)');
        setNewKey('C Major');
        setIsNewSongModalOpen(false);
      }
    } catch (err) {
      console.error('Error adding song:', err);
    }
  };

  const handleDeleteSong = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this song? All its parts and widgets will be permanently erased.')) return;

    try {
      const res = await fetch(`${API_BASE}/songs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedSongId === id) {
          setSelectedSongId(null);
        }
        fetchSongs();
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
        body: JSON.stringify({ name: newFolderName })
      });
      if (res.ok) {
        const data = await res.json();
        setFolders(prev => [...prev, data]);
        setExpandedFolders(prev => ({ ...prev, [data.id]: true }));
        setNewFolderName('');
        setIsNewFolderModalOpen(false);
      }
    } catch (err) {
      console.error('Error creating folder:', err);
    }
  };

  const handleDeleteFolder = async (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this folder? Organized songs will be safely moved to "Uncategorized Songs".')) return;
    try {
      const res = await fetch(`${API_BASE}/folders/${folderId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setFolders(prev => prev.filter(f => f.id !== folderId));
        setSongs(prev => prev.map(s => s.folder_id === folderId ? { ...s, folder_id: null } : s));
        if (selectedSong && selectedSong.folder_id === folderId) {
          setSelectedSong(prev => prev ? { ...prev, folder_id: null } : null);
        }
      }
    } catch (err) {
      console.error('Error deleting folder:', err);
    }
  };

  const handleMoveSongToFolder = async (songId: string, folderId: string | null) => {
    try {
      const res = await fetch(`${API_BASE}/songs/${songId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId })
      });
      if (res.ok) {
        setSongs(prev => prev.map(s => s.id === songId ? { ...s, folder_id: folderId } : s));
        if (selectedSong && selectedSong.id === songId) {
          setSelectedSong(prev => prev ? { ...prev, folder_id: folderId } : null);
        }
      }
    } catch (err) {
      console.error('Error organizing song into folder:', err);
    }
  };

  const handleAddPart = async (partType: string) => {
    if (!selectedSongId) return;

    try {
      const res = await fetch(`${API_BASE}/songs/${selectedSongId}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part_type: partType })
      });

      if (res.ok) {
        const newPart = await res.json();
        await fetchSongDetails(selectedSongId);
        setActivePartId(newPart.id);
      }
    } catch (err) {
      console.error('Error adding part:', err);
    }
  };

  const handleDeletePart = async (partId: string) => {
    if (!confirm('Delete this part and all its widgets?')) return;

    try {
      const res = await fetch(`${API_BASE}/parts/${partId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchSongDetails(selectedSongId!);
      }
    } catch (err) {
      console.error('Error deleting part:', err);
    }
  };

  const handleAddWidget = async (partId: string, widgetType: string) => {
    try {
      const res = await fetch(`${API_BASE}/parts/${partId}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widget_type: widgetType })
      });

      if (res.ok) {
        fetchSongDetails(selectedSongId!);
      }
    } catch (err) {
      console.error('Error adding widget:', err);
    }
  };

  const handleSaveWidgetData = async (widgetId: string, updatedData: any) => {
    try {
      await fetch(`${API_BASE}/widgets/${widgetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: updatedData })
      });
      // Silent save, update the local memory directly so we don't query the db continuously on every click
      if (selectedSong) {
        const updatedParts = selectedSong.parts.map(part => {
          return {
            ...part,
            widgets: part.widgets.map(w => {
              if (w.id === widgetId) {
                return { ...w, data: updatedData };
              }
              return w;
            })
          };
        });
        setSelectedSong({ ...selectedSong, parts: updatedParts });
      }
    } catch (err) {
      console.error('Error saving widget data:', err);
    }
  };

  const handleSaveWidgetTitle = (widget: any, newTitle: string) => {
    const updatedData = {
      ...(widget.data || {}),
      title: newTitle.trim()
    };
    handleSaveWidgetData(widget.id, updatedData);
    setEditingWidgetTitleId(null);
  };

  const handleDeleteWidget = async (widgetId: string) => {
    if (!confirm('Are you sure you want to delete this widget?')) return;

    try {
      const res = await fetch(`${API_BASE}/widgets/${widgetId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSongDetails(selectedSongId!);
      }
    } catch (err) {
      console.error('Error deleting widget:', err);
    }
  };

  // Helper mapping widget title labels
  const getWidgetTypeLabel = (type: string) => {
    switch (type) {
      case 'fret_board': return { name: 'Interactive Fret Board', icon: <Layers3 size={15} style={{ color: 'var(--primary)' }} /> };
      case 'note': return { name: 'Practice Notes', icon: <FileText size={15} style={{ color: 'var(--accent-purple)' }} /> };
      case 'rhythm': return { name: 'Rhythm step sequencer', icon: <Activity size={15} style={{ color: 'var(--secondary)' }} /> };
      case 'roman_numeral': return { name: 'Roman Numeral Chord Map', icon: <Hash size={15} style={{ color: 'var(--accent-green)' }} /> };
      default: return { name: 'Widget', icon: <Compass size={15} /> };
    }
  };

  const currentPart = selectedSong?.parts.find(p => p.id === activePartId);

  const renderSongCard = (s: Song) => {
    const isDraggingThis = draggedSongId === s.id;
    return (
      <div 
        key={s.id} 
        draggable={true}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', s.id);
          setDraggedSongId(s.id);
        }}
        onDragEnd={() => {
          setDraggedSongId(null);
        }}
        className={`song-item ${selectedSongId === s.id ? 'active' : ''} ${isDraggingThis ? 'dragging' : ''}`}
        onClick={() => {
          setSelectedSongId(s.id);
          setIsSidebarOpen(false); // Close on mobile navigation
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <span className="song-title">{s.title}</span>
          <button 
            className="btn btn-secondary btn-icon" 
            style={{ width: '24px', height: '24px', opacity: 0.6 }} 
            onClick={(e) => handleDeleteSong(s.id, e)}
          >
            <Trash2 size={12} style={{ color: 'var(--accent-red)' }} />
          </button>
        </div>
        <span className="song-artist">{s.artist}</span>
        <div className="song-meta-badges">
          <span className="badge badge-primary">{s.tuning.split(' (')[0]}</span>
          <span className="badge badge-secondary">{s.key_signature}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      {/* Mobile Toggle Menu Bar */}
      <button className="menu-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* SIDEBAR */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Music size={22} style={{ color: 'var(--primary)', filter: 'drop-shadow(0 0 8px var(--primary))' }} />
            <h1>Bass Fret Lesson</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setIsNewSongModalOpen(true)}>
              <Plus size={16} /> Add Song
            </button>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
              onClick={() => setIsNewFolderModalOpen(true)}
              title="Create Folder"
            >
              <FolderPlus size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Song Items */}
        <div className="song-list-scroll">
          {/* Dynamic Uncategorized Drop Zone (Visible when dragging a song) */}
          {draggedSongId && (
            <div 
              className={`uncategorized-drop-zone ${dragOverUncategorized ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverUncategorized(true);
              }}
              onDragLeave={() => setDragOverUncategorized(false)}
              onDrop={(e) => {
                e.preventDefault();
                const songId = e.dataTransfer.getData('text/plain') || draggedSongId;
                setDragOverUncategorized(false);
                if (songId) {
                  handleMoveSongToFolder(songId, null);
                }
              }}
            >
              <span>Move out of folder (Drop here)</span>
            </div>
          )}

          {/* Render Folders */}
          {folders.map(folder => {
            const folderSongs = songs.filter(s => s.folder_id === folder.id);
            const isExpanded = expandedFolders[folder.id] !== false; // Default to expanded
            const isDragOver = dragOverFolderId === folder.id;

            return (
              <div 
                key={folder.id} 
                className={`folder-group ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedSongId && songs.find(s => s.id === draggedSongId)?.folder_id !== folder.id) {
                    setDragOverFolderId(folder.id);
                  }
                }}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const songId = e.dataTransfer.getData('text/plain') || draggedSongId;
                  setDragOverFolderId(null);
                  if (songId) {
                    handleMoveSongToFolder(songId, folder.id);
                  }
                }}
              >
                <div 
                  className="folder-header" 
                  onClick={() => setExpandedFolders(prev => ({ ...prev, [folder.id]: !isExpanded }))}
                >
                  <div className="folder-header-left">
                    {isExpanded ? <FolderOpen size={16} style={{ color: 'var(--primary)' }} /> : <Folder size={16} style={{ color: 'var(--primary)' }} />}
                    <span className="folder-title" title={folder.name}>{folder.name}</span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>({folderSongs.length})</span>
                  </div>
                  <div className="folder-actions">
                    <button 
                      className="folder-btn" 
                      onClick={(e) => handleDeleteFolder(folder.id, e)}
                      title="Delete Folder"
                    >
                      <Trash2 size={12} />
                    </button>
                    {isExpanded ? <ChevronUp size={14} style={{ opacity: 0.5 }} /> : <ChevronDown size={14} style={{ opacity: 0.5 }} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="folder-songs-list">
                    {folderSongs.length === 0 ? (
                      <div style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'center', fontStyle: 'italic' }}>
                        Folder is empty. Drag songs here!
                      </div>
                    ) : (
                      folderSongs.map(renderSongCard)
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Render Uncategorized Songs (songs that have no folder_id) */}
          {songs.length === 0 && folders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              No songs added yet. Start by clicking Add Song!
            </div>
          ) : (
            <>
              {folders.length > 0 && songs.filter(s => !s.folder_id).length > 0 && (
                <div style={{ 
                  fontSize: '0.7rem', 
                  color: 'var(--text-dim)', 
                  fontWeight: 600, 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em', 
                  marginTop: '0.75rem',
                  marginBottom: '0.25rem',
                  paddingLeft: '0.25rem'
                }}>
                  Uncategorized Songs
                </div>
              )}
              {songs.filter(s => !s.folder_id).map(renderSongCard)}
            </>
          )}
        </div>

        {/* Sidebar Footer for Backup and Restore */}
        <div className="sidebar-footer" style={{
          padding: isSidebarCollapsed ? '0.75rem 0.25rem' : '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          background: 'rgba(0, 0, 0, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isSidebarCollapsed ? 'center' : 'stretch',
          gap: isSidebarCollapsed ? '0.6rem' : '0.5rem',
          marginTop: 'auto'
        }}>
          {!isSidebarCollapsed && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Data Center
            </span>
          )}
          
          <div style={{ 
            display: 'flex', 
            flexDirection: isSidebarCollapsed ? 'column' : 'row', 
            gap: '0.5rem',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <button 
              className="btn btn-secondary" 
              onClick={handleBackupDatabase}
              style={{ 
                flex: isSidebarCollapsed ? '0 0 auto' : 1, 
                width: isSidebarCollapsed ? '28px' : 'auto',
                height: isSidebarCollapsed ? '28px' : 'auto',
                padding: isSidebarCollapsed ? '0' : '0.4rem', 
                fontSize: '0.72rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '0.3rem',
                borderRadius: isSidebarCollapsed ? '50%' : 'var(--radius-sm)'
              }}
              title="Download entire database backup as a JSON file"
            >
              <Download size={13} />
              {!isSidebarCollapsed && <span>Backup</span>}
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={() => document.getElementById('restore-file-input')?.click()}
              style={{ 
                flex: isSidebarCollapsed ? '0 0 auto' : 1, 
                width: isSidebarCollapsed ? '28px' : 'auto',
                height: isSidebarCollapsed ? '28px' : 'auto',
                padding: isSidebarCollapsed ? '0' : '0.4rem', 
                fontSize: '0.72rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '0.3rem',
                borderRadius: isSidebarCollapsed ? '50%' : 'var(--radius-sm)'
              }}
              title="Restore entire database from a JSON backup file"
            >
              <Upload size={13} />
              {!isSidebarCollapsed && <span>Restore</span>}
            </button>
          </div>
          
          {/* Hidden file input for restore trigger */}
          <input 
            id="restore-file-input" 
            type="file" 
            accept=".json" 
            onChange={handleRestoreDatabase} 
            style={{ display: 'none' }} 
          />
        </div>
      </aside>

      {/* MAIN WORKBENCH PANEL */}
      <main className="workbench">
        {selectedSong ? (
          <>
            {/* Header info */}
            <header className="workbench-header">
              <div className="song-info-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button 
                  className="btn btn-secondary btn-icon collapse-sidebar-btn" 
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  title={isSidebarCollapsed ? "Expand Song List Sidebar" : "Collapse Song List Sidebar"}
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    marginRight: '0.25rem',
                    flexShrink: 0
                  }}
                >
                  {isSidebarCollapsed ? (
                    <ChevronRight size={16} style={{ color: 'var(--primary)' }} />
                  ) : (
                    <ChevronLeft size={16} style={{ color: 'var(--text-dim)' }} />
                  )}
                </button>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', lineHeight: 1.2 }}>{selectedSong.title}</h2>
                  <p style={{ margin: 0, marginTop: '2px', fontSize: '0.85rem' }}>by {selectedSong.artist} &bull; <strong style={{ color: 'var(--primary)' }}>{selectedSong.tuning}</strong> &bull; <strong style={{ color: 'var(--secondary)' }}>{selectedSong.key_signature}</strong></p>
                </div>
              </div>

              {/* Segmented Mode Control */}
              <div style={{
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '3px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                marginRight: '1rem',
                marginLeft: 'auto'
              }}>
                <button
                  onClick={() => handleTogglePlayMode(false)}
                  style={{
                    background: !isPlayMode ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    color: !isPlayMode ? 'var(--primary)' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Edit Mode
                </button>
                <button
                  onClick={() => handleTogglePlayMode(true)}
                  style={{
                    background: isPlayMode ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    color: isPlayMode ? 'var(--primary)' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Play Mode
                </button>
              </div>

              {/* Reload Button */}
              <button className="btn btn-secondary btn-icon" onClick={() => fetchSongDetails(selectedSongId!)} title="Sync database">
                <RefreshCw size={15} />
              </button>
            </header>

            {/* Workbench Content */}
            <div className="workbench-content">
              {/* Parts Navigation Bar or Play Mode Switcher */}
              {!isPlayMode ? (
                <div className="parts-navigation">
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600, marginRight: '0.5rem', textTransform: 'uppercase' }}>Parts:</span>
                  {selectedSong.parts.map((p) => (
                    <button 
                      key={p.id}
                      className={`part-tab ${activePartId === p.id ? 'active' : ''}`}
                      onClick={() => setActivePartId(p.id)}
                    >
                      {p.part_type}
                    </button>
                  ))}

                  {/* Add new part toolbar drop-out */}
                  <div style={{ position: 'relative', display: 'inline-block', marginLeft: 'auto' }}>
                    <select 
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddPart(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="input-field"
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', width: '130px', cursor: 'pointer' }}
                    >
                      <option value="" disabled>+ Add Song Part</option>
                      {PART_TYPES.filter(type => !selectedSong.parts.some(p => p.part_type === type)).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                /* Play Mode Switcher */
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1.5rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: '4px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap'
                }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600, paddingLeft: '0.5rem', textTransform: 'uppercase', flexShrink: 0 }}>Practice View:</span>
                  {[
                    { type: 'roman_numeral', label: 'Roman Chord Map', icon: <Hash size={14} /> },
                    { type: 'fret_board', label: 'Fret Board Graph', icon: <Layers3 size={14} /> },
                    { type: 'rhythm', label: 'Rhythm Sequencer', icon: <Activity size={14} /> },
                    { type: 'note', label: 'Notes Notepad', icon: <FileText size={14} /> }
                  ].map((btn) => (
                    <button
                      key={btn.type}
                      onClick={() => setActivePlayWidgetType(btn.type as any)}
                      style={{
                        background: activePlayWidgetType === btn.type ? 'rgba(99,102,241,0.15)' : 'transparent',
                        color: activePlayWidgetType === btn.type ? 'var(--primary)' : 'var(--text-muted)',
                        border: activePlayWidgetType === btn.type ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {btn.icon}
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Workbench main workspace (conditional Edit/Play) */}
              {!isPlayMode ? (
                /* Edit Mode Workspace content area */
                currentPart ? (
                  <section className="part-section">
                    <div className="part-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div 
                        onClick={() => setCollapsedParts(prev => ({ ...prev, [currentPart.id]: !prev[currentPart.id] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}
                        title={collapsedParts[currentPart.id] ? "Expand Part Content" : "Collapse Part Content"}
                      >
                        <button className="btn btn-secondary btn-icon" style={{ width: '28px', height: '28px', padding: 0 }}>
                          <ChevronRight 
                            size={14} 
                            style={{ 
                              transform: collapsedParts[currentPart.id] ? 'rotate(0deg)' : 'rotate(90deg)', 
                              transition: 'transform 0.2s ease' 
                            }} 
                          />
                        </button>
                        <h3 className="part-title-label" style={{ margin: 0 }}>{currentPart.part_type} Content</h3>
                      </div>
                      <button className="btn btn-danger" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleDeletePart(currentPart.id)}>
                        <Trash2 size={12} /> Delete Part
                      </button>
                    </div>

                    {/* Render Widgets sequentially if not collapsed */}
                    {!collapsedParts[currentPart.id] ? (
                      <>
                        {currentPart.widgets.length === 0 ? (
                          <div style={{
                            padding: '3rem 1.5rem',
                            textAlign: 'center',
                            border: '1px dashed rgba(255,255,255,0.06)',
                            borderRadius: 'var(--radius-lg)',
                            color: 'var(--text-muted)'
                          }}>
                            <Layers style={{ strokeWidth: 1.5, marginBottom: '0.75rem', color: 'var(--primary)' }} />
                            <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>This part has no widgets yet. Let's add standard lesson tools below!</p>
                          </div>
                        ) : (
                          currentPart.widgets.map((widget) => {
                            const meta = getWidgetTypeLabel(widget.widget_type);
                            const widgetTitle = (widget.widget_type === 'fret_board' && widget.data?.title) 
                              ? widget.data.title 
                              : meta.name;
                            const isEditingTitle = editingWidgetTitleId === widget.id;
                            return (
                              <div key={widget.id} className="glass-card widget-card">
                                <div className="widget-header">
                                  {isEditingTitle ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                                      {meta.icon}
                                      <input 
                                        type="text"
                                        className="input-field"
                                        style={{
                                          padding: '0.15rem 0.5rem',
                                          fontSize: '0.85rem',
                                          background: 'rgba(0,0,0,0.25)',
                                          border: '1px solid var(--primary)',
                                          borderRadius: 'var(--radius-xs)',
                                          color: 'var(--text-main)',
                                          height: 'auto',
                                          maxWidth: '220px',
                                          margin: 0
                                        }}
                                        autoFocus
                                        value={editingWidgetTitleValue}
                                        onChange={(e) => setEditingWidgetTitleValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveWidgetTitle(widget, editingWidgetTitleValue);
                                          } else if (e.key === 'Escape') {
                                            setEditingWidgetTitleId(null);
                                          }
                                        }}
                                        onBlur={() => handleSaveWidgetTitle(widget, editingWidgetTitleValue)}
                                      />
                                    </div>
                                  ) : (
                                    <span className="widget-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      {meta.icon}
                                      {widgetTitle}
                                      {widget.widget_type === 'fret_board' && (
                                        <button 
                                          className="btn btn-secondary btn-icon"
                                          style={{ width: '22px', height: '22px', padding: 0, opacity: 0.6, border: 'none', background: 'transparent' }}
                                          title="Rename Fret Board"
                                          onClick={() => {
                                            setEditingWidgetTitleId(widget.id);
                                            setEditingWidgetTitleValue(widget.data?.title || '');
                                          }}
                                        >
                                          <Edit3 size={11} style={{ color: 'var(--primary)' }} />
                                        </button>
                                      )}
                                    </span>
                                  )}
                                  <div className="widget-actions">
                                    <button className="btn btn-secondary btn-icon" style={{ width: '28px', height: '28px' }} onClick={() => handleDeleteWidget(widget.id)}>
                                      <Trash2 size={13} style={{ color: 'var(--accent-red)' }} />
                                    </button>
                                  </div>
                                </div>

                                {/* Dynamic components binding */}
                                {widget.widget_type === 'fret_board' && (
                                  <FretBoardWidget 
                                    widgetId={widget.id}
                                    tuning={selectedSong.tuning}
                                    initialData={widget.data || {}}
                                    onSave={(data) => handleSaveWidgetData(widget.id, data)}
                                  />
                                )}

                                {widget.widget_type === 'note' && (
                                  <NoteWidget 
                                    widgetId={widget.id}
                                    initialData={widget.data || {}}
                                    onSave={(data) => handleSaveWidgetData(widget.id, data)}
                                    isPlayMode={false}
                                  />
                                )}

                                {widget.widget_type === 'rhythm' && (
                                  <RhythmWidget 
                                    widgetId={widget.id}
                                    initialData={widget.data || {}}
                                    onSave={(data) => handleSaveWidgetData(widget.id, data)}
                                  />
                                )}

                                {widget.widget_type === 'roman_numeral' && (
                                  <RomanNumeralWidget 
                                    widgetId={widget.id}
                                    songKey={selectedSong?.key_signature ? selectedSong.key_signature.split(' ')[0] : 'C'}
                                    initialData={widget.data || {}}
                                    onSave={(data) => handleSaveWidgetData(widget.id, data)}
                                  />
                                )}
                              </div>
                            );
                          })
                        )}

                        {/* Widget Creation Toolbar */}
                        <div className="widget-creator-toolbar">
                          <span className="widget-creator-title">+ ADD LESSON WIDGET</span>
                          <div className="widget-btn-group">
                            <button className="btn btn-secondary" onClick={() => handleAddWidget(currentPart.id, 'fret_board')}>
                              <Layers3 size={14} style={{ color: 'var(--primary)' }} /> Fret Board Graph
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleAddWidget(currentPart.id, 'note')}>
                              <FileText size={14} style={{ color: 'var(--accent-purple)' }} /> Notes Notepad
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleAddWidget(currentPart.id, 'rhythm')}>
                              <Activity size={14} style={{ color: 'var(--secondary)' }} /> Rhythm Sequencer
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleAddWidget(currentPart.id, 'roman_numeral')}>
                              <Hash size={14} style={{ color: 'var(--accent-green)' }} /> Roman Chord Map
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{
                        padding: '2rem 1.5rem',
                        textAlign: 'center',
                        background: 'rgba(255,255,255,0.01)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px dashed rgba(255,255,255,0.03)',
                        color: 'var(--text-dim)',
                        fontSize: '0.85rem'
                      }}>
                        <Layers style={{ strokeWidth: 1, width: '28px', height: '28px', color: 'var(--primary)', marginBottom: '0.5rem', opacity: 0.5 }} />
                        <p style={{ margin: 0 }}>This song part content is collapsed to save space.</p>
                        <button 
                          className="btn btn-secondary" 
                          style={{ marginTop: '0.75rem', padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                          onClick={() => setCollapsedParts(prev => ({ ...prev, [currentPart.id]: false }))}
                        >
                          Expand Widgets Stack
                        </button>
                      </div>
                    )}
                  </section>
                ) : (
                  <div style={{
                    padding: '5rem 2rem',
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.01)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px dashed rgba(255,255,255,0.05)',
                    color: 'var(--text-muted)'
                  }}>
                    <Layers style={{ strokeWidth: 1, width: '48px', height: '48px', color: 'var(--primary)', marginBottom: '1.25rem' }} />
                    <h4 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>No Song Parts Created</h4>
                    <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem', maxWidth: '380px', margin: '0 auto' }}>To begin learning, choose or add a song section like an Intro or Verse from the upper bar.</p>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                      {PART_TYPES.slice(0, 4).map(type => (
                        <button key={type} className="btn btn-secondary" onClick={() => handleAddPart(type)}>
                          + {type}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                /* Play Mode Workspace: tabless continuous vertical parts stack for active widget type */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {(() => {
                    const partsWithActiveWidgets = selectedSong.parts.filter(part => 
                      part.widgets.some(w => w.widget_type === activePlayWidgetType)
                    );

                    if (partsWithActiveWidgets.length === 0) {
                      const widgetLabels = {
                        roman_numeral: 'Roman Chord Map',
                        fret_board: 'Fret Board Graph',
                        rhythm: 'Rhythm Sequencer',
                        note: 'Notes Notepad'
                      };
                      return (
                        <div style={{
                          padding: '5rem 2rem',
                          textAlign: 'center',
                          background: 'rgba(255,255,255,0.01)',
                          borderRadius: 'var(--radius-lg)',
                          border: '1px dashed rgba(255,255,255,0.05)',
                          color: 'var(--text-muted)'
                        }}>
                          <Layers style={{ strokeWidth: 1, width: '48px', height: '48px', color: 'var(--primary)', marginBottom: '1.25rem' }} />
                          <h4 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>No {widgetLabels[activePlayWidgetType]}s</h4>
                          <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem', maxWidth: '380px', margin: '0 auto' }}>
                            This song doesn't contain any {widgetLabels[activePlayWidgetType]} widgets yet. Switch back to Edit Mode to build some!
                          </p>
                        </div>
                      );
                    }

                    return partsWithActiveWidgets.map(part => {
                      const matchingWidgets = part.widgets.filter(w => w.widget_type === activePlayWidgetType);
                      return (
                        <div key={part.id} className="play-part-section" style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1.25rem',
                          background: 'rgba(15, 20, 35, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.04)',
                          borderRadius: 'var(--radius-lg)',
                          padding: '1.5rem',
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
                          backdropFilter: 'blur(8px)'
                        }}>
                          {/* Beautiful Part Header Header */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            paddingBottom: '0.75rem',
                            marginBottom: '0.25rem'
                          }}>
                            <div style={{
                              width: '8px',
                              height: '16px',
                              borderRadius: '4px',
                              background: 'var(--primary)'
                            }} />
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{part.part_type}</h3>
                          </div>

                          {/* Matching Widgets continuous list */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {matchingWidgets.map(widget => (
                              <div key={widget.id} className="play-widget-wrapper">
                                {widget.widget_type === 'fret_board' && (
                                  <FretBoardWidget 
                                    widgetId={widget.id}
                                    tuning={selectedSong.tuning}
                                    initialData={widget.data || {}}
                                    onSave={(data) => handleSaveWidgetData(widget.id, data)}
                                    isPlayMode={true}
                                  />
                                )}

                                {widget.widget_type === 'note' && (
                                  <NoteWidget 
                                    widgetId={widget.id}
                                    initialData={widget.data || {}}
                                    onSave={(data) => handleSaveWidgetData(widget.id, data)}
                                    isPlayMode={true}
                                  />
                                )}

                                {widget.widget_type === 'rhythm' && (
                                  <RhythmWidget 
                                    widgetId={widget.id}
                                    initialData={widget.data || {}}
                                    onSave={(data) => handleSaveWidgetData(widget.id, data)}
                                    isPlayMode={true}
                                  />
                                )}

                                {widget.widget_type === 'roman_numeral' && (
                                  <RomanNumeralWidget 
                                    widgetId={widget.id}
                                    songKey={selectedSong?.key_signature ? selectedSong.key_signature.split(' ')[0] : 'C'}
                                    initialData={widget.data || {}}
                                    onSave={(data) => handleSaveWidgetData(widget.id, data)}
                                    isPlayMode={true}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <Music size={48} style={{ strokeWidth: 1, color: 'var(--text-dim)', marginBottom: '0.5rem' }} />
            <h3 style={{ color: 'var(--text-main)' }}>Select or Add a Song</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '320px' }}>Load an existing song from the sidebar or make a brand new study file with your teacher.</p>
          </div>
        )}
      </main>

      {/* NEW SONG DIALOG MODAL */}
      {isNewSongModalOpen && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <div className="modal-header">
              <h3>Create Song File</h3>
            </div>
            <form onSubmit={handleAddSong}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Song Title</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    required 
                    placeholder="e.g. Under The Bridge" 
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Artist Name</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    required 
                    placeholder="e.g. Red Hot Chili Peppers" 
                    value={newArtist}
                    onChange={(e) => setNewArtist(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Bass Tuning</label>
                  <select 
                    className="input-field"
                    value={newTuning}
                    onChange={(e) => setNewTuning(e.target.value)}
                  >
                    {AVAILABLE_TUNINGS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Song Key Signature</label>
                  <select 
                    className="input-field"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                  >
                    {AVAILABLE_KEYS.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewSongModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create study file
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW FOLDER DIALOG MODAL */}
      {isNewFolderModalOpen && (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Create New Folder</h3>
            </div>
            <form onSubmit={handleCreateFolder}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Folder Name</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    required 
                    autoFocus
                    placeholder="e.g. Rock Classics" 
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewFolderModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
