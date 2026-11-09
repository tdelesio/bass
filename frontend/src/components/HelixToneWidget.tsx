import React, { useState } from 'react';
import {
  Search,
  Sparkles,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Power,
  ExternalLink,
  Sliders,
  Check,
  Music,
  Zap,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export type HxBlockCategory =
  | 'dynamics'
  | 'filter'
  | 'pitch'
  | 'distortion'
  | 'amp_cab'
  | 'modulation'
  | 'eq'
  | 'delay'
  | 'reverb';

export interface HxStompBlock {
  id: string;
  category: HxBlockCategory;
  hxModel: string;
  basedOn: string;
  enabled: boolean;
  footswitch: 'Always On' | 'FS1' | 'FS2' | 'FS3';
  role: string;
  settings: Record<string, string>;
}

export interface CustomToneItem {
  id: string;
  toneName: string;
  song: string;
  band: string;
  guitarist: string;
  instrumentTag?: string;
  amp: string;
  style: string;
  comment: string;
  downloads: number;
  date: string;
  url: string;
}

export interface HelixToneWidgetData {
  title?: string;
  instrument?: 'bass' | 'guitar';
  playingStyle?: string;
  tuning?: string;
  summary?: string;
  blocks?: HxStompBlock[];
  detectedGear?: string[];
  customTones?: CustomToneItem[];
  lastPolledAt?: string;
}

interface HelixToneWidgetProps {
  data: HelixToneWidgetData;
  onChange: (newData: HelixToneWidgetData) => void;
  songTitle?: string;
  songArtist?: string;
  apiBase: string;
  readOnly?: boolean;
}

export const HX_CATEGORY_META: Record<
  HxBlockCategory,
  { label: string; color: string; bg: string; border: string; badgeBg: string }
> = {
  dynamics: {
    label: 'Dynamics / Comp',
    color: '#fde047',
    bg: 'rgba(234, 179, 8, 0.16)',
    border: '#eab308',
    badgeBg: '#a16207'
  },
  filter: {
    label: 'Filter / Wah',
    color: '#e9d5ff',
    bg: 'rgba(168, 85, 247, 0.18)',
    border: '#a855f7',
    badgeBg: '#7e22ce'
  },
  pitch: {
    label: 'Pitch / Synth',
    color: '#ddd6fe',
    bg: 'rgba(139, 92, 246, 0.18)',
    border: '#8b5cf6',
    badgeBg: '#6d28d9'
  },
  distortion: {
    label: 'Drive / Fuzz / DI',
    color: '#fed7aa',
    bg: 'rgba(249, 115, 22, 0.18)',
    border: '#f97316',
    badgeBg: '#c2410c'
  },
  amp_cab: {
    label: 'Amp + Cab',
    color: '#fecaca',
    bg: 'rgba(239, 68, 68, 0.2)',
    border: '#ef4444',
    badgeBg: '#b91c1c'
  },
  modulation: {
    label: 'Modulation',
    color: '#bfdbfe',
    bg: 'rgba(59, 130, 246, 0.18)',
    border: '#3b82f6',
    badgeBg: '#1d4ed8'
  },
  eq: {
    label: 'EQ / Sculpt',
    color: '#a7f3d0',
    bg: 'rgba(16, 185, 129, 0.16)',
    border: '#10b981',
    badgeBg: '#047857'
  },
  delay: {
    label: 'Delay',
    color: '#bbf7d0',
    bg: 'rgba(34, 197, 94, 0.16)',
    border: '#22c55e',
    badgeBg: '#15803d'
  },
  reverb: {
    label: 'Reverb',
    color: '#fecdd3',
    bg: 'rgba(244, 63, 94, 0.16)',
    border: '#f43f5e',
    badgeBg: '#be123c'
  }
};

export interface HxCatalogModel {
  category: HxBlockCategory;
  instrument: 'bass' | 'guitar' | 'both';
  hxModel: string;
  basedOn: string;
  defaultRole: string;
  defaultSettings: Record<string, string>;
}

export const HX_STOMP_MODEL_CATALOG: HxCatalogModel[] = [
  // Dynamics / Compressors
  {
    category: 'dynamics',
    instrument: 'both',
    hxModel: 'LA Studio Comp',
    basedOn: 'Teletronix LA-2A Studio Optical Compressor',
    defaultRole: 'Smooth optical studio compression to glue low-end fundamentals and sustain.',
    defaultSettings: { 'Peak Reduc': '5.5', Gain: '5.0', Type: 'Compress', Mix: '80%' }
  },
  {
    category: 'dynamics',
    instrument: 'bass',
    hxModel: 'Rochester Comp',
    basedOn: 'Ashly CLX-52 / BBE Opto Stomp Bass Compressor',
    defaultRole: 'Transparent bass transient control that preserves pick/slap attack.',
    defaultSettings: { Threshold: '-24 dB', Ratio: '4:1', Attack: '15 ms', Gain: '3.5 dB' }
  },
  {
    category: 'dynamics',
    instrument: 'both',
    hxModel: 'Deluxe Comp',
    basedOn: 'Line 6 Studio VCA Compressor',
    defaultRole: 'Precision studio VCA compression with wet/dry mix.',
    defaultSettings: { Threshold: '-26 dB', Ratio: '4:1', Attack: '12 ms', Mix: '75%' }
  },
  {
    category: 'dynamics',
    instrument: 'both',
    hxModel: 'Red Squeeze',
    basedOn: 'MXR Dyna Comp',
    defaultRole: 'Snappy percussive funk compression and sustain.',
    defaultSettings: { Sensitivity: '5.5', Mix: '75%', Level: '+1.5 dB' }
  },
  {
    category: 'dynamics',
    instrument: 'both',
    hxModel: 'Kinky Comp',
    basedOn: 'Xotic SP Compressor',
    defaultRole: 'Compact punchy compression with parallel blend.',
    defaultSettings: { Sensitivity: '4.8', Attack: '5.0', Mix: '70%', Level: '+1.0 dB' }
  },

  // Filter / Pitch / Synth
  {
    category: 'filter',
    instrument: 'both',
    hxModel: 'Mutant Filter',
    basedOn: 'Musitronics Mu-Tron III Envelope Filter',
    defaultRole: 'Classic funk/slap vocal envelope filter sweep.',
    defaultSettings: { Mode: 'BP (Bandpass)', Drive: '4.5', Peak: '6.5', Range: 'Low', Mix: '100%' }
  },
  {
    category: 'filter',
    instrument: 'both',
    hxModel: 'Autofilter',
    basedOn: 'Line 6 Dynamic Auto-Filter',
    defaultRole: 'Fast-tracking dynamic filter for synth-funk bass and leads.',
    defaultSettings: { Mode: 'Low Pass', Sens: '6.0', Resonance: '5.5', Mix: '100%' }
  },
  {
    category: 'pitch',
    instrument: 'both',
    hxModel: 'Twin Harmony',
    basedOn: 'Sub-Octave / Dual Pitch Shifter (OC-2 style)',
    defaultRole: 'Adds -1 octave sub weight underneath single-note riffs.',
    defaultSettings: { 'Interval 1': '-1 Oct', 'Voice 1': '65%', Mix: '45%' }
  },
  {
    category: 'pitch',
    instrument: 'bass',
    hxModel: '3 OSC Synth',
    basedOn: '3-Oscillator Analog Synth Bass',
    defaultRole: 'Thick analog synth bass layer for synth-rock and pop hooks.',
    defaultSettings: { 'Osc 1': 'Saw (-1 Oct)', Cut: '4.2', Resonance: '5.5', Mix: '40%' }
  },
  {
    category: 'pitch',
    instrument: 'both',
    hxModel: 'Poly Capo',
    basedOn: 'Line 6 Polyphonic Drop/Capo Shifter',
    defaultRole: 'Shifts tuning down or up polyphonically without retuning.',
    defaultSettings: { Interval: '-2 Semitones', 'High Cut': '8.0 kHz', Mix: '100%' }
  },

  // Distortion / Overdrive / Fuzz / DI
  {
    category: 'distortion',
    instrument: 'bass',
    hxModel: 'ZeroAmp Bass DI',
    basedOn: 'Tech 21 SansAmp Bass Driver DI V1',
    defaultRole: 'Warm SVT-style tube DI harmonic grit and parallel clean blend.',
    defaultSettings: { Drive: '5.0', Bass: '5.8', Treble: '6.0', Presence: '5.5', Blend: '75%' }
  },
  {
    category: 'distortion',
    instrument: 'bass',
    hxModel: 'Obsidian 7000',
    basedOn: 'Darkglass Electronics Microtubes B7K Ultra',
    defaultRole: 'Modern aggressive bass grind and clank with clean sub-bass blend.',
    defaultSettings: { Drive: '6.2', Blend: '70%', Attack: 'Boost', Grunt: 'Fat', 'Hi Mids': '+3.0 dB' }
  },
  {
    category: 'distortion',
    instrument: 'bass',
    hxModel: 'Clawthorn Drive',
    basedOn: 'Wounded Paw Battering Ram Bass Overdrive + Octave',
    defaultRole: 'Thick bass overdrive with switchable octave fuzz.',
    defaultSettings: { Drive: '5.8', Bass: '6.2', Treble: '5.5', Blend: '70%' }
  },
  {
    category: 'distortion',
    instrument: 'both',
    hxModel: 'Russian Big Pi',
    basedOn: 'Electro-Harmonix Green Russian Big Muff Pi',
    defaultRole: 'Massive, wooly low-end fuzz sustain that keeps deep fundamentals.',
    defaultSettings: { Sustain: '6.8', Tone: '5.2', Level: '6.5', Blend: '70%' }
  },
  {
    category: 'distortion',
    instrument: 'both',
    hxModel: 'Industrial Fuzz',
    basedOn: 'Z.Vex Fuzz Factory / Woolly Mammoth / Animato',
    defaultRole: 'Biting, gated saw-wave synth-fuzz (Muse Hysteria staple).',
    defaultSettings: { Stab: '7.5', Gate: '3.0', Pinch: '5.5', Drive: '7.0', Blend: '65%' }
  },
  {
    category: 'distortion',
    instrument: 'bass',
    hxModel: 'Scrambler',
    basedOn: 'Ampeg Scrambler Bass Overdrive',
    defaultRole: 'Classic SVT tube grind with dedicated treble and clean blend.',
    defaultSettings: { Drive: '5.5', Treble: '6.0', Blend: '65%', Vol: '6.5' }
  },
  {
    category: 'distortion',
    instrument: 'guitar',
    hxModel: 'Minotaur',
    basedOn: 'Klon Centaur Transparent Overdrive',
    defaultRole: 'Mid-focused transparent overdrive and edge-of-breakup boost.',
    defaultSettings: { Gain: '3.8', Treble: '6.0', Output: '6.5' }
  },
  {
    category: 'distortion',
    instrument: 'guitar',
    hxModel: 'Scream 808',
    basedOn: 'Ibanez TS808 Tube Screamer',
    defaultRole: 'Classic mid-hump tube overdrive that tightens amps.',
    defaultSettings: { Gain: '4.5', Tone: '6.0', Level: '7.0' }
  },
  {
    category: 'distortion',
    instrument: 'guitar',
    hxModel: 'Compulsive Drive',
    basedOn: 'Fulltone OCD Overdrive',
    defaultRole: 'Dynamic amp-like crunch and harmonic sustain.',
    defaultSettings: { Gain: '6.0', Tone: '6.2', Peak: 'High', Level: '6.5' }
  },
  {
    category: 'distortion',
    instrument: 'both',
    hxModel: 'Triangle Fuzz',
    basedOn: 'Electro-Harmonix Triangle Big Muff Pi',
    defaultRole: 'Singing, violin-like sustain for solos and heavy walls of fuzz.',
    defaultSettings: { Sustain: '7.0', Tone: '5.8', Level: '6.5' }
  },

  // Bass Amps + Cabs
  {
    category: 'amp_cab',
    instrument: 'bass',
    hxModel: 'SV Beast Nrm + 8x10 SVT Beast',
    basedOn: 'Ampeg SVT (Normal Ch) + 8x10 SVT Cab',
    defaultRole: 'Iconic 300W all-tube rock/funk bass stack with deep low-end authority.',
    defaultSettings: { Drive: '4.5', Bass: '6.0', Midrange: '6.5', 'Mid Freq': '800 Hz', Treble: '5.2' }
  },
  {
    category: 'amp_cab',
    instrument: 'bass',
    hxModel: 'SV Beast Brt + 8x10 SVT Beast',
    basedOn: 'Ampeg SVT (Bright Ch) + 8x10 SVT Cab',
    defaultRole: 'Aggressive picked/modern rock SVT stack with extra upper-mid bite.',
    defaultSettings: { Drive: '5.5', Bass: '6.0', Midrange: '6.8', 'Mid Freq': '800 Hz', Treble: '6.2' }
  },
  {
    category: 'amp_cab',
    instrument: 'bass',
    hxModel: 'Flip Top + 1x15 Flip Top',
    basedOn: '1960s Ampeg B-15N Portaflex Tube Combo',
    defaultRole: 'Warm, round Motown/soul/vintage studio tube thump.',
    defaultSettings: { Drive: '4.5', Bass: '6.5', Treble: '4.2', 'Cab Mic': '47 Cond FET' }
  },
  {
    category: 'amp_cab',
    instrument: 'bass',
    hxModel: 'G Cougar 800 + 4x10 Rhino',
    basedOn: 'Gallien-Krueger GK 800RB + 4x10 Cab',
    defaultRole: 'Punchy solid-state bi-amp funk/alt-rock clank (Flea / RHCP staple).',
    defaultSettings: { Boost: '5.5', 'Lo Cut': 'On', 'Lo Mid': '6.0', 'Hi Mid': '6.5', Presence: '6.0' }
  },
  {
    category: 'amp_cab',
    instrument: 'bass',
    hxModel: 'Cali Bass + 6x10 Cali Power',
    basedOn: 'Mesa/Boogie M9 Carbine + 6x10 Cab',
    defaultRole: 'Modern high-headroom bass punch and tight sub-lows.',
    defaultSettings: { Drive: '5.0', Bass: '6.2', Mid: '5.8', Treble: '6.0', 'Voice': '2 (Mid Scoop)' }
  },
  {
    category: 'amp_cab',
    instrument: 'bass',
    hxModel: 'Cali 400 Ch1 + 2x15 Brute',
    basedOn: 'Mesa/Boogie Bass 400+ All-Tube + 2x15 Cab',
    defaultRole: 'Classic prog/hard-rock all-tube growl and harmonic richness.',
    defaultSettings: { Volume: '6.0', Bass: '6.0', Mid: '6.5', Treble: '5.8' }
  },
  {
    category: 'amp_cab',
    instrument: 'bass',
    hxModel: 'Agua 51 + 4x10 Rhino',
    basedOn: 'Aguilar DB 751 + 4x10 Cab',
    defaultRole: 'Hi-fi modern fingerstyle, jazz, and slap clarity.',
    defaultSettings: { Drive: '4.2', Bass: '6.0', Mid: '5.5', Treble: '5.8', 'Deep': 'On' }
  },
  {
    category: 'amp_cab',
    instrument: 'bass',
    hxModel: 'Woody Blue + 1x18 Del Sol',
    basedOn: '1970 Acoustic 360 Preamp + 1x18 Horn Cab',
    defaultRole: 'Vintage 70s classic rock & jazz-fusion warmth (John Paul Jones / Jaco).',
    defaultSettings: { Drive: '5.0', Bass: '6.5', Treble: '5.2', 'Variamp': '4.5' }
  },

  // Guitar Amps + Cabs
  {
    category: 'amp_cab',
    instrument: 'guitar',
    hxModel: 'US Double Nrm + 2x12 Double C12N',
    basedOn: 'Fender Twin Reverb + 2x12 Jensen Cab',
    defaultRole: 'Crystal-clear American clean headroom and pedal platform.',
    defaultSettings: { Drive: '4.2', Bass: '5.5', Mid: '6.0', Treble: '6.2', Presence: '5.0' }
  },
  {
    category: 'amp_cab',
    instrument: 'guitar',
    hxModel: 'Essex A30 + 2x12 Blue Bell',
    basedOn: 'Vox AC30 Top Boost + 2x12 Alnico Blue Cab',
    defaultRole: 'Chimey British Class-A jangle and dynamic edge-of-breakup.',
    defaultSettings: { Drive: '5.2', Bass: '5.0', Treble: '6.5', 'Cut': '4.5' }
  },
  {
    category: 'amp_cab',
    instrument: 'guitar',
    hxModel: 'Brit Plexi Brt + 4x12 Greenback25',
    basedOn: '1959 Marshall Super Lead 100W + 4x12 Cab',
    defaultRole: 'Classic British rock roar and woody midrange crunch.',
    defaultSettings: { 'Drive Brt': '6.2', Bass: '5.0', Mid: '6.8', Treble: '6.0', Presence: '5.5' }
  },
  {
    category: 'amp_cab',
    instrument: 'guitar',
    hxModel: 'Brit 2204 + 4x12 Greenback25',
    basedOn: 'Marshall JCM800 2204 + 4x12 Cab',
    defaultRole: 'Punchy 80s/90s hard rock & alt-rock crunch.',
    defaultSettings: { Preamp: '6.5', Bass: '5.5', Mid: '6.8', Treble: '6.0', Presence: '5.5' }
  },
  {
    category: 'amp_cab',
    instrument: 'guitar',
    hxModel: 'Placater Dirty + 4x12 Cali V30',
    basedOn: 'Friedman BE-100 + 4x12 Vintage 30 Cab',
    defaultRole: 'Hot-rodded modern British high-gain rhythm and lead saturation.',
    defaultSettings: { Drive: '6.5', Bass: '5.5', Mid: '6.5', Treble: '6.2', 'HBE': 'On' }
  },

  // Modulation
  {
    category: 'modulation',
    instrument: 'both',
    hxModel: '70s Chorus',
    basedOn: 'BOSS CE-1 Chorus Ensemble',
    defaultRole: 'Lush warm analog chorus shimmer (Flea / Duff McKagan / 80s staple).',
    defaultSettings: { 'Chorus Intensity': '4.5', Mode: 'Chorus', 'Low Cut': '180 Hz', Mix: '40%' }
  },
  {
    category: 'modulation',
    instrument: 'both',
    hxModel: 'PlastiChorus',
    basedOn: 'Modded Arion SCH-Z Chorus',
    defaultRole: 'Liquid 80s dimension chorus for clean intros and chordal bass.',
    defaultSettings: { Rate: '3.8', Depth: '5.5', Tone: '6.0', Mix: '45%' }
  },
  {
    category: 'modulation',
    instrument: 'both',
    hxModel: 'Gray Flanger',
    basedOn: 'MXR M117 Flanger',
    defaultRole: 'Metallic jet-sweep flanger (Tool 46 & 2 / The Cure / Van Halen).',
    defaultSettings: { Manual: '5.5', Width: '6.0', Speed: '2.2', Regen: '4.5', Mix: '45%' }
  },
  {
    category: 'modulation',
    instrument: 'both',
    hxModel: 'Script Mod Phase',
    basedOn: 'MXR Phase 90 (Script Logo)',
    defaultRole: 'Swirling vintage 4-stage analog phaser.',
    defaultSettings: { Speed: '2.8', Mix: '50%', Level: '0.0 dB' }
  },

  // EQ
  {
    category: 'eq',
    instrument: 'both',
    hxModel: '10 Band Graphic',
    basedOn: 'MXR M108 10-Band Graphic EQ',
    defaultRole: 'Precision frequency sculpting and low-cut tightness.',
    defaultSettings: { '62.5 Hz': '+2.0 dB', '250 Hz': '-1.5 dB', '800 Hz': '+2.5 dB', '2 kHz': '+1.5 dB', Level: '0.0 dB' }
  },
  {
    category: 'eq',
    instrument: 'both',
    hxModel: 'Cali Q Graphic',
    basedOn: 'Mesa/Boogie Mark IV 5-Band Graphic EQ',
    defaultRole: 'Powerful 5-band tone shaping for punch or scoop.',
    defaultSettings: { '80 Hz': '+2.5 dB', '240 Hz': '+0.5 dB', '750 Hz': '+2.0 dB', '2200 Hz': '+1.5 dB' }
  },

  // Delay & Reverb
  {
    category: 'delay',
    instrument: 'both',
    hxModel: 'Transistor Tape',
    basedOn: 'Maestro Echoplex EP-3 Tape Echo',
    defaultRole: 'Warm vintage tape echo and studio depth.',
    defaultSettings: { Time: '360 ms', Feedback: '22%', 'Wow Flt': '3.5', Mix: '24%' }
  },
  {
    category: 'reverb',
    instrument: 'both',
    hxModel: 'Dynamic Hall',
    basedOn: 'Line 6 Studio Ducking Hall Reverb',
    defaultRole: 'Lush ambient hall space that stays clear while playing.',
    defaultSettings: { Decay: '2.8 s', Predelay: '35 ms', 'Low Cut': '160 Hz', Mix: '22%' }
  }
];

const HelixToneWidget: React.FC<HelixToneWidgetProps> = ({
  data,
  onChange,
  songTitle = '',
  songArtist = '',
  apiBase,
  readOnly = false
}) => {
  const instrument: 'bass' | 'guitar' = data.instrument === 'guitar' ? 'guitar' : 'bass';
  const blocks: HxStompBlock[] = Array.isArray(data.blocks) ? data.blocks : [];
  const detectedGear: string[] = Array.isArray(data.detectedGear) ? data.detectedGear : [];
  const customTones: CustomToneItem[] = Array.isArray(data.customTones) ? data.customTones : [];

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [polling, setPolling] = useState<boolean>(false);
  const [pollError, setPollError] = useState<string>('');
  const [showDiscoveryPanel, setShowDiscoveryPanel] = useState<boolean>(false);
  const [customQueryTitle, setCustomQueryTitle] = useState<string>(songTitle);
  const [customQueryArtist, setCustomQueryArtist] = useState<string>(songArtist);
  const [discoveredPresets, setDiscoveredPresets] = useState<
    Array<{ id: string; name: string; description: string; chain: HxStompBlock[] }>
  >([]);
  const [newSettingKey, setNewSettingKey] = useState<string>('');
  const [newSettingVal, setNewSettingVal] = useState<string>('');

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;

  const handlePollInternetTone = async (targetInstrument: 'bass' | 'guitar' = instrument) => {
    const qTitle = (customQueryTitle || songTitle || '').trim();
    const qArtist = (customQueryArtist || songArtist || '').trim();
    setPolling(true);
    setPollError('');
    setShowDiscoveryPanel(true);

    try {
      const params = new URLSearchParams({
        title: qTitle,
        artist: qArtist,
        instrument: targetInstrument
      });
      const res = await fetch(`${apiBase}/tone/discover?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to poll internet tone sources');
      }
      const result = await res.json();
      const nextBlocks: HxStompBlock[] = Array.isArray(result.recommendedChain)
        ? result.recommendedChain
        : blocks;

      if (Array.isArray(result.presets)) {
        setDiscoveredPresets(result.presets);
      }

      onChange({
        ...data,
        instrument: targetInstrument,
        playingStyle: result.playingStyle || data.playingStyle,
        tuning: result.tuning || data.tuning,
        summary: result.summary || data.summary,
        blocks: nextBlocks,
        detectedGear: Array.isArray(result.detectedGear) ? result.detectedGear : [],
        customTones: Array.isArray(result.customTones) ? result.customTones : [],
        lastPolledAt: new Date().toISOString()
      });

      if (nextBlocks.length > 0) {
        setSelectedBlockId(nextBlocks[0].id);
      }
    } catch (err: any) {
      setPollError(err?.message || 'Could not reach tone discovery service');
    } finally {
      setPolling(false);
    }
  };

  const handleInstrumentSwitch = (nextInst: 'bass' | 'guitar') => {
    if (readOnly) return;
    if (nextInst === instrument) return;
    onChange({
      ...data,
      instrument: nextInst
    });
    // Automatically poll the internet for the newly selected instrument!
    handlePollInternetTone(nextInst);
  };

  const handleToggleBlockEnabled = (blockId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (readOnly) return;
    const next = blocks.map(b => (b.id === blockId ? { ...b, enabled: !b.enabled } : b));
    onChange({ ...data, blocks: next });
  };

  const handleUpdateBlock = (blockId: string, patch: Partial<HxStompBlock>) => {
    if (readOnly) return;
    const next = blocks.map(b => (b.id === blockId ? { ...b, ...patch } : b));
    onChange({ ...data, blocks: next });
  };

  const handleMoveBlock = (blockId: string, direction: -1 | 1) => {
    if (readOnly) return;
    const idx = blocks.findIndex(b => b.id === blockId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= blocks.length) return;
    const next = [...blocks];
    const temp = next[idx];
    next[idx] = next[swapIdx];
    next[swapIdx] = temp;
    onChange({ ...data, blocks: next });
  };

  const handleDeleteBlock = (blockId: string) => {
    if (readOnly) return;
    const next = blocks.filter(b => b.id !== blockId);
    onChange({ ...data, blocks: next });
    if (selectedBlockId === blockId) {
      setSelectedBlockId(next[0]?.id || null);
    }
  };

  const handleAddBlock = () => {
    if (readOnly || blocks.length >= 8) return;
    const defaultModel =
      instrument === 'bass'
        ? HX_STOMP_MODEL_CATALOG.find(m => m.hxModel === 'Obsidian 7000')!
        : HX_STOMP_MODEL_CATALOG.find(m => m.hxModel === 'Minotaur')!;
    const newBlock: HxStompBlock = {
      id: `blk-${Date.now().toString(36)}`,
      category: defaultModel.category,
      hxModel: defaultModel.hxModel,
      basedOn: defaultModel.basedOn,
      enabled: true,
      footswitch: 'FS1',
      role: defaultModel.defaultRole,
      settings: { ...defaultModel.defaultSettings }
    };
    const next = [...blocks, newBlock];
    onChange({ ...data, blocks: next });
    setSelectedBlockId(newBlock.id);
  };

  const handleSelectCatalogModel = (blockId: string, model: HxCatalogModel) => {
    handleUpdateBlock(blockId, {
      category: model.category,
      hxModel: model.hxModel,
      basedOn: model.basedOn,
      role: model.defaultRole,
      settings: { ...model.defaultSettings }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Top Bar: Instrument Selector (Bass vs Guitar) + Poll Internet Button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(10, 14, 24, 0.78)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Left: Instrument Selector + Playing Style Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              borderRadius: '8px',
              padding: '3px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)'
            }}
          >
            <button
              type="button"
              disabled={readOnly}
              onClick={() => handleInstrumentSwitch('bass')}
              style={{
                padding: '0.32rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                cursor: readOnly ? 'default' : 'pointer',
                fontSize: '0.78rem',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background:
                  instrument === 'bass'
                    ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
                    : 'transparent',
                color: instrument === 'bass' ? '#fff' : 'var(--text-muted)',
                boxShadow: instrument === 'bass' ? '0 2px 10px rgba(6, 182, 212, 0.35)' : 'none'
              }}
              title="Switch to Bass Rig & Pedal Chain"
            >
              🎸 Bass Tone
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => handleInstrumentSwitch('guitar')}
              style={{
                padding: '0.32rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                cursor: readOnly ? 'default' : 'pointer',
                fontSize: '0.78rem',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background:
                  instrument === 'guitar'
                    ? 'linear-gradient(135deg, #f97316, #ea580c)'
                    : 'transparent',
                color: instrument === 'guitar' ? '#fff' : 'var(--text-muted)',
                boxShadow: instrument === 'guitar' ? '0 2px 10px rgba(249, 115, 22, 0.35)' : 'none'
              }}
              title="Switch to Guitar Rig & Pedal Chain"
            >
              ⚡ Guitar Tone
            </button>
          </div>

          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 800,
              padding: '0.2rem 0.6rem',
              borderRadius: '999px',
              background: 'rgba(239, 68, 68, 0.16)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5'
            }}
          >
            Line 6 HX Stomp ({blocks.length}/8 Blocks)
          </span>

          {data.playingStyle && (
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.14)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#6ee7b7'
              }}
            >
              🎯 {data.playingStyle}
            </span>
          )}
        </div>

        {/* Right: Poll Internet for Tone Button + Add Block */}
        {!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{
                padding: '0.38rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #ef4444, #f97316)',
                border: '1px solid #fb923c'
              }}
              disabled={polling}
              onClick={() => handlePollInternetTone(instrument)}
              title="Poll Line 6 CustomTone, Songsterr & Web Rig databases to build the HX Stomp pedal chain for this song"
            >
              <Sparkles size={14} />
              {polling
                ? `Polling ${instrument === 'bass' ? 'Bass' : 'Guitar'} Tone...`
                : `Poll Internet for ${instrument === 'bass' ? 'Bass' : 'Guitar'} Tone`}
            </button>

            {(customTones.length > 0 || detectedGear.length > 0 || showDiscoveryPanel) && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.36rem 0.65rem', fontSize: '0.75rem' }}
                onClick={() => setShowDiscoveryPanel(prev => !prev)}
              >
                {showDiscoveryPanel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span>
                  {showDiscoveryPanel ? 'Hide Poll Results' : `View Poll Results (${customTones.length})`}
                </span>
              </button>
            )}

            {blocks.length < 8 && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.36rem 0.7rem', fontSize: '0.75rem' }}
                onClick={handleAddBlock}
              >
                <Plus size={13} /> Add Pedal ({blocks.length}/8)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tone Summary & Detected Real-World Gear Banner */}
      {(data.summary || detectedGear.length > 0) && (
        <div
          style={{
            padding: '0.7rem 0.95rem',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem'
          }}
        >
          {data.summary && (
            <div style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.45 }}>
              {data.summary}
            </div>
          )}
          {detectedGear.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Detected Real-World Rig:
              </span>
              {detectedGear.map((gear, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '0.12rem 0.5rem',
                    borderRadius: '999px',
                    background: 'rgba(249, 115, 22, 0.14)',
                    border: '1px solid rgba(249, 115, 22, 0.35)',
                    color: '#fdba74'
                  }}
                >
                  {gear}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Internet Tone Discovery & CustomTone Drawer */}
      {!readOnly && showDiscoveryPanel && (
        <div
          style={{
            padding: '0.9rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(10, 14, 24, 0.95))',
            border: '1.5px solid rgba(249, 115, 22, 0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem'
          }}
        >
          {/* Search Override Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <Search size={14} style={{ color: '#fb923c' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff' }}>
                Internet Tone & Line 6 CustomTone Poll ({instrument.toUpperCase()}):
              </span>
              <input
                type="text"
                className="form-input"
                placeholder="Song Title..."
                value={customQueryTitle}
                onChange={e => setCustomQueryTitle(e.target.value)}
                style={{ width: '170px', padding: '0.25rem 0.5rem', fontSize: '0.76rem' }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Artist / Band..."
                value={customQueryArtist}
                onChange={e => setCustomQueryArtist(e.target.value)}
                style={{ width: '170px', padding: '0.25rem 0.5rem', fontSize: '0.76rem' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.26rem 0.65rem', fontSize: '0.74rem', borderColor: '#fb923c', color: '#fed7aa' }}
                disabled={polling}
                onClick={() => handlePollInternetTone(instrument)}
              >
                {polling ? 'Polling...' : 'Re-Poll'}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.22rem 0.55rem', fontSize: '0.72rem' }}
              onClick={() => setShowDiscoveryPanel(false)}
            >
              Close ✕
            </button>
          </div>

          {pollError && (
            <div style={{ fontSize: '0.78rem', color: '#fca5a5' }}>⚠️ {pollError}</div>
          )}

          {/* Suggested Preset Variations */}
          {discoveredPresets.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Generated HX Stomp Chain Variations:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {discoveredPresets.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      padding: '0.35rem 0.7rem',
                      fontSize: '0.74rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      borderColor: 'rgba(16, 185, 129, 0.4)',
                      color: '#a7f3d0'
                    }}
                    onClick={() =>
                      onChange({
                        ...data,
                        blocks: preset.chain,
                        summary: preset.description
                      })
                    }
                    title={preset.description}
                  >
                    <Check size={12} /> Load: {preset.name} ({preset.chain.length} blocks)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Line 6 CustomTone Community Presets Found */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Line 6 CustomTone Community Presets Found ({customTones.length}):
            </span>
            {customTones.length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                No exact Line 6 CustomTone matches found for this query — the chain below was built automatically from Songsterr track metadata and web rig profiles.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '0.55rem'
                }}
              >
                {customTones.map(ct => (
                  <div
                    key={ct.id}
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.4rem'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
                        <strong style={{ fontSize: '0.82rem', color: '#fff' }}>{ct.toneName}</strong>
                        <span
                          style={{
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            padding: '0.08rem 0.38rem',
                            borderRadius: '999px',
                            background: 'rgba(6, 182, 212, 0.16)',
                            color: '#67e8f9',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          ⬇ {ct.downloads}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {ct.band ? `${ct.band}` : ''}{ct.song ? ` • ${ct.song}` : ''}{ct.guitarist ? ` (${ct.guitarist})` : ''}
                      </div>
                      {ct.comment && (
                        <div
                          style={{
                            fontSize: '0.71rem',
                            color: '#cbd5e1',
                            marginTop: '0.3rem',
                            fontStyle: 'italic',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                          title={ct.comment}
                        >
                          "{ct.comment}"
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                        {ct.instrumentTag || ct.style || 'HX Stomp'}
                      </span>
                      <a
                        href={ct.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#fb923c',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        View on CustomTone <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visual Line 6 HX Stomp Series Signal Chain (IN -> Blocks 1..8 -> OUT) */}
      <div
        style={{
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(180deg, rgba(9, 12, 20, 0.92), rgba(15, 20, 32, 0.92))',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          overflowX: 'auto'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: '0.45rem',
            minWidth: 'min-content'
          }}
        >
          {/* INPUT NODE */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem 0.6rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              fontSize: '0.68rem',
              fontWeight: 800,
              color: 'var(--text-muted)',
              letterSpacing: '0.06em'
            }}
          >
            <span>IN</span>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>
              {instrument === 'bass' ? 'BASS' : 'GTR'}
            </span>
          </div>

          {blocks.map((block, idx) => {
            const catMeta = HX_CATEGORY_META[block.category] || HX_CATEGORY_META.distortion;
            const isSelected = !readOnly && selectedBlockId === block.id;

            return (
              <React.Fragment key={block.id}>
                {/* Signal Cable Connector */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: block.enabled ? catMeta.border : 'rgba(255,255,255,0.2)',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                    padding: '0 0.1rem'
                  }}
                >
                  ➔
                </div>

                {/* HX Stomp Pedal Block Card */}
                <div
                  onClick={() => {
                    if (!readOnly) {
                      setSelectedBlockId(prev => (prev === block.id ? null : block.id));
                    }
                  }}
                  style={{
                    width: '215px',
                    minWidth: '205px',
                    borderRadius: '10px',
                    padding: '0.7rem 0.8rem',
                    background: block.enabled ? catMeta.bg : 'rgba(15, 23, 42, 0.45)',
                    border: isSelected
                      ? `2.5px solid #ffffff`
                      : block.enabled
                      ? `2px solid ${catMeta.border}`
                      : '1.5px dashed rgba(255, 255, 255, 0.18)',
                    opacity: block.enabled ? 1 : 0.62,
                    cursor: readOnly ? 'default' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    boxShadow: isSelected
                      ? `0 0 16px ${catMeta.border}`
                      : block.enabled
                      ? '0 4px 14px rgba(0, 0, 0, 0.35)'
                      : 'none',
                    transition: 'all 0.14s ease'
                  }}
                  title={
                    readOnly
                      ? `${block.hxModel} (${block.basedOn})`
                      : `Click to customize Block #${idx + 1}: ${block.hxModel}`
                  }
                >
                  {/* Top Header: Block # + Category + Footswitch + Bypass LED */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.3rem' }}>
                      <span
                        style={{
                          fontSize: '0.64rem',
                          fontWeight: 900,
                          padding: '0.1rem 0.42rem',
                          borderRadius: '4px',
                          background: catMeta.badgeBg,
                          color: '#fff',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em'
                        }}
                      >
                        #{idx + 1} {catMeta.label}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.28rem' }}>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '0.08rem 0.36rem',
                            borderRadius: '4px',
                            background:
                              block.footswitch === 'Always On'
                                ? 'rgba(16, 185, 129, 0.22)'
                                : 'rgba(255, 255, 255, 0.12)',
                            color: block.footswitch === 'Always On' ? '#6ee7b7' : '#f8fafc',
                            border: '1px solid rgba(255,255,255,0.16)'
                          }}
                        >
                          {block.footswitch}
                        </span>

                        {!readOnly && (
                          <button
                            type="button"
                            onClick={e => handleToggleBlockEnabled(block.id, e)}
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              border: block.enabled ? `1.5px solid #4ade80` : '1px solid rgba(255,255,255,0.25)',
                              background: block.enabled ? 'rgba(34, 197, 94, 0.28)' : 'rgba(0,0,0,0.4)',
                              color: block.enabled ? '#4ade80' : 'var(--text-dim)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0
                            }}
                            title={block.enabled ? 'Block Active (Click to Bypass)' : 'Block Bypassed (Click to Enable)'}
                          >
                            <Power size={11} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* HX Stomp Model Name */}
                    <div style={{ fontSize: '0.94rem', fontWeight: 900, color: '#ffffff', lineHeight: 1.2 }}>
                      {block.hxModel}
                    </div>

                    {/* Real-World Pedal Equivalent */}
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: catMeta.color,
                        lineHeight: 1.25
                      }}
                    >
                      Based on: {block.basedOn}
                    </div>
                  </div>

                  {/* Knob / Parameter Pills */}
                  {block.settings && Object.keys(block.settings).length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.25rem',
                        paddingTop: '0.35rem',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      {Object.entries(block.settings).map(([k, v]) => (
                        <span
                          key={k}
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.38rem',
                            borderRadius: '4px',
                            background: 'rgba(0, 0, 0, 0.42)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: '#e2e8f0'
                          }}
                        >
                          <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {v}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Role / Tone Description */}
                  {block.role && (
                    <div
                      style={{
                        fontSize: '0.68rem',
                        color: '#cbd5e1',
                        lineHeight: 1.3,
                        fontStyle: 'italic'
                      }}
                    >
                      {block.role}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}

          {/* Final Signal Cable -> OUTPUT NODE */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
              fontWeight: 900,
              fontSize: '0.9rem',
              padding: '0 0.1rem'
            }}
          >
            ➔
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem 0.6rem',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              fontSize: '0.68rem',
              fontWeight: 800,
              color: '#6ee7b7',
              letterSpacing: '0.06em'
            }}
          >
            <span>OUT</span>
            <span style={{ fontSize: '0.6rem', color: '#a7f3d0' }}>MAIN L/R</span>
          </div>
        </div>
      </div>

      {/* Interactive Block Inspector / Editor (when a pedal block is clicked in Teach/Edit Mode) */}
      {!readOnly && selectedBlock && (
        <div
          style={{
            padding: '0.95rem 1.1rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(15, 23, 42, 0.9)',
            border: `2px solid ${HX_CATEGORY_META[selectedBlock.category]?.border || '#f97316'}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Sliders size={15} style={{ color: HX_CATEGORY_META[selectedBlock.category]?.color }} />
              <strong style={{ fontSize: '0.88rem', color: '#fff' }}>
                Edit HX Stomp Block #{blocks.findIndex(b => b.id === selectedBlock.id) + 1}: {selectedBlock.hxModel}
              </strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                ({selectedBlock.basedOn})
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.24rem 0.55rem', fontSize: '0.72rem' }}
                disabled={blocks.findIndex(b => b.id === selectedBlock.id) === 0}
                onClick={() => handleMoveBlock(selectedBlock.id, -1)}
                title="Move pedal earlier in the signal chain"
              >
                <ArrowLeft size={12} /> Move Left
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.24rem 0.55rem', fontSize: '0.72rem' }}
                disabled={blocks.findIndex(b => b.id === selectedBlock.id) === blocks.length - 1}
                onClick={() => handleMoveBlock(selectedBlock.id, 1)}
                title="Move pedal later in the signal chain"
              >
                Move Right <ArrowRight size={12} />
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.24rem 0.55rem', fontSize: '0.72rem', color: '#fca5a5' }}
                onClick={() => handleDeleteBlock(selectedBlock.id)}
              >
                <Trash2 size={12} /> Remove Block
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.24rem 0.55rem', fontSize: '0.72rem' }}
                onClick={() => setSelectedBlockId(null)}
              >
                Done ✕
              </button>
            </div>
          </div>

          {/* Row 1: Quick Swap from Line 6 HX Stomp Catalog + Footswitch Selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.65rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Swap from HX Stomp Model Library:
              </label>
              <select
                className="form-input"
                style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                value={selectedBlock.hxModel}
                onChange={e => {
                  const found = HX_STOMP_MODEL_CATALOG.find(m => m.hxModel === e.target.value);
                  if (found) {
                    handleSelectCatalogModel(selectedBlock.id, found);
                  }
                }}
              >
                <option value={selectedBlock.hxModel}>
                  {selectedBlock.hxModel} — ({selectedBlock.basedOn})
                </option>
                {Object.entries(HX_CATEGORY_META).map(([catKey, meta]) => {
                  const modelsInCat = HX_STOMP_MODEL_CATALOG.filter(
                    m =>
                      m.category === catKey &&
                      (m.instrument === 'both' || m.instrument === instrument)
                  );
                  if (modelsInCat.length === 0) return null;
                  return (
                    <optgroup key={catKey} label={meta.label}>
                      {modelsInCat.map(m => (
                        <option key={m.hxModel} value={m.hxModel}>
                          {m.hxModel} ({m.basedOn})
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Block Category Color:
              </label>
              <select
                className="form-input"
                style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                value={selectedBlock.category}
                onChange={e =>
                  handleUpdateBlock(selectedBlock.id, { category: e.target.value as HxBlockCategory })
                }
              >
                {Object.entries(HX_CATEGORY_META).map(([k, meta]) => (
                  <option key={k} value={k}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                HX Stomp Footswitch Assignment:
              </label>
              <select
                className="form-input"
                style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                value={selectedBlock.footswitch}
                onChange={e =>
                  handleUpdateBlock(selectedBlock.id, {
                    footswitch: e.target.value as HxStompBlock['footswitch']
                  })
                }
              >
                <option value="Always On">Always On</option>
                <option value="FS1">Footswitch 1 (FS1)</option>
                <option value="FS2">Footswitch 2 (FS2)</option>
                <option value="FS3">Footswitch 3 (FS3)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Custom HX Model Name, Real-World Based On, and Role Note */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.65rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                HX Stomp Model Name:
              </label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                value={selectedBlock.hxModel}
                onChange={e => handleUpdateBlock(selectedBlock.id, { hxModel: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Real-World Pedal / Amp Equivalent:
              </label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                value={selectedBlock.basedOn}
                onChange={e => handleUpdateBlock(selectedBlock.id, { basedOn: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Tone Role / Section Tip:
              </label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                value={selectedBlock.role}
                onChange={e => handleUpdateBlock(selectedBlock.id, { role: e.target.value })}
              />
            </div>
          </div>

          {/* Row 3: Editable Knob Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              Knob / Parameter Settings:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
              {Object.entries(selectedBlock.settings || {}).map(([paramKey, paramVal]) => (
                <div
                  key={paramKey}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.2rem 0.45rem',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.12)'
                  }}
                >
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cbd5e1' }}>
                    {paramKey}:
                  </span>
                  <input
                    type="text"
                    className="form-input"
                    value={paramVal}
                    onChange={e => {
                      const nextSettings = {
                        ...(selectedBlock.settings || {}),
                        [paramKey]: e.target.value
                      };
                      handleUpdateBlock(selectedBlock.id, { settings: nextSettings });
                    }}
                    style={{ width: '68px', padding: '0.12rem 0.35rem', fontSize: '0.72rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextSettings = { ...(selectedBlock.settings || {}) };
                      delete nextSettings[paramKey];
                      handleUpdateBlock(selectedBlock.id, { settings: nextSettings });
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#fca5a5',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      padding: '0 0.15rem'
                    }}
                    title={`Remove ${paramKey}`}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Add new knob setting */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="+ Knob (e.g. Blend)"
                  value={newSettingKey}
                  onChange={e => setNewSettingKey(e.target.value)}
                  style={{ width: '115px', padding: '0.2rem 0.4rem', fontSize: '0.72rem' }}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Val (e.g. 70%)"
                  value={newSettingVal}
                  onChange={e => setNewSettingVal(e.target.value)}
                  style={{ width: '85px', padding: '0.2rem 0.4rem', fontSize: '0.72rem' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                  onClick={() => {
                    const k = newSettingKey.trim();
                    const v = newSettingVal.trim();
                    if (!k) return;
                    handleUpdateBlock(selectedBlock.id, {
                      settings: { ...(selectedBlock.settings || {}), [k]: v || '5.0' }
                    });
                    setNewSettingKey('');
                    setNewSettingVal('');
                  }}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HelixToneWidget;
