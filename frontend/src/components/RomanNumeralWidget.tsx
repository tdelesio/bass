import React, { useState, useEffect, useRef } from 'react';
import { CornerDownLeft, Repeat, Pause } from 'lucide-react';

interface ChordItem {
  numeral: string; // "I", "ii", "iii", or "\n"
  octave: boolean;
  duration: '1/8' | '1/4' | '1/2' | '1';
  linkedWidgetId?: string;
}

interface RomanNumeralWidgetProps {
  widgetId: string;
  songKey: string; // Song level key center (e.g. "C", "G")
  initialData: {
    key?: string;
    scale?: string;
    progression?: any[]; // Supports both legacy string arrays and new object arrays
    lineRepeats?: Record<number, number>;
  };
  onSave: (data: { 
    key: string; 
    scale: string; 
    progression: ChordItem[]; 
    lineRepeats: Record<number, number> 
  }) => void;
  isPlayMode?: boolean;
  allWidgets?: any[];
}

const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const SCALES = ["major", "minor"];

// Roman numeral sets for mapping
const DIATONIC_ROMANS: Record<string, string[]> = {
  major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  minor: ["i", "ii°", "III", "iv", "v", "VI", "VII"]
};

// Calculate diatonic notes/chords based on Root key and Mode
const calculateDiatonicChords = (rootKey: string, scaleMode: string): { numeral: string; chord: string }[] => {
  const rootIndex = KEYS.indexOf(rootKey);
  if (rootIndex === -1) return [];

  // Half-step intervals for Major vs Minor scales
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
  const minorIntervals = [0, 2, 3, 5, 7, 8, 10];

  const intervals = scaleMode === 'major' ? majorIntervals : minorIntervals;
  const numerals = DIATONIC_ROMANS[scaleMode];
  
  // Suffixes for chord qualities
  const chordSuffixes = scaleMode === 'major' 
    ? ["", "m", "m", "", "", "m", " dim"] 
    : ["m", " dim", "", "m", "m", "", ""];

  return numerals.map((numeral, idx) => {
    const noteIdx = (rootIndex + intervals[idx]) % 12;
    const chordNote = KEYS[noteIdx];
    return {
      numeral,
      chord: `${chordNote}${chordSuffixes[idx]}`
    };
  });
};

// Calculate non-diatonic accidental notes/chords based on Root key and Mode
const calculateAccidentalChords = (rootKey: string, scaleMode: string): { numeral: string; chord: string }[] => {
  const rootIndex = KEYS.indexOf(rootKey);
  if (rootIndex === -1) return [];

  if (scaleMode === 'major') {
    // Non-diatonic steps relative to root: bII, bIII, #IV, bVI, bVII (half steps 1, 3, 6, 8, 10)
    const intervals = [1, 3, 6, 8, 10];
    const numerals = ["bII", "bIII", "#IV", "bVI", "bVII"];
    const suffixes = ["", "", " dim", "", ""]; // standard default qualities
    
    return numerals.map((numeral, idx) => {
      const noteIdx = (rootIndex + intervals[idx]) % 12;
      const chordNote = KEYS[noteIdx];
      return {
        numeral,
        chord: `${chordNote}${suffixes[idx]}`
      };
    });
  } else {
    // Minor mode non-diatonic steps: bII, #iii, #iv, #vi, vii° (half steps 1, 4, 6, 9, 11)
    const intervals = [1, 4, 6, 9, 11];
    const numerals = ["bII", "#iii", "#iv", "#vi", "vii°"];
    const suffixes = ["", "", "m", " dim", " dim"];
    
    return numerals.map((numeral, idx) => {
      const noteIdx = (rootIndex + intervals[idx]) % 12;
      const chordNote = KEYS[noteIdx];
      return {
        numeral,
        chord: `${chordNote}${suffixes[idx]}`
      };
    });
  }
};

// Map duration to responsive width and beat values: halved to fit more notes per line
const DURATION_METADATA: Record<string, { width: number; label: string; beats: number }> = {
  '1/8': { width: 22, label: '1/8', beats: 0.125 },
  '1/4': { width: 36, label: '1/4', beats: 0.25 },
  '1/2': { width: 60, label: '1/2', beats: 0.5 },
  '1':   { width: 100, label: 'W', beats: 1.0 }
};

