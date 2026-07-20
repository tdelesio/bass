import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Circle, Trash2, Award, Zap, RefreshCw } from 'lucide-react';

interface FretNote {
  id: string;
  string: number; // 1-indexed from thinnest (G) to thickest (E/B)
  fret: number;   // 0 for open string, 1-15 for frets
  sequence: number; // Order index: 1, 2, 3...
  noteName: string;
}

interface FretBoardWidgetProps {
  widgetId: string;
  tuning: string;
  initialData: {
    notes?: FretNote[];
    title?: string;
  };
  onSave: (data: { notes: FretNote[]; title?: string }) => void;
  isPlayMode?: boolean;
}

// Map chromatic scale
const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Get open string base MIDI notes for each tuning option (from high-to-low / thinnest-to-thickest string index)
const getTuningBaseMidiNotes = (tuningName: string): number[] => {
  const normalized = tuningName.toLowerCase();
  if (normalized.includes('5-string half-step down')) {
    // Gb2, Db2, Ab1, Eb1, Bb0
    return [42, 37, 32, 27, 22];
  }
  if (normalized.includes('5-string standard')) {
    // G2, D2, A1, E1, B0
    return [43, 38, 33, 28, 23];
  }
  if (normalized.includes('drop c')) {
    // F2, C2, G1, C1
    return [41, 36, 31, 24];
  }
  if (normalized.includes('drop d')) {
    // G2, D2, A1, D1
    return [43, 38, 33, 26];
  }
  if (normalized.includes('whole-step down')) {
    // F2, C2, G1, D1
    return [41, 36, 31, 26];
  }
  if (normalized.includes('half-step down')) {
    // Gb2, Db2, Ab1, Eb1
    return [42, 37, 32, 27];
  }
  // Standard EADG: G2 (43), D2 (38), A1 (33), E1 (28)
  return [43, 38, 33, 28];
};

// Calculate pitch name from base MIDI note and fret
const calculateNoteName = (baseMidi: number, fret: number): string => {
  const midi = baseMidi + fret;
  return CHROMATIC_SCALE[midi % 12];
};

// Calculate frequency for synthesizer
const calculateFrequency = (baseMidi: number, fret: number): number => {
  const midi = baseMidi + fret;
  return 440 * Math.pow(2, (midi - 69) / 12);
};

