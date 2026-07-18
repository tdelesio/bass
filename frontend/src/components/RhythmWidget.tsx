import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Info, Trash2 } from 'lucide-react';

interface RhythmItem {
  type: 'note' | 'rest';
  duration: '1/16' | '1/8' | '1/4' | '1/2' | '1';
}

interface RhythmWidgetProps {
  widgetId: string;
  initialData: {
    timeSignature?: string;
    tempo?: number;
    subdivisions?: number;
    beats?: boolean[];
    items?: RhythmItem[];
  };
  onSave: (data: { 
    timeSignature: string; 
    tempo: number; 
    subdivisions: number; 
    beats: boolean[];
    items: RhythmItem[];
  }) => void;
  isPlayMode?: boolean;
}

const DURATION_BEATS: Record<string, number> = {
  '1/16': 0.25,
  '1/8': 0.5,
  '1/4': 1.0,
  '1/2': 2.0,
  '1': 4.0 // Whole note
};

const DURATION_LABELS: Record<string, string> = {
  '1/16': '1/16',
  '1/8': '1/8',
  '1/4': '1/4',
  '1/2': '1/2',
  '1': 'Whole'
};

const DURATION_WIDTHS: Record<string, number> = {
  '1/16': 54,
  '1/8': 68,
  '1/4': 90,
  '1/2': 140,
  '1': 220
};

const ITEM_SIXTEENTHS: Record<string, number> = {
  '1/16': 1,
  '1/8': 2,
  '1/4': 4,
  '1/2': 8,
  '1': 16
};

// Colors matching the diagram aesthetics
const RHYTHM_COLORS = {
  note: {
    '1/16': '#a2628b', // Plum
    '1/8': '#52796f',  // Sage
    '1/4': '#415a77',  // Slate
    '1/2': '#d97706',  // Amber
    '1': '#b91c1c'     // Brick Red
  },
  rest: {
    '1/16': '#7e537e',
    '1/8': '#43615e',
    '1/4': '#35495e',
    '1/2': '#c25e1a',
    '1': '#9e2a2b'
  }
};

const renderRhythmIcon = (type: 'note' | 'rest', duration: string, size = 22, color = 'currentColor', isBeamed = false) => {
  if (type === 'note') {
    switch (duration) {
      case '1': // Whole Note (tilted hollow oval)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" style={{ display: 'block' }}>
            <ellipse cx="12" cy="12" rx="7" ry="4.5" transform="rotate(-20 12 12)" />
          </svg>
        );
      case '1/2': // Half Note (hollow oval with vertical stem)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
            <ellipse cx="9" cy="15" rx="5" ry="3.5" transform="rotate(-20 9 15)" />
            <line x1="14" y1="15" x2="14" y2="4" strokeLinecap="round" />
          </svg>
        );
      case '1/4': // Quarter Note (filled oval with vertical stem)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
            <ellipse cx="9" cy="15" rx="5" ry="3.5" fill={color} transform="rotate(-20 9 15)" />
            <line x1="14" y1="15" x2="14" y2="4" strokeLinecap="round" />
          </svg>
        );
      case '1/8': // Eighth Note
        if (isBeamed) {
          // Longer stem to touch the horizontal beaming line at the top
          return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
              <ellipse cx="9" cy="15" rx="5" ry="3.5" fill={color} transform="rotate(-20 9 15)" />
              <line x1="14" y1="15" x2="14" y2="1.5" strokeLinecap="round" />
            </svg>
          );
        }
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
            <ellipse cx="9" cy="15" rx="5" ry="3.5" fill={color} transform="rotate(-20 9 15)" />
            <line x1="14" y1="15" x2="14" y2="4" strokeLinecap="round" />
            <path d="M14,4 C17,7 16,10 19,11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case '1/16': // Sixteenth Note
        if (isBeamed) {
          return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
              <ellipse cx="9" cy="15" rx="5" ry="3.5" fill={color} transform="rotate(-20 9 15)" />
              <line x1="14" y1="15" x2="14" y2="1.5" strokeLinecap="round" />
            </svg>
          );
        }
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
            <ellipse cx="9" cy="15" rx="5" ry="3.5" fill={color} transform="rotate(-20 9 15)" />
            <line x1="14" y1="15" x2="14" y2="4" strokeLinecap="round" />
            <path d="M14,4 C17,7 16,10 19,11" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14,7 C17,10 16,13 19,14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
    }
  } else {
    // RESTS
    switch (duration) {
      case '1': // Whole Rest (hangs below staff line)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
            <line x1="4" y1="10" x2="20" y2="10" strokeLinecap="round" />
            <rect x="8" y="10" width="8" height="5" fill={color} />
          </svg>
        );
      case '1/2': // Half Rest (sits above staff line like a hat)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
            <line x1="4" y1="14" x2="20" y2="14" strokeLinecap="round" />
            <rect x="8" y="9" width="8" height="5" fill={color} />
          </svg>
        );
      case '1/4': // Quarter Rest (lightning squiggly)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
            <path d="M10,4 L14,8 C11,11 10,12 13,15 C10,17 9,18 12,20" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case '1/8': // Eighth Rest (slash with top-left hook)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
            <line x1="10" y1="18" x2="15" y2="6" strokeLinecap="round" />
            <circle cx="9" cy="8" r="2" fill={color} />
            <path d="M9,6 C11,6 12,8 14,9" strokeLinecap="round" />
          </svg>
        );
      case '1/16': // Sixteenth Rest (slash with 2 hooks)
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ display: 'block' }}>
            <line x1="9" y1="20" x2="15" y2="5" strokeLinecap="round" />
            <circle cx="9" cy="8" r="1.8" fill={color} />
            <path d="M9,6 C11,6 12,8 14,9" strokeLinecap="round" />
            <circle cx="7" cy="13" r="1.8" fill={color} />
            <path d="M7,11 C9,11 10,13 12,14" strokeLinecap="round" />
          </svg>
        );
    }
  }
  return null;
};

