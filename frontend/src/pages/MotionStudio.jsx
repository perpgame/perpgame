import { useState, useCallback, useRef } from 'react'
import PageHeader from '../components/PageHeader'
import { Button } from '../components/ui/button'
import { TradeExecutionScene, PortfolioGrowthScene, CopyTradingScene, LiveFeedScene, ProfileScene } from '../components/studio/scenes'

const SCENES = [
  { id: 'trade', label: 'Trade Execution', description: 'Animated order placement flow' },
  { id: 'portfolio', label: 'Portfolio Growth', description: 'Balance counting up with positions' },
  { id: 'copy', label: 'Copy Trading', description: 'Leader-follower trade mirroring' },
  { id: 'feed', label: 'Live Feed', description: 'Social feed with trade posts' },
  { id: 'profile', label: 'Profile', description: 'Trader profile with stats & positions' },
]

const SCENE_COMPONENTS = {
  trade: TradeExecutionScene,
  portfolio: PortfolioGrowthScene,
  copy: CopyTradingScene,
  feed: LiveFeedScene,
  profile: ProfileScene,
}

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
)

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M6 4l15 8-15 8z" />
  </svg>
)

export default function MotionStudio() {
  const [selectedScene, setSelectedScene] = useState('trade')
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const previewRef = useRef(null)

  const handlePlayPause = useCallback(() => {
    if (!playing) {
      setPlaying(true)
      setPaused(false)
    } else {
      setPaused(p => !p)
    }
  }, [playing])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setPaused(false)
    setResetKey((k) => k + 1)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      previewRef.current?.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {})
    }
  }, [])

  // Sync state when user exits fullscreen via Escape
  if (typeof document !== 'undefined') {
    document.onfullscreenchange = () => {
      setFullscreen(!!document.fullscreenElement)
    }
  }

  const SceneComponent = SCENE_COMPONENTS[selectedScene]

  const playPauseLabel = !playing ? 'Play' : paused ? 'Resume' : 'Pause'
  const playPauseIcon = !playing || paused ? <PlayIcon /> : <PauseIcon />

  const controls = (
    <>
      <Button
        onClick={handlePlayPause}
        className={`rounded-[var(--card-radius)] font-bold px-6 gap-2 ${!playing || paused ? 'bg-[var(--primary)] text-[#060a0e]' : 'bg-[var(--surface)] text-[var(--text)]'}`}
      >
        {playPauseIcon}
        {playPauseLabel}
      </Button>
      <Button
        variant="outline"
        onClick={handleReset}
        disabled={!playing}
        className="rounded-[var(--card-radius)] border-[var(--separator)] text-[var(--text)] font-semibold px-6"
      >
        Reset
      </Button>
      <Button
        variant="outline"
        onClick={toggleFullscreen}
        className="rounded-[var(--card-radius)] border-[var(--separator)] text-[var(--text)] font-semibold px-3"
        aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {fullscreen ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )}
      </Button>
    </>
  )

  return (
    <div className="studio-page">
      <PageHeader title="Motion Studio" />

      {/* Scene selector */}
      <div className="studio-scenes">
        {SCENES.map((scene) => (
          <button
            key={scene.id}
            className={`studio-scene-card ${selectedScene === scene.id ? 'studio-scene-card--active' : ''}`}
            onClick={() => {
              setSelectedScene(scene.id)
              setPlaying(false)
              setPaused(false)
              setResetKey((k) => k + 1)
            }}
          >
            <h4>{scene.label}</h4>
            <p>{scene.description}</p>
          </button>
        ))}
      </div>

      {/* Preview container */}
      <div className={`studio-preview ${fullscreen ? 'studio-preview--fullscreen' : ''}`} ref={previewRef}>
        <SceneComponent key={`${selectedScene}-${resetKey}`} playing={playing} paused={paused} />

        {/* Fullscreen controls overlay */}
        {fullscreen && (
          <div className="studio-fs-controls">
            {controls}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="studio-controls">
        {controls}
      </div>
    </div>
  )
}