// Normalizer function to safely translate legacy string array data to new ChordItem format. Default is 1/4 note now.
const normalizeProgression = (prog: any[]): ChordItem[] => {
  if (!prog || !Array.isArray(prog)) return [];
  return prog.map(item => {
    if (typeof item === 'string') {
      if (item === '\n') {
        return { numeral: '\n', octave: false, duration: '1/4' };
      }
      const isOct = item.endsWith('^');
      const base = isOct ? item.slice(0, -1) : item;
      return { numeral: base, octave: isOct, duration: '1/4' };
    }
    // Already matches modern structure
    return {
      numeral: item.numeral || 'I',
      octave: !!item.octave,
      duration: item.duration || '1/4',
      linkedWidgetId: item.linkedWidgetId
    };
  });
};

export default function RomanNumeralWidget({ widgetId, songKey, initialData, onSave, isPlayMode, allWidgets = [] }: RomanNumeralWidgetProps) {
  const [key, setKey] = useState(initialData.key || songKey || 'C');
  const [scale, setScale] = useState(initialData.scale || 'major');
  const [progression, setProgression] = useState<ChordItem[]>(normalizeProgression(initialData.progression || []));
  const [lineRepeats, setLineRepeats] = useState<Record<number, number>>(initialData.lineRepeats || {});
  const [selectedDuration, setSelectedDuration] = useState<'1/8' | '1/4' | '1/2' | '1'>('1/4');

  // Drag-to-Resize mouse tracking states
  const [resizeIndex, setResizeIndex] = useState<number | null>(null);
  const resizeStartMouseX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Drag and Drop (reorder) states & handlers
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    if (resizeIndex !== null) {
      e.preventDefault();
      return;
    }
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx.toString());
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) return;

    // Do not drag/drop carriage returns to maintain row integrity
    if (progression[draggedIdx].numeral === '\n' || progression[targetIdx].numeral === '\n') {
      setDraggedIdx(null);
      return;
    }

    const updated = [...progression];
    const [draggedItem] = updated.splice(draggedIdx, 1);
    updated.splice(targetIdx, 0, draggedItem);

    setDraggedIdx(null);
    saveWidgetState(updated, lineRepeats);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  // References to always hold the freshest state to prevent stale dragging closures
  const progressionRef = useRef<ChordItem[]>(progression);
  const lineRepeatsRef = useRef<Record<number, number>>(lineRepeats);

  // Keep references perfectly synced to state changes
  useEffect(() => {
    progressionRef.current = progression;
  }, [progression]);

  useEffect(() => {
    lineRepeatsRef.current = lineRepeats;
  }, [lineRepeats]);

  // Sync state with incoming initialData
  useEffect(() => {
    if (initialData.key) {
      setKey(initialData.key);
    } else if (songKey) {
      setKey(songKey);
    }
    if (initialData.scale) setScale(initialData.scale);
    if (initialData.progression) setProgression(normalizeProgression(initialData.progression));
    if (initialData.lineRepeats) setLineRepeats(initialData.lineRepeats);
  }, [initialData, songKey]);

  const diatonicChords = calculateDiatonicChords(key, scale);
  const accidentalChords = calculateAccidentalChords(key, scale);

  const saveWidgetState = (updatedProg: ChordItem[], updatedRepeats: Record<number, number>) => {
    setProgression(updatedProg);
    setLineRepeats(updatedRepeats);
    onSave({ key, scale, progression: updatedProg, lineRepeats: updatedRepeats });
  };

  const handleKeyOrScaleChange = (newKey: string, newScale: string) => {
    setKey(newKey);
    setScale(newScale);
    onSave({ key: newKey, scale: newScale, progression, lineRepeats });
  };

  const addNumeral = (numeral: string) => {
    const newItem: ChordItem = { numeral, octave: false, duration: selectedDuration };
    const updated = [...progression, newItem];
    saveWidgetState(updated, lineRepeats);
  };

  const addCustomChord = () => {
    const val = prompt("Enter custom chord or note (max 4 characters, e.g. C/C#):");
    if (val && val.trim()) {
      const cleanVal = val.trim().slice(0, 4);
      addNumeral(cleanVal);
    }
  };

  const addCarriageReturn = () => {
    const newItem: ChordItem = { numeral: '\n', octave: false, duration: '1/4' }; // Default to 1/4 note
    const updated = [...progression, newItem];
    saveWidgetState(updated, lineRepeats);
  };

  const toggleOctaveShift = (idx: number) => {
    // If resizing right now, block octave triggers
    if (resizeIndex !== null) return;

    const updated = [...progression];
    if (updated[idx].numeral === '\n' || updated[idx].numeral === 'REST') return;
    
    updated[idx] = {
      ...updated[idx],
      octave: !updated[idx].octave
    };
    saveWidgetState(updated, lineRepeats);
  };

  const handleLinkWidgetToCard = (idx: number, targetWidgetId: string | undefined) => {
    const updated = [...progression];
    updated[idx] = {
      ...updated[idx],
      linkedWidgetId: targetWidgetId
    };
    setProgression(updated);
    onSave({
      key,
      scale,
      progression: updated,
      lineRepeats
    });
  };

  const handleCardInteraction = (item: ChordItem) => {
    if (item.linkedWidgetId) {
      const el = document.getElementById(`widget-${item.linkedWidgetId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add neon outline visual focus pulse
        el.style.outline = '3px solid var(--accent-purple)';
        el.style.boxShadow = '0 0 25px rgba(168, 85, 247, 0.6)';
        el.style.borderRadius = 'var(--radius-lg)';
        el.style.transition = 'outline 0.15s ease, box-shadow 0.15s ease';
        
        setTimeout(() => {
          el.style.outline = '';
          el.style.boxShadow = '';
        }, 1500);
      }
    }
  };

  const getWidgetLabel = (w: any) => {
    const customTitle = w.data?.title;
    if (customTitle) return customTitle;
    
    if (w.widget_type === 'fret_board') return 'Fret Board';
    if (w.widget_type === 'rhythm') return 'Rhythm';
    if (w.widget_type === 'note') return 'Notepad';
    if (w.widget_type === 'roman_numeral') return 'Progression';
    return 'Widget';
  };

  const deleteNumeralAtIndex = (idxToRemove: number) => {
    const itemToRemove = progression[idxToRemove];
    const updatedProg = progression.filter((_, idx) => idx !== idxToRemove);

    let updatedRepeats = { ...lineRepeats };
    if (itemToRemove.numeral === '\n') {
      let lineCountBefore = 0;
      for (let i = 0; i < idxToRemove; i++) {
        if (progression[i].numeral === '\n') lineCountBefore++;
      }
      
      const newRepeats: Record<number, number> = {};
      Object.entries(lineRepeats).forEach(([keyStr, val]) => {
        const keyNum = parseInt(keyStr);
        if (keyNum < lineCountBefore) {
          newRepeats[keyNum] = val;
        } else if (keyNum > lineCountBefore) {
          newRepeats[keyNum - 1] = val;
        }
      });
      updatedRepeats = newRepeats;
    }

    saveWidgetState(updatedProg, updatedRepeats);
  };

  // Drag-to-resize event handlers
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, idx: number, currentDuration: string) => {
    e.stopPropagation();
    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setResizeIndex(idx);
    resizeStartMouseX.current = clientX;
    resizeStartWidth.current = DURATION_METADATA[currentDuration].width;

    // Bind document global event listeners for flawless drag outside container bounds
    const handleResizeMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const deltaX = currentX - resizeStartMouseX.current;
      const targetWidth = resizeStartWidth.current + deltaX;

      // Find closest snapped duration width
      let closestDuration: '1/8' | '1/4' | '1/2' | '1' = '1/4';
      let minDiff = Infinity;

      Object.entries(DURATION_METADATA).forEach(([dur, meta]) => {
        const diff = Math.abs(meta.width - targetWidth);
        if (diff < minDiff) {
          minDiff = diff;
          closestDuration = dur as any;
        }
      });

      // Safely access current state via our synced ref
      const currentProg = progressionRef.current;
      if (currentProg[idx].duration !== closestDuration) {
        const updated = [...currentProg];
        updated[idx] = { ...updated[idx], duration: closestDuration };
        setProgression(updated); // Dynamically scale box layout in real-time
      }
    };

    const handleResizeEnd = () => {
      setResizeIndex(null);
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.removeEventListener('touchmove', handleResizeMove);
      document.removeEventListener('touchend', handleResizeEnd);

      // Save final snapping layout directly from latest ref state to database
      onSave({ 
        key, 
        scale, 
        progression: progressionRef.current, 
        lineRepeats: lineRepeatsRef.current 
      });
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    document.addEventListener('touchmove', handleResizeMove, { passive: false });
    document.addEventListener('touchend', handleResizeEnd);
  };

  const handleToggleLineRepeat = (lineIdx: number) => {
    const currentRepeat = lineRepeats[lineIdx] || 1;
    let nextRepeat = 1;

    if (currentRepeat === 1) nextRepeat = 2;
    else if (currentRepeat === 2) nextRepeat = 3;
    else if (currentRepeat === 3) nextRepeat = 4;
    else nextRepeat = 1;

    const updatedRepeats = { ...lineRepeats, [lineIdx]: nextRepeat };
    saveWidgetState(progression, updatedRepeats);
  };

  const clearProgression = () => {
    saveWidgetState([], {});
  };

  // Group progression elements into lines based on newline characters
  const getProgressionLines = () => {
    const lines: { items: { item: ChordItem; originalIdx: number }[] }[] = [];
    let currentLineItems: { item: ChordItem; originalIdx: number }[] = [];

    progression.forEach((item, idx) => {
      if (item.numeral === '\n') {
        lines.push({ items: currentLineItems });
        currentLineItems = [];
      } else {
        currentLineItems.push({ item, originalIdx: idx });
      }
    });

    lines.push({ items: currentLineItems });
    return lines;
  };

  const progressionLines = getProgressionLines();

  return (
    <div className="roman-numeral-widget" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {!isPlayMode && (
        <>
          {/* Root Selector Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            padding: '0.5rem',
            background: 'rgba(255,255,255,0.01)',
            borderRadius: 'var(--radius-md)'
          }}>
            {/* Key signature selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Scale Root:</span>
              <select
                value={key}
                onChange={(e) => handleKeyOrScaleChange(e.target.value, scale)}
                className="input-field"
                style={{ width: '80px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
              >
                {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              {songKey && key !== songKey && (
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                  onClick={() => handleKeyOrScaleChange(songKey, scale)}
                  title="Reset scale root to match active Song Key"
                >
                  Reset to Song Key ({songKey})
                </button>
              )}
            </div>

            {/* Scale/Quality selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Quality:</span>
              <select
                value={scale}
                onChange={(e) => handleKeyOrScaleChange(key, e.target.value)}
                className="input-field"
                style={{ width: '100px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
              >
                <option value="major">Major (Ionian)</option>
                <option value="minor">Natural Minor</option>
              </select>
            </div>

            {/* Note Duration/Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: 'auto', marginRight: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>Add Size:</span>
              {(['1/8', '1/4', '1/2', '1'] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  className={`btn ${selectedDuration === d ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ 
                    padding: '0.25rem 0.5rem', 
                    fontSize: '0.75rem',
                    minWidth: '32px'
                  }}
                  onClick={() => setSelectedDuration(d)}
                >
                  {d === '1' ? '1' : d}
                </button>
              ))}
            </div>

            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} 
              onClick={clearProgression}
            >
              Clear Progression
            </button>
          </div>

          {/* Interactive Diatonic Scale Reference Blocks + Line Break Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scale Degrees (Click to construct progression):</span>
            <div style={{
              display: 'flex',
              gap: '0.4rem',
              alignItems: 'stretch',
              width: '100%',
              overflowX: 'auto',
              paddingBottom: '0.25rem'
            }}>
              {diatonicChords.map(({ numeral, chord }) => (
                <button
                  key={numeral}
                  onClick={() => addNumeral(numeral)}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.5rem',
                    minWidth: '54px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem',
                    transition: 'all 0.15s ease',
                    flex: 1
                  }}
                  className="interactive-scale-degree"
                >
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>{numeral}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-main)' }}>{chord}</span>
                </button>
              ))}

              {/* New Line / Carriage Return Button */}
              <button
                onClick={addCarriageReturn}
                title="Insert a Carriage Return (starts a new row of chords)"
                style={{
                  background: 'rgba(6, 182, 212, 0.08)',
                  border: '1px dashed var(--secondary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem',
                  transition: 'all 0.15s ease',
                  minWidth: '70px',
                  color: 'var(--secondary)'
                }}
                className="carriage-return-btn"
              >
                <CornerDownLeft size={16} />
                <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>New Line</span>
              </button>

              {/* Rest Button */}
              <button
                onClick={() => addNumeral('REST')}
                title="Insert a Rest (silence/pause card of any size)"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px dashed var(--accent-red)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem',
                  transition: 'all 0.15s ease',
                  minWidth: '70px',
                  color: 'var(--accent-red)'
                }}
                className="rest-btn"
              >
                <Pause size={16} />
                <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Add Rest</span>
              </button>
            </div>

            {/* Interactive Accidental / Chromatic Scale Reference Blocks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.1rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Accidental / Chromatic Degrees:</span>
              <div style={{
                display: 'flex',
                gap: '0.4rem',
                alignItems: 'stretch',
                width: '100%',
                overflowX: 'auto',
                paddingBottom: '0.25rem'
              }}>
                {accidentalChords.map(({ numeral, chord }) => (
                  <button
                    key={numeral}
                    onClick={() => addNumeral(numeral)}
                    style={{
                      background: 'rgba(234, 179, 8, 0.02)', // subtle amber tint
                      border: '1px solid rgba(234, 179, 8, 0.12)', // subtle amber border
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.45rem',
                      minWidth: '54px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.2rem',
                      transition: 'all 0.15s ease',
                      flex: 1
                    }}
                    className="interactive-accidental-degree"
                    title={`Click to add non-diatonic ${numeral} (${chord}) chord`}
                  >
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#eab308' }}>{numeral}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{chord}</span>
                  </button>
                ))}
                {/* Custom Button */}
                <button
                  type="button"
                  onClick={addCustomChord}
                  style={{
                    background: 'rgba(168, 85, 247, 0.02)', // purple tint
                    border: '1px solid rgba(168, 85, 247, 0.15)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.45rem',
                    minWidth: '60px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.2rem',
                    transition: 'all 0.15s ease',
                    flex: 1
                  }}
                  className="interactive-accidental-degree"
                  title="Click to add custom chord/note (up to 4 chars)"
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-purple)' }}>Custom</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Text</span>
                </button>
                {/* Empty space-separator to align with the "New Line" button above */}
                <div style={{ minWidth: '70px', flex: 0 }} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Generated Progression Output Card display arranged by carriage returns */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {isPlayMode ? "Your Progression Sheets:" : "Your Progression Sheets (Single click = octave, Double click = delete):"}
        </span>
        <div style={{
          padding: '1.25rem',
          background: 'rgba(10, 12, 20, 0.4)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          minHeight: '100px'
        }}>
          {progression.length === 0 ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontStyle: 'italic', textAlign: 'center', padding: '1.5rem 0' }}>
              No chord progression recorded. Click on scale degrees or New Line above!
            </span>
          ) : (
            progressionLines.map((line, lineIdx) => {
              const repeatVal = lineRepeats[lineIdx] || 1;
              const hasRepeat = repeatVal > 1;

              // Calculate bar line markers dynamically by accumulating beat times inside the active line
              let accumulatedBeats = 0;

              return (
                <div 
                  key={lineIdx} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: '0.4rem',
                    padding: '0.75rem 0.5rem',
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid rgba(255,255,255,0.02)',
                    borderRadius: 'var(--radius-md)',
                    position: 'relative'
                  }}
                >
                  {/* Notes Row: full horizontal real estate with wrap instead of scroll! */}
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem 0rem', width: '100%', padding: '0.25rem 0' }}>
                    {hasRepeat && (
                      <div style={{ display: 'flex', alignItems: 'center', marginRight: '0.75rem', color: 'var(--secondary)', flexShrink: 0 }}>
                        <div style={{ width: '4px', height: '40px', background: 'var(--secondary)', marginRight: '2px', borderRadius: '1px' }} />
                        <div style={{ width: '1.5px', height: '40px', background: 'var(--secondary)', marginRight: '4px' }} />
                        <div style={{ fontSize: '1.25rem', fontWeight: 900, lineHeight: 1 }}>:</div>
                      </div>
                    )}

                    {/* Chord Cards row inside this line with automated bar dividers and wraps when needed */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {line.items.length === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>Empty Line Block</span>
                      ) : (
                        line.items.map(({ item, originalIdx }, chordIdx) => {
                          const isRest = item.numeral === 'REST';
                          const matchingDegree = !isRest ? (diatonicChords.find(d => d.numeral === item.numeral) 
                            || accidentalChords.find(d => d.numeral === item.numeral)) : null;
                          const chordName = isRest ? '' : (matchingDegree ? matchingDegree.chord : item.numeral);

                          const durationMeta = DURATION_METADATA[item.duration] || DURATION_METADATA['1/4'];
                          accumulatedBeats += durationMeta.beats;

                          // Check if this chord completed a full bar (sum multiples of 1.0)
                          const isBarCompleted = Math.abs((accumulatedBeats % 1.0)) < 0.001 || Math.abs((accumulatedBeats % 1.0) - 1.0) < 0.001;

                          return (
                            <React.Fragment key={originalIdx}>
                              <div
                                draggable={!isPlayMode}
                                onDragStart={isPlayMode ? undefined : (e) => handleDragStart(e, originalIdx)}
                                onDragOver={isPlayMode ? undefined : (e) => handleDragOver(e, originalIdx)}
                                onDrop={isPlayMode ? undefined : (e) => handleDrop(e, originalIdx)}
                                onDragEnd={isPlayMode ? undefined : handleDragEnd}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: '3px',
                                  width: `${durationMeta.width}px`,
                                  flexShrink: 0,
                                  cursor: isPlayMode ? 'default' : 'grab',
                                  opacity: draggedIdx === originalIdx ? 0.35 : 1,
                                  transition: 'opacity 0.2s ease'
                                }}
                              >
                                {/* Chord/Note Name above the box */}
                                <div 
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    width: '100%',
                                    height: '14px'
                                  }}
                                >
                                  <span style={{ 
                                    fontSize: '0.68rem', 
                                    fontWeight: 800, 
                                    color: isRest ? 'var(--accent-red)' : 'var(--text-main)', 
                                    lineHeight: 1 
                                  }}>
                                    {chordName}
                                  </span>
                                </div>

                                {/* The Card Box itself */}
                                <div 
                                  onClick={() => handleCardInteraction(item)}
                                  title={item.linkedWidgetId ? "Click to focus linked widget" : undefined}
                                  style={{
                                    width: '100%',
                                    background: isRest
                                      ? 'rgba(239, 68, 68, 0.04)'
                                      : (item.octave 
                                        ? 'rgba(234, 179, 8, 0.08)' 
                                        : 'rgba(99, 102, 241, 0.08)'),
                                    border: isRest
                                      ? '1px dashed rgba(239, 68, 68, 0.25)'
                                      : (item.octave
                                        ? '1px solid rgba(234, 179, 8, 0.35)'
                                        : '1px solid rgba(99, 102, 241, 0.25)'),
                                    boxShadow: isRest
                                      ? '0 0 10px rgba(239, 68, 68, 0.01)'
                                      : (item.octave
                                        ? '0 0 10px rgba(234, 179, 8, 0.05)'
                                        : '0 0 10px rgba(99, 102, 241, 0.03)'),
                                    padding: '0.2rem 0.15rem',
                                    borderRadius: 'var(--radius-sm)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative',
                                    cursor: item.linkedWidgetId ? 'pointer' : (isPlayMode ? 'default' : 'pointer'),
                                    userSelect: 'none',
                                    height: '52px',
                                    transition: 'border-color 0.15s ease, background 0.15s ease'
                                  }}
                                  className={`progression-block ${item.linkedWidgetId ? 'linked-glow' : ''}`}
                                >
                                  {/* Floating link status icon */}
                                  {item.linkedWidgetId && (
                                    <span 
                                      style={{ 
                                        position: 'absolute', 
                                        top: '2px', 
                                        left: '4px', 
                                        fontSize: '0.5rem', 
                                        color: 'var(--accent-purple)'
                                      }}
                                      title="Linked to another widget (Click card to navigate)"
                                    >
                                      🔗
                                    </span>
                                  )}

                                  {/* Floating delete button appearing on 1s hover */}
                                  {!isPlayMode && (
                                    <button
                                      className="chord-delete-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteNumeralAtIndex(originalIdx);
                                      }}
                                      title="Delete this chord card"
                                      style={{
                                        position: 'absolute',
                                        top: '-6px',
                                        right: '-6px',
                                        background: 'var(--accent-red)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: '14px',
                                        height: '14px',
                                        fontSize: '0.55rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                                        zIndex: 10,
                                        padding: 0,
                                        lineHeight: 1
                                      }}
                                    >
                                      ✕
                                    </button>
                                  )}

                                  {/* Centered Roman Numeral inside the box */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', flex: 1, marginTop: '2px' }}>
                                    <span style={{ 
                                      fontSize: isRest ? '1.1rem' : (durationMeta.width < 50 ? '0.72rem' : '0.85rem'), 
                                      fontWeight: 800, 
                                      color: isRest ? 'var(--accent-red)' : 'var(--secondary)', 
                                      lineHeight: 1 
                                    }}>
                                      {isRest ? '𝄾' : item.numeral}
                                    </span>
                                  </div>

                                  {/* Floating duration micro-badge (at top right) */}
                                  {durationMeta.width >= 35 && (
                                    <span style={{ 
                                      position: 'absolute', 
                                      top: '2px', 
                                      right: '4px', 
                                      fontSize: '0.45rem', 
                                      color: isRest ? 'rgba(239,68,68,0.4)' : 'var(--text-dim)', 
                                      fontWeight: 'bold' 
                                    }}>
                                      {durationMeta.label}
                                    </span>
                                  )}

                                  {/* Actions Row */}
                                  {!isPlayMode && !isRest && item.numeral !== '\n' && (
                                    <div 
                                      style={{ 
                                        display: 'flex', 
                                        gap: '2px', 
                                        width: '100%', 
                                        justifyContent: 'center', 
                                        marginTop: 'auto',
                                        zIndex: 8,
                                        padding: '0 2px 2px 2px'
                                      }}
                                      onClick={(e) => e.stopPropagation()} // Stop triggering parent click
                                    >
                                      {/* Octave Shift Button */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleOctaveShift(originalIdx);
                                        }}
                                        style={{
                                          background: item.octave ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255,255,255,0.02)',
                                          border: item.octave ? '1px solid #eab308' : '1px solid rgba(255,255,255,0.06)',
                                          borderRadius: '2px',
                                          color: item.octave ? '#eab308' : 'var(--text-dim)',
                                          padding: '1px 2px',
                                          fontSize: '0.48rem',
                                          fontWeight: '700',
                                          cursor: 'pointer',
                                          lineHeight: 1
                                        }}
                                        title="Toggle Octave Shift (+1 Octave)"
                                      >
                                        Oct
                                      </button>

                                      {/* Link Association Selector */}
                                      <select
                                        value={item.linkedWidgetId || ''}
                                        onChange={(e) => {
                                          const targetId = e.target.value || undefined;
                                          handleLinkWidgetToCard(originalIdx, targetId);
                                        }}
                                        style={{
                                          background: item.linkedWidgetId ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.02)',
                                          border: item.linkedWidgetId ? '1px solid var(--accent-purple)' : '1px solid rgba(255,255,255,0.06)',
                                          borderRadius: '2px',
                                          color: item.linkedWidgetId ? 'var(--accent-purple)' : 'var(--text-dim)',
                                          fontSize: '0.48rem',
                                          fontWeight: '700',
                                          cursor: 'pointer',
                                          lineHeight: 1,
                                          padding: '0',
                                          maxWidth: '100%',
                                          textAlign: 'center'
                                        }}
                                        title="Link this chord to another widget"
                                      >
                                        <option value="">Link</option>
                                        {allWidgets
                                          .filter(w => w.id !== widgetId) // Exclude current widget
                                          .map(w => {
                                            const wMeta = getWidgetLabel(w);
                                            return (
                                              <option key={w.id} value={w.id}>
                                                {wMeta}
                                              </option>
                                            );
                                          })
                                        }
                                      </select>
                                    </div>
                                  )}

                                  {/* Translucent Right-Edge Drag-To-Resize Handle */}
                                  {!isPlayMode && (
                                    <div 
                                      onMouseDown={(e) => handleResizeStart(e, originalIdx, item.duration)}
                                      onTouchStart={(e) => handleResizeStart(e, originalIdx, item.duration)}
                                      style={{
                                        position: 'absolute',
                                        right: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: durationMeta.width < 50 ? '6px' : '10px',
                                        cursor: 'ew-resize',
                                        background: 'linear-gradient(90deg, transparent 0%, rgba(6, 182, 212, 0.08) 100%)',
                                        borderTopRightRadius: 'var(--radius-sm)',
                                        borderBottomRightRadius: 'var(--radius-sm)',
                                        zIndex: 5
                                      }}
                                      className="resize-handle"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  )}
                                </div>
                              </div>

                              {/* Automated Full Bar space separator and vertical divider line */}
                              {isBarCompleted && chordIdx < line.items.length - 1 && (
                                <div 
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    margin: '0 0.5rem', 
                                    height: '48px',
                                    flexShrink: 0 
                                  }}
                                >
                                  {/* Beautiful vertical score bar divider and empty spacer space */}
                                  <div style={{ width: '1.5px', height: '36px', background: 'rgba(255,255,255,0.12)' }} />
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </div>

                    {/* Right Repeat Bar visualizer */}
                    {hasRepeat && (
                      <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.75rem', color: 'var(--secondary)', flexShrink: 0 }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 900, lineHeight: 1, marginRight: '4px' }}>:</div>
                        <div style={{ width: '1.5px', height: '40px', background: 'var(--secondary)', marginRight: '2px' }} />
                        <div style={{ width: '4px', height: '40px', background: 'var(--secondary)', marginRight: '8px', borderRadius: '1px' }} />
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: 'bold', 
                          background: 'rgba(6, 182, 212, 0.15)',
                          border: '1px solid var(--secondary)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.15rem 0.4rem',
                          color: 'var(--secondary)',
                          whiteSpace: 'nowrap'
                        }}>
                          x{repeatVal}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Line Options & Control panel positioned below the notes */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    alignItems: 'center', 
                    borderTop: '1px solid rgba(255,255,255,0.03)', 
                    paddingTop: '0.5rem', 
                    marginTop: '0.15rem',
                    width: '100%'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: 'auto', fontWeight: 500 }}>
                      Line {lineIdx + 1} controls
                    </span>
                    <button
                      className={`btn ${hasRepeat ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                      onClick={() => handleToggleLineRepeat(lineIdx)}
                      title="Set repeat repetitions for this progression block"
                    >
                      <Repeat size={11} /> {hasRepeat ? `Repeat: x${repeatVal}` : 'Set Repeat'}
                    </button>

                    {/* Carriage return token removal option */}
                    {lineIdx < progressionLines.length - 1 && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                        title="Delete carriage return (merge this line with the next)"
                        onClick={() => {
                          let count = 0;
                          for (let i = 0; i < progression.length; i++) {
                            if (progression[i].numeral === '\n') {
                              if (count === lineIdx) {
                                deleteNumeralAtIndex(i);
                                break;
                              }
                              count++;
                            }
                          }
                        }}
                      >
                        Merge Lines
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <style>{`
        .interactive-scale-degree:hover {
          background: rgba(99, 102, 241, 0.06) !important;
          border-color: rgba(99, 102, 241, 0.2) !important;
          transform: translateY(-1px);
        }
        .interactive-accidental-degree:hover {
          background: rgba(234, 179, 8, 0.06) !important;
          border-color: rgba(234, 179, 8, 0.25) !important;
          transform: translateY(-1px);
        }
        .carriage-return-btn:hover {
          background: rgba(6, 182, 212, 0.14) !important;
          border-color: var(--secondary-glow) !important;
        }
        .progression-block:hover {
          border-color: rgba(99, 102, 241, 0.5) !important;
        }
        .progression-block:hover .resize-handle {
          background: linear-gradient(90deg, transparent 0%, rgba(6, 182, 212, 0.3) 100%) !important;
        }
        .resize-handle:hover {
          background: rgba(6, 182, 212, 0.4) !important;
        }
        /* Hover-delayed delete button on chord note card */
        .chord-delete-btn {
          opacity: 0;
          pointer-events: none;
          transform: scale(0.85);
          transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .progression-block:hover .chord-delete-btn {
          opacity: 1;
          pointer-events: auto;
          transform: scale(1);
          transition-delay: 1s; /* Hover for exactly 1 second to reveal */
        }
        .chord-delete-btn:hover {
          transform: scale(1.2) !important;
          background: #ef4444 !important; /* brighter red */
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.6) !important;
        }
      `}</style>
    </div>
  );
}