export default function FretBoardWidget({ widgetId, tuning, initialData, onSave, isPlayMode }: FretBoardWidgetProps) {
  const [notes, setNotes] = useState<FretNote[]>(initialData.notes || []);
  const [customTitle, setCustomTitle] = useState<string>(initialData.title || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayIndex, setCurrentPlayIndex] = useState<number | null>(null);
  const [playbackBpm, setPlaybackBpm] = useState(100);
  const [loopPlayback, setLoopToggle] = useState(false);

  const playbackTimerRef = useRef<any | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Get string notes based on selected tuning
  const stringBases = getTuningBaseMidiNotes(tuning);
  const stringsCount = stringBases.length;
  const maxFrets = 15;

  // Sync initialData
  useEffect(() => {
    if (initialData.notes) {
      setNotes(initialData.notes);
    }
    if (initialData.title !== undefined) {
      setCustomTitle(initialData.title || '');
    }
  }, [initialData]);

  // Clean up playback on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  const saveChanges = (updatedNotes: FretNote[]) => {
    setNotes(updatedNotes);
    onSave({ notes: updatedNotes, title: customTitle });
  };

  const handleTitleChange = (newTitle: string) => {
    setCustomTitle(newTitle);
    onSave({ notes, title: newTitle });
  };

  // Synthesizes a realistic warm bass tone using Triangle wave + Gain ramp-down + Lowpass filter
  const playNoteAudio = (frequency: number) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Create Web Audio nodes
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle'; // Warm, full sound profile suitable for bass
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      // Lowpass filter to shave off high frequency hiss, making it sound deep and rich
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, ctx.currentTime);

      // Amplitude Envelope: Instant attack, smooth exponential decay
      gainNode.gain.setValueAtTime(0.6, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

      // Node connections
      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Start and Stop
      osc.start();
      osc.stop(ctx.currentTime + 0.9);
    } catch (err) {
      console.error('AudioContext synthesis failed:', err);
    }
  };

  // Handles clicking a fret node: always appends to sequence to support note repetition
  const handleFretClick = (stringIdx: number, fretIndex: number) => {
    const baseMidi = stringBases[stringIdx - 1];
    const frequency = calculateFrequency(baseMidi, fretIndex);

    // Play synthesized audio tone
    playNoteAudio(frequency);

    // If we are in play mode, do not append to sequence or save changes
    if (isPlayMode) return;

    const noteName = calculateNoteName(baseMidi, fretIndex);

    // Create new note at the end of the sequence
    const newSequence = notes.length + 1;
    const newNote: FretNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      string: stringIdx,
      fret: fretIndex,
      sequence: newSequence,
      noteName,
    };

    saveChanges([...notes, newNote]);
  };

  // Handles deleting a specific note by its ID and resequencing remaining notes sequentially
  const handleDeleteNoteById = (noteId: string) => {
    const filtered = notes.filter(n => n.id !== noteId);
    
    // Sort remaining notes by their previous sequence, and reassign sequential numbers (1, 2, 3...)
    const resequenced = [...filtered]
      .sort((a, b) => a.sequence - b.sequence)
      .map((n, idx) => ({
        ...n,
        sequence: idx + 1
      }));

    saveChanges(resequenced);
  };

  // Trigger Playback Sequence
  const startPlayback = () => {
    if (notes.length === 0) return;
    stopPlayback();
    setIsPlaying(true);

    // Warm up and activate AudioContext on direct user tap event for mobile/phone browsers
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch (e) {
      console.warn('AudioContext touchstart activation failed:', e);
    }

    let currentIndex = 0;
    const intervalMs = (60 / playbackBpm) * 1000;

    const playStep = () => {
      setCurrentPlayIndex(currentIndex);

      // Find current note metadata
      const activeNote = notes.find(n => n.sequence === currentIndex + 1);
      if (activeNote) {
        const baseMidi = stringBases[activeNote.string - 1];
        const freq = calculateFrequency(baseMidi, activeNote.fret);
        playNoteAudio(freq);
      }

      currentIndex++;

      if (currentIndex >= notes.length) {
        if (loopPlayback) {
          currentIndex = 0;
          playbackTimerRef.current = setTimeout(playStep, intervalMs);
        } else {
          playbackTimerRef.current = setTimeout(() => {
            stopPlayback();
          }, intervalMs);
        }
      } else {
        playbackTimerRef.current = setTimeout(playStep, intervalMs);
      }
    };

    // Run first step instantly
    playStep();
  };

  const stopPlayback = () => {
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setIsPlaying(false);
    setCurrentPlayIndex(null);
  };

  const clearFretboard = () => {
    stopPlayback();
    saveChanges([]);
  };

  // Generate string labels based on tuning
  const getStringLabels = (): string[] => {
    const default4 = ['G', 'D', 'A', 'E'];
    const default5 = ['G', 'D', 'A', 'E', 'B'];

    const normalized = tuning.toLowerCase();
    if (normalized.includes('5-string')) {
      if (normalized.includes('half-step')) return ['G♭', 'D♭', 'A♭', 'E♭', 'B♭'];
      return default5;
    }
    if (normalized.includes('half-step down')) return ['G♭', 'D♭', 'A♭', 'E♭'];
    if (normalized.includes('whole-step down')) return ['F', 'C', 'G', 'D'];
    if (normalized.includes('drop c')) return ['F', 'C', 'G', 'C'];
    if (normalized.includes('drop d')) return ['G', 'D', 'A', 'D'];

    return default4;
  };

  const stringLabels = getStringLabels();

  /* ==========================================================================
     SVG CONNECTION LINE RENDERER
     Calculates bezier paths between sequential notes
     ========================================================================== */
  const renderSVGConnections = () => {
    if (notes.length < 2) return null;

    // Create an ordered array of notes
    const orderedNotes = [...notes].sort((a, b) => a.sequence - b.sequence);

    // Pre-calculate positions based on grid structure
    // Stringspacing is ~44px, Fretwidth is ~60px
    const getCoordinates = (note: FretNote) => {
      const x = 50 + note.fret * 60 + 30; // 50px offset + fret * 60px + half fret width
      const y = (note.string - 1) * 44 + 22; // string gap 44px + centering offset
      return { x, y };
    };

    const pathDArray: string[] = [];

    for (let i = 0; i < orderedNotes.length - 1; i++) {
      const start = getCoordinates(orderedNotes[i]);
      const end = getCoordinates(orderedNotes[i + 1]);

      // Calculate simple control point for smooth organic curve (curving upwards or downwards)
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const controlX = start.x + dx / 2;
      const controlY = start.y + dy / 2 - Math.sign(dx || 1) * 20; // Slight arch

      pathDArray.push(`M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`);
    }

    return (
      <svg className="fretboard-svg-overlay" style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '1000px', // Matches the width of the board
        height: `${stringsCount * 44}px`,
        pointerEvents: 'none',
        zIndex: 5,
      }}>
        <defs>
          <linearGradient id="glow-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--secondary)" stopOpacity="0.8" />
          </linearGradient>
          <filter id="line-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {pathDArray.map((pathD, idx) => (
          <path
            key={idx}
            d={pathD}
            fill="none"
            stroke="url(#glow-gradient)"
            strokeWidth="3"
            filter="url(#line-glow)"
            style={{
              strokeDasharray: '6',
              animation: 'dash 15s linear infinite',
            }}
          />
        ))}
      </svg>
    );
  };

  return (
    <div className="fretboard-widget">
      {/* Editable Widget Name */}
      {!isPlayMode ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.75rem',
          padding: '0.4rem 0.75rem',
          background: 'rgba(255, 255, 255, 0.01)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(255,255,255,0.02)',
          maxWidth: '350px'
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fret Board Name:</span>
          <input
            type="text"
            className="input-field"
            style={{
              padding: '0.2rem 0.5rem',
              fontSize: '0.85rem',
              background: 'rgba(0,0,0,0.15)',
              border: '1px solid rgba(255,255,255,0.05)',
              height: 'auto',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-main)',
              flex: 1
            }}
            placeholder="e.g. Verse Bassline"
            value={customTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
          />
        </div>
      ) : (
        customTitle && (
          <div style={{
            fontSize: '0.95rem',
            fontWeight: 600,
            color: 'var(--primary)',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>🎯</span> {customTitle}
          </div>
        )
      )}

      {/* Play/Control Bar */}
      <div className="fretboard-controls" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        background: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '1rem',
        border: '1px solid rgba(255,255,255,0.03)',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {!isPlaying ? (
            <button className="btn btn-primary" onClick={startPlayback}>
              <Play size={16} /> Play Sequence
            </button>
          ) : (
            <button className="btn btn-danger" onClick={stopPlayback}>
              <Square size={16} /> Stop
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Tempo Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tempo:</span>
            <input 
              type="range" 
              min="40" 
              max="240" 
              value={playbackBpm}
              onChange={(e) => setPlaybackBpm(parseInt(e.target.value))}
              style={{ accentColor: 'var(--primary)', width: '100px', height: '4px' }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', width: '45px', fontWeight: 600 }}>{playbackBpm} BPM</span>
          </div>

          {/* Loop playback */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <input 
              type="checkbox" 
              checked={loopPlayback} 
              onChange={() => setLoopToggle(!loopPlayback)}
              style={{ accentColor: 'var(--primary)' }}
            />
            Loop
          </label>

          {!isPlayMode && (
            <button className="btn btn-secondary btn-icon" onClick={clearFretboard} title="Clear Fretboard">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable fretboard container */}
      <div className="fretboard-scroll-wrapper">
        <div style={{
          position: 'relative',
          width: '1060px', // Accommodates fret width
          padding: '1.5rem 2rem 1.5rem 1rem',
          userSelect: 'none'
        }}>
          {/* Fret Indicators Numbers */}
          <div className="fret-indicators" style={{
            display: 'flex',
            paddingLeft: '50px', // Alignment offset with open string col
            marginBottom: '0.5rem'
          }}>
            {Array.from({ length: maxFrets + 1 }).map((_, fretIdx) => (
              <div key={fretIdx} style={{
                width: '60px',
                textAlign: 'center',
                fontSize: '0.75rem',
                color: fretIdx === 0 
                  ? 'var(--secondary)' 
                  : [3, 5, 7, 9, 12, 15].includes(fretIdx) 
                    ? 'var(--text-muted)' 
                    : 'var(--text-dim)',
                fontWeight: [3, 5, 7, 9, 12, 15].includes(fretIdx) ? 'bold' : 'normal',
              }}>
                {fretIdx === 0 ? 'Open' : fretIdx}
              </div>
            ))}
          </div>

          {/* Fret Board Grid Overlay */}
          <div className="fretboard-grid" style={{
            position: 'relative',
            background: 'linear-gradient(90deg, #1b2030 0%, #151a2a 100%)',
            border: '2px solid #2d3748',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.6)'
          }}>
            {/* SVG Connecting Curves */}
            {renderSVGConnections()}

            {/* Fret Markers (Dots) on fretboard standard positions (3, 5, 7, 9, 12, 15) */}
            <div className="fret-dots" style={{ position: 'absolute', top: 0, left: '50px', right: 0, bottom: 0, pointerEvents: 'none', zIndex: 1 }}>
              {[3, 5, 7, 9, 15].map(fret => (
                <div key={fret} style={{
                  position: 'absolute',
                  left: `${fret * 60 - 30}px`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)'
                }} />
              ))}
              {/* Double dot at fret 12 */}
              <div style={{ position: 'absolute', left: `${12 * 60 - 30}px`, top: '30%', transform: 'translateX(-50%)', width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ position: 'absolute', left: `${12 * 60 - 30}px`, bottom: '30%', transform: 'translateX(-50%)', width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            </div>

            {/* Render each string */}
            {Array.from({ length: stringsCount }).map((_, stringIdx) => {
              const stringNum = stringIdx + 1; // 1 is thinnest (G), e.g. 4 or 5 is thickest (E/B)
              const label = stringLabels[stringIdx];

              return (
                <div key={stringNum} className="fretboard-string-row" style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '44px',
                  position: 'relative'
                }}>
                  {/* String metal wire visual */}
                  <div className="string-wire" style={{
                    position: 'absolute',
                    left: '50px',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: `${1 + (stringsCount - stringNum) * 0.5}px`, // Thickness variations based on string pitch
                    background: 'linear-gradient(180deg, #d1d5db 0%, #4b5563 100%)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    zIndex: 2,
                    pointerEvents: 'none'
                  }} />

                  {/* Tuning Note Label on left */}
                  <div className="string-tuning-label" style={{
                    width: '50px',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-title)',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    color: 'var(--secondary)',
                    borderRight: '2px solid #2d3748',
                    background: 'rgba(0,0,0,0.2)',
                    zIndex: 3
                  }}>
                    {label}
                  </div>

                  {/* Interactive Frets Cells */}
                  <div className="fret-cells" style={{ display: 'flex', flex: 1, zIndex: 4 }}>
                    {Array.from({ length: maxFrets + 1 }).map((_, fretIdx) => {
                      // Metal fret wire bar
                      const showFretWire = fretIdx > 0;

                      // Check if a note is currently placed on this intersection
                      const matchingNotes = notes.filter(n => n.string === stringNum && n.fret === fretIdx);
                      const hasNotes = matchingNotes.length > 0;
                      const isPlayingNote = hasNotes && currentPlayIndex !== null && matchingNotes.some(n => n.sequence === currentPlayIndex + 1);
                      const firstMatchingNote = matchingNotes[0];

                      return (
                        <div
                          key={fretIdx}
                          onClick={() => handleFretClick(stringNum, fretIdx)}
                          className="fret-cell"
                          style={{
                            width: '60px',
                            height: '44px',
                            position: 'relative',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: showFretWire ? '1.5px solid #4a5568' : 'none'
                          }}
                        >
                          {/* Inner wood highlight on hover */}
                          <div className="fret-cell-hover" style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(99, 102, 241, 0.04)',
                            opacity: 0,
                            transition: 'opacity 0.15s'
                          }} />

                          {/* Render Note badge if active */}
                          {hasNotes && (
                            <div className={`fret-note-badge ${isPlayingNote ? 'pulse-active' : ''}`} style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: isPlayingNote 
                                ? 'var(--secondary)' 
                                : 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
                              border: `2px solid ${isPlayingNote ? '#fff' : 'rgba(255,255,255,0.7)'}`,
                              boxShadow: isPlayingNote 
                                ? '0 0 15px var(--secondary)' 
                                : '0 4px 10px rgba(0,0,0,0.5), 0 0 8px var(--primary-glow)',
                              color: 'white',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              zIndex: 10,
                              fontFamily: 'Outfit',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              transition: 'all 0.1s ease',
                              transform: isPlayingNote ? 'scale(1.2)' : 'scale(1)',
                              position: 'relative'
                            }}>
                              {firstMatchingNote.noteName}
                              
                              {/* Sequence index badges wrapper */}
                              <div style={{
                                position: 'absolute',
                                top: '-10px',
                                right: '-12px',
                                display: 'flex',
                                gap: '3px',
                                zIndex: 15
                              }}>
                                {matchingNotes.map(n => {
                                  const isPlayingThisStep = currentPlayIndex !== null && n.sequence === currentPlayIndex + 1;
                                  return (
                                    <div 
                                      key={n.id}
                                      className="fret-sequence-badge"
                                      onClick={(e) => {
                                        e.stopPropagation(); // Prevent adding another note on click
                                        handleDeleteNoteById(n.id);
                                      }}
                                      style={{
                                        background: isPlayingThisStep ? 'var(--secondary)' : 'var(--bg-slate-950)',
                                        border: `1px solid ${isPlayingThisStep ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                                        borderRadius: '50%',
                                        width: '16px',
                                        height: '16px',
                                        fontSize: '0.55rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                                        position: 'relative',
                                        overflow: 'hidden'
                                      }}
                                      title={`Click to delete sequence step #${n.sequence}`}
                                    >
                                      <span className="seq-num">{n.sequence}</span>
                                      <span className="seq-x">✕</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tiny Instruction Note */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        <Zap size={14} className="glow-icon" style={{ color: 'var(--primary)' }} />
        <span>{!isPlayMode ? "Click anywhere on the fretboard wood grid to place notes sequentially. Click a placed note number to delete it." : "Press 'Play Sequence' to hear the notes synthesized!"}</span>
      </div>

      <style>{`
        .fret-cell:hover .fret-cell-hover {
          opacity: 1 !important;
        }
        @keyframes dash {
          to {
            stroke-dashoffset: -100;
          }
        }
        .pulse-active {
          animation: activePulse 0.4s infinite alternate;
        }
        @keyframes activePulse {
          0% { transform: scale(1.15); box-shadow: 0 0 10px var(--secondary); }
          100% { transform: scale(1.25); box-shadow: 0 0 25px var(--secondary); }
        }
        .fret-sequence-badge .seq-x {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          display: flex;
          align-items: center;
          justifyContent: center;
          opacity: 0;
          color: var(--accent-red);
          background: var(--bg-slate-950);
          border-radius: 50%;
          font-size: 0.55rem;
          font-weight: 900;
          transition: opacity 0.15s ease;
        }
        .fret-sequence-badge .seq-num {
          opacity: 1;
          transition: opacity 0.15s ease;
        }
        /* Fade in the red X and fade out the step numbers when hovering over the main note badge for 1 second */
        .fret-note-badge:hover .fret-sequence-badge .seq-x {
          opacity: 1;
          transition-delay: 1s;
        }
        .fret-note-badge:hover .fret-sequence-badge .seq-num {
          opacity: 0;
          transition-delay: 1s;
        }
        /* Make individual X badge turn red on hovering it directly */
        .fret-sequence-badge:hover .seq-x {
          color: #fff !important;
          background: var(--accent-red) !important;
          box-shadow: 0 0 8px var(--accent-red);
        }
      `}</style>
    </div>
  );
}