export default function RhythmWidget({ widgetId, initialData, onSave, isPlayMode }: RhythmWidgetProps) {
  const [timeSignature, setTimeSignature] = useState(initialData.timeSignature || '4/4');
  const [tempo, setTempo] = useState(initialData.tempo || 100);
  const [subdivisions, setSubdivisions] = useState(initialData.subdivisions || 4);
  const [beats, setBeats] = useState<boolean[]>(initialData.beats || Array(16).fill(false));
  
  // Default sequence: four 1/4 notes to start with
  const [items, setItems] = useState<RhythmItem[]>(initialData.items || [
    { type: 'note', duration: '1/4' },
    { type: 'note', duration: '1/4' },
    { type: 'note', duration: '1/4' },
    { type: 'note', duration: '1/4' }
  ]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number | null>(null);

  const stepTimerRef = useRef<any | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sync state with incoming initialData
  useEffect(() => {
    if (initialData.timeSignature) setTimeSignature(initialData.timeSignature);
    if (initialData.tempo) setTempo(initialData.tempo);
    if (initialData.subdivisions) setSubdivisions(initialData.subdivisions);
    if (initialData.beats) setBeats(initialData.beats);
    if (initialData.items) setItems(initialData.items);
  }, [initialData]);

  // Calculate current total length of sequence in sixteenth parts
  const totalSixteenths = items.reduce((sum, item) => sum + ITEM_SIXTEENTHS[item.duration], 0);

  // Math fractions helper (simplifies to e.g. 5/8 or 1/1)
  const getSimplestFraction = (sixteenths: number) => {
    if (sixteenths === 0) return '0/1';
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const divisor = gcd(sixteenths, 16);
    const num = sixteenths / divisor;
    const den = 16 / divisor;
    return `${num}/${den}`;
  };

  const handleTempoChange = (newTempo: number) => {
    setTempo(newTempo);
    onSave({ timeSignature, tempo: newTempo, subdivisions, beats, items });
  };

  const addRhythmItem = (type: 'note' | 'rest', duration: '1/16' | '1/8' | '1/4' | '1/2' | '1') => {
    const itemValue = ITEM_SIXTEENTHS[duration];
    
    // Prevent adding more items if it would exceed 1 Whole Note (16 sixteenth units)
    if (totalSixteenths + itemValue > 16) {
      alert(`⚠️ Cannot add: This would exceed the 1/1 Whole Note measure limit!\n\nCurrent measure size: ${getSimplestFraction(totalSixteenths)}\nAdding note value: ${DURATION_LABELS[duration]}`);
      return;
    }

    const updated = [...items, { type, duration }];
    setItems(updated);
    onSave({ timeSignature, tempo, subdivisions, beats, items: updated });
  };

  const deleteRhythmItem = (index: number) => {
    const updated = items.filter((_, idx) => idx !== index);
    setItems(updated);
    onSave({ timeSignature, tempo, subdivisions, beats, items: updated });
  };

  const clearRhythm = () => {
    setItems([]);
    onSave({ timeSignature, tempo, subdivisions, beats, items: [] });
  };

  // Rules of Beaming (stringing notes together continuously):
  // Notes are beamed together continuously as long as they are consecutive notes with flags (1/8 or 1/16).
  const canBeamToRight = (idx: number) => {
    if (idx >= items.length - 1) return false;
    const current = items[idx];
    const next = items[idx + 1];

    if (current.type !== 'note' || next.type !== 'note') return false;
    return (current.duration === '1/8' || current.duration === '1/16') && 
           (next.duration === '1/8' || next.duration === '1/16');
  };

  const canBeamToLeft = (idx: number) => {
    if (idx <= 0) return false;
    const current = items[idx];
    const prev = items[idx - 1];

    if (current.type !== 'note' || prev.type !== 'note') return false;
    return (current.duration === '1/8' || current.duration === '1/16') && 
           (prev.duration === '1/8' || prev.duration === '1/16');
  };

  // Synthesizes beautifully clear percussion ticks using Web Audio API
  const playRhythmAudio = (duration: string, isAccent: boolean) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = isAccent ? 'sine' : 'triangle';

      let frequency = 800;
      let decay = 0.1;

      switch (duration) {
        case '1/16':
          frequency = 1100;
          decay = 0.04;
          break;
        case '1/8':
          frequency = 950;
          decay = 0.07;
          break;
        case '1/4':
          frequency = 800;
          decay = 0.12;
          break;
        case '1/2':
          frequency = 650;
          decay = 0.24;
          break;
        case '1':
          frequency = 500;
          decay = 0.45;
          break;
      }

      if (isAccent) {
        frequency += 150;
        decay += 0.05;
      }

      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gainNode.gain.setValueAtTime(isAccent ? 0.35 : 0.22, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + decay + 0.05);
    } catch (e) {
      console.error('AudioContext rhythm synthesis failed:', e);
    }
  };

  const startSequencer = () => {
    if (isPlaying) {
      stopSequencer();
      return;
    }

    if (items.length === 0) return;

    setIsPlaying(true);
    let currentIndex = 0;

    const tick = () => {
      setCurrentStep(currentIndex);
      const currentItem = items[currentIndex];

      if (currentItem.type === 'note') {
        const isAccent = currentIndex % 4 === 0;
        playRhythmAudio(currentItem.duration, isAccent);
      }

      const durationBeats = DURATION_BEATS[currentItem.duration] || 1.0;
      const beatIntervalMs = (60 / tempo) * 1000;
      const delayMs = durationBeats * beatIntervalMs;

      currentIndex = (currentIndex + 1) % items.length;
      stepTimerRef.current = setTimeout(tick, delayMs);
    };

    tick();
  };

  const stopSequencer = () => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setIsPlaying(false);
    setCurrentStep(null);
  };

  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
  }, []);

  return (
    <div className="rhythm-widget" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Control Row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        padding: '0.5rem 0.75rem',
        background: 'rgba(255,255,255,0.01)',
        border: '1px solid rgba(255,255,255,0.03)',
        borderRadius: 'var(--radius-md)'
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`} onClick={startSequencer}>
            {isPlaying ? <Square size={14} /> : <Play size={14} />}
            {isPlaying ? 'Stop Beat' : 'Play Beat'}
          </button>

          {!isPlayMode && items.length > 0 && (
            <button className="btn btn-secondary" onClick={clearRhythm} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Trash2 size={13} style={{ color: 'var(--accent-red)' }} />
              Clear Grid
            </button>
          )}
        </div>

        {/* Tempo slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tempo:</span>
          <input 
            type="range" 
            min="40" 
            max="240" 
            value={tempo}
            onChange={(e) => handleTempoChange(parseInt(e.target.value))}
            style={{ accentColor: 'var(--primary)', width: '100px', height: '4px' }}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', width: '55px', fontWeight: 600 }}>{tempo} BPM</span>
        </div>
      </div>

      {!isPlayMode && (
        <>
          {/* Measure Capacity Interactive Progress Tracker */}
          <div style={{
            padding: '0.75rem 1rem',
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(255,255,255,0.03)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)' }}>
                Measure Capacity Progress:
              </span>
              <span style={{ 
                fontSize: '0.85rem', 
                fontWeight: 'bold', 
                color: totalSixteenths === 16 ? 'var(--primary)' : 'var(--text-main)',
                filter: totalSixteenths === 16 ? 'drop-shadow(0 0 6px var(--primary-glow))' : 'none',
                transition: 'all 0.2s ease'
              }}>
                {getSimplestFraction(totalSixteenths)} {totalSixteenths === 16 ? 'Whole Note (Measure Full! 🏆)' : '/ 1 Whole Note'}
              </span>
            </div>
            
            {/* Progress Track */}
            <div style={{
              width: '100%',
              height: '6px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '3px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${(totalSixteenths / 16) * 100}%`,
                height: '100%',
                background: totalSixteenths === 16 
                  ? 'linear-gradient(90deg, var(--primary) 0%, #10b981 100%)' 
                  : 'linear-gradient(90deg, var(--secondary) 0%, var(--primary) 100%)',
                boxShadow: totalSixteenths === 16 ? '0 0 8px #10b981' : 'none',
                borderRadius: '3px',
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease'
              }} />
            </div>
          </div>

          {/* Rhythmic construction blocks builder */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
            padding: '1rem',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
            borderRadius: 'var(--radius-md)'
          }}>
            {/* Notes Line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ width: '85px', fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Note:</span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {(['1/16', '1/8', '1/4', '1/2', '1'] as const).map((d) => {
                  const color = RHYTHM_COLORS.note[d];
                  return (
                    <button 
                      key={d} 
                      onClick={() => addRhythmItem('note', d)}
                      className="btn btn-secondary rhythm-add-btn"
                      style={{ 
                        padding: '0.4rem 0.75rem', 
                        fontSize: '0.75rem', 
                        background: 'rgba(255, 255, 255, 0.02)', 
                        borderColor: 'rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}
                      title={`Add ${DURATION_LABELS[d]} Note`}
                    >
                      <div style={{ color }}>
                        {renderRhythmIcon('note', d, 16, color)}
                      </div>
                      <span style={{ color: 'var(--text-main)' }}>{DURATION_LABELS[d]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rests Line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ width: '85px', fontSize: '0.72rem', color: 'var(--secondary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Rest:</span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {(['1/16', '1/8', '1/4', '1/2', '1'] as const).map((d) => {
                  const color = RHYTHM_COLORS.rest[d];
                  return (
                    <button 
                      key={d} 
                      onClick={() => addRhythmItem('rest', d)}
                      className="btn btn-secondary rhythm-add-btn"
                      style={{ 
                        padding: '0.4rem 0.75rem', 
                        fontSize: '0.75rem', 
                        background: 'rgba(255, 255, 255, 0.02)', 
                        borderColor: 'rgba(255, 255, 255, 0.05)',
                        borderStyle: 'dashed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}
                      title={`Add ${DURATION_LABELS[d]} Rest`}
                    >
                      <div style={{ color }}>
                        {renderRhythmIcon('rest', d, 16, color)}
                      </div>
                      <span style={{ color: 'var(--text-dim)' }}>{DURATION_LABELS[d]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Rhythmic Playback Track Sheet */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Rhythm Sequence (Hover 1s to delete):
        </span>
        
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '1.25rem',
          background: 'rgba(10, 12, 20, 0.6)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-lg)',
          minHeight: '100px',
          width: '100%'
        }}>
          {items.length === 0 ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', margin: 'auto' }}>
              Sequence Empty. Click Add Note or Add Rest above to compose your rhythm!
            </span>
          ) : (
            items.map((item, idx) => {
              const isCurrent = currentStep === idx;
              const width = DURATION_WIDTHS[item.duration] || 80;
              const label = DURATION_LABELS[item.duration];
              const color = item.type === 'note' ? RHYTHM_COLORS.note[item.duration] : RHYTHM_COLORS.rest[item.duration];

              // Beaming calculations: Beams are drawn continuously all the way across consecutive flagged notes
              const beamLeft = canBeamToLeft(idx);
              const beamRight = canBeamToRight(idx);
              const isBeamed = beamLeft || beamRight;

              return (
                <div
                  key={idx}
                  style={{
                    position: 'relative',
                    width: `${width}px`,
                    height: '64px',
                    borderRadius: 'var(--radius-md)',
                    background: isCurrent
                      ? 'rgba(6, 182, 212, 0.15)'
                      : item.type === 'note'
                        ? 'rgba(255, 255, 255, 0.02)'
                        : 'rgba(255, 255, 255, 0.01)',
                    border: isCurrent
                      ? '2px solid var(--secondary)'
                      : item.type === 'note'
                        ? `1px solid ${color}40`
                        : `1px dashed ${color}30`,
                    boxShadow: isCurrent 
                      ? '0 0 15px var(--secondary-glow)' 
                      : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.3rem 0.4rem 0.3rem',
                    cursor: isPlayMode ? 'default' : 'pointer',
                    userSelect: 'none',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                  className="rhythm-block"
                  title={`${item.type === 'note' ? 'Note' : 'Rest'} (${label})`}
                >
                  {/* Floating delete button appearing on 1s hover */}
                  {!isPlayMode && (
                    <button
                      className="rhythm-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRhythmItem(idx);
                      }}
                      title="Delete this block"
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        background: 'var(--accent-red)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '15px',
                        height: '15px',
                        fontSize: '0.55rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                        zIndex: 10,
                        padding: 0,
                        lineHeight: 1
                      }}
                    >
                      ✕
                    </button>
                  )}

                  {/* Horizontal Music Beaming Lines layer (Rules of Beaming) */}
                  {isBeamed && (
                    <div style={{
                      position: 'absolute',
                      top: '7.5px', // Aligns perfectly to connect with lengthened vertical stems
                      left: 0,
                      right: 0,
                      height: '10px',
                      pointerEvents: 'none',
                      zIndex: 2
                    }}>
                      {/* 1st Beam: Primary eighth note connection */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: beamLeft ? 0 : '50%',
                        right: beamRight ? 0 : '50%',
                        height: '4px',
                        background: isCurrent ? 'var(--secondary)' : color,
                        boxShadow: isCurrent ? '0 0 4px var(--secondary-glow)' : 'none',
                        borderRadius: '0.5px'
                      }} />

                      {/* 2nd Beam: Sixteenth note connection */}
                      {item.duration === '1/16' && (
                        <div style={{
                          position: 'absolute',
                          top: '6.5px',
                          // If adjacent note is also 1/16, connect fully, otherwise render a neat 35% stub beam!
                          left: (beamLeft && items[idx - 1]?.duration === '1/16') ? 0 : beamLeft ? '30%' : '50%',
                          right: (beamRight && items[idx + 1]?.duration === '1/16') ? 0 : beamRight ? '30%' : '50%',
                          height: '3px',
                          background: isCurrent ? 'var(--secondary)' : color,
                          borderRadius: '0.5px'
                        }} />
                      )}
                    </div>
                  )}

                  {/* Main Music Note Symbol Render */}
                  <div style={{ 
                    color: isCurrent ? 'var(--secondary)' : color, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: '26px',
                    filter: isCurrent ? 'drop-shadow(0 0 4px var(--secondary-glow))' : 'none'
                  }}>
                    {renderRhythmIcon(item.type, item.duration, 24, isCurrent ? 'var(--secondary)' : color, isBeamed)}
                  </div>

                  {/* Labels details */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                    <span style={{ 
                      fontSize: '0.55rem', 
                      color: isCurrent ? 'var(--secondary)' : 'var(--text-dim)', 
                      fontWeight: '700', 
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      lineHeight: 1
                    }}>
                      {label}
                    </span>
                    <span style={{ 
                      fontSize: '0.45rem', 
                      color: 'rgba(255,255,255,0.2)', 
                      fontWeight: '600',
                      lineHeight: 1
                    }}>
                      {item.type === 'note' ? 'Note' : 'Rest'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Helper Info */}
      {!isPlayMode && (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
          <Info size={14} style={{ color: 'var(--secondary)', flexShrink: 0 }} />
          <span>Compose realistic music-sheet rhythms. Playhead highlights active blocks, clicking notes and holding silence for rests!</span>
        </div>
      )}

      <style>{`
        .rhythm-add-btn {
          transition: all 0.15s ease !important;
        }
        .rhythm-add-btn:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,0.06) !important;
          border-color: rgba(255,255,255,0.2) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .rhythm-block:hover {
          background: rgba(255, 255, 255, 0.04) !important;
        }
        /* Hover-delayed delete button on rhythm blocks */
        .rhythm-delete-btn {
          opacity: 0;
          pointer-events: none;
          transform: scale(0.85);
          transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .rhythm-block:hover .rhythm-delete-btn {
          opacity: 1;
          pointer-events: auto;
          transform: scale(1);
          transition-delay: 1s; /* Hover for exactly 1 second to reveal */
        }
        .rhythm-delete-btn:hover {
          transform: scale(1.2) !important;
          background: #ef4444 !important;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.6) !important;
        }
      `}</style>
    </div>
  );
}
